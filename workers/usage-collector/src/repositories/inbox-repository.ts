import type { PrismaClient, UsageQueueInbox } from "@/server/db/generated/prisma/client";
import { Prisma } from "@/server/db/generated/prisma/client";
import { UsageQueueInboxStatus } from "@/server/db/generated/prisma/enums";
import type { UsageQueueInboxRepository } from "@/server/jobs/workers/usage-collector/contracts";
import type { ProcessOnceOptions } from "@/server/jobs/workers/usage-collector/core/orchestrator";
import type {
  NormalizedQueuedUsageEvent,
  UsageInboxRecord,
  UsageSourceEnvelope,
} from "@/server/jobs/workers/usage-collector/core/types";
import { prisma as defaultPrisma } from "@/server/db/client";

const DEFAULT_MAX_PROCESS_ATTEMPTS = 10;
const DEFAULT_PROCESSED_RETENTION_MS = 24 * 60 * 60 * 1000;
const DEFAULT_FAILED_RETENTION_MS = 7 * 24 * 60 * 60 * 1000;

type ClaimRowId = { id: string };

export interface InboxRepositoryOptions {
  prisma?: PrismaClient;
  maxProcessAttempts?: number;
  processedRetentionMs?: number;
  failedRetentionMs?: number;
  now?: () => Date;
}

export class PrismaUsageQueueInboxRepository implements UsageQueueInboxRepository {
  private readonly prismaClient: PrismaClient;
  private readonly maxProcessAttempts: number;
  private readonly processedRetentionMs: number;
  private readonly failedRetentionMs: number;
  private readonly now: () => Date;

  public constructor(options: InboxRepositoryOptions = {}) {
    this.prismaClient = options.prisma ?? defaultPrisma;
    this.maxProcessAttempts = normalizePositiveInt(
      options.maxProcessAttempts ?? DEFAULT_MAX_PROCESS_ATTEMPTS
    );
    this.processedRetentionMs = normalizePositiveInt(
      options.processedRetentionMs ?? DEFAULT_PROCESSED_RETENTION_MS
    );
    this.failedRetentionMs = normalizePositiveInt(
      options.failedRetentionMs ?? DEFAULT_FAILED_RETENTION_MS
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
          status: UsageQueueInboxStatus.processing,
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
    event: NormalizedQueuedUsageEvent,
    claimAttemptCount: number
  ): Promise<void> {
    await this.finalizeClaimedRecord(recordId, claimAttemptCount, {
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

  public async markDecodeFailed(
    recordId: string,
    reason: string,
    claimAttemptCount: number
  ): Promise<void> {
    await this.finalizeClaimedRecord(recordId, claimAttemptCount, {
      data: {
        status: UsageQueueInboxStatus.decode_failed,
        failedAt: this.now(),
        failureReason: reason,
      },
    });
  }

  public async markProcessFailed(
    recordId: string,
    reason: string,
    claimAttemptCount: number
  ): Promise<void> {
    await this.finalizeClaimedRecord(recordId, claimAttemptCount, {
      data: {
        status: UsageQueueInboxStatus.process_failed,
        failedAt: this.now(),
        failureReason: reason,
      },
    });
  }

  public async markDiscarded(
    recordId: string,
    reason: string,
    claimAttemptCount: number
  ): Promise<void> {
    await this.finalizeClaimedRecord(recordId, claimAttemptCount, {
      data: {
        status: UsageQueueInboxStatus.discarded,
        discardedAt: this.now(),
        discardReason: reason,
      },
    });
  }

  public async cleanupExpiredRecords(): Promise<number> {
    const now = this.now();
    const processedBefore = new Date(now.getTime() - this.processedRetentionMs);
    const failedBefore = new Date(now.getTime() - this.failedRetentionMs);

    const [processedResult, failedResult] = await Promise.all([
      this.prismaClient.usageQueueInbox.deleteMany({
        where: {
          status: UsageQueueInboxStatus.processed,
          processedAt: {
            lt: processedBefore,
          },
        },
      }),
      this.prismaClient.usageQueueInbox.deleteMany({
        where: {
          OR: [
            {
              status: UsageQueueInboxStatus.decode_failed,
              failedAt: {
                lt: failedBefore,
              },
            },
            {
              status: UsageQueueInboxStatus.process_failed,
              failedAt: {
                lt: failedBefore,
              },
            },
            {
              status: UsageQueueInboxStatus.discarded,
              discardedAt: {
                lt: failedBefore,
              },
            },
          ],
        },
      }),
    ]);

    return processedResult.count + failedResult.count;
  }

  private async finalizeClaimedRecord(
    recordId: string,
    claimAttemptCount: number,
    options: {
      data: Prisma.UsageQueueInboxUpdateManyMutationInput;
    }
  ): Promise<void> {
    await this.prismaClient.usageQueueInbox.updateMany({
      where: {
        id: recordId,
        status: UsageQueueInboxStatus.processing,
        attemptCount: normalizePositiveInt(claimAttemptCount),
      },
      data: options.data,
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
