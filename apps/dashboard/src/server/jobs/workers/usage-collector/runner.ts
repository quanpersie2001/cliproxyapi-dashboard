import type { CollectorOrchestrator } from "@/server/jobs/workers/usage-collector/core/orchestrator";
import type { CollectorLeaderLock } from "@/server/jobs/workers/usage-collector/infra/leader-lock";
import type { CollectorStateRepository } from "@/server/jobs/workers/usage-collector/repositories/collector-state-repository";

export type CollectorRunSignal = {
  aborted: boolean;
  onAbort?: (listener: () => void) => () => void;
};

export interface CollectorRunResult {
  status: "disabled" | "standby" | "success" | "error";
  waitMs: number;
  wakeSequence: number;
  error?: string;
}

export interface UsageCollectorWorkerRunnerOptions {
  workerId: string;
  orchestrator: CollectorOrchestrator;
  lock: CollectorLeaderLock;
  stateRepository: CollectorStateRepository;
  enabled: boolean;
  pullBatchSize: number;
  processBatchSize: number;
  maxDrainCycles?: number;
  idleMs: number;
  errorBackoffMs: number;
  sleep?: (ms: number, signal: CollectorRunSignal) => Promise<void>;
}

const DEFAULT_MAX_DRAIN_CYCLES = 3;

export class UsageCollectorWorkerRunner {
  private readonly sleepFn: (ms: number, signal: CollectorRunSignal) => Promise<void>;
  private readonly maxDrainCycles: number;
  private lastObservedWakeSequence = 0;

  public constructor(private readonly options: UsageCollectorWorkerRunnerOptions) {
    this.sleepFn = options.sleep ?? defaultSleep;
    this.maxDrainCycles = normalizePositiveInt(options.maxDrainCycles ?? DEFAULT_MAX_DRAIN_CYCLES);
  }

  public async start(signal: CollectorRunSignal): Promise<void> {
    while (!signal.aborted) {
      const result = await this.runOnce(signal);
      if (signal.aborted) {
        return;
      }
      await this.sleepFn(result.waitMs, signal);
    }
  }

  public async runOnce(signal?: CollectorRunSignal): Promise<CollectorRunResult> {
    if (!this.options.enabled) {
      return {
        status: "disabled",
        waitMs: this.options.idleMs,
        wakeSequence: this.lastObservedWakeSequence,
      };
    }

    try {
      await this.options.stateRepository.ensureSingletonState();
      const wakeSequence = await this.options.stateRepository.getWakeSequence();
      const wakeRequested = wakeSequence > this.lastObservedWakeSequence;

      const abortBridge = toAbortBridge(signal);
      const abortSignal = abortBridge.signal;
      const leadership = await this.options.lock.withLeadership(
        this.options.workerId,
        async () => {
          try {
            await this.options.stateRepository.markRunning(this.options.workerId);
            const recordsStored = await this.drainWithinCycleBudget(abortSignal);
            await this.options.stateRepository.markSuccess(this.options.workerId, recordsStored);
            return recordsStored;
          } finally {
            abortBridge.dispose();
          }
        }
      );

      if (!leadership.acquired) {
        if (wakeRequested) {
          this.lastObservedWakeSequence = wakeSequence;
        }
        await this.options.stateRepository.markStandby(this.options.workerId);
        return {
          status: "standby",
          waitMs: this.options.idleMs,
          wakeSequence,
        };
      }

      let handledWakeSequence = wakeSequence;
      if (wakeRequested) {
        const latestWakeSequence = await this.options.stateRepository.getWakeSequence();
        handledWakeSequence = Math.max(wakeSequence, latestWakeSequence);
      }

      this.lastObservedWakeSequence = handledWakeSequence;
      if (wakeRequested) {
        await this.options.stateRepository.markWakeHandled(
          this.options.workerId,
          handledWakeSequence
        );
      }

      return {
        status: "success",
        waitMs: wakeRequested ? 0 : this.options.idleMs,
        wakeSequence: handledWakeSequence,
      };
    } catch (error) {
      const reason = toErrorMessage(error);
      await this.options.stateRepository.ensureSingletonState();
      await this.options.stateRepository.markError(this.options.workerId, reason);
      return {
        status: "error",
        waitMs: this.options.errorBackoffMs,
        wakeSequence: this.lastObservedWakeSequence,
        error: reason,
      };
    }
  }

