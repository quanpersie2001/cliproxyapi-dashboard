import { logger } from "@/lib/logger";
interface ModelPricingPreviewRecord {
  id?: string;
  provider: string;
  model: string;
  displayName: string | null;
  promptPriceUsd: number;
  completionPriceUsd: number;
  cachedPriceUsd: number | null;
  reasoningPriceUsd: number | null;
  currency: string;
  sourceType: string;
  sourceUrl: string | null;
  manualOverride: boolean;
  isActive: boolean;
  effectiveFrom: string;
  lastSyncedAt: string | null;
  syncError: string | null;
}

const FETCH_TIMEOUT_MS = 15_000;

export const MODEL_PRICING_SYNC_SOURCES = ["openai", "claude"] as const;

export type ModelPricingSyncSource = (typeof MODEL_PRICING_SYNC_SOURCES)[number];

interface SyncedModelPricingSeed {
  provider: string;
  model: string;
  displayName: string;
  promptPriceUsd: number;
  completionPriceUsd: number;
  cachedPriceUsd: number | null;
  sourceUrl: string;
}

interface SourceSyncResult {
  source: ModelPricingSyncSource;
  imported: number;
}

export interface ModelPricingSyncPreviewSummary {
  syncedAt: string;
  sourceCount: number;
  imported: number;
  results: SourceSyncResult[];
}

function fetchWithTimeout(url: string): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  return fetch(url, {
    signal: controller.signal,
    cache: "no-store",
    headers: {
      "User-Agent": "cliproxyapi-dashboard/1.0",
      Accept: "text/html, text/plain;q=0.9",
    },
  }).finally(() => {
    clearTimeout(timeoutId);
  });
}

function decodeHtmlEntities(value: string): string {
  return value
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, "\"")
    .replace(/&#39;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">");
}

function htmlToTextLines(html: string): string[] {
  const normalized = decodeHtmlEntities(
    html
      .replace(/<script\b[\s\S]*?<\/script>/gi, "")
      .replace(/<style\b[\s\S]*?<\/style>/gi, "")
      .replace(/<\/(tr|thead|tbody|table|section|article|div|p|li|h1|h2|h3|h4|h5|h6)>/gi, "\n")
      .replace(/<(br|hr)\s*\/?>/gi, "\n")
      .replace(/<\/(td|th)>/gi, " ")
      .replace(/<[^>]+>/g, " ")
  );

  return normalized
    .replace(/\r/g, "")
    .split("\n")
    .map((line) => line.replace(/\s+/g, " ").trim())
    .filter(Boolean);
}

function toAnthropicModelIds(displayName: string): string[] {
  const match = /^Claude\s+(Opus|Sonnet|Haiku)\s+(\d+)(?:\.(\d+))?$/i.exec(displayName.trim());
  if (!match) {
    return [];
  }

  const family = match[1].toLowerCase();
  const major = match[2];
  const minor = match[3];

  if (!minor) {
    return [`claude-${family}-${major}`];
  }

  if (Number(major) >= 4) {
    return [
      `claude-${family}-${major}-${minor}`,
      `claude-${family}-${major}.${minor}`,
    ];
  }

  return [
    `claude-${major}-${minor}-${family}`,
    `claude-${major}.${minor}-${family}`,
  ];
}

function parseOpenAiPricingFromLines(lines: string[]): SyncedModelPricingSeed[] {
  const url = "https://developers.openai.com/api/docs/pricing";
  const seeds = new Map<string, SyncedModelPricingSeed>();
  const priceToken = "(?:-|\\d+(?:\\.\\d+)?)";
  const shortPattern = new RegExp(
    `^(?:(ChatGPT|Codex|Deep research|Computer use)\\s+)?([a-z0-9][a-z0-9.\\-]+)\\$(${priceToken})\\$(${priceToken})\\$(${priceToken})(?:---+)?$`,
    "i"
  );
  const longPattern = new RegExp(
    `^(?:(ChatGPT|Codex|Deep research|Computer use)\\s+)?([a-z0-9][a-z0-9.\\-]+)\\$(${priceToken})\\$(${priceToken})\\$(${priceToken})\\$(${priceToken})\\$(${priceToken})\\$(${priceToken})$`,
    "i"
  );

  for (const line of lines) {
    const match = longPattern.exec(line) ?? shortPattern.exec(line);
    if (!match) {
      continue;
    }

    const category = match[1]?.toLowerCase() ?? "";
    const model = match[2];
    const prompt = match[3] === "-" ? NaN : Number(match[3]);
    const cached = match[4] === "-" ? null : Number(match[4]);
    const completion = match[5] === "-" ? NaN : Number(match[5]);

    if (!Number.isFinite(prompt) || !Number.isFinite(completion)) {
      continue;
    }

    if (
      !model.startsWith("gpt-") &&
      !model.startsWith("o") &&
      model !== "computer-use-preview"
    ) {
      continue;
    }

    const provider = category === "codex" || model.includes("codex") ? "codex" : "openai";
    const key = `${provider}:${model}`;

    if (!seeds.has(key)) {
      seeds.set(key, {
        provider,
        model,
        displayName: model,
        promptPriceUsd: prompt,
        completionPriceUsd: completion,
        cachedPriceUsd: cached,
        sourceUrl: url,
      });
    }
  }

  return [...seeds.values()];
}

