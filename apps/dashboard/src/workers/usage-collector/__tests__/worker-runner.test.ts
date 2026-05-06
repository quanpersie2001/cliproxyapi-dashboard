import { describe, expect, it, vi } from "vitest";
import type { CollectorOrchestrator } from "@/workers/usage-collector/core/orchestrator";
import type { CollectorLeaderLock } from "@/workers/usage-collector/infra/leader-lock";
import type { CollectorStateRepository } from "@/workers/usage-collector/repositories/collector-state-repository";
import type {
  CollectorRunSignal,
  UsageCollectorWorkerRunnerOptions,
} from "@/workers/usage-collector/runner";
import { UsageCollectorWorkerRunner } from "@/workers/usage-collector/runner";

function createRunner(
  overrides: Partial<UsageCollectorWorkerRunnerOptions> = {}
): {
  runner: UsageCollectorWorkerRunner;
  orchestrator: CollectorOrchestrator;
  lock: CollectorLeaderLock;
  stateRepository: CollectorStateRepository;
} {
  const defaultOrchestrator: CollectorOrchestrator = {
    pullOnce: vi.fn(),
    processOnce: vi.fn(),
    drainNow: vi.fn().mockResolvedValue({
      summary: {
        pulled: { pulled: 2, stored: 2, dropped: 0, durationMs: 1 },
        processed: {
          claimed: 2,
          processed: 2,
          decodeFailed: 0,
          processFailed: 0,
          discarded: 0,
          durationMs: 1,
        },
      },
    }),
  };

  const defaultLock: CollectorLeaderLock = {
    withLeadership: vi.fn().mockImplementation(async (_workerId, run) => ({
      acquired: true,
      value: await run(),
    })),
  };

  const defaultStateRepository: CollectorStateRepository = {
    ensureSingletonState: vi.fn().mockResolvedValue(undefined),
    getWakeSequence: vi.fn().mockResolvedValue(0),
    markStandby: vi.fn().mockResolvedValue(undefined),
    markRunning: vi.fn().mockResolvedValue(undefined),
    markSuccess: vi.fn().mockResolvedValue(undefined),
    markError: vi.fn().mockResolvedValue(undefined),
    markWakeHandled: vi.fn().mockResolvedValue(undefined),
  };

  const orchestrator = overrides.orchestrator ?? defaultOrchestrator;
  const lock = overrides.lock ?? defaultLock;
  const stateRepository = overrides.stateRepository ?? defaultStateRepository;

  const runner = new UsageCollectorWorkerRunner({
    workerId: "worker-a",
    orchestrator,
    lock,
    stateRepository,
    enabled: true,
    pullBatchSize: 50,
    processBatchSize: 50,
    maxDrainCycles: 3,
    idleMs: 1_000,
    errorBackoffMs: 5_000,
    sleep: async () => undefined,
    ...overrides,
  });

  return { runner, orchestrator, lock, stateRepository };
}

