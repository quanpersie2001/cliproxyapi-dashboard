import type { PrismaClient, UsageQueueInbox } from "@/generated/prisma/client";
import { Prisma } from "@/generated/prisma/client";
import { UsageQueueInboxStatus } from "@/generated/prisma/enums";
import type { UsageQueueInboxRepository } from "@/usage-collector/contracts";
import type { ProcessOnceOptions } from "@/usage-collector/core/orchestrator";
import type {
  NormalizedQueuedUsageEvent,
  UsageInboxRecord,
  UsageSourceEnvelope,
} from "@/usage-collector/core/types";
import { prisma as defaultPrisma } from "@/lib/db";

const DEFAULT_MAX_PROCESS_ATTEMPTS = 10;

type ClaimRowId = { id: string };

export interface InboxRepositoryOptions {
  prisma?: PrismaClient;
  maxProcessAttempts?: number;
  now?: () => Date;
}

export class PrismaUsageQueueInboxRepository implements UsageQueueInboxRepository {
  private readonly prismaClient: PrismaClient;
  private readonly maxProcessAttempts: number;
  private readonly now: () => Date;

  public constructor(options: InboxRepositoryOptions = {}) {
    this.prismaClient = options.prisma ?? defaultPrisma;
    this.maxProcessAttempts = normalizePositiveInt(
      options.maxProcessAttempts ?? DEFAULT_MAX_PROCESS_ATTEMPTS
    );
    this.now = options.now ?? (() => new Date());
  }

  public async storeRawMessages(messages: UsageSourceEnvelope[]): Promise<number> {
    if (messages.length === 0) {
      return 0;
    }

    const result = await this.prismaClient.usageQueueInbox.createMany({
      data: messages.map((message) => ({
        rawMessage: message.rawMessage,
        source: normalizeNullableText(message.source),
      })),
    });

    return result.count;
  }

  public async claimForProcessing(options: ProcessOnceOptions): Promise<UsageInboxRecord[]> {
    const maxRecords = normalizePositiveInt(options.maxRecords);
    if (maxRecords === 0) {
      return [];
    }

    return this.prismaClient.$transaction(async (tx) => {
      const claimedRows = await tx.$queryRaw<ClaimRowId[]>(Prisma.sql`
        SELECT id
        FROM usage_queue_inbox
        WHERE status IN (${UsageQueueInboxStatus.pending}, ${UsageQueueInboxStatus.process_failed})
          AND (
            status <> ${UsageQueueInboxStatus.process_failed}
            OR "attemptCount" < ${this.maxProcessAttempts}
          )
        ORDER BY "createdAt" ASC
        FOR UPDATE SKIP LOCKED
        LIMIT ${maxRecords}
      `);

      if (claimedRows.length === 0) {
        return [];
      }

      const claimedIds = claimedRows.map((row) => row.id);
      const attemptedAt = this.now();

      await tx.usageQueueInbox.updateMany({
        where: {
          id: {
            in: claimedIds,
          },
        },
        data: {
          attemptCount: {
            increment: 1,
          },
          lastAttemptAt: attemptedAt,
        },
      });

      const records = await tx.usageQueueInbox.findMany({
        where: {
          id: {
            in: claimedIds,
          },
        },
        orderBy: {
          createdAt: "asc",
        },
      });

      return records.map(toUsageInboxRecord);
    });
  }

  public async markProcessed(
    recordId: string,
    event: NormalizedQueuedUsageEvent
  ): Promise<void> {
    await this.prismaClient.usageQueueInbox.update({
      where: { id: recordId },
      data: {
        status: UsageQueueInboxStatus.processed,
        eventKey: event.eventKey,
        requestId: event.requestId,
        provider: event.provider,
        authType: event.authType,
        authIndex: event.authIndex,
        apiGroupKey: event.apiGroupKey,
        model: event.model,
        source: event.source,
        timestamp: event.timestamp,
        processedAt: this.now(),
        failedAt: null,
        discardedAt: null,
        failureReason: null,
        discardReason: null,
      },
    });
  }

  public async markDecodeFailed(recordId: string, reason: string): Promise<void> {
    await this.prismaClient.usageQueueInbox.update({
      where: { id: recordId },
      data: {
        status: UsageQueueInboxStatus.decode_failed,
        failedAt: this.now(),
        failureReason: reason,
      },
    });
  }

  public async markProcessFailed(recordId: string, reason: string): Promise<void> {
    await this.prismaClient.usageQueueInbox.update({
      where: { id: recordId },
      data: {
        status: UsageQueueInboxStatus.process_failed,
        failedAt: this.now(),
        failureReason: reason,
      },
    });
  }

  public async markDiscarded(recordId: string, reason: string): Promise<void> {
    await this.prismaClient.usageQueueInbox.update({
      where: { id: recordId },
      data: {
        status: UsageQueueInboxStatus.discarded,
        discardedAt: this.now(),
        discardReason: reason,
      },
    });
  }
}

function toUsageInboxRecord(row: UsageQueueInbox): UsageInboxRecord {
  return {
    id: row.id,
    rawMessage: row.rawMessage,
    status: row.status,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    eventKey: row.eventKey,
    requestId: row.requestId,
    provider: row.provider,
    authType: row.authType,
    authIndex: row.authIndex,
    apiGroupKey: row.apiGroupKey,
    model: row.model,
    source: row.source,
    timestamp: row.timestamp,
    attemptCount: row.attemptCount,
    lastAttemptAt: row.lastAttemptAt,
    processedAt: row.processedAt,
    failedAt: row.failedAt,
    discardedAt: row.discardedAt,
    failureReason: row.failureReason,
    discardReason: row.discardReason,
  };
}

function normalizeNullableText(value: string | null | undefined): string | null {
  const normalized = (value ?? "").trim();
  return normalized.length > 0 ? normalized : null;
}

function normalizePositiveInt(value: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }
  return Math.max(0, Math.trunc(value));
}
