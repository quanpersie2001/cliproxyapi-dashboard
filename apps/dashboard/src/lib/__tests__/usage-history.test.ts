import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

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
  afterEach(() => {
    vi.useRealTimers();
  });

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

  it("anchors recent windows and hourly labels to current time when range end is in the future", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-05-07T18:45:12.000Z"));

    prisma.user.findUnique.mockResolvedValue({
      id: "user-1",
      isAdmin: false,
      username: "alice",
    });
    prisma.providerOAuthOwnership.findMany.mockResolvedValue([]);
    prisma.user.findMany.mockResolvedValue([{ id: "user-1", username: "alice" }]);
    prisma.userApiKey.findMany.mockResolvedValue([]);
    prisma.providerKeyOwnership.findMany.mockResolvedValue([]);
    prisma.customProvider.findMany.mockResolvedValue([]);
    prisma.collectorState.findFirst.mockResolvedValue({
      lastCollectedAt: new Date("2026-05-07T18:40:00.000Z"),
      lastStatus: "success",
    });

    fetchWithTimeout.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ auth_files: [] }),
      body: { cancel: vi.fn() },
    });

    const record = {
      eventKey: "evt-1",
      apiKeyId: null,
      userId: "user-1",
      authIndex: "auth-1",
      endpoint: "/v1/chat/completions",
      model: "claude-sonnet-4",
      source: "alice",
      latencyMs: 500,
      totalTokens: 12,
      inputTokens: 7,
      outputTokens: 5,
      reasoningTokens: 0,
      cachedTokens: 0,
      failed: false,
      timestamp: new Date("2026-05-07T18:30:00.000Z"),
      user: { username: "alice" },
      apiKey: null,
    };

    prisma.usageRecord.findMany.mockResolvedValueOnce([record]).mockResolvedValueOnce([record]);
    prisma.usageRecord.groupBy.mockImplementation(async (args: { by: string[] }) => {
      const key = args.by.join(",");
      if (key === "apiKeyId,userId,authIndex,model,failed") {
        return [{
          apiKeyId: null,
          userId: "user-1",
          authIndex: "auth-1",
          model: "claude-sonnet-4",
          failed: false,
          _count: { _all: 1 },
          _sum: { totalTokens: 12, inputTokens: 7, outputTokens: 5, reasoningTokens: 0, cachedTokens: 0 },
        }];
      }
      if (key === "source,authIndex,failed") {
        return [{
          source: "alice",
          authIndex: "auth-1",
          failed: false,
          _count: { _all: 1 },
          _sum: { totalTokens: 12 },
        }];
      }
      if (key === "endpoint,model,failed") {
        return [{
          endpoint: "/v1/chat/completions",
          model: "claude-sonnet-4",
          failed: false,
          _count: { _all: 1 },
          _sum: { totalTokens: 12 },
        }];
      }
      throw new Error(`Unexpected groupBy call: ${key}`);
    });
    prisma.usageRecord.aggregate.mockResolvedValue({
      _count: { _all: 1 },
      _sum: { totalTokens: 12 },
    });

    prisma.$queryRaw
      .mockResolvedValueOnce([
        {
          bucket: new Date("2026-05-07T00:00:00.000Z"),
          model: "claude-sonnet-4",
          requests: 1,
          totalTokens: 12,
          inputTokens: 7,
          outputTokens: 5,
          reasoningTokens: 0,
          cachedTokens: 0,
          promptTokens: 7,
          successCount: 1,
          failureCount: 0,
        },
      ])
      .mockResolvedValueOnce([
        {
          bucket: new Date("2026-05-07T18:00:00.000Z"),
          model: "claude-sonnet-4",
          requests: 1,
          totalTokens: 12,
          inputTokens: 7,
          outputTokens: 5,
          reasoningTokens: 0,
          cachedTokens: 0,
          promptTokens: 7,
          successCount: 1,
          failureCount: 0,
        },
      ])
      .mockResolvedValueOnce([{ sampleCount: 1, averageMs: 500, p95Ms: 500, maxMs: 500 }])
      .mockResolvedValueOnce([{ blockIndex: 671, successCount: 1, failureCount: 0 }]);

    const { getUsageHistorySnapshot } = await import("@/lib/usage/history");

    const snapshot = await getUsageHistorySnapshot({
      userId: "user-1",
      fromDate: new Date("2026-05-01T00:00:00.000Z"),
      toDate: new Date("2026-05-07T23:59:59.000Z"),
      fromParam: "2026-05-01",
      toParam: "2026-05-07",
    });

    const aggregateArgs = prisma.usageRecord.aggregate.mock.calls[0]?.[0] as {
      where: { timestamp: { gte: Date; lte: Date } };
    };

    expect(aggregateArgs.where.timestamp.lte.toISOString()).toBe("2026-05-07T18:45:12.000Z");
    expect(aggregateArgs.where.timestamp.gte.toISOString()).toBe("2026-05-07T18:15:12.000Z");
    expect(snapshot.data.requestTrend.hour.at(-1)?.label).toBe("2026-05-07T18:00:00.000Z");
  });

  it("includes unresolved admin traffic with null apiKeyId across snapshot sections", async () => {
    prisma.user.findUnique.mockResolvedValue({
      id: "admin-1",
      isAdmin: true,
      username: "admin",
    });
    prisma.providerOAuthOwnership.findMany.mockResolvedValue([]);
    prisma.user.findMany.mockResolvedValue([]);
    prisma.userApiKey.findMany.mockResolvedValue([]);
    prisma.providerKeyOwnership.findMany.mockResolvedValue([]);
    prisma.customProvider.findMany.mockResolvedValue([]);
    prisma.collectorState.findFirst.mockResolvedValue({
      lastCollectedAt: new Date("2026-05-07T16:00:00.000Z"),
      lastStatus: "success",
    });

    fetchWithTimeout.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ auth_files: [] }),
      body: { cancel: vi.fn() },
    });

    const unresolvedRecord = {
      eventKey: "evt-unresolved-1",
      apiKeyId: null,
      userId: null,
      authIndex: "auth-unresolved-1",
      endpoint: "/v1/chat/completions",
      model: "claude-sonnet-4",
      source: "",
      latencyMs: 500,
      totalTokens: 12,
      inputTokens: 7,
      outputTokens: 5,
      reasoningTokens: 0,
      cachedTokens: 0,
      failed: false,
      timestamp: new Date("2026-05-07T10:30:00.000Z"),
      user: null,
      apiKey: null,
    };

    prisma.usageRecord.findMany.mockImplementation(async (args: { where?: { apiKeyId?: { not?: null } } }) => {
      if (args.where?.apiKeyId?.not === null) {
        return [];
      }
      return [unresolvedRecord];
    });

    prisma.usageRecord.groupBy.mockImplementation(async (args: { by: string[]; where?: { apiKeyId?: { not?: null } } }) => {
      if (args.where?.apiKeyId?.not === null) {
        return [];
      }

      const key = args.by.join(",");
      if (key === "apiKeyId,userId,authIndex,model,failed") {
        return [
          {
            apiKeyId: null,
            userId: null,
            authIndex: "auth-unresolved-1",
            model: "claude-sonnet-4",
            failed: false,
            _count: { _all: 1 },
            _sum: {
              totalTokens: 12,
              inputTokens: 7,
              outputTokens: 5,
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
            authIndex: "auth-unresolved-1",
            failed: false,
            _count: { _all: 1 },
            _sum: { totalTokens: 12 },
          },
        ];
      }

      if (key === "endpoint,model,failed") {
        return [
          {
            endpoint: "/v1/chat/completions",
            model: "claude-sonnet-4",
            failed: false,
            _count: { _all: 1 },
            _sum: { totalTokens: 12 },
          },
        ];
      }

      throw new Error(`Unexpected groupBy call: ${key}`);
    });

    prisma.usageRecord.aggregate.mockImplementation(async (args: { where?: { apiKeyId?: { not?: null } } }) => {
      if (args.where?.apiKeyId?.not === null) {
        return {
          _count: { _all: 0 },
          _sum: { totalTokens: 0 },
        };
      }
      return {
        _count: { _all: 1 },
        _sum: { totalTokens: 12 },
      };
    });

    prisma.$queryRaw.mockImplementation(async (...rawArgs: unknown[]) => {
      const sqlArg = rawArgs[0] as { strings?: string[] };
      const sqlText = Array.isArray(sqlArg?.strings) ? sqlArg.strings.join(" ") : "";

      if (sqlText.includes("DATE_TRUNC('day'")) {
        if (sqlText.includes('"apiKeyId" IS NOT NULL')) {
          return [];
        }
        return [
          {
            bucket: new Date("2026-05-07T00:00:00.000Z"),
            model: "claude-sonnet-4",
            requests: 1,
            totalTokens: 12,
            inputTokens: 7,
            outputTokens: 5,
            reasoningTokens: 0,
            cachedTokens: 0,
            promptTokens: 7,
            successCount: 1,
            failureCount: 0,
          },
        ];
      }

      if (sqlText.includes("DATE_TRUNC('hour'")) {
        if (sqlText.includes('"apiKeyId" IS NOT NULL')) {
          return [];
        }
        return [
          {
            bucket: new Date("2026-05-07T10:00:00.000Z"),
            model: "claude-sonnet-4",
            requests: 1,
            totalTokens: 12,
            inputTokens: 7,
            outputTokens: 5,
            reasoningTokens: 0,
            cachedTokens: 0,
            promptTokens: 7,
            successCount: 1,
            failureCount: 0,
          },
        ];
      }

      if (sqlText.includes("PERCENTILE_CONT")) {
        if (sqlText.includes('"apiKeyId" IS NOT NULL')) {
          return [{ sampleCount: 0, averageMs: 0, p95Ms: 0, maxMs: 0 }];
        }
        return [{ sampleCount: 1, averageMs: 500, p95Ms: 500, maxMs: 500 }];
      }

      if (sqlText.includes("blockIndex")) {
        if (sqlText.includes('"apiKeyId" IS NOT NULL')) {
          return [];
        }
        return [{ blockIndex: 0, successCount: 1, failureCount: 0 }];
      }

      throw new Error(`Unexpected queryRaw SQL: ${sqlText}`);
    });

    const { getUsageHistorySnapshot } = await import("@/lib/usage/history");

    const snapshot = await getUsageHistorySnapshot({
      userId: "admin-1",
      fromDate: new Date("2026-05-01T00:00:00.000Z"),
      toDate: new Date("2026-05-07T23:59:59.000Z"),
      fromParam: "2026-05-01",
      toParam: "2026-05-07",
    });

    expect(snapshot.data.requestEvents).toHaveLength(1);
    expect(snapshot.data.totals.totalRequests).toBe(1);
    expect(snapshot.data.recentRate.requestCount).toBe(1);
    expect(snapshot.data.modelBreakdown).toEqual([
      expect.objectContaining({ model: "claude-sonnet-4", requests: 1, tokens: 12 }),
    ]);
  });

  it("separates cost basis by provider+model and preserves reasoning tokens", async () => {
    prisma.user.findUnique.mockResolvedValue({ id: "admin-1", isAdmin: true, username: "admin" });
    prisma.providerOAuthOwnership.findMany.mockResolvedValue([]);
    prisma.user.findMany.mockResolvedValue([]);
    prisma.userApiKey.findMany.mockResolvedValue([]);
    prisma.providerKeyOwnership.findMany.mockResolvedValue([]);
    prisma.customProvider.findMany.mockResolvedValue([]);
    prisma.collectorState.findFirst.mockResolvedValue({
      lastCollectedAt: new Date("2026-05-07T16:00:00.000Z"),
      lastStatus: "success",
    });

    fetchWithTimeout.mockResolvedValue({ ok: true, json: () => Promise.resolve({ auth_files: [] }), body: { cancel: vi.fn() } });

    const requestRecord = {
      eventKey: "evt-1",
      apiKeyId: null,
      userId: null,
      authIndex: "auth-1",
      endpoint: "/v1/chat/completions",
      model: "gpt-4.1",
      source: "",
      latencyMs: 100,
      totalTokens: 100,
      inputTokens: 60,
      outputTokens: 40,
      reasoningTokens: 10,
      cachedTokens: 5,
      failed: false,
      timestamp: new Date("2026-05-07T10:30:00.000Z"),
      user: null,
      apiKey: null,
    };

    prisma.usageRecord.findMany.mockResolvedValue([requestRecord]);
    prisma.usageRecord.aggregate.mockResolvedValue({ _count: { _all: 1 }, _sum: { totalTokens: 100 } });
    prisma.usageRecord.groupBy.mockImplementation(async (args: { by: string[] }) => {
      const key = args.by.join(",");
      if (key === "apiKeyId,userId,authIndex,model,failed") {
        return [{
          apiKeyId: null,
          userId: null,
          authIndex: "auth-1",
          model: "gpt-4.1",
          failed: false,
          _count: { _all: 1 },
          _sum: { totalTokens: 100, inputTokens: 60, outputTokens: 40, reasoningTokens: 10, cachedTokens: 5 },
        }];
      }
      if (key === "source,authIndex,failed") {
        return [{ source: "", authIndex: "auth-1", failed: false, _count: { _all: 1 }, _sum: { totalTokens: 100 } }];
      }
      if (key === "endpoint,model,failed") {
        return [{ endpoint: "/v1/chat/completions", model: "gpt-4.1", failed: false, _count: { _all: 1 }, _sum: { totalTokens: 100 } }];
      }
      throw new Error(`Unexpected groupBy call: ${key}`);
    });

    prisma.$queryRaw.mockImplementation(async (...rawArgs: unknown[]) => {
      const sqlArg = rawArgs[0] as { strings?: string[] };
      const sqlText = Array.isArray(sqlArg?.strings) ? sqlArg.strings.join(" ") : "";
      if (sqlText.includes("DATE_TRUNC('day'")) {
        return [
          {
            bucket: new Date("2026-05-07T00:00:00.000Z"),
            provider: "openai",
            model: "gpt-4.1",
            requests: 1,
            totalTokens: 100,
            inputTokens: 60,
            outputTokens: 40,
            reasoningTokens: 10,
            cachedTokens: 5,
            promptTokens: 55,
            successCount: 1,
            failureCount: 0,
          },
          {
            bucket: new Date("2026-05-07T00:00:00.000Z"),
            provider: "anthropic",
            model: "gpt-4.1",
            requests: 2,
            totalTokens: 200,
            inputTokens: 120,
            outputTokens: 80,
            reasoningTokens: 30,
            cachedTokens: 20,
            promptTokens: 100,
            successCount: 2,
            failureCount: 0,
          },
        ];
      }
      if (sqlText.includes("DATE_TRUNC('hour'")) {
        return [
          {
            bucket: new Date("2026-05-07T10:00:00.000Z"),
            provider: "openai",
            model: "gpt-4.1",
            requests: 1,
            totalTokens: 100,
            inputTokens: 60,
            outputTokens: 40,
            reasoningTokens: 10,
            cachedTokens: 5,
            promptTokens: 55,
            successCount: 1,
            failureCount: 0,
          },
        ];
      }
      if (sqlText.includes("PERCENTILE_CONT")) {
        return [{ sampleCount: 1, averageMs: 100, p95Ms: 100, maxMs: 100 }];
      }
      if (sqlText.includes("blockIndex")) {
        return [{ blockIndex: 0, successCount: 1, failureCount: 0 }];
      }
      throw new Error(`Unexpected queryRaw SQL: ${sqlText}`);
    });

    const { getUsageHistorySnapshot } = await import("@/lib/usage/history");

    const snapshot = await getUsageHistorySnapshot({
      userId: "admin-1",
      fromDate: new Date("2026-05-01T00:00:00.000Z"),
      toDate: new Date("2026-05-07T23:59:59.000Z"),
      fromParam: "2026-05-01",
      toParam: "2026-05-07",
    });

    expect(snapshot.data.costBreakdown.totalsByModel["openai:gpt-4.1"]).toEqual({
      promptTokens: 55,
      cachedTokens: 5,
      outputTokens: 40,
      reasoningTokens: 10,
    });
    expect(snapshot.data.costBreakdown.totalsByModel["anthropic:gpt-4.1"]).toEqual({
      promptTokens: 100,
      cachedTokens: 20,
      outputTokens: 80,
      reasoningTokens: 30,
    });
  });
});
