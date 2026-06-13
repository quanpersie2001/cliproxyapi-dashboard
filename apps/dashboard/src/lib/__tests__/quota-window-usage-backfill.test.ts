import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

describe("quota window usage backfill", () => {
  it("calculates a current 5h window from reset time and backfills token/cost", async () => {
    const {
      backfillQuotaWindowUsageStats,
      QUOTA_WINDOW_FIVE_HOURS_SECONDS,
    } = await import("@/lib/quota/window-usage-backfill");
    const sumWindowStats = vi.fn().mockResolvedValue({ tokens: 123, cost: 0.45 });

    const groups = await backfillQuotaWindowUsageStats(" 9 ", [
      {
        id: "primary-window",
        label: "5h Window",
        remainingFraction: 0.5,
        resetTime: "2026-06-01T10:00:00.000Z",
        windowSeconds: QUOTA_WINDOW_FIVE_HOURS_SECONDS,
        models: [
          {
            id: "primary-window",
            displayName: "5h Window",
            remainingFraction: 0.5,
            resetTime: "2026-06-01T10:00:00.000Z",
          },
        ],
      },
    ], {
      now: new Date("2026-06-01T08:00:00.000Z"),
      sumWindowStats,
    });

    expect(sumWindowStats).toHaveBeenCalledWith(
      "9",
      new Date("2026-06-01T05:00:00.000Z"),
      new Date("2026-06-01T08:00:00.000Z")
    );
    expect(groups[0].windowUsageTokens).toBe(123);
    expect(groups[0].windowUsageCost).toBe(0.45);
    expect(groups[0].models[0].windowUsageTokens).toBe(123);
    expect(groups[0].models[0].windowUsageCost).toBe(0.45);
  });

  it("preserves provider-supplied complete values and does not query local usage", async () => {
    const {
      backfillQuotaWindowUsageStats,
      QUOTA_WINDOW_SEVEN_DAYS_SECONDS,
    } = await import("@/lib/quota/window-usage-backfill");
    const sumWindowStats = vi.fn();

    const groups = await backfillQuotaWindowUsageStats("9", [
      {
        id: "seven-day",
        label: "7d Weekly",
        remainingFraction: 0.5,
        resetTime: "2026-06-08T00:00:00.000Z",
        windowSeconds: QUOTA_WINDOW_SEVEN_DAYS_SECONDS,
        windowUsageTokens: 77,
        windowUsageCost: 1.23,
        models: [],
      },
    ], {
      now: new Date("2026-06-07T00:00:00.000Z"),
      sumWindowStats,
    });

    expect(sumWindowStats).not.toHaveBeenCalled();
    expect(groups[0].windowUsageTokens).toBe(77);
    expect(groups[0].windowUsageCost).toBe(1.23);
  });

  it("preserves model-level complete values while backfilling missing group values", async () => {
    const {
      backfillQuotaWindowUsageStats,
      QUOTA_WINDOW_SEVEN_DAYS_SECONDS,
    } = await import("@/lib/quota/window-usage-backfill");
    const sumWindowStats = vi.fn().mockResolvedValue({ tokens: 100, cost: 2 });

    const groups = await backfillQuotaWindowUsageStats("9", [
      {
        id: "seven-day",
        label: "7d Weekly",
        remainingFraction: 0.5,
        resetTime: "2026-06-08T00:00:00.000Z",
        windowSeconds: QUOTA_WINDOW_SEVEN_DAYS_SECONDS,
        models: [
          {
            id: "sonnet",
            displayName: "Sonnet",
            remainingFraction: 0.5,
            resetTime: "2026-06-08T00:00:00.000Z",
            windowUsageTokens: 33,
            windowUsageCost: 0.75,
          },
          {
            id: "opus",
            displayName: "Opus",
            remainingFraction: 0.4,
            resetTime: "2026-06-08T00:00:00.000Z",
          },
        ],
      },
    ], {
      now: new Date("2026-06-07T00:00:00.000Z"),
      sumWindowStats,
    });

    expect(groups[0].windowUsageTokens).toBe(100);
    expect(groups[0].windowUsageCost).toBe(2);
    expect(groups[0].models[0].windowUsageTokens).toBe(33);
    expect(groups[0].models[0].windowUsageCost).toBe(0.75);
    expect(groups[0].models[1].windowUsageTokens).toBe(100);
    expect(groups[0].models[1].windowUsageCost).toBe(2);
  });

  it("strips incomplete provider values if local backfill cannot identify a supported window", async () => {
    const {
      backfillQuotaWindowUsageStats,
      QUOTA_WINDOW_FIVE_HOURS_SECONDS,
    } = await import("@/lib/quota/window-usage-backfill");

    const groups = await backfillQuotaWindowUsageStats("9", [
      {
        id: "primary-window",
        label: "5h Window",
        remainingFraction: 0.5,
        resetTime: null,
        windowSeconds: QUOTA_WINDOW_FIVE_HOURS_SECONDS,
        windowUsageTokens: 77,
        models: [
          {
            id: "primary-window",
            displayName: "5h Window",
            remainingFraction: 0.5,
            resetTime: null,
            windowUsageCost: 1.23,
          },
        ],
      },
    ], {
      sumWindowStats: vi.fn(),
    });

    expect(groups[0].windowUsageTokens).toBeUndefined();
    expect(groups[0].windowUsageCost).toBeUndefined();
    expect(groups[0].models[0].windowUsageCost).toBeUndefined();
  });

  it("does not backfill model-specific rows without clear generic window semantics", async () => {
    const { backfillQuotaWindowUsageStats } = await import("@/lib/quota/window-usage-backfill");
    const sumWindowStats = vi.fn();

    await backfillQuotaWindowUsageStats("9", [
      {
        id: "seven-day-sonnet",
        label: "7d Sonnet",
        remainingFraction: 0.2,
        resetTime: "2026-06-08T00:00:00.000Z",
        models: [],
      },
    ], {
      now: new Date("2026-06-07T00:00:00.000Z"),
      sumWindowStats,
    });

    expect(sumWindowStats).not.toHaveBeenCalled();
  });

  it("reuses one local stats query for duplicate windows in one response", async () => {
    const {
      backfillQuotaWindowUsageStats,
      QUOTA_WINDOW_FIVE_HOURS_SECONDS,
    } = await import("@/lib/quota/window-usage-backfill");
    const sumWindowStats = vi.fn().mockResolvedValue({ tokens: 5, cost: 0.01 });

    const baseGroup = {
      remainingFraction: 0.5,
      resetTime: "2026-06-01T10:00:00.000Z",
      windowSeconds: QUOTA_WINDOW_FIVE_HOURS_SECONDS,
      models: [],
    };

    await backfillQuotaWindowUsageStats("9", [
      { ...baseGroup, id: "primary", label: "Primary" },
      { ...baseGroup, id: "secondary", label: "Secondary" },
    ], {
      now: new Date("2026-06-01T08:00:00.000Z"),
      sumWindowStats,
    });

    expect(sumWindowStats).toHaveBeenCalledTimes(1);
  });
});
