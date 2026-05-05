import { describe, expect, it, vi } from "vitest";
import type { NormalizedQueuedUsageEvent } from "@/usage-collector/core/types";
vi.mock("server-only", () => ({}));
vi.mock("@/lib/db", () => ({
  prisma: {},
}));

const { invalidateUsageCaches } = vi.hoisted(() => ({
  invalidateUsageCaches: vi.fn(),
}));

vi.mock("@/lib/cache", () => ({
  invalidateUsageCaches,
}));

import { PrismaUsageRecordRepository } from "@/usage-collector/repositories/usage-record-repository";

function createEvent(overrides: Partial<NormalizedQueuedUsageEvent> = {}): NormalizedQueuedUsageEvent {
  return {
    eventKey: "evt-1",
    requestId: "req-1",
    provider: "openai",
    authType: "api-key",
    authIndex: "auth-1",
    apiGroupKey: "/v1/chat/completions",
    model: "gpt-4.1",
    source: "source-a",
    timestamp: new Date("2026-05-05T00:00:00.000Z"),
    failed: false,
    latencyMs: 120,
    tokens: {
      inputTokens: 10,
      outputTokens: 20,
      reasoningTokens: 3,
      cachedTokens: 0,
      totalTokens: 33,
    },
    ...overrides,
  };
}

describe("PrismaUsageRecordRepository", () => {
  it("persists normalized events and invalidates usage caches", async () => {
    const usageRecord = {
      createMany: vi.fn().mockResolvedValue({ count: 1 }),
    };
    const prisma = { usageRecord } as never;
    const repository = new PrismaUsageRecordRepository({ prisma });

    const persisted = await repository.persistNormalizedEvents([createEvent()]);

    expect(persisted).toBe(1);
    expect(usageRecord.createMany).toHaveBeenCalledWith({
      data: [
        expect.objectContaining({
          eventKey: "evt-1",
          authIndex: "auth-1",
          endpoint: "/v1/chat/completions",
          totalTokens: 33,
        }),
      ],
      skipDuplicates: true,
    });
    expect(invalidateUsageCaches).toHaveBeenCalledTimes(1);
  });

  it("deduplicates duplicate event keys before persistence", async () => {
    const usageRecord = {
      createMany: vi.fn().mockResolvedValue({ count: 1 }),
    };
    const prisma = { usageRecord } as never;
    const repository = new PrismaUsageRecordRepository({ prisma });

    const persisted = await repository.persistNormalizedEvents([
      createEvent({ eventKey: "dup-key" }),
      createEvent({ eventKey: "dup-key", source: "source-b" }),
      createEvent({ eventKey: "unique-key", requestId: "req-2" }),
    ]);

    expect(persisted).toBe(1);
    const firstCall = usageRecord.createMany.mock.calls[0][0];
    expect(firstCall.data).toHaveLength(2);
    expect(firstCall.data[0].eventKey).toBe("dup-key");
    expect(firstCall.data[1].eventKey).toBe("unique-key");
  });
});
