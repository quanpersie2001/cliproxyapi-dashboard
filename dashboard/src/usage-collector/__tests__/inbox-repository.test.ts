import { describe, expect, it, vi } from "vitest";
import { UsageQueueInboxStatus } from "@/generated/prisma/enums";
import type { UsageSourceEnvelope } from "@/usage-collector/core/types";
vi.mock("server-only", () => ({}));
vi.mock("@/lib/db", () => ({
  prisma: {},
}));
import { PrismaUsageQueueInboxRepository } from "@/usage-collector/repositories/inbox-repository";

function createPrismaMock() {
  const usageQueueInbox = {
    createMany: vi.fn(),
    updateMany: vi.fn(),
    findMany: vi.fn(),
    update: vi.fn(),
  };

  const prisma = {
    usageQueueInbox,
    $queryRaw: vi.fn(),
    $transaction: vi.fn(),
  };

  return { prisma, usageQueueInbox };
}

describe("PrismaUsageQueueInboxRepository", () => {
  it("stores raw source messages unchanged in usage_queue_inbox", async () => {
    const { prisma, usageQueueInbox } = createPrismaMock();
    usageQueueInbox.createMany.mockResolvedValue({ count: 2 });
    const repository = new PrismaUsageQueueInboxRepository({
      prisma: prisma as never,
    });
    const messages: UsageSourceEnvelope[] = [
      {
        source: "resp_queue",
        receivedAt: new Date("2026-05-05T00:00:00.000Z"),
        rawMessage: '{"request_id":"req_1"}',
      },
      {
        source: "resp_queue",
        receivedAt: new Date("2026-05-05T00:00:01.000Z"),
        rawMessage: '{"request_id":"req_2"}',
      },
    ];

    const storedCount = await repository.storeRawMessages(messages);

    expect(storedCount).toBe(2);
    expect(usageQueueInbox.createMany).toHaveBeenCalledWith({
      data: [
        {
          rawMessage: '{"request_id":"req_1"}',
          source: "resp_queue",
        },
        {
          rawMessage: '{"request_id":"req_2"}',
          source: "resp_queue",
        },
      ],
    });
  });

  it("claims rows with FOR UPDATE SKIP LOCKED semantics and increments attempt metadata", async () => {
    const now = new Date("2026-05-05T10:00:00.000Z");
    const { prisma, usageQueueInbox } = createPrismaMock();
    const tx = {
      $queryRaw: vi.fn().mockResolvedValue([{ id: "inbox_1" }]),
      usageQueueInbox: {
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
        findMany: vi.fn().mockResolvedValue([
          {
            id: "inbox_1",
            rawMessage: '{"request_id":"req_1"}',
            status: UsageQueueInboxStatus.pending,
            createdAt: new Date("2026-05-05T09:59:00.000Z"),
            updatedAt: new Date("2026-05-05T09:59:00.000Z"),
            eventKey: null,
            requestId: null,
            provider: null,
            authType: null,
            authIndex: null,
            apiGroupKey: null,
            model: null,
            source: "resp_queue",
            timestamp: null,
            attemptCount: 1,
            lastAttemptAt: now,
            processedAt: null,
            failedAt: null,
            discardedAt: null,
            failureReason: null,
            discardReason: null,
          },
        ]),
      },
    };

    prisma.$transaction.mockImplementation(async (callback: (transaction: typeof tx) => unknown) =>
      callback(tx)
    );

    const repository = new PrismaUsageQueueInboxRepository({
      prisma: prisma as never,
      now: () => now,
    });

    const claimed = await repository.claimForProcessing({ maxRecords: 1 });

    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(tx.$queryRaw).toHaveBeenCalledTimes(1);
    const queryArgument = tx.$queryRaw.mock.calls[0][0] as { strings?: string[] };
    const queryText = queryArgument.strings?.join(" ") ?? "";
    expect(queryText).toContain("FOR UPDATE SKIP LOCKED");
    expect(tx.usageQueueInbox.updateMany).toHaveBeenCalledWith({
      where: { id: { in: ["inbox_1"] } },
      data: {
        attemptCount: { increment: 1 },
        lastAttemptAt: now,
      },
    });
    expect(tx.usageQueueInbox.findMany).toHaveBeenCalledWith({
      where: { id: { in: ["inbox_1"] } },
      orderBy: { createdAt: "asc" },
    });
    expect(claimed).toHaveLength(1);
    expect(claimed[0]?.id).toBe("inbox_1");
  });

  it("marks decode failures with status and reason", async () => {
    const now = new Date("2026-05-05T10:10:00.000Z");
    const { prisma, usageQueueInbox } = createPrismaMock();
    usageQueueInbox.update.mockResolvedValue({});
    const repository = new PrismaUsageQueueInboxRepository({
      prisma: prisma as never,
      now: () => now,
    });

    await repository.markDecodeFailed("inbox_2", "invalid_json");

    expect(usageQueueInbox.update).toHaveBeenCalledWith({
      where: { id: "inbox_2" },
      data: {
        status: UsageQueueInboxStatus.decode_failed,
        failedAt: now,
        failureReason: "invalid_json",
      },
    });
  });

  it("marks discarded rows with timestamp and discard reason", async () => {
    const now = new Date("2026-05-05T10:20:00.000Z");
    const { prisma, usageQueueInbox } = createPrismaMock();
    usageQueueInbox.update.mockResolvedValue({});
    const repository = new PrismaUsageQueueInboxRepository({
      prisma: prisma as never,
      now: () => now,
    });

    await repository.markDiscarded("inbox_3", "max_attempts_exceeded");

    expect(usageQueueInbox.update).toHaveBeenCalledWith({
      where: { id: "inbox_3" },
      data: {
        status: UsageQueueInboxStatus.discarded,
        discardedAt: now,
        discardReason: "max_attempts_exceeded",
      },
    });
  });
});
