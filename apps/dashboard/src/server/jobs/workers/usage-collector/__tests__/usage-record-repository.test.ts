import { beforeEach, describe, expect, it, vi } from "vitest";
import type { NormalizedQueuedUsageEvent } from "@/server/jobs/workers/usage-collector/core/types";
vi.mock("server-only", () => ({}));
vi.mock("@/server/db/client", () => ({
  prisma: {},
}));

const { invalidateUsageCaches } = vi.hoisted(() => ({
  invalidateUsageCaches: vi.fn(),
}));

vi.mock("@/lib/cache", () => ({
  invalidateUsageCaches,
}));

vi.mock("@/lib/logger", () => ({
  logger: {
    warn: vi.fn(),
  },
}));


import { PrismaUsageRecordRepository } from "@/server/jobs/workers/usage-collector/repositories/usage-record-repository";

function createEvent(overrides: Partial<NormalizedQueuedUsageEvent> = {}): NormalizedQueuedUsageEvent {
  return {
    eventKey: "evt-1",
    requestId: "req-1",
    provider: "openai",
    authType: "api-key",
    authIndex: "auth-1",
    apiGroupKey: "/v1/chat/completions",
    apiKey: null,
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
  beforeEach(() => {
    process.env.MANAGEMENT_API_KEY = "test-management-key";
    process.env.CLIPROXYAPI_MANAGEMENT_URL = "https://management.test";
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: true,
      json: async () => [],
    }));
  });

  function createOwnershipDirectoryMocks() {
    return {
      userApiKey: {
        findMany: vi.fn().mockResolvedValue([]),
      },
      providerOAuthOwnership: {
        findMany: vi.fn().mockResolvedValue([]),
      },
      providerKeyOwnership: {
        findMany: vi.fn().mockResolvedValue([]),
      },
      user: {
        findMany: vi.fn().mockResolvedValue([]),
      },
    };
  }

  it("persists normalized events and invalidates usage caches", async () => {
    const usageRecord = {
      createMany: vi.fn().mockResolvedValue({ count: 1 }),
    };
    const prisma = {
      usageRecord,
      ...createOwnershipDirectoryMocks(),
    } as never;
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
    const prisma = {
      usageRecord,
      ...createOwnershipDirectoryMocks(),
    } as never;
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

  it("persists resolved ownership fields when the event source maps to a known user", async () => {
    const usageRecord = {
      createMany: vi.fn().mockResolvedValue({ count: 1 }),
    };
    const prisma = {
      usageRecord,
      userApiKey: {
        findMany: vi.fn().mockResolvedValue([
          {
            id: "api-source",
            userId: "user-source",
            key: "sk-source",
          },
        ]),
      },
      providerOAuthOwnership: {
        findMany: vi.fn().mockResolvedValue([]),
      },
      providerKeyOwnership: {
        findMany: vi.fn().mockResolvedValue([]),
      },
      user: {
        findMany: vi.fn().mockResolvedValue([
          {
            id: "user-source",
            username: "source-owner",
          },
        ]),
      },
    } as never;
    const repository = new PrismaUsageRecordRepository({ prisma });

    await repository.persistNormalizedEvents([
      createEvent({
        source: "source-owner",
        authIndex: "auth-1",
      }),
      createEvent({
        eventKey: "evt-2",
        requestId: "req-2",
        source: "unresolved-source",
        authIndex: "auth-2",
      }),
    ]);

    const firstCall = usageRecord.createMany.mock.calls[0][0];
    expect(firstCall.data[0]).toEqual(
      expect.objectContaining({
        userId: "user-source",
        apiKeyId: "api-source",
      })
    );
    expect(firstCall.data[1]).toEqual(
      expect.objectContaining({
        userId: null,
        apiKeyId: null,
      })
    );
  });



  it("attributes usage to the exact API key when apiKey is provided", async () => {
    const usageRecord = {
      createMany: vi.fn().mockResolvedValue({ count: 1 }),
    };
    const prisma = {
      usageRecord,
      userApiKey: {
        findMany: vi.fn().mockResolvedValue([
          {
            id: "api-first",
            userId: "user-source",
            key: "sk-first",
          },
          {
            id: "api-target",
            userId: "user-source",
            key: "sk-live-target-key",
          },
        ]),
      },
      providerOAuthOwnership: {
        findMany: vi.fn().mockResolvedValue([]),
      },
      providerKeyOwnership: {
        findMany: vi.fn().mockResolvedValue([]),
      },
      user: {
        findMany: vi.fn().mockResolvedValue([
          {
            id: "user-source",
            username: "source-owner",
          },
        ]),
      },
    } as never;

    const repository = new PrismaUsageRecordRepository({ prisma });

    await repository.persistNormalizedEvents([
      createEvent({
        eventKey: "evt-with-key",
        source: "source-owner",
        apiKey: "sk-live-target-key",
      }),
    ]);

    const firstCall = usageRecord.createMany.mock.calls[0][0];
    expect(firstCall.data[0]).toEqual(
      expect.objectContaining({
        userId: "user-source",
        apiKeyId: "api-target",
      })
    );
  });

  it("resolves ownership from auth-file index when source is not directly mapped", async () => {
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      json: async () => [
        {
          auth_index: "auth-file-1",
          file_name: "claude-account.json",
          email: "",
        },
      ],
    } as Response);

    const usageRecord = {
      createMany: vi.fn().mockResolvedValue({ count: 1 }),
    };
    const prisma = {
      usageRecord,
      userApiKey: {
        findMany: vi.fn().mockResolvedValue([
          {
            id: "api-owner",
            userId: "user-owner",
            key: "sk-owner",
          },
        ]),
      },
      providerOAuthOwnership: {
        findMany: vi.fn().mockResolvedValue([]),
      },
      providerKeyOwnership: {
        findMany: vi.fn().mockResolvedValue([]),
      },
      user: {
        findMany: vi.fn().mockResolvedValue([
          {
            id: "user-owner",
            username: "claude-account.json",
          },
        ]),
      },
    } as never;

    const repository = new PrismaUsageRecordRepository({ prisma });

    await repository.persistNormalizedEvents([
      createEvent({
        eventKey: "evt-auth-file",
        source: "unknown-source",
        authIndex: "auth-file-1",
      }),
    ]);

    const firstCall = usageRecord.createMany.mock.calls[0][0];
    expect(firstCall.data[0]).toEqual(
      expect.objectContaining({
        userId: "user-owner",
        apiKeyId: "api-owner",
      })
    );
  });

  it("reuses cached ownership directories across batches within ttl", async () => {
    const usageRecord = {
      createMany: vi.fn().mockResolvedValue({ count: 1 }),
    };
    const userApiKeyFindMany = vi.fn().mockResolvedValue([]);
    const oauthOwnershipFindMany = vi.fn().mockResolvedValue([]);
    const keyOwnershipFindMany = vi.fn().mockResolvedValue([]);
    const userFindMany = vi.fn().mockResolvedValue([]);

    const prisma = {
      usageRecord,
      userApiKey: {
        findMany: userApiKeyFindMany,
      },
      providerOAuthOwnership: {
        findMany: oauthOwnershipFindMany,
      },
      providerKeyOwnership: {
        findMany: keyOwnershipFindMany,
      },
      user: {
        findMany: userFindMany,
      },
    } as never;

    const repository = new PrismaUsageRecordRepository({
      prisma,
      ownershipCacheTtlMs: 60_000,
    });

    await repository.persistNormalizedEvents([createEvent({ eventKey: "evt-cache-1" })]);
    await repository.persistNormalizedEvents([createEvent({ eventKey: "evt-cache-2" })]);

    expect(userApiKeyFindMany).toHaveBeenCalledTimes(1);
    expect(oauthOwnershipFindMany).toHaveBeenCalledTimes(1);
    expect(keyOwnershipFindMany).toHaveBeenCalledTimes(1);
    expect(userFindMany).toHaveBeenCalledTimes(1);
    expect(usageRecord.createMany).toHaveBeenCalledTimes(2);
  });
});
