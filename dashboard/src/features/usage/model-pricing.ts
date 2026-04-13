import { API_ENDPOINTS } from "@/lib/api-endpoints";

export interface ModelPrice {
  prompt: number;
  completion: number;
  cache: number;
}

export interface ModelPricingRecord {
  id?: string;
  provider: string;
  model: string;
  displayName?: string | null;
  promptPriceUsd: number;
  completionPriceUsd: number;
  cachePriceUsd?: number | null;
  cachedPriceUsd?: number | null;
  reasoningPriceUsd?: number | null;
  currency?: string;
  sourceType?: string | null;
  sourceUrl?: string | null;
  manualOverride?: boolean;
  isActive?: boolean;
  effectiveFrom?: string | null;
  lastSyncedAt?: string | null;
  syncError?: string | null;
  updatedAt?: string | null;
}

export interface ModelPricingSnapshot {
  items: ModelPricingRecord[];
  updatedAt?: string | null;
}

export interface ModelPricingSyncSummary {
  syncedAt: string;
  sourceCount: number;
  imported: number;
  results: Array<{
    source: string;
    imported: number;
  }>;
}

export interface ModelPricingDraft {
  provider: string;
  model: string;
  displayName: string;
  promptPriceUsd: string;
  completionPriceUsd: string;
  cachePriceUsd: string;
  currency: string;
  sourceType: string;
  sourceUrl: string;
  manualOverride: boolean;
  isActive: boolean;
}

export const MODEL_PRICING_ENDPOINT = API_ENDPOINTS.MODEL_PRICING;
export const ADMIN_MODEL_PRICING_ENDPOINT = API_ENDPOINTS.ADMIN.MODEL_PRICING;
export const ADMIN_MODEL_PRICING_SYNC_ENDPOINT = API_ENDPOINTS.ADMIN.MODEL_PRICING_SYNC;

function parseNumber(value: unknown, fallback = 0): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return fallback;
}

function parseOptionalString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function parseBoolean(value: unknown, fallback = false): boolean {
  if (typeof value === "boolean") return value;
  if (typeof value === "string") {
    if (value === "true") return true;
    if (value === "false") return false;
  }
  return fallback;
}

function parseRecord(entry: unknown): ModelPricingRecord | null {
  if (!entry || typeof entry !== "object") return null;
  const candidate = entry as Record<string, unknown>;
  const provider = typeof candidate.provider === "string" ? candidate.provider.trim() : "";
  const model = typeof candidate.model === "string" ? candidate.model.trim() : "";
  if (!provider || !model) return null;
  const cacheSource = candidate.cachedPriceUsd
    ?? candidate.cachePriceUsd
    ?? candidate.cache
    ?? candidate.cache_price_usd
    ?? candidate.cachePrice;

  return {
    id: typeof candidate.id === "string" ? candidate.id : undefined,
    provider,
    model,
    displayName: parseOptionalString(candidate.displayName),
    promptPriceUsd: parseNumber(
      candidate.promptPriceUsd ?? candidate.prompt ?? candidate.prompt_price_usd ?? candidate.promptPrice,
    ),
    completionPriceUsd: parseNumber(
      candidate.completionPriceUsd ?? candidate.completion ?? candidate.completion_price_usd ?? candidate.completionPrice,
    ),
    cachePriceUsd: cacheSource === undefined || cacheSource === null ? null : parseNumber(cacheSource),
    cachedPriceUsd: cacheSource === undefined || cacheSource === null ? null : parseNumber(cacheSource),
    reasoningPriceUsd:
      candidate.reasoningPriceUsd === undefined || candidate.reasoningPriceUsd === null
        ? null
        : parseNumber(candidate.reasoningPriceUsd),
    currency: typeof candidate.currency === "string" && candidate.currency.trim() ? candidate.currency.trim() : "USD",
    sourceType: parseOptionalString(candidate.sourceType ?? candidate.source),
    sourceUrl: parseOptionalString(candidate.sourceUrl),
    manualOverride: parseBoolean(candidate.manualOverride, false),
    isActive: parseBoolean(candidate.isActive, true),
    effectiveFrom: parseOptionalString(candidate.effectiveFrom),
    lastSyncedAt: parseOptionalString(candidate.lastSyncedAt),
    syncError: parseOptionalString(candidate.syncError),
    updatedAt: parseOptionalString(candidate.updatedAt),
  };
}

function extractItems(payload: unknown): unknown[] {
  if (Array.isArray(payload)) return payload;
  if (!payload || typeof payload !== "object") return [];

  const candidate = payload as Record<string, unknown>;
  if (Array.isArray(candidate.items)) return candidate.items;
  if (Array.isArray(candidate.pricing)) return candidate.pricing;
  if (Array.isArray(candidate.records)) return candidate.records;
  if (Array.isArray(candidate.modelPricing)) return candidate.modelPricing;
  if (Array.isArray(candidate.data)) return candidate.data;
  if (candidate.data && typeof candidate.data === "object") {
    const nested = candidate.data as Record<string, unknown>;
    if (Array.isArray(nested.items)) return nested.items;
    if (Array.isArray(nested.pricing)) return nested.pricing;
    if (Array.isArray(nested.records)) return nested.records;
    if (Array.isArray(nested.modelPricing)) return nested.modelPricing;
  }

  return [];
}

