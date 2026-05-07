import { beforeEach, describe, expect, it, vi } from "vitest";

const usageAnalyticsMock = vi.fn(() => null);
const loadModelPricingMock = vi.fn();
const headersMock = vi.fn();

vi.mock("next/navigation", () => ({
  redirect: vi.fn(),
}));

vi.mock("next/headers", () => ({
  headers: headersMock,
}));

vi.mock("@/components/dashboard/available-model-groups", () => ({
  AvailableModelGroups: () => null,
}));

vi.mock("@/components/ui/badge", () => ({
  Badge: () => null,
}));

vi.mock("@/features/usage/components/usage-analytics", () => ({
  UsageAnalytics: usageAnalyticsMock,
}));

vi.mock("@/features/usage/model-pricing", () => ({
  loadModelPricing: loadModelPricingMock,
}));

vi.mock("@/server/auth/lib/session", () => ({
  verifySession: vi.fn(async () => ({ userId: "user-1" })),
}));

vi.mock("@/server/db/client", () => ({
  prisma: {
    userApiKey: {
      count: vi.fn(async () => 1),
      findFirst: vi.fn(async () => ({ key: "k-1", name: "Key" })),
    },
    providerKeyOwnership: {
      count: vi.fn(async () => 1),
    },
    providerOAuthOwnership: {
      count: vi.fn(async () => 1),
    },
    customProvider: {
      count: vi.fn(async () => 0),
      findMany: vi.fn(async () => []),
    },
    usageRecord: {
      count: vi.fn(async () => 1),
    },
  },
}));

vi.mock("@/lib/proxy-models", () => ({
  fetchAvailableAuthFileModels: vi.fn(async () => ({ activeAuthFiles: [], models: [] })),
  fetchAvailableProxyModels: vi.fn(async () => []),
  groupProxyModelsByProvider: vi.fn(() => []),
}));

vi.mock("@/lib/model-preferences", () => ({
  loadExcludedModelsForUser: vi.fn(async () => []),
}));

vi.mock("@/lib/metric-format", () => ({
  formatMetricCompact: vi.fn((value: number) => String(value)),
}));

vi.mock("@/lib/usage/dashboard-window", () => ({
  getUtcDayRange: vi.fn(() => ({
    fromDate: new Date("2026-05-01T00:00:00.000Z"),
    toDate: new Date("2026-05-07T23:59:59.000Z"),
    fromParam: "2026-05-01",
    toParam: "2026-05-07",
  })),
}));

vi.mock("@/lib/usage/history", () => ({
  getUsageHistorySnapshot: vi.fn(async () => ({
    isAdmin: true,
    data: {
      totals: {
        totalRequests: 1,
        totalTokens: 10,
        inputTokens: 6,
        outputTokens: 4,
        reasoningTokens: 0,
        cachedTokens: 0,
        successCount: 1,
        failureCount: 0,
      },
      dailyBreakdown: [],
      modelBreakdown: [],
      apiBreakdown: [],
      credentialBreakdown: [],
      requestEvents: [],
      latencySeries: [],
      latencySummary: { sampleCount: 0, averageMs: 0, p95Ms: 0, maxMs: 0 },
      recentRate: { windowMinutes: 30, requestCount: 0, tokenCount: 0, rpm: 0, tpm: 0 },
      serviceHealth: {
        successRate: 100,
        totalSuccess: 0,
        totalFailure: 0,
        rows: 7,
        cols: 96,
        blockSizeMinutes: 15,
        blockDetails: [],
      },
      modelNames: [],
      requestTrend: { hour: [], day: [] },
      tokenTrend: { hour: [], day: [] },
      tokenBreakdown: { hour: [], day: [] },
      costBreakdown: { hour: [], day: [], totalsByModel: {} },
      period: {
        from: "2026-05-01T00:00:00.000Z",
        to: "2026-05-07T23:59:59.000Z",
      },
      collectorStatus: {
        lastCollectedAt: "2026-05-07T00:00:00.000Z",
        lastStatus: "success",
      },
      keys: {},
      truncated: false,
    },
  })),
}));

describe("DashboardOverviewPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    headersMock.mockResolvedValue({
      get: (key: string) => {
        if (key === "host") return "localhost:3000";
        if (key === "x-forwarded-proto") return "http";
        if (key === "cookie") return "session=abc";
        return null;
      },
    });
    loadModelPricingMock.mockResolvedValue([
      {
        provider: "openai",
        model: "gpt-4.1",
        promptPriceUsd: 2,
        completionPriceUsd: 8,
        cachePriceUsd: 1,
        reasoningPriceUsd: 0,
        isActive: true,
      },
    ]);
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, text: async () => "ok" })));
  });

  it("passes initialModelPricing to UsageAnalytics in embedded overview", async () => {
    const { default: DashboardOverviewPage } = await import("@/app/dashboard/page");

    const tree = await DashboardOverviewPage();

    function findUsageAnalyticsElement(node: unknown): { props: Record<string, unknown> } | null {
      if (!node || typeof node !== "object") return null;
      const element = node as {
        type?: unknown;
        props?: { children?: unknown } & Record<string, unknown>;
      };
      if (element.type === usageAnalyticsMock) return { props: element.props ?? {} };
      const children = element.props?.children;
      if (!children) return null;
      if (Array.isArray(children)) {
        for (const child of children) {
          const match = findUsageAnalyticsElement(child);
          if (match) return match;
        }
        return null;
      }
      return findUsageAnalyticsElement(children);
    }

    const usageAnalyticsElement = findUsageAnalyticsElement(tree);
    expect(usageAnalyticsElement).not.toBeNull();
    expect(usageAnalyticsElement?.props).toEqual(
      expect.objectContaining({
        initialModelPricing: [
          expect.objectContaining({ provider: "openai", model: "gpt-4.1" }),
        ],
        embedded: true,
      }),
    );
  });
});