  private async drainWithinCycleBudget(abortSignal: AbortSignal | undefined): Promise<number> {
    let cycles = 0;
    let processedRecords = 0;

    do {
      const drainResult = await this.options.orchestrator.drainNow({
        pull: {
          maxMessages: this.options.pullBatchSize,
          signal: abortSignal,
        },
        process: {
          maxRecords: this.options.processBatchSize,
          signal: abortSignal,
        },
      });

      processedRecords += Math.max(0, drainResult.summary.processed.processed);
      cycles += 1;

      if (abortSignal?.aborted) {
        break;
      }
      if (cycles >= this.maxDrainCycles) {
        break;
      }
      if (!hasPotentialBacklog(drainResult, this.options.pullBatchSize, this.options.processBatchSize)) {
        break;
      }
    } while (true);

    return processedRecords;
  }
}

function toAbortBridge(signal?: CollectorRunSignal): {
  signal: AbortSignal | undefined;
  dispose: () => void;
} {
  if (!signal) {
    return { signal: undefined, dispose: noop };
  }

  if (typeof AbortController === "undefined") {
    return {
      signal: signal.aborted ? AbortSignal.abort() : undefined,
      dispose: noop,
    };
  }

  if (signal.aborted) {
    return { signal: AbortSignal.abort(), dispose: noop };
  }

  const controller = new AbortController();
  let disposed = false;
  let unsubscribe: (() => void) | undefined;
  let watcher: NodeJS.Timeout | undefined;

  const cleanup = () => {
    if (disposed) {
      return;
    }
    disposed = true;
    if (watcher) {
      clearInterval(watcher);
      watcher = undefined;
    }
    if (unsubscribe) {
      unsubscribe();
      unsubscribe = undefined;
    }
  };

  const abort = () => {
    if (!controller.signal.aborted) {
      controller.abort();
    }
    cleanup();
  };

  if (signal.onAbort) {
    unsubscribe = signal.onAbort(abort);
  } else {
    watcher = setInterval(() => {
      if (signal.aborted) {
        abort();
      }
    }, 25);
  }

  return { signal: controller.signal, dispose: cleanup };
}

function noop(): void {
  // intentionally empty
}

async function defaultSleep(ms: number, signal: CollectorRunSignal): Promise<void> {
  if (ms <= 0 || signal.aborted) {
    return;
  }
  await new Promise<void>((resolve) => {
    const timer = setTimeout(() => {
      resolve();
    }, ms);

    if (signal.aborted) {
      clearTimeout(timer);
      resolve();
    }
  });
}

function toErrorMessage(value: unknown): string {
  if (value instanceof Error && value.message) {
    return value.message;
  }
  return "collector_run_failed";
}

function hasPotentialBacklog(
  result: {
    summary: {
      pulled: {
        pulled: number;
      };
      processed: {
        claimed: number;
      };
    };
  },
  pullBatchSize: number,
  processBatchSize: number
): boolean {
  const pulledAtLimit = pullBatchSize > 0 && result.summary.pulled.pulled >= pullBatchSize;
  const processedAtLimit =
    processBatchSize > 0 && result.summary.processed.claimed >= processBatchSize;
  return pulledAtLimit || processedAtLimit;
}

function normalizePositiveInt(value: number): number {
  if (!Number.isFinite(value)) {
    return 1;
  }
  return Math.max(1, Math.trunc(value));
}
