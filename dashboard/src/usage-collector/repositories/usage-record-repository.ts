import type { PrismaClient } from "@/generated/prisma/client";
import type { UsageRecordRepository } from "@/usage-collector/contracts";
import type { NormalizedQueuedUsageEvent } from "@/usage-collector/core/types";
import { invalidateUsageCaches } from "@/lib/cache";
import { prisma as defaultPrisma } from "@/lib/db";

export interface UsageRecordRepositoryOptions {
  prisma?: PrismaClient;
}

export class PrismaUsageRecordRepository implements UsageRecordRepository {
  private readonly prismaClient: PrismaClient;

  public constructor(options: UsageRecordRepositoryOptions = {}) {
    this.prismaClient = options.prisma ?? defaultPrisma;
  }

  public async persistNormalizedEvents(events: NormalizedQueuedUsageEvent[]): Promise<number> {
    if (events.length === 0) {
      return 0;
    }

    const deduplicatedEvents = dedupeByEventKey(events);
    const result = await this.prismaClient.usageRecord.createMany({
      data: deduplicatedEvents.map((event) => ({
        eventKey: event.eventKey,
        requestId: event.requestId,
        provider: event.provider,
        authType: event.authType,
        authIndex: event.authIndex,
        endpoint: event.apiGroupKey,
        model: event.model,
        source: event.source,
        timestamp: event.timestamp,
        latencyMs: event.latencyMs,
        inputTokens: event.tokens.inputTokens,
        outputTokens: event.tokens.outputTokens,
        reasoningTokens: event.tokens.reasoningTokens,
        cachedTokens: event.tokens.cachedTokens,
        totalTokens: event.tokens.totalTokens,
        failed: event.failed,
      })),
      skipDuplicates: true,
    });

    invalidateUsageCaches();
    return result.count;
  }
}

function dedupeByEventKey(events: NormalizedQueuedUsageEvent[]): NormalizedQueuedUsageEvent[] {
  const seen = new Set<string>();
  const deduplicated: NormalizedQueuedUsageEvent[] = [];

  for (const event of events) {
    if (seen.has(event.eventKey)) {
      continue;
    }
    seen.add(event.eventKey);
    deduplicated.push(event);
  }

  return deduplicated;
}
