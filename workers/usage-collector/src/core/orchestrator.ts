import type {
  CollectorDrainSummary,
  CollectorProcessMetrics,
  CollectorPullMetrics,
  UsageInboxRecord,
} from "./types";

export interface PullOnceOptions {
  maxMessages: number;
  signal?: AbortSignal;
}

export interface ProcessOnceOptions {
  maxRecords: number;
  signal?: AbortSignal;
}

export interface DrainNowOptions {
  pull: PullOnceOptions;
  process: ProcessOnceOptions;
}

export interface PullOnceResult {
  metrics: CollectorPullMetrics;
}

export interface ProcessOnceResult {
  metrics: CollectorProcessMetrics;
  claimedRecords: UsageInboxRecord[];
}

export interface DrainNowResult {
  summary: CollectorDrainSummary;
}

export interface CollectorOrchestrator {
  pullOnce(options: PullOnceOptions): Promise<PullOnceResult>;
  processOnce(options: ProcessOnceOptions): Promise<ProcessOnceResult>;
  drainNow(options: DrainNowOptions): Promise<DrainNowResult>;
}
