import { describe, expect, it } from "vitest";
import {
  aggregateUsageRecords,
  summarizeLatency,
  type AggregationRecord,
} from "@/lib/usage/aggregation";

function buildRecord(overrides: Partial<AggregationRecord>): AggregationRecord {
  return {
    apiKeyId: "key-1",
    userId: "user-1",
    authIndex: "auth-1",
    endpoint: "/v1/chat/completions",
    model: "gpt-4.1",
    sourceId: "t:source-1",
    sourceDisplay: "source-1",
    latencyMs: 1200,
    totalTokens: 300,
    inputTokens: 200,
    outputTokens: 80,
    reasoningTokens: 10,
    cachedTokens: 10,
    failed: false,
    timestamp: new Date("2026-04-09T10:00:00.000Z"),
    displayNameFallback: "alice",
    username: "alice",
    apiKeyName: "Primary key",
    exposeUsername: false,
    ...overrides,
  };
}

describe("summarizeLatency", () => {
  it("computes average, p95, and max from samples", () => {
    expect(summarizeLatency([100, 200, 400, 800, 1_200])).toEqual({
      sampleCount: 5,
      averageMs: 540,
      p95Ms: 1_200,
      maxMs: 1_200,
    });
  });
});

describe("aggregateUsageRecords", () => {
  it("builds totals, daily breakdowns, recent rates, and latest request events", () => {
    const data = aggregateUsageRecords(
      [
        buildRecord({
          model: "gpt-4.1-mini",
          totalTokens: 120,
          inputTokens: 90,
          outputTokens: 20,
          reasoningTokens: 5,
          cachedTokens: 5,
          latencyMs: 900,
          timestamp: new Date("2026-04-08T22:15:00.000Z"),
        }),
        buildRecord({
          model: "gpt-4.1",
          totalTokens: 300,
          inputTokens: 200,
          outputTokens: 80,
          reasoningTokens: 10,
          cachedTokens: 10,
          latencyMs: 1_500,
          timestamp: new Date("2026-04-09T09:45:00.000Z"),
        }),
        buildRecord({
          model: "gpt-4.1",
          totalTokens: 80,
          inputTokens: 40,
          outputTokens: 30,
          reasoningTokens: 5,
          cachedTokens: 5,
          latencyMs: 0,
          failed: true,
          timestamp: new Date("2026-04-09T09:15:00.000Z"),
        }),
      ],
      {
        nowMs: Date.parse("2026-04-09T10:00:00.000Z"),
        recentWindowMinutes: 60,
        serviceHealthDays: 1,
        serviceHealthBlockMinutes: 60,
      }
    );

    expect(data.totals).toEqual({
      totalRequests: 3,
      totalTokens: 500,
      inputTokens: 330,
      outputTokens: 130,
      reasoningTokens: 20,
      cachedTokens: 20,
      successCount: 2,
      failureCount: 1,
    });
    expect(data.dailyBreakdown).toEqual([
      {
        date: "2026-04-08",
        requests: 1,
        tokens: 120,
        inputTokens: 90,
        outputTokens: 20,
        reasoningTokens: 5,
        cachedTokens: 5,
        success: 1,
        failure: 0,
      },
      {
        date: "2026-04-09",
        requests: 2,
        tokens: 380,
        inputTokens: 240,
        outputTokens: 110,
        reasoningTokens: 15,
        cachedTokens: 15,
        success: 1,
        failure: 1,
      },
    ]);
    expect(data.modelBreakdown[0]).toMatchObject({
      model: "gpt-4.1",
      requests: 2,
      tokens: 380,
      successCount: 1,
      failureCount: 1,
    });
    expect(data.recentRate).toEqual({
      windowMinutes: 60,
      requestCount: 2,
      tokenCount: 380,
      rpm: 2 / 60,
      tpm: 380 / 60,
    });
    expect(data.latencySummary).toEqual({
      sampleCount: 2,
      averageMs: 1_200,
      p95Ms: 1_500,
      maxMs: 1_500,
    });
    expect(data.requestEvents[0]).toMatchObject({
      model: "gpt-4.1",
      keyName: "Primary key",
      failed: false,
      totalTokens: 300,
    });
    expect(data.requestEvents[0]?.username).toBeUndefined();
  });

  it("tracks service health buckets and only exposes usernames when requested", () => {
    const data = aggregateUsageRecords(
      [
        buildRecord({
          username: "admin-visible",
          exposeUsername: true,
          timestamp: new Date("2026-04-09T09:45:00.000Z"),
        }),
        buildRecord({
          failed: true,
          exposeUsername: true,
          timestamp: new Date("2026-04-09T08:10:00.000Z"),
        }),
      ],
      {
        nowMs: Date.parse("2026-04-09T10:00:00.000Z"),
        serviceHealthDays: 1,
        serviceHealthBlockMinutes: 60,
      }
    );

    expect(data.serviceHealth.rows).toBe(1);
    expect(data.serviceHealth.cols).toBe(24);
    expect(data.serviceHealth.totalSuccess).toBe(1);
    expect(data.serviceHealth.totalFailure).toBe(1);
    expect(data.serviceHealth.successRate).toBe(50);
    expect(data.serviceHealth.blockDetails[23]).toMatchObject({ success: 1, failure: 0, rate: 1 });
    expect(data.serviceHealth.blockDetails[22]).toMatchObject({ success: 0, failure: 1, rate: 0 });
    expect(data.requestEvents[0]?.username).toBe("admin-visible");
  });
});
