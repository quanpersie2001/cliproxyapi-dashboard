import { describe, expect, it } from "vitest";
import { buildUsageEventKey } from "@/server/jobs/workers/usage-collector/core/event-key";
import type { NormalizedQueuedUsageEvent } from "@/server/jobs/workers/usage-collector/core/types";

type EventKeyInput = Omit<NormalizedQueuedUsageEvent, "eventKey">;

function createEvent(overrides: Partial<EventKeyInput> = {}): EventKeyInput {
  return {
    requestId: null,
    provider: "openai",
    authType: "api-key",
    authIndex: "auth-123",
    apiGroupKey: "/v1/chat/completions",
    model: "gpt-4.1",
    modelAlias: null,
    source: "codex",
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
      reasoningTokens: 5,
      cachedTokens: 2,
      cacheReadTokens: 0,
      cacheCreationTokens: 0,
      totalTokens: 35,
    },
    ...overrides,
  };
}

describe("buildUsageEventKey", () => {
  it("includes non-empty requestId in the canonical hash without making it the whole key", () => {
    const event = createEvent({ requestId: "  req_abc_123  " });
    const sameWithoutRequestId = createEvent({ requestId: null });

    expect(buildUsageEventKey(event)).toMatch(/^[a-f0-9]{64}$/);
    expect(buildUsageEventKey(event)).not.toBe(buildUsageEventKey(sameWithoutRequestId));
  });

  it("falls back to deterministic hash when requestId is blank", () => {
    const event = createEvent({ requestId: "   " });
    const key = buildUsageEventKey(event);

    expect(key).toMatch(/^[a-f0-9]{64}$/);
    expect(key).toBe(buildUsageEventKey(event));
  });

  it("normalizes totalTokens to input+output when total is zero", () => {
    const eventWithZeroTotal = createEvent({
      requestId: null,
      tokens: {
        inputTokens: 7,
        outputTokens: 11,
        reasoningTokens: 3,
        cachedTokens: 99,
        cacheReadTokens: 0,
        cacheCreationTokens: 0,
        totalTokens: 0,
      },
    });
    const eventWithComputedTotal = createEvent({
      requestId: null,
      tokens: {
        inputTokens: 7,
        outputTokens: 11,
        reasoningTokens: 3,
        cachedTokens: 0,
        cacheReadTokens: 0,
        cacheCreationTokens: 0,
        totalTokens: 18,
      },
    });

    expect(buildUsageEventKey(eventWithZeroTotal)).toBe(
      buildUsageEventKey(eventWithComputedTotal)
    );
  });

  it("uses cachedTokens only when total and io/reasoning are all zero", () => {
    const eventWithCachedFallback = createEvent({
      requestId: null,
      tokens: {
        inputTokens: 0,
        outputTokens: 0,
        reasoningTokens: 0,
        cachedTokens: 9,
        cacheReadTokens: 0,
        cacheCreationTokens: 0,
        totalTokens: 0,
      },
    });
    const eventWithExplicitTotal = createEvent({
      requestId: null,
      tokens: {
        inputTokens: 0,
        outputTokens: 0,
        reasoningTokens: 0,
        cachedTokens: 0,
        cacheReadTokens: 0,
        cacheCreationTokens: 0,
        totalTokens: 9,
      },
    });

    expect(buildUsageEventKey(eventWithCachedFallback)).toBe(
      buildUsageEventKey(eventWithExplicitTotal)
    );
  });

  it("normalizes timestamps to UTC when hashing fallback tuple", () => {
    const base = createEvent({
      requestId: null,
      timestamp: new Date("2026-05-05T07:00:00.000Z"),
    });
    const sameMomentDifferentOffset = createEvent({
      requestId: null,
      timestamp: new Date("2026-05-05T14:00:00.000+07:00"),
    });

    expect(buildUsageEventKey(base)).toBe(buildUsageEventKey(sameMomentDifferentOffset));
  });

  it("keeps duplicate requestId segments distinct when model changes", () => {
    const base = createEvent({ requestId: "req-shared" });
    const nextSegment = createEvent({
      requestId: "req-shared",
      model: "gpt-4.1-mini",
    });

    expect(buildUsageEventKey(base)).not.toBe(buildUsageEventKey(nextSegment));
  });
});
