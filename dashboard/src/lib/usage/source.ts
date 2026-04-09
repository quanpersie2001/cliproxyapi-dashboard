import "server-only";
import { createHash } from "crypto";

const KEY_LIKE_TOKEN_REGEX =
  /(sk-[A-Za-z0-9-_]{6,}|sk-ant-[A-Za-z0-9-_]{6,}|AIza[0-9A-Za-z-_]{8,}|AI[a-zA-Z0-9_-]{6,}|hf_[A-Za-z0-9]{6,}|pk_[A-Za-z0-9]{6,}|rk_[A-Za-z0-9]{6,})/;

function fnv1a64Hex(value: string): string {
  return createHash("sha256").update(value).digest("hex").slice(0, 16);
}

function maskToken(value: string): string {
  if (value.length <= 12) {
    return value;
  }
  return `${value.slice(0, 8)}...${value.slice(-4)}`;
}

function looksLikeRawSecret(text: string): boolean {
  if (!text || /\s/.test(text)) return false;

  const lower = text.toLowerCase();
  if (lower.endsWith(".json")) return false;
  if (lower.startsWith("http://") || lower.startsWith("https://")) return false;
  if (/[\\/]/.test(text)) return false;

  if (KEY_LIKE_TOKEN_REGEX.test(text)) return true;
  if (text.length >= 32 && text.length <= 512) return true;

  if (text.length >= 16 && text.length < 32 && /^[A-Za-z0-9._=-]+$/.test(text)) {
    return /[A-Za-z]/.test(text) && /\d/.test(text);
  }

  return false;
}

function extractRawSecretFromText(text: string): string | null {
  if (!text) return null;
  if (looksLikeRawSecret(text)) return text;

  const keyLikeMatch = text.match(KEY_LIKE_TOKEN_REGEX);
  if (keyLikeMatch?.[0]) return keyLikeMatch[0];

  const queryMatch = text.match(
    /(?:[?&])(api[-_]?key|key|token|access_token|authorization)=([^&#\s]+)/i
  );
  if (queryMatch?.[2] && looksLikeRawSecret(queryMatch[2])) {
    return queryMatch[2];
  }

  const headerMatch = text.match(
    /(api[-_]?key|key|token|access[-_]?token|authorization)\s*[:=]\s*([A-Za-z0-9._=-]+)/i
  );
  if (headerMatch?.[2] && looksLikeRawSecret(headerMatch[2])) {
    return headerMatch[2];
  }

  const bearerMatch = text.match(/\bBearer\s+([A-Za-z0-9._=-]{6,})/i);
  if (bearerMatch?.[1] && looksLikeRawSecret(bearerMatch[1])) {
    return bearerMatch[1];
  }

  return null;
}

export function normalizeUsageSourceId(value: unknown): string {
  const raw = typeof value === "string" ? value : value == null ? "" : String(value);
  const trimmed = raw.trim();
  if (!trimmed) return "";

  const extracted = extractRawSecretFromText(trimmed);
  if (extracted) {
    return `k:${fnv1a64Hex(extracted)}`;
  }

  return `t:${trimmed}`;
}

export function maskUsageSensitiveValue(value: unknown): string {
  const raw = typeof value === "string" ? value : value == null ? "" : String(value);
  const trimmed = raw.trim();
  if (!trimmed) return "";

  const extracted = extractRawSecretFromText(trimmed);
  if (extracted) {
    return trimmed === extracted ? maskToken(extracted) : trimmed.replace(extracted, maskToken(extracted));
  }

  return trimmed;
}

export function maskRawUsageSource(value: unknown): string {
  const raw = typeof value === "string" ? value : value == null ? "" : String(value);
  const trimmed = raw.trim();
  if (!trimmed) return "";
  return looksLikeRawSecret(trimmed) ? maskToken(trimmed) : maskUsageSensitiveValue(trimmed);
}