describe("UsageCollectorWorkerRunner", () => {
  it("stays standby when leadership is not acquired", async () => {
    const { runner, orchestrator, lock, stateRepository } = createRunner({
      lock: {
        withLeadership: vi.fn().mockResolvedValue({ acquired: false }),
      },
    });

    const result = await runner.runOnce();

    expect(result).toEqual({
      status: "standby",
      waitMs: 1000,
      wakeSequence: 0,
    });
    expect(lock.withLeadership).toHaveBeenCalledTimes(1);
    expect(stateRepository.markStandby).toHaveBeenCalledWith("worker-a");
    expect(orchestrator.drainNow).not.toHaveBeenCalled();
  });

  it("processes work as leader and records wake handling when wake sequence advances", async () => {
    const { runner, orchestrator, stateRepository } = createRunner({
      stateRepository: {
        ensureSingletonState: vi.fn().mockResolvedValue(undefined),
        getWakeSequence: vi.fn().mockResolvedValue(2),
        markStandby: vi.fn().mockResolvedValue(undefined),
        markRunning: vi.fn().mockResolvedValue(undefined),
        markSuccess: vi.fn().mockResolvedValue(undefined),
        markError: vi.fn().mockResolvedValue(undefined),
        markWakeHandled: vi.fn().mockResolvedValue(undefined),
      },
    });

    const result = await runner.runOnce();

    expect(result).toEqual({
      status: "success",
      waitMs: 0,
      wakeSequence: 2,
    });
    expect(orchestrator.drainNow).toHaveBeenCalledWith({
      pull: { maxMessages: 50, signal: undefined },
      process: { maxRecords: 50, signal: undefined },
    });
    expect(stateRepository.markRunning).toHaveBeenCalledWith("worker-a");
    expect(stateRepository.markSuccess).toHaveBeenCalledWith("worker-a", 2);
    expect(stateRepository.markWakeHandled).toHaveBeenCalledWith("worker-a", 2);
  });

  it("keeps follower standby bounded after wake sequence advances", async () => {
    const { runner, orchestrator, stateRepository } = createRunner({
      lock: {
        withLeadership: vi.fn().mockResolvedValue({ acquired: false }),
      },
      stateRepository: {
        ensureSingletonState: vi.fn().mockResolvedValue(undefined),
        getWakeSequence: vi.fn().mockResolvedValue(5),
        markStandby: vi.fn().mockResolvedValue(undefined),
        markRunning: vi.fn().mockResolvedValue(undefined),
        markSuccess: vi.fn().mockResolvedValue(undefined),
        markError: vi.fn().mockResolvedValue(undefined),
        markWakeHandled: vi.fn().mockResolvedValue(undefined),
      },
    });

    const result = await runner.runOnce();

    expect(result).toEqual({
      status: "standby",
      waitMs: 1000,
      wakeSequence: 5,
    });
    expect(stateRepository.markStandby).toHaveBeenCalledWith("worker-a");
    expect(orchestrator.drainNow).not.toHaveBeenCalled();
    expect(stateRepository.markWakeHandled).not.toHaveBeenCalled();
  });

  it("preserves overlapping newer wake sequence after a successful leader run", async () => {
    let wakeSequence = 4;
    const { runner, stateRepository } = createRunner({
      orchestrator: {
        pullOnce: vi.fn(),
        processOnce: vi.fn(),
        drainNow: vi.fn().mockImplementation(async () => {
          wakeSequence = 5;
          return {
            summary: {
              pulled: { pulled: 1, stored: 1, dropped: 0, durationMs: 1 },
              processed: {
                claimed: 1,
                processed: 1,
                decodeFailed: 0,
                processFailed: 0,
                discarded: 0,
                durationMs: 1,
              },
            },
          };
        }),
      },
      stateRepository: {
        ensureSingletonState: vi.fn().mockResolvedValue(undefined),
        getWakeSequence: vi.fn().mockImplementation(async () => wakeSequence),
        markStandby: vi.fn().mockResolvedValue(undefined),
        markRunning: vi.fn().mockResolvedValue(undefined),
        markSuccess: vi.fn().mockResolvedValue(undefined),
        markError: vi.fn().mockResolvedValue(undefined),
        markWakeHandled: vi.fn().mockImplementation(async (_workerId, value) => {
          wakeSequence = Math.max(wakeSequence, value);
        }),
      },
    });

    const firstRun = await runner.runOnce();

    expect(firstRun).toEqual({
      status: "success",
      waitMs: 0,
      wakeSequence: 5,
    });
    expect(stateRepository.markWakeHandled).toHaveBeenCalledWith("worker-a", 5);

    const secondRun = await runner.runOnce();

    expect(secondRun).toEqual({
      status: "success",
      waitMs: 1000,
      wakeSequence: 5,
    });
  });

  it("marks error and returns backoff when orchestration fails", async () => {
    const failure = new Error("resp unavailable");
    const { runner, orchestrator, stateRepository } = createRunner();
    vi.mocked(orchestrator.drainNow).mockRejectedValueOnce(failure);

    const result = await runner.runOnce();

    expect(result).toEqual({
      status: "error",
      waitMs: 5000,
      wakeSequence: 0,
      error: "resp unavailable",
    });
    expect(stateRepository.markError).toHaveBeenCalledWith(
      "worker-a",
      "resp unavailable"
    );
  });

  it("runs loop continuously with backoff and exits when signal is aborted", async () => {
    const sleepCalls: number[] = [];
    const runSignal: CollectorRunSignal = { aborted: false };
    const { runner } = createRunner({
      sleep: async (ms, signal) => {
        sleepCalls.push(ms);
        signal.aborted = true;
      },
    });

    await runner.start(runSignal);

    expect(sleepCalls.length).toBe(1);
    expect(sleepCalls[0]).toBeGreaterThanOrEqual(0);
  });

  it("drains multiple batches before sleeping when backlog still appears full-batch", async () => {
    const { runner, orchestrator } = createRunner({
      stateRepository: {
        ensureSingletonState: vi.fn().mockResolvedValue(undefined),
        getWakeSequence: vi.fn().mockResolvedValue(0),
        markStandby: vi.fn().mockResolvedValue(undefined),
        markRunning: vi.fn().mockResolvedValue(undefined),
        markSuccess: vi.fn().mockResolvedValue(undefined),
        markError: vi.fn().mockResolvedValue(undefined),
        markWakeHandled: vi.fn().mockResolvedValue(undefined),
      },
      orchestrator: {
        pullOnce: vi.fn(),
        processOnce: vi.fn(),
        drainNow: vi
          .fn()
          .mockResolvedValueOnce({
            summary: {
              pulled: { pulled: 50, stored: 50, dropped: 0, durationMs: 1 },
              processed: {
                claimed: 50,
                processed: 50,
                decodeFailed: 0,
                processFailed: 0,
                discarded: 0,
                durationMs: 1,
              },
            },
          })
          .mockResolvedValueOnce({
            summary: {
              pulled: { pulled: 2, stored: 2, dropped: 0, durationMs: 1 },
              processed: {
                claimed: 2,
                processed: 2,
                decodeFailed: 0,
                processFailed: 0,
                discarded: 0,
                durationMs: 1,
              },
            },
          }),
      },
    });

    const result = await runner.runOnce();

    expect(result).toEqual({
      status: "success",
      waitMs: 1000,
      wakeSequence: 0,
    });
    expect(vi.mocked(orchestrator.drainNow)).toHaveBeenCalledTimes(2);
  });

  it("keeps bounded draining by maxDrainCycles even when every cycle is full-batch", async () => {
    const { runner, orchestrator } = createRunner({
      maxDrainCycles: 2,
      stateRepository: {
        ensureSingletonState: vi.fn().mockResolvedValue(undefined),
        getWakeSequence: vi.fn().mockResolvedValue(0),
        markStandby: vi.fn().mockResolvedValue(undefined),
        markRunning: vi.fn().mockResolvedValue(undefined),
        markSuccess: vi.fn().mockResolvedValue(undefined),
        markError: vi.fn().mockResolvedValue(undefined),
        markWakeHandled: vi.fn().mockResolvedValue(undefined),
      },
      orchestrator: {
        pullOnce: vi.fn(),
        processOnce: vi.fn(),
        drainNow: vi.fn().mockResolvedValue({
          summary: {
            pulled: { pulled: 50, stored: 50, dropped: 0, durationMs: 1 },
            processed: {
              claimed: 50,
              processed: 50,
              decodeFailed: 0,
              processFailed: 0,
              discarded: 0,
              durationMs: 1,
            },
          },
        }),
      },
    });

    await runner.runOnce();

    expect(vi.mocked(orchestrator.drainNow)).toHaveBeenCalledTimes(2);
  });

  it("propagates a live abort signal into in-flight drain operations", async () => {
    const abortListeners = new Set<() => void>();
    const runSignal: CollectorRunSignal = {
      aborted: false,
      onAbort: (listener) => {
        abortListeners.add(listener);
        return () => {
          abortListeners.delete(listener);
        };
      },
    };

    const { runner, orchestrator } = createRunner({
      orchestrator: {
        pullOnce: vi.fn(),
        processOnce: vi.fn(),
        drainNow: vi.fn().mockImplementation(async ({ pull, process }) => {
          expect(pull.signal).toBeDefined();
          expect(process.signal).toBeDefined();
          expect(pull.signal?.aborted).toBe(false);
          expect(process.signal?.aborted).toBe(false);

          return await new Promise((_resolve, reject) => {
            pull.signal?.addEventListener(
              "abort",
              () => {
                reject(new Error("drain aborted"));
              },
              { once: true }
            );
          });
        }),
      },
    });

    const runOncePromise = runner.runOnce(runSignal);
    await new Promise((resolve) => setTimeout(resolve, 10));
    runSignal.aborted = true;
    abortListeners.forEach((listener) => listener());

    const result = await runOncePromise;

    expect(vi.mocked(orchestrator.drainNow)).toHaveBeenCalledTimes(1);
    expect(result).toEqual({
      status: "error",
      waitMs: 5000,
      wakeSequence: 0,
      error: "drain aborted",
    });
  });
});
