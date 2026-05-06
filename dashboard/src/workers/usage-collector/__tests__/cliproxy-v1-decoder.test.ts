import { describe, expect, it } from "vitest";
import { CLIProxyV1Decoder } from "@/workers/usage-collector/decoders/cliproxy-v1-decoder";
import type { UsageSourceEnvelope } from "@/workers/usage-collector/core/types";

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
          total_tokens: 35,
        },
        failed: false,
        provider: "openai",
        model: "gpt-4.1",
        endpoint: "/v1/chat/completions",
        auth_type: "api-key",
        request_id: "req_123",
      })
    );

    const result = decoder.decode(payload);

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    expect(result.event.eventKey).toBe("req_123");
    expect(result.event.requestId).toBe("req_123");
    expect(result.event.authIndex).toBe("auth-123");
    expect(result.event.timestamp.toISOString()).toBe("2026-05-05T01:02:03.000Z");
    expect(result.event.tokens.totalTokens).toBe(35);
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
