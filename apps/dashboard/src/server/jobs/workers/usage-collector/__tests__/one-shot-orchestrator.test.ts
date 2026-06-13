import { describe, expect, it, vi } from "vitest";
import type {
  UsageMessageSource,
  UsagePayloadDecoder,
  UsageQueueInboxRepository,
  UsageRecordRepository,
} from "@/server/jobs/workers/usage-collector/contracts";
import { OneShotCollectorOrchestrator } from "@/server/jobs/workers/usage-collector/core/one-shot-orchestrator";
import { CollectorProcessService } from "@/server/jobs/workers/usage-collector/core/process-service";
import { CollectorPullService } from "@/server/jobs/workers/usage-collector/core/pull-service";
import type { NormalizedQueuedUsageEvent, UsageInboxRecord } from "@/server/jobs/workers/usage-collector/core/types";

function createEvent(eventKey: string): NormalizedQueuedUsageEvent {
  return {
    eventKey,
    requestId: `req-${eventKey}`,
    provider: "openai",
    authType: "api-key",
    authIndex: "auth-1",
    apiGroupKey: "/v1/chat/completions",
    model: "gpt-4.1",
    modelAlias: null,
    source: "source-a",
    timestamp: new Date("2026-05-05T00:00:00.000Z"),
    failed: false,
    latencyMs: 120,
    ttftMs: null,
    reasoningEffort: null,
    serviceTier: null,
    executorType: null,
    tokens: {
      inputTokens: 10,
      outputTokens: 20,
      reasoningTokens: 0,
      cachedTokens: 0,
      cacheReadTokens: 0,
      cacheCreationTokens: 0,
      totalTokens: 30,
    },
  };
}

function createInboxRecord(id: string, rawMessage: string, attemptCount = 1): UsageInboxRecord {
  return {
    id,
    rawMessage,
    status: "pending",
    createdAt: new Date("2026-05-05T00:00:00.000Z"),
    updatedAt: new Date("2026-05-05T00:00:00.000Z"),
    attemptCount,
  };
}

