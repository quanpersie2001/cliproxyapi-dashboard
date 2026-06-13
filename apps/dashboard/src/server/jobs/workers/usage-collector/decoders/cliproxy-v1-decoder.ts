import type { UsagePayloadDecoder } from "../contracts";
import { buildUsageEventKey } from "../core/event-key";
import type {
  DecodedUsageMessage,
  NormalizedQueuedUsageEvent,
  NormalizedTokenUsage,
  UsageSourceEnvelope,
} from "../core/types";

type QueuedPayload = {
  timestamp?: unknown;
  latency_ms?: unknown;
  source?: unknown;
  auth_index?: unknown;
  tokens?: unknown;
  failed?: unknown;
  provider?: unknown;
  model?: unknown;
  alias?: unknown;
  model_alias?: unknown;
  reasoning_effort?: unknown;
  service_tier?: unknown;
  executor_type?: unknown;
  endpoint?: unknown;
  api_key?: unknown;
  auth_type?: unknown;
  request_id?: unknown;
  ttft_ms?: unknown;
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
      apiKey: normalizeNullableText(payload.api_key),
      model: normalizeText(payload.model) || "unknown",
      modelAlias: normalizeNullableText(payload.alias ?? payload.model_alias),
      source: normalizeText(payload.source) || "unknown",
      timestamp,
      failed: payload.failed === true,
      latencyMs: normalizeCount(payload.latency_ms),
      ttftMs: normalizeNullableCount(payload.ttft_ms),
      reasoningEffort: normalizeNullableText(payload.reasoning_effort),
      serviceTier: normalizeNullableText(payload.service_tier),
      executorType: normalizeNullableText(payload.executor_type),
      tokens: normalizeTokens(payload.tokens, payload.provider),
    },
  };
}

function normalizeTokens(value: unknown, provider: unknown): NormalizedTokenUsage {
  const rawTokens = readTokenUsage(value);
  return normalizeTokensByProvider(rawTokens, normalizeText(provider));
}

function readTokenUsage(value: unknown): NormalizedTokenUsage {
  if (!isRecord(value)) {
    return emptyTokenUsage();
  }

  return {
    inputTokens: normalizeCount(value.input_tokens),
    outputTokens: normalizeCount(value.output_tokens),
    reasoningTokens: normalizeCount(value.reasoning_tokens),
    cachedTokens: normalizeCount(value.cached_tokens),
    cacheReadTokens: normalizeCount(value.cache_read_tokens),
    cacheCreationTokens: normalizeCount(value.cache_creation_tokens),
    totalTokens: normalizeCount(value.total_tokens),
  };
}

function emptyTokenUsage(): NormalizedTokenUsage {
  return {
    inputTokens: 0,
    outputTokens: 0,
    reasoningTokens: 0,
    cachedTokens: 0,
    cacheReadTokens: 0,
    cacheCreationTokens: 0,
    totalTokens: 0,
  };
}

function normalizeTokensByProvider(
  tokens: NormalizedTokenUsage,
  provider: string
): NormalizedTokenUsage {
  const normalizedProvider = provider.trim().toLowerCase();
  switch (normalizedProvider) {
    case "claude":
    case "anthropic":
      return normalizeClaudeTokens(tokens);
    case "gemini":
    case "vertex":
    case "gemini-cli":
    case "gemini-cli-code-assist":
    case "aistudio":
    case "ai-studio":
    case "antigravity":
      return normalizeGeminiTokens(tokens);
    default:
      return normalizeOpenAIStyleTokens(tokens);
  }
}

function normalizeClaudeTokens(tokens: NormalizedTokenUsage): NormalizedTokenUsage {
  const normalized = clampTokenUsage(tokens);
  normalized.inputTokens += normalized.cacheReadTokens + normalized.cacheCreationTokens;
  normalized.cachedTokens = normalized.cacheReadTokens;
  return fillCodexStyleTotalTokens(normalized);
}

function normalizeGeminiTokens(tokens: NormalizedTokenUsage): NormalizedTokenUsage {
  const normalized = clampTokenUsage(tokens);
  if (shouldFoldReasoningIntoOutput(normalized)) {
    normalized.outputTokens += normalized.reasoningTokens;
  }
  return fillCodexStyleTotalTokens(normalized);
}

function normalizeOpenAIStyleTokens(tokens: NormalizedTokenUsage): NormalizedTokenUsage {
  return fillCodexStyleTotalTokens(clampTokenUsage(tokens));
}

function shouldFoldReasoningIntoOutput(tokens: NormalizedTokenUsage): boolean {
  if (tokens.reasoningTokens <= 0) {
    return false;
  }
  if (tokens.totalTokens === 0) {
    return true;
  }
  if (tokens.inputTokens + tokens.outputTokens === tokens.totalTokens) {
    return false;
  }
  return tokens.inputTokens + tokens.outputTokens + tokens.reasoningTokens === tokens.totalTokens;
}

function fillCodexStyleTotalTokens(tokens: NormalizedTokenUsage): NormalizedTokenUsage {
  if (tokens.totalTokens === 0) {
    tokens.totalTokens = tokens.inputTokens + tokens.outputTokens;
  }
  if (tokens.totalTokens === 0) {
    tokens.totalTokens = tokens.cachedTokens;
  }
  return tokens;
}

function clampTokenUsage(tokens: NormalizedTokenUsage): NormalizedTokenUsage {
  return {
    inputTokens: normalizeCount(tokens.inputTokens),
    outputTokens: normalizeCount(tokens.outputTokens),
    reasoningTokens: normalizeCount(tokens.reasoningTokens),
    cachedTokens: normalizeCount(tokens.cachedTokens),
    cacheReadTokens: normalizeCount(tokens.cacheReadTokens),
    cacheCreationTokens: normalizeCount(tokens.cacheCreationTokens),
    totalTokens: normalizeCount(tokens.totalTokens),
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

function normalizeNullableCount(value: unknown): number | null {
  if (value === null || value === undefined) {
    return null;
  }
  return normalizeCount(value);
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