function extractSingleItem(payload: unknown): unknown | null {
  if (!payload || typeof payload !== "object") return null;

  const candidate = payload as Record<string, unknown>;
  if (candidate.modelPricing && !Array.isArray(candidate.modelPricing)) return candidate.modelPricing;
  if (candidate.pricing && !Array.isArray(candidate.pricing)) return candidate.pricing;
  if (candidate.record && typeof candidate.record === "object") return candidate.record;
  if (candidate.item && typeof candidate.item === "object") return candidate.item;
  if (candidate.data && typeof candidate.data === "object") {
    const nested = candidate.data as Record<string, unknown>;
    if (nested.modelPricing && !Array.isArray(nested.modelPricing)) return nested.modelPricing;
    if (nested.pricing && !Array.isArray(nested.pricing)) return nested.pricing;
    if (nested.record && typeof nested.record === "object") return nested.record;
    if (nested.item && typeof nested.item === "object") return nested.item;
  }

  return parseRecord(payload) ? payload : null;
}

export function normalizeModelPricing(payload: unknown): ModelPricingRecord[] {
  return extractItems(payload)
    .map((entry) => parseRecord(entry))
    .filter((entry): entry is ModelPricingRecord => entry !== null);
}

export function normalizeSingleModelPricing(payload: unknown): ModelPricingRecord | null {
  const entry = extractSingleItem(payload);
  return entry ? parseRecord(entry) : null;
}

export function modelPricingToLookup(records: ModelPricingRecord[]): Record<string, ModelPrice> {
  const lookup: Record<string, ModelPrice> = {};
  for (const record of records) {
    if (!record.isActive) continue;
    lookup[record.model] = {
      prompt: record.promptPriceUsd,
      completion: record.completionPriceUsd,
      cache: record.cachePriceUsd ?? record.promptPriceUsd,
    };
  }
  return lookup;
}

export function normalizeModelPricingDraft(record?: ModelPricingRecord | null): ModelPricingDraft {
  return {
    provider: record?.provider ?? "",
    model: record?.model ?? "",
    displayName: record?.displayName ?? "",
    promptPriceUsd: record ? String(record.promptPriceUsd) : "",
    completionPriceUsd: record ? String(record.completionPriceUsd) : "",
    cachePriceUsd: record?.cachePriceUsd === null || record?.cachePriceUsd === undefined ? "" : String(record.cachePriceUsd),
    currency: record?.currency ?? "USD",
    sourceType: record?.sourceType ?? "manual",
    sourceUrl: record?.sourceUrl ?? "",
    manualOverride: record?.manualOverride ?? true,
    isActive: record?.isActive ?? true,
  };
}

export function draftToRequestBody(draft: ModelPricingDraft) {
  const cachePriceUsd = draft.cachePriceUsd.trim() === "" ? null : parseNumber(draft.cachePriceUsd, 0);

  return {
    provider: draft.provider.trim(),
    model: draft.model.trim(),
    displayName: draft.displayName.trim() || null,
    promptPriceUsd: parseNumber(draft.promptPriceUsd, 0),
    completionPriceUsd: parseNumber(draft.completionPriceUsd, 0),
    cachePriceUsd,
    currency: draft.currency.trim() || "USD",
    sourceType: draft.sourceType.trim() || "manual",
    sourceUrl: draft.sourceUrl.trim() || null,
    manualOverride: draft.manualOverride,
    isActive: draft.isActive,
  };
}

export async function loadModelPricing(
  baseUrl?: string,
  init?: RequestInit
): Promise<ModelPricingRecord[] | null> {
  const endpoint = baseUrl ? new URL(MODEL_PRICING_ENDPOINT, baseUrl).toString() : MODEL_PRICING_ENDPOINT;
  try {
    const response = await fetch(endpoint, {
      cache: "no-store",
      credentials: "include",
      ...init,
    });
    if (!response.ok) return null;
    const payload = await response.json() as unknown;
    return normalizeModelPricing(payload);
  } catch {
    return null;
  }
}

export async function saveModelPricingRecord(
  draft: ModelPricingDraft,
  recordId?: string
): Promise<ModelPricingRecord | null> {
  const endpoint = recordId
    ? `${ADMIN_MODEL_PRICING_ENDPOINT}/${encodeURIComponent(recordId)}`
    : ADMIN_MODEL_PRICING_ENDPOINT;
  const method = recordId ? "PUT" : "POST";

  const response = await fetch(endpoint, {
    method,
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(draftToRequestBody(draft)),
  });

  if (!response.ok) {
    return null;
  }

  const payload = await response.json() as unknown;
  return normalizeSingleModelPricing(payload);
}

export async function deleteModelPricingRecord(recordId: string): Promise<boolean> {
  const response = await fetch(`${ADMIN_MODEL_PRICING_ENDPOINT}/${encodeURIComponent(recordId)}`, {
    method: "DELETE",
    credentials: "include",
  });

  return response.ok;
}

export async function syncModelPricingRecords(
  sources?: string[]
): Promise<{ summary: ModelPricingSyncSummary; records: ModelPricingRecord[] } | null> {
  const response = await fetch(ADMIN_MODEL_PRICING_SYNC_ENDPOINT, {
    method: "POST",
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(sources && sources.length > 0 ? { sources } : {}),
  });

  if (!response.ok) {
    return null;
  }

  const payload = await response.json() as unknown;
  if (!payload || typeof payload !== "object") {
    return null;
  }

  const candidate = payload as Record<string, unknown>;
  const summary = candidate.summary;
  if (!summary || typeof summary !== "object") {
    return null;
  }

  return {
    summary: summary as ModelPricingSyncSummary,
    records: normalizeModelPricing(payload),
  };
}
