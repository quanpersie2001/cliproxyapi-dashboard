import { describe, expect, it } from "vitest";
import { CLIProxyV1Decoder } from "@/server/jobs/workers/usage-collector/decoders/cliproxy-v1-decoder";
import type { UsageSourceEnvelope } from "@/server/jobs/workers/usage-collector/core/types";

function createEnvelope(rawMessage: string): UsageSourceEnvelope {
  return {
    source: "resp_queue",
    receivedAt: new Date("2026-05-05T00:00:00.000Z"),
    rawMessage,
    sourceMessageId: null,
  };
}

describe("CLIProxyV1Decoder", () => {
  it("decodes a valid queue payload into a normalized usage event", () => {
    const decoder = new CLIProxyV1Decoder();
    const payload = createEnvelope(
      JSON.stringify({
        timestamp: "2026-05-05T01:02:03.000Z",
        latency_ms: 125,
        source: "codex",
        auth_index: "auth-123",
        tokens: {
          input_tokens: 10,
          output_tokens: 20,
          reasoning_tokens: 3,
          cached_tokens: 2,
          cache_read_tokens: 1,
          cache_creation_tokens: 4,
          total_tokens: 35,
        },
        failed: false,
        provider: "openai",
        model: "gpt-4.1",
        alias: "gpt-4.1-alias",
        reasoning_effort: "medium",
        service_tier: "priority",
        executor_type: "responses",
        endpoint: "/v1/chat/completions",
        auth_type: "api-key",
        request_id: "req_123",
        ttft_ms: 51,
      })
    );

    const result = decoder.decode(payload);

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    expect(result.event.eventKey).toMatch(/^[a-f0-9]{64}$/);
    expect(result.event.requestId).toBe("req_123");
    expect(result.event.authIndex).toBe("auth-123");
    expect(result.event.timestamp.toISOString()).toBe("2026-05-05T01:02:03.000Z");
    expect(result.event.modelAlias).toBe("gpt-4.1-alias");
    expect(result.event.reasoningEffort).toBe("medium");
    expect(result.event.serviceTier).toBe("priority");
    expect(result.event.executorType).toBe("responses");
    expect(result.event.ttftMs).toBe(51);
    expect(result.event.tokens.cacheReadTokens).toBe(1);
    expect(result.event.tokens.cacheCreationTokens).toBe(4);
    expect(result.event.tokens.totalTokens).toBe(35);
  });

  it("normalizes Claude token payloads into Codex/OpenAI storage style", () => {
    const decoder = new CLIProxyV1Decoder();
    const result = decoder.decode(
      createEnvelope(
        JSON.stringify({
          timestamp: "2026-05-05T01:02:03.000Z",
          source: "claude",
          auth_index: "auth-claude",
          provider: "anthropic",
          model: "claude-4",
          tokens: {
            input_tokens: 100,
            output_tokens: 30,
            reasoning_tokens: 0,
            cached_tokens: 999,
            cache_read_tokens: 20,
            cache_creation_tokens: 5,
            total_tokens: 0,
          },
        })
      )
    );

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    expect(result.event.tokens).toMatchObject({
      inputTokens: 125,
      outputTokens: 30,
      cachedTokens: 20,
      cacheReadTokens: 20,
      cacheCreationTokens: 5,
      totalTokens: 155,
    });
  });

  it("folds Gemini-family reasoning into output when the raw total includes reasoning", () => {
    const decoder = new CLIProxyV1Decoder();
    const result = decoder.decode(
      createEnvelope(
        JSON.stringify({
          timestamp: "2026-05-05T01:02:03.000Z",
          source: "gemini",
          auth_index: "auth-gemini",
          provider: "gemini-cli",
          model: "gemini-2.5-pro",
          tokens: {
            input_tokens: 100,
            output_tokens: 30,
            reasoning_tokens: 7,
            total_tokens: 137,
          },
        })
      )
    );

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    expect(result.event.tokens.outputTokens).toBe(37);
    expect(result.event.tokens.reasoningTokens).toBe(7);
    expect(result.event.tokens.totalTokens).toBe(137);
  });

  it("keeps OpenAI/Codex/xAI response-style token payloads and clamps negatives", () => {
    const decoder = new CLIProxyV1Decoder();
    const result = decoder.decode(
      createEnvelope(
        JSON.stringify({
          timestamp: "2026-05-05T01:02:03.000Z",
          source: "codex",
          auth_index: "auth-codex",
          provider: "xai",
          model: "grok-code-fast",
          tokens: {
            input_tokens: 100,
            output_tokens: 40,
            reasoning_tokens: 10,
            cached_tokens: -5,
            cache_read_tokens: -2,
            cache_creation_tokens: 3.9,
            total_tokens: 0,
          },
        })
      )
    );

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    expect(result.event.tokens).toMatchObject({
      inputTokens: 100,
      outputTokens: 40,
      reasoningTokens: 10,
      cachedTokens: 0,
      cacheReadTokens: 0,
      cacheCreationTokens: 3,
      totalTokens: 140,
    });
  });

  it("captures api_key when present for downstream ownership attribution", () => {
    const decoder = new CLIProxyV1Decoder();
    const payload = createEnvelope(
      JSON.stringify({
        timestamp: "2026-05-05T01:02:03.000Z",
        source: "codex",
        auth_index: "auth-123",
        model: "gpt-4.1",
        endpoint: "/v1/chat/completions",
        api_key: "sk-live-target-key",
      })
    );

    const result = decoder.decode(payload);

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    expect(result.event.apiKey).toBe("sk-live-target-key");
    expect(result.event.apiGroupKey).toBe("/v1/chat/completions");
  });

  it("returns decode_failed for malformed JSON payloads", () => {
    const decoder = new CLIProxyV1Decoder();
    const result = decoder.decode(createEnvelope("{not-json"));

    expect(result).toEqual({
      ok: false,
      error: {
        reason: "invalid_json",
        retriable: false,
      },
    });
  });

  it("returns decode_failed when auth_index is missing", () => {
    const decoder = new CLIProxyV1Decoder();
    const result = decoder.decode(
      createEnvelope(
        JSON.stringify({
          timestamp: "2026-05-05T01:02:03.000Z",
          source: "codex",
        })
      )
    );

    expect(result).toEqual({
      ok: false,
      error: {
        reason: "missing_auth_index",
        retriable: false,
      },
    });
  });

  it("fails closed when timestamp is invalid", () => {
    const decoder = new CLIProxyV1Decoder();
    const result = decoder.decode(
      createEnvelope(
        JSON.stringify({
          timestamp: "not-a-date",
          auth_index: "auth-123",
          model: "gpt-4.1",
        })
      )
    );

    expect(result).toEqual({
      ok: false,
      error: {
        reason: "invalid_timestamp",
        retriable: false,
      },
    });
  });
});
