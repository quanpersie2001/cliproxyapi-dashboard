import type { UsagePayloadDecoder } from "@/usage-collector/contracts";
import { buildUsageEventKey } from "@/usage-collector/core/event-key";
import type {
  DecodedUsageMessage,
  NormalizedQueuedUsageEvent,
  NormalizedTokenUsage,
  UsageSourceEnvelope,
} from "@/usage-collector/core/types";

type QueuedPayload = {
  timestamp?: unknown;
  latency_ms?: unknown;
  source?: unknown;
  auth_index?: unknown;
  tokens?: unknown;
  failed?: unknown;
  provider?: unknown;
  model?: unknown;
  endpoint?: unknown;
  auth_type?: unknown;
  request_id?: unknown;
};

type EventKeyInput = Omit<NormalizedQueuedUsageEvent, "eventKey">;

export class CLIProxyV1Decoder implements UsagePayloadDecoder {
  public decode(envelope: UsageSourceEnvelope): DecodedUsageMessage {
    const payloadResult = parsePayload(envelope.rawMessage);
    if (!payloadResult.ok) {
      return payloadResult;
    }

    const eventResult = toEventInput(payloadResult.payload);
    if (!eventResult.ok) {
      return eventResult;
    }

    let eventKey: string;
    try {
      eventKey = buildUsageEventKey(eventResult.event);
    } catch (error) {
      return decodeFailure(`invalid_event_identity:${toErrorMessage(error)}`);
    }

    return {
      ok: true,
      event: {
        ...eventResult.event,
        eventKey,
      },
    };
  }
}

function parsePayload(rawMessage: string):
  | { ok: true; payload: QueuedPayload }
  | { ok: false; error: { reason: string; retriable: boolean } } {
  let parsed: unknown;
  try {
    parsed = JSON.parse(rawMessage);
  } catch {
    return decodeFailure("invalid_json");
  }

  if (!isRecord(parsed)) {
    return decodeFailure("invalid_payload");
  }

  return { ok: true, payload: parsed };
}

function toEventInput(payload: QueuedPayload):
  | { ok: true; event: EventKeyInput }
  | { ok: false; error: { reason: string; retriable: boolean } } {
  const authIndex = normalizeText(payload.auth_index);
  if (authIndex.length === 0) {
    return decodeFailure("missing_auth_index");
  }

  const timestamp = parseTimestamp(payload.timestamp);
  if (!timestamp) {
    return decodeFailure("invalid_timestamp");
  }

  return {
    ok: true,
    event: {
      requestId: normalizeNullableText(payload.request_id),
      provider: normalizeNullableText(payload.provider),
      authType: normalizeNullableText(payload.auth_type),
      authIndex,
      apiGroupKey: normalizeNullableText(payload.endpoint),
      model: normalizeText(payload.model) || "unknown",
      source: normalizeText(payload.source) || "unknown",
      timestamp,
      failed: payload.failed === true,
      latencyMs: normalizeCount(payload.latency_ms),
      tokens: normalizeTokens(payload.tokens),
    },
  };
}

function normalizeTokens(value: unknown): NormalizedTokenUsage {
  if (!isRecord(value)) {
    return {
      inputTokens: 0,
      outputTokens: 0,
      reasoningTokens: 0,
      cachedTokens: 0,
      totalTokens: 0,
    };
  }

  return {
    inputTokens: normalizeCount(value.input_tokens),
    outputTokens: normalizeCount(value.output_tokens),
    reasoningTokens: normalizeCount(value.reasoning_tokens),
    cachedTokens: normalizeCount(value.cached_tokens),
    totalTokens: normalizeCount(value.total_tokens),
  };
}

function parseTimestamp(value: unknown): Date | null {
  if (typeof value !== "string" && typeof value !== "number") {
    return null;
  }

  const timestamp = new Date(value);
  if (Number.isNaN(timestamp.getTime())) {
    return null;
  }
  return timestamp;
}

function normalizeNullableText(value: unknown): string | null {
  const normalized = normalizeText(value);
  return normalized.length > 0 ? normalized : null;
}

function normalizeText(value: unknown): string {
  if (typeof value !== "string") {
    return "";
  }
  return value.trim();
}

function normalizeCount(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return 0;
  }
  return Math.max(0, Math.trunc(value));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function toErrorMessage(value: unknown): string {
  if (value instanceof Error && value.message) {
    return value.message;
  }
  return "unknown";
}

function decodeFailure(reason: string): {
  ok: false;
  error: { reason: string; retriable: boolean };
} {
  return {
    ok: false,
    error: {
      reason,
      retriable: false,
    },
  };
}
