import { createHash } from "crypto";
import type { NormalizedQueuedUsageEvent } from "./types";

type EventKeyInput = Omit<NormalizedQueuedUsageEvent, "eventKey">;

function normalizeCount(value: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }
  return Math.max(0, Math.trunc(value));
}

function normalizeTotalTokens(event: EventKeyInput): number {
  const explicitTotal = normalizeCount(event.tokens.totalTokens);
  if (explicitTotal > 0) {
    return explicitTotal;
  }

  const derivedIoReasoningTotal =
    normalizeCount(event.tokens.inputTokens) +
    normalizeCount(event.tokens.outputTokens) +
    normalizeCount(event.tokens.reasoningTokens);
  if (derivedIoReasoningTotal > 0) {
    return derivedIoReasoningTotal;
  }

  return normalizeCount(event.tokens.cachedTokens);
}

function normalizeText(value: string | null | undefined): string {
  return (value ?? "").trim();
}

function toCanonicalTuple(event: EventKeyInput): string[] {
  const normalizedTimestamp = new Date(event.timestamp).toISOString();
  const inputTokens = normalizeCount(event.tokens.inputTokens);
  const outputTokens = normalizeCount(event.tokens.outputTokens);
  const reasoningTokens = normalizeCount(event.tokens.reasoningTokens);
  const totalTokens = normalizeTotalTokens(event);

  return [
    normalizeText(event.apiGroupKey),
    normalizeText(event.model),
    normalizedTimestamp,
    normalizeText(event.source),
    normalizeText(event.authIndex),
    event.failed ? "1" : "0",
    String(inputTokens),
    String(outputTokens),
    String(reasoningTokens),
    String(totalTokens),
  ];
}

export function buildUsageEventKey(event: EventKeyInput): string {
  const requestId = normalizeText(event.requestId);
  if (requestId.length > 0) {
    return requestId;
  }

  const canonicalPayload = toCanonicalTuple(event).join("|");
  return createHash("sha256").update(canonicalPayload).digest("hex");
}
