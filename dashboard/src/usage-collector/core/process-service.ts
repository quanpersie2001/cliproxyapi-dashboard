import type {
  UsagePayloadDecoder,
  UsageQueueInboxRepository,
  UsageRecordRepository,
} from "@/usage-collector/contracts";
import type { ProcessOnceOptions, ProcessOnceResult } from "@/usage-collector/core/orchestrator";
import type { NormalizedQueuedUsageEvent, UsageInboxRecord } from "@/usage-collector/core/types";

const DEFAULT_MAX_PROCESS_ATTEMPTS = 10;

type PendingProcessedEvent = {
  record: UsageInboxRecord;
  event: NormalizedQueuedUsageEvent;
};

export interface CollectorProcessServiceOptions {
  decoder: UsagePayloadDecoder;
  inboxRepository: UsageQueueInboxRepository;
  usageRecordRepository: UsageRecordRepository;
  maxProcessAttempts?: number;
  now?: () => Date;
}

export class CollectorProcessService {
  private readonly now: () => Date;
  private readonly maxProcessAttempts: number;

  public constructor(private readonly options: CollectorProcessServiceOptions) {
    this.now = options.now ?? (() => new Date());
    this.maxProcessAttempts = normalizePositiveInt(
      options.maxProcessAttempts ?? DEFAULT_MAX_PROCESS_ATTEMPTS
    );
  }

  public async processOnce(processOptions: ProcessOnceOptions): Promise<ProcessOnceResult> {
    const startedAt = this.now().getTime();
    const claimedRecords = await this.options.inboxRepository.claimForProcessing(processOptions);

    let processed = 0;
    let decodeFailed = 0;
    let processFailed = 0;
    let discarded = 0;

    const persistableEvents: PendingProcessedEvent[] = [];
    for (const record of claimedRecords) {
      const claimAttemptCount = normalizePositiveInt(record.attemptCount ?? 0);
      const decoded = this.options.decoder.decode({
        source: record.source ?? "usage_queue_inbox",
        receivedAt: record.createdAt,
        rawMessage: record.rawMessage,
        sourceMessageId: record.id,
      });

      if (!decoded.ok) {
        if (shouldDiscard(record, this.maxProcessAttempts)) {
          await this.options.inboxRepository.markDiscarded(
            record.id,
            decoded.error.reason,
            claimAttemptCount
          );
          discarded += 1;
        } else {
          await this.options.inboxRepository.markDecodeFailed(
            record.id,
            decoded.error.reason,
            claimAttemptCount
          );
          decodeFailed += 1;
        }
        continue;
      }

      persistableEvents.push({
        record,
        event: decoded.event,
      });
    }

    if (persistableEvents.length > 0) {
      try {
        await this.options.usageRecordRepository.persistNormalizedEvents(
          persistableEvents.map((entry) => entry.event)
        );
      } catch (error) {
        const failureReason = toErrorMessage(error);
        for (const entry of persistableEvents) {
          const claimAttemptCount = normalizePositiveInt(entry.record.attemptCount ?? 0);
          if (shouldDiscard(entry.record, this.maxProcessAttempts)) {
            await this.options.inboxRepository.markDiscarded(
              entry.record.id,
              failureReason,
              claimAttemptCount
            );
            discarded += 1;
          } else {
            await this.options.inboxRepository.markProcessFailed(
              entry.record.id,
              failureReason,
              claimAttemptCount
            );
            processFailed += 1;
          }
        }
        const durationMs = Math.max(0, this.now().getTime() - startedAt);
        return {
          metrics: {
            claimed: claimedRecords.length,
            processed,
            decodeFailed,
            processFailed,
            discarded,
            durationMs,
          },
          claimedRecords,
        };
      }

      for (const entry of persistableEvents) {
        const claimAttemptCount = normalizePositiveInt(entry.record.attemptCount ?? 0);
        try {
          await this.options.inboxRepository.markProcessed(
            entry.record.id,
            entry.event,
            claimAttemptCount
          );
          processed += 1;
        } catch (error) {
          const failureReason = toErrorMessage(error);
          if (shouldDiscard(entry.record, this.maxProcessAttempts)) {
            await this.options.inboxRepository.markDiscarded(
              entry.record.id,
              failureReason,
              claimAttemptCount
            );
            discarded += 1;
          } else {
            await this.options.inboxRepository.markProcessFailed(
              entry.record.id,
              failureReason,
              claimAttemptCount
            );
            processFailed += 1;
          }
        }
      }
    }

    const durationMs = Math.max(0, this.now().getTime() - startedAt);
    await runRetentionCleanup(this.options.inboxRepository);
    return {
      metrics: {
        claimed: claimedRecords.length,
        processed,
        decodeFailed,
        processFailed,
        discarded,
        durationMs,
      },
      claimedRecords,
    };
  }
}

async function runRetentionCleanup(inboxRepository: UsageQueueInboxRepository): Promise<void> {
  if (typeof inboxRepository.cleanupExpiredRecords !== "function") {
    return;
  }

  try {
    await inboxRepository.cleanupExpiredRecords();
  } catch {
    // Retention cleanup is best-effort and must not break ingestion.
  }
}

function shouldDiscard(record: UsageInboxRecord, maxAttempts: number): boolean {
  const attempts = normalizePositiveInt(record.attemptCount ?? 0);
  if (maxAttempts === 0) {
    return false;
  }
  return attempts >= maxAttempts;
}

function normalizePositiveInt(value: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }
  return Math.max(0, Math.trunc(value));
}

function toErrorMessage(value: unknown): string {
  if (value instanceof Error && value.message) {
    return value.message;
  }
  return "process_failed";
}
