export const USAGE_QUEUE_INBOX_STATUSES = [
  "pending",
  "processed",
  "decode_failed",
  "process_failed",
  "discarded",
] as const;

export type UsageQueueInboxStatus = (typeof USAGE_QUEUE_INBOX_STATUSES)[number];

export interface UsageSourceEnvelope {
  source: string;
  receivedAt: Date;
  rawMessage: string;
  sourceMessageId?: string | null;
  metadata?: Record<string, string | number | boolean | null>;
}

export interface NormalizedTokenUsage {
  inputTokens: number;
  outputTokens: number;
  reasoningTokens: number;
  cachedTokens: number;
  totalTokens: number;
}

export interface NormalizedQueuedUsageEvent {
  eventKey: string;
  requestId: string | null;
  provider: string | null;
  authType: string | null;
  authIndex: string;
  apiGroupKey: string | null;
  model: string;
  source: string;
  timestamp: Date;
  failed: boolean;
  latencyMs: number;
  tokens: NormalizedTokenUsage;
}

export interface UsageInboxRecord {
  id: string;
  rawMessage: string;
  status: UsageQueueInboxStatus;
  createdAt: Date;
  updatedAt: Date;
  eventKey?: string | null;
  requestId?: string | null;
  provider?: string | null;
  authType?: string | null;
  authIndex?: string | null;
  apiGroupKey?: string | null;
  model?: string | null;
  source?: string | null;
  timestamp?: Date | null;
  attemptCount?: number;
  lastAttemptAt?: Date | null;
  processedAt?: Date | null;
  failedAt?: Date | null;
  discardedAt?: Date | null;
  failureReason?: string | null;
  discardReason?: string | null;
}

export interface DecodeFailure {
  reason: string;
  retriable: boolean;
}

export type DecodedUsageMessage =
  | {
      ok: true;
      event: NormalizedQueuedUsageEvent;
    }
  | {
      ok: false;
      error: DecodeFailure;
    };

export interface CollectorPullMetrics {
  pulled: number;
  stored: number;
  dropped: number;
  durationMs: number;
}

export interface CollectorProcessMetrics {
  claimed: number;
  processed: number;
  decodeFailed: number;
  processFailed: number;
  discarded: number;
  durationMs: number;
}

export interface CollectorDrainSummary {
  pulled: CollectorPullMetrics;
  processed: CollectorProcessMetrics;
}