describe("OneShotCollectorOrchestrator", () => {
  it("reports pull metrics from source and inbox spool", async () => {
    const source: UsageMessageSource = {
      pullBatch: vi.fn().mockResolvedValue([
        {
          source: "resp_queue",
          receivedAt: new Date("2026-05-05T00:00:00.000Z"),
          rawMessage: '{"ok":1}',
        },
        {
          source: "resp_queue",
          receivedAt: new Date("2026-05-05T00:00:01.000Z"),
          rawMessage: '{"ok":2}',
        },
      ]),
    };
    const inboxRepository: UsageQueueInboxRepository = {
      storeRawMessages: vi.fn().mockResolvedValue(1),
      claimForProcessing: vi.fn(),
      markProcessed: vi.fn(),
      markDecodeFailed: vi.fn(),
      markProcessFailed: vi.fn(),
      markDiscarded: vi.fn(),
    };
    const pullService = new CollectorPullService({
      source,
      inboxRepository,
      now: (() => {
        const times = [0, 5];
        return () => new Date(times.shift() ?? 5);
      })(),
    });

    const result = await pullService.pullOnce({ maxMessages: 2 });

    expect(result.metrics).toEqual({
      pulled: 2,
      stored: 1,
      dropped: 1,
      durationMs: 5,
    });
  });

  it("fails closed with explicit loss-window signal when pull persistence fails", async () => {
    const source: UsageMessageSource = {
      pullBatch: vi.fn().mockResolvedValue([
        {
          source: "resp_queue",
          receivedAt: new Date("2026-05-05T00:00:00.000Z"),
          rawMessage: '{"ok":1}',
        },
        {
          source: "resp_queue",
          receivedAt: new Date("2026-05-05T00:00:01.000Z"),
          rawMessage: '{"ok":2}',
        },
      ]),
    };
    const inboxRepository: UsageQueueInboxRepository = {
      storeRawMessages: vi.fn().mockRejectedValue(new Error("db unavailable")),
      claimForProcessing: vi.fn(),
      markProcessed: vi.fn(),
      markDecodeFailed: vi.fn(),
      markProcessFailed: vi.fn(),
      markDiscarded: vi.fn(),
    };
    const pullService = new CollectorPullService({
      source,
      inboxRepository,
      now: (() => {
        const times = [0, 2];
        return () => new Date(times.shift() ?? 2);
      })(),
    });

    await expect(pullService.pullOnce({ maxMessages: 2 })).rejects.toThrow(
      "pull_store_failed: pulled=2 persisted=0 loss_window_open=true reason=db unavailable"
    );
  });

  it("processes mixed batches with decode failures and successful persistence", async () => {
    const inboxRepository: UsageQueueInboxRepository = {
      storeRawMessages: vi.fn(),
      claimForProcessing: vi
        .fn()
        .mockResolvedValue([
          createInboxRecord("r1", '{"kind":"valid","key":"evt-1"}'),
          createInboxRecord("r2", '{"kind":"invalid"}'),
          createInboxRecord("r3", '{"kind":"valid","key":"evt-2"}'),
        ]),
      markProcessed: vi.fn().mockResolvedValue(undefined),
      markDecodeFailed: vi.fn().mockResolvedValue(undefined),
      markProcessFailed: vi.fn().mockResolvedValue(undefined),
      markDiscarded: vi.fn().mockResolvedValue(undefined),
    };
    const decoder: UsagePayloadDecoder = {
      decode: vi.fn((envelope) => {
        const payload = JSON.parse(envelope.rawMessage) as { kind: string; key?: string };
        if (payload.kind === "invalid") {
          return {
            ok: false,
            error: {
              reason: "invalid_payload",
              retriable: false,
            },
          } as const;
        }
        return {
          ok: true,
          event: createEvent(payload.key ?? "evt-fallback"),
        } as const;
      }),
    };
    const usageRecordRepository: UsageRecordRepository = {
      persistNormalizedEvents: vi.fn().mockResolvedValue(2),
    };

    const processService = new CollectorProcessService({
      decoder,
      inboxRepository,
      usageRecordRepository,
      now: (() => {
        const times = [10, 20];
        return () => new Date(times.shift() ?? 20);
      })(),
    });

    const result = await processService.processOnce({ maxRecords: 3 });

    expect(usageRecordRepository.persistNormalizedEvents).toHaveBeenCalledWith([
      createEvent("evt-1"),
      createEvent("evt-2"),
    ]);
    expect(inboxRepository.markDecodeFailed).toHaveBeenCalledWith(
      "r2",
      "invalid_payload",
      1
    );
    expect(inboxRepository.markProcessed).toHaveBeenCalledTimes(2);
    expect(result.metrics).toEqual({
      claimed: 3,
      processed: 2,
      decodeFailed: 1,
      processFailed: 0,
      discarded: 0,
      durationMs: 10,
    });
  });

  it("marks persistence failures as process_failed or discarded by attempt budget", async () => {
    const inboxRepository: UsageQueueInboxRepository = {
      storeRawMessages: vi.fn(),
      claimForProcessing: vi
        .fn()
        .mockResolvedValue([
          createInboxRecord("high-attempt", '{"kind":"valid","key":"evt-1"}', 10),
          createInboxRecord("retryable", '{"kind":"valid","key":"evt-2"}', 2),
        ]),
      markProcessed: vi.fn().mockResolvedValue(undefined),
      markDecodeFailed: vi.fn().mockResolvedValue(undefined),
      markProcessFailed: vi.fn().mockResolvedValue(undefined),
      markDiscarded: vi.fn().mockResolvedValue(undefined),
    };
    const decoder: UsagePayloadDecoder = {
      decode: vi.fn((envelope) => {
        const payload = JSON.parse(envelope.rawMessage) as { key: string };
        return {
          ok: true,
          event: createEvent(payload.key),
        } as const;
      }),
    };
    const usageRecordRepository: UsageRecordRepository = {
      persistNormalizedEvents: vi.fn().mockRejectedValue(new Error("db write failed")),
    };

    const processService = new CollectorProcessService({
      decoder,
      inboxRepository,
      usageRecordRepository,
      maxProcessAttempts: 10,
      now: (() => {
        const times = [0, 5];
        return () => new Date(times.shift() ?? 5);
      })(),
    });

    const result = await processService.processOnce({ maxRecords: 2 });

    expect(inboxRepository.markDiscarded).toHaveBeenCalledWith(
      "high-attempt",
      "db write failed",
      10
    );
    expect(inboxRepository.markProcessFailed).toHaveBeenCalledWith(
      "retryable",
      "db write failed",
      2
    );
    expect(result.metrics).toEqual({
      claimed: 2,
      processed: 0,
      decodeFailed: 0,
      processFailed: 1,
      discarded: 1,
      durationMs: 5,
    });
  });

  it("does not reclassify already-processed rows when a later markProcessed fails", async () => {
    const inboxRepository: UsageQueueInboxRepository = {
      storeRawMessages: vi.fn(),
      claimForProcessing: vi
        .fn()
        .mockResolvedValue([
          createInboxRecord("processed-first", '{"kind":"valid","key":"evt-1"}', 1),
          createInboxRecord("mark-fails", '{"kind":"valid","key":"evt-2"}', 2),
          createInboxRecord("processed-last", '{"kind":"valid","key":"evt-3"}', 1),
        ]),
      markProcessed: vi
        .fn()
        .mockResolvedValueOnce(undefined)
        .mockRejectedValueOnce(new Error("mark failed"))
        .mockResolvedValueOnce(undefined),
      markDecodeFailed: vi.fn().mockResolvedValue(undefined),
      markProcessFailed: vi.fn().mockResolvedValue(undefined),
      markDiscarded: vi.fn().mockResolvedValue(undefined),
    };
    const decoder: UsagePayloadDecoder = {
      decode: vi.fn((envelope) => {
        const payload = JSON.parse(envelope.rawMessage) as { key: string };
        return {
          ok: true,
          event: createEvent(payload.key),
        } as const;
      }),
    };
    const usageRecordRepository: UsageRecordRepository = {
      persistNormalizedEvents: vi.fn().mockResolvedValue(3),
    };

    const processService = new CollectorProcessService({
      decoder,
      inboxRepository,
      usageRecordRepository,
      maxProcessAttempts: 10,
      now: (() => {
        const times = [0, 6];
        return () => new Date(times.shift() ?? 6);
      })(),
    });

    const result = await processService.processOnce({ maxRecords: 3 });

    expect(inboxRepository.markProcessed).toHaveBeenCalledTimes(3);
    expect(inboxRepository.markProcessFailed).toHaveBeenCalledTimes(1);
    expect(inboxRepository.markProcessFailed).toHaveBeenCalledWith(
      "mark-fails",
      "mark failed",
      2
    );
    expect(inboxRepository.markDiscarded).not.toHaveBeenCalled();
    expect(result.metrics).toEqual({
      claimed: 3,
      processed: 2,
      decodeFailed: 0,
      processFailed: 1,
      discarded: 0,
      durationMs: 6,
    });
  });

  it("keeps processOnce successful when retention cleanup throws", async () => {
    const inboxRepository: UsageQueueInboxRepository = {
      storeRawMessages: vi.fn(),
      claimForProcessing: vi
        .fn()
        .mockResolvedValue([createInboxRecord("cleanup-1", '{"kind":"valid","key":"evt-clean"}', 1)]),
      markProcessed: vi.fn().mockResolvedValue(undefined),
      markDecodeFailed: vi.fn().mockResolvedValue(undefined),
      markProcessFailed: vi.fn().mockResolvedValue(undefined),
      markDiscarded: vi.fn().mockResolvedValue(undefined),
      cleanupExpiredRecords: vi.fn().mockRejectedValue(new Error("cleanup failed")),
    };

    const decoder: UsagePayloadDecoder = {
      decode: vi.fn((envelope) => {
        const payload = JSON.parse(envelope.rawMessage) as { key: string };
        return {
          ok: true,
          event: createEvent(payload.key),
        } as const;
      }),
    };

    const usageRecordRepository: UsageRecordRepository = {
      persistNormalizedEvents: vi.fn().mockResolvedValue(1),
    };

    const processService = new CollectorProcessService({
      decoder,
      inboxRepository,
      usageRecordRepository,
      now: (() => {
        const times = [0, 4];
        return () => new Date(times.shift() ?? 4);
      })(),
    });

    const result = await processService.processOnce({ maxRecords: 1 });

    expect(inboxRepository.cleanupExpiredRecords).toHaveBeenCalledTimes(1);
    expect(inboxRepository.markProcessed).toHaveBeenCalledTimes(1);
    expect(result.metrics).toEqual({
      claimed: 1,
      processed: 1,
      decodeFailed: 0,
      processFailed: 0,
      discarded: 0,
      durationMs: 4,
    });
  });

  it("composes pull and process into drainNow summary", async () => {
    const source: UsageMessageSource = {
      pullBatch: vi
        .fn()
        .mockResolvedValue([
          { source: "resp_queue", receivedAt: new Date("2026-05-05T00:00:00.000Z"), rawMessage: '{"ok":1}' },
        ]),
    };
    const inboxRepository: UsageQueueInboxRepository = {
      storeRawMessages: vi.fn().mockResolvedValue(1),
      claimForProcessing: vi.fn().mockResolvedValue([]),
      markProcessed: vi.fn(),
      markDecodeFailed: vi.fn(),
      markProcessFailed: vi.fn(),
      markDiscarded: vi.fn(),
    };
    const decoder: UsagePayloadDecoder = {
      decode: vi.fn(),
    };
    const usageRecordRepository: UsageRecordRepository = {
      persistNormalizedEvents: vi.fn(),
    };

    const orchestrator = new OneShotCollectorOrchestrator({
      pullService: new CollectorPullService({
        source,
        inboxRepository,
      }),
      processService: new CollectorProcessService({
        decoder,
        inboxRepository,
        usageRecordRepository,
      }),
    });

    const drained = await orchestrator.drainNow({
      pull: { maxMessages: 1 },
      process: { maxRecords: 10 },
    });

    expect(drained.summary.pulled.pulled).toBe(1);
    expect(drained.summary.processed.claimed).toBe(0);
  });
});
