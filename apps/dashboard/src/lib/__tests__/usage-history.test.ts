import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const usageCache = {
  get: vi.fn(),
  set: vi.fn(),
};

const prisma = {
  user: {
    findUnique: vi.fn(),
    findMany: vi.fn(),
  },
  userApiKey: {
    findMany: vi.fn(),
  },
  providerOAuthOwnership: {
    findMany: vi.fn(),
  },
  providerKeyOwnership: {
    findMany: vi.fn(),
  },
  customProvider: {
    findMany: vi.fn(),
  },
  collectorState: {
    findFirst: vi.fn(),
  },
  usageRecord: {
    findMany: vi.fn(),
    groupBy: vi.fn(),
    aggregate: vi.fn(),
  },
  $queryRaw: vi.fn(),
};

const fetchWithTimeout = vi.fn();

vi.mock("@/lib/cache", () => ({
  usageCache,
}));

vi.mock("@/server/db/client", () => ({
  prisma,
}));

vi.mock("@/lib/logger", () => ({
  logger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

vi.mock("@/lib/providers/management-api", () => ({
  MANAGEMENT_API_KEY: "1234567890123456",
  MANAGEMENT_BASE_URL: "http://test:8317/v0/management",
  fetchWithTimeout,
}));

describe("getUsageHistorySnapshot", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
    usageCache.get.mockReturnValue(null);
  });

  it("keeps usage-history compatibility for event-backed OAuth rows with blank source", async () => {
    prisma.user.findUnique.mockResolvedValue({
      id: "user-1",
      isAdmin: false,
      username: "alice",
    });
    prisma.providerOAuthOwnership.findMany
      .mockResolvedValueOnce([
        {
          accountName: "claude-account.json",
          accountEmail: "user@example.com",
        },
      ])
      .mockResolvedValueOnce([
        {
          id: "oauth-own-1",
          provider: "claude",
          accountName: "claude-account.json",
          accountEmail: "user@example.com",
        },
      ]);
    prisma.user.findMany.mockResolvedValue([
      {
        id: "user-1",
        username: "alice",
      },
    ]);
    prisma.userApiKey.findMany.mockResolvedValue([]);
    prisma.providerKeyOwnership.findMany.mockResolvedValue([]);
    prisma.customProvider.findMany.mockResolvedValue([]);
    prisma.collectorState.findFirst.mockResolvedValue({
      lastCollectedAt: new Date("2026-05-04T16:00:00.000Z"),
      lastStatus: "success",
    });

    fetchWithTimeout.mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          auth_files: [
            {
              auth_index: "auth-o1",
              file_name: "claude-account.json",
              email: "user@example.com",
            },
          ],
        }),
      body: { cancel: vi.fn() },
    });

    const requestRecord = {
      eventKey: "evt-1",
      apiKeyId: null,
      userId: "user-1",
      authIndex: "auth-o1",
      endpoint: "/v1/chat/completions",
      model: "claude-sonnet-4",
      source: "",
      latencyMs: 1500,
      totalTokens: 50,
      inputTokens: 30,
      outputTokens: 20,
      reasoningTokens: 0,
      cachedTokens: 0,
      failed: true,
      timestamp: new Date("2026-05-04T15:55:00.000Z"),
      user: { username: "alice" },
      apiKey: null,
    };

    prisma.usageRecord.findMany
      .mockResolvedValueOnce([requestRecord])
      .mockResolvedValueOnce([requestRecord]);
    prisma.usageRecord.aggregate.mockResolvedValue({
      _count: { _all: 1 },
      _sum: { totalTokens: 50 },
    });
    prisma.usageRecord.groupBy.mockImplementation(async (args: { by: string[] }) => {
      const key = args.by.join(",");
      if (key === "apiKeyId,userId,authIndex,model,failed") {
        return [
          {
            apiKeyId: null,
            userId: "user-1",
            authIndex: "auth-o1",
            model: "claude-sonnet-4",
            failed: true,
            _count: { _all: 1 },
            _sum: {
              totalTokens: 50,
              inputTokens: 30,
              outputTokens: 20,
              reasoningTokens: 0,
              cachedTokens: 0,
            },
          },
        ];
      }

      if (key === "source,authIndex,failed") {
        return [
          {
            source: "",
            authIndex: "auth-o1",
            failed: true,
            _count: { _all: 1 },
            _sum: { totalTokens: 50 },
          },
        ];
      }

      if (key === "endpoint,model,failed") {
        return [
          {
            endpoint: "/v1/chat/completions",
            model: "claude-sonnet-4",
            failed: true,
            _count: { _all: 1 },
            _sum: { totalTokens: 50 },
          },
        ];
      }

      throw new Error(`Unexpected groupBy call: ${key}`);
    });

    prisma.$queryRaw
      .mockResolvedValueOnce([
        {
          bucket: new Date("2026-05-04T00:00:00.000Z"),
          model: "claude-sonnet-4",
          requests: 1,
          totalTokens: 50,
          inputTokens: 30,
          outputTokens: 20,
          reasoningTokens: 0,
          cachedTokens: 0,
          promptTokens: 30,
          successCount: 0,
          failureCount: 1,
        },
      ])
      .mockResolvedValueOnce([
        {
          bucket: new Date("2026-05-04T15:00:00.000Z"),
          model: "claude-sonnet-4",
          requests: 1,
          totalTokens: 50,
          inputTokens: 30,
          outputTokens: 20,
          reasoningTokens: 0,
          cachedTokens: 0,
          promptTokens: 30,
          successCount: 0,
          failureCount: 1,
        },
      ])
      .mockResolvedValueOnce([
        {
          sampleCount: 1,
          averageMs: 1500,
          p95Ms: 1500,
          maxMs: 1500,
        },
      ])
      .mockResolvedValueOnce([
        {
          blockIndex: 0,
          successCount: 0,
          failureCount: 1,
        },
      ]);

    const { getUsageHistorySnapshot } = await import("@/lib/usage/history");

    const snapshot = await getUsageHistorySnapshot({
      userId: "user-1",
      fromDate: new Date("2026-05-01T00:00:00.000Z"),
      toDate: new Date("2026-05-07T23:59:59.000Z"),
      fromParam: "2026-05-01",
      toParam: "2026-05-07",
    });

    expect(fetchWithTimeout).toHaveBeenCalledWith(
      "http://test:8317/v0/management/auth-files",
      expect.objectContaining({
        method: "GET",
        headers: { Authorization: "Bearer 1234567890123456" },
      })
    );
    expect(snapshot.data.credentialBreakdown).toEqual([
      expect.objectContaining({
        sourceId: "oauth:oauth-own-1",
        sourceDisplay: "claude-account.json",
        failureCount: 1,
        successCount: 0,
      }),
    ]);
    expect(snapshot.data.requestEvents[0]).toMatchObject({
      sourceId: "oauth:oauth-own-1",
      sourceDisplay: "claude-account.json",
      failed: true,
    });
  });
});
