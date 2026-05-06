import type {
  CollectorOrchestrator,
  ProcessOnceOptions,
  ProcessOnceResult,
  PullOnceOptions,
  PullOnceResult,
} from "../core/orchestrator";
import type {
  DecodedUsageMessage,
  NormalizedQueuedUsageEvent,
  UsageInboxRecord,
  UsageSourceEnvelope,
} from "../core/types";

export type {
  CollectorDrainSummary,
  CollectorProcessMetrics,
  CollectorPullMetrics,
  DecodeFailure,
  DecodedUsageMessage,
  NormalizedQueuedUsageEvent,
  NormalizedTokenUsage,
  UsageInboxRecord,
  UsageQueueInboxStatus,
  UsageSourceEnvelope,
} from "../core/types";
export { USAGE_QUEUE_INBOX_STATUSES } from "../core/types";

export type {
  CollectorOrchestrator,
  DrainNowOptions,
  DrainNowResult,
  ProcessOnceOptions,
  ProcessOnceResult,
  PullOnceOptions,
  PullOnceResult,
} from "../core/orchestrator";

export interface UsageMessageSource {
  pullBatch(options: PullOnceOptions): Promise<UsageSourceEnvelope[]>;
}

export interface UsagePayloadDecoder {
  decode(envelope: UsageSourceEnvelope): DecodedUsageMessage;
}

export interface UsageQueueInboxRepository {
  storeRawMessages(messages: UsageSourceEnvelope[]): Promise<number>;
  claimForProcessing(options: ProcessOnceOptions): Promise<UsageInboxRecord[]>;
  markProcessed(
    recordId: string,
    event: NormalizedQueuedUsageEvent,
    claimAttemptCount: number
  ): Promise<void>;
  markDecodeFailed(recordId: string, reason: string, claimAttemptCount: number): Promise<void>;
  markProcessFailed(recordId: string, reason: string, claimAttemptCount: number): Promise<void>;
  markDiscarded(recordId: string, reason: string, claimAttemptCount: number): Promise<void>;
  cleanupExpiredRecords?(): Promise<number>;
}

export interface UsageRecordRepository {
  persistNormalizedEvents(events: NormalizedQueuedUsageEvent[]): Promise<number>;
}

export interface CollectorOrchestratorFactory {
  create(): CollectorOrchestrator;
}

export interface CollectorOneShotExecutor {
  pullOnce(options: PullOnceOptions): Promise<PullOnceResult>;
  processOnce(options: ProcessOnceOptions): Promise<ProcessOnceResult>;
}
