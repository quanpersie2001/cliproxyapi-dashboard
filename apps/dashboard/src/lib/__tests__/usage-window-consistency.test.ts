import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/usage/history", () => ({
  isValidUsageHistoryDateParam: (value: string) => /^\d{4}-\d{2}-\d{2}$/.test(value),
}));

describe("usage 7d window consistency", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("keeps API 7d window aligned with SSR recent window", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-05-07T18:45:12.000Z"));

    const { buildUsageWindowRange } = await import("@/server/services/resolve-usage-range");
    const { getUtcDayRange } = await import("@/lib/usage/dashboard-window");

    const apiRange = buildUsageWindowRange("7d");
    const ssrRange = getUtcDayRange(7);

    expect(apiRange.fromParam).toBe(ssrRange.fromParam);
    expect(apiRange.toParam).toBe(ssrRange.toParam);
    expect(apiRange.fromDate.toISOString()).toBe(ssrRange.fromDate.toISOString());
    expect(apiRange.toDate.toISOString()).toBe(ssrRange.toDate.toISOString());
  });
});