function parseAnthropicPricingFromLines(lines: string[]): SyncedModelPricingSeed[] {
  const url = "https://platform.claude.com/docs/en/about-claude/pricing";
  const seeds = new Map<string, SyncedModelPricingSeed>();
  const linePattern =
    /^(Claude\s+(?:Opus|Sonnet|Haiku)\s+\d+(?:\.\d+)?)\$(\d+(?:\.\d+)?)\s*\/\s*MTok\$(\d+(?:\.\d+)?)\s*\/\s*MTok\$(\d+(?:\.\d+)?)\s*\/\s*MTok\$(\d+(?:\.\d+)?)\s*\/\s*MTok\$(\d+(?:\.\d+)?)\s*\/\s*MTok$/i;

  for (const line of lines) {
    const match = linePattern.exec(line);
    if (!match) {
      continue;
    }

    const displayName = match[1];
    const prompt = Number(match[2]);
    const cacheRead = Number(match[5]);
    const completion = Number(match[6]);

    if (!Number.isFinite(prompt) || !Number.isFinite(cacheRead) || !Number.isFinite(completion)) {
      continue;
    }

    for (const model of toAnthropicModelIds(displayName)) {
      const key = `claude:${model}`;
      if (!seeds.has(key)) {
        seeds.set(key, {
          provider: "claude",
          model,
          displayName,
          promptPriceUsd: prompt,
          completionPriceUsd: completion,
          cachedPriceUsd: cacheRead,
          sourceUrl: url,
        });
      }
    }
  }

  return [...seeds.values()];
}

async function loadSourceSeeds(source: ModelPricingSyncSource): Promise<SyncedModelPricingSeed[]> {
  switch (source) {
    case "openai": {
      const response = await fetchWithTimeout("https://developers.openai.com/api/docs/pricing");
      if (!response.ok) {
        throw new Error(`OpenAI pricing source returned ${response.status}`);
      }

      const html = await response.text();
      return parseOpenAiPricingFromLines(htmlToTextLines(html));
    }
    case "claude": {
      const response = await fetchWithTimeout("https://platform.claude.com/docs/en/about-claude/pricing");
      if (!response.ok) {
        throw new Error(`Claude pricing source returned ${response.status}`);
      }

      const html = await response.text();
      return parseAnthropicPricingFromLines(htmlToTextLines(html));
    }
  }
}

function seedToPreviewRecord(seed: SyncedModelPricingSeed, now: Date): ModelPricingPreviewRecord {
  return {
    provider: seed.provider,
    model: seed.model,
    displayName: seed.displayName,
    promptPriceUsd: seed.promptPriceUsd,
    completionPriceUsd: seed.completionPriceUsd,
    cachedPriceUsd: seed.cachedPriceUsd,
    reasoningPriceUsd: null,
    currency: "USD",
    sourceType: "official_doc",
    sourceUrl: seed.sourceUrl,
    manualOverride: false,
    isActive: true,
    effectiveFrom: now.toISOString(),
    lastSyncedAt: now.toISOString(),
    syncError: null,
  };
}

async function previewSource(source: ModelPricingSyncSource): Promise<{
  result: SourceSyncResult;
  records: ModelPricingPreviewRecord[];
}> {
  const importedSeeds = await loadSourceSeeds(source);
  const now = new Date();

  return {
    result: {
      source,
      imported: importedSeeds.length,
    },
    records: importedSeeds.map((seed) => seedToPreviewRecord(seed, now)),
  };
}

export async function previewModelPricingFromOfficialSources(
  sources: ModelPricingSyncSource[] = [...MODEL_PRICING_SYNC_SOURCES]
): Promise<{
  summary: ModelPricingSyncPreviewSummary;
  records: ModelPricingPreviewRecord[];
}> {
  const results: SourceSyncResult[] = [];
  const records: ModelPricingPreviewRecord[] = [];

  for (const source of sources) {
    try {
      const preview = await previewSource(source);
      results.push(preview.result);
      records.push(...preview.records);
    } catch (error) {
      logger.error({ err: error, source }, "Model pricing sync source failed");
      throw error;
    }
  }

  return {
    summary: {
      syncedAt: new Date().toISOString(),
      sourceCount: results.length,
      imported: results.reduce((sum, result) => sum + result.imported, 0),
      results,
    },
    records,
  };
}

export function normalizeRequestedSyncSources(input: unknown): ModelPricingSyncSource[] {
  if (!Array.isArray(input) || input.length === 0) {
    return [...MODEL_PRICING_SYNC_SOURCES];
  }

  const normalized = input
    .filter((entry): entry is string => typeof entry === "string")
    .map((entry) => entry.trim().toLowerCase())
    .filter((entry): entry is ModelPricingSyncSource =>
      (MODEL_PRICING_SYNC_SOURCES as readonly string[]).includes(entry)
    );

  return normalized.length > 0 ? [...new Set(normalized)] : [...MODEL_PRICING_SYNC_SOURCES];
}

export const __testables = {
  htmlToTextLines,
  parseAnthropicPricingFromLines,
  parseOpenAiPricingFromLines,
  toAnthropicModelIds,
};
