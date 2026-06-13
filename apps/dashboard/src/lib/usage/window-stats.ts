import { Prisma } from "@/server/db/generated/prisma/client";
import { prisma } from "@/server/db/client";
import {
  modelPricingLookupKey,
  resolveModelPriceForUsageKey,
} from "@/features/usage/model-pricing";
import { calculateUsageTokenCost } from "@/lib/usage/cost";

export interface UsageWindowStats {
  tokens: number;
  cost: number;
}

interface UsageWindowTokenStatsRow {
  provider: string | null;
  model: string;
  totalTokens: unknown;
  inputTokens: unknown;
  outputTokens: unknown;
  reasoningTokens: unknown;
  cachedTokens: unknown;
  cacheReadTokens: unknown;
  cacheCreationTokens: unknown;
}

interface ActiveModelPricingRow {
  provider: string;
  model: string;
  promptPriceUsd: unknown;
  completionPriceUsd: unknown;
  cachedPriceUsd: unknown;
  reasoningPriceUsd: unknown;
}

function readFiniteNumber(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === "bigint") {
    return Number(value);
  }

  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }

  if (value && typeof value === "object" && "toString" in value) {
    const parsed = Number(String(value));
    return Number.isFinite(parsed) ? parsed : 0;
  }

  return 0;
}

function normalizeText(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

async function loadActiveModelPrices(): Promise<Record<string, {
  prompt: number;
  completion: number;
  cache: number;
  reasoning: number;
}>> {
  const rows = await prisma.modelPricing.findMany({
    where: { isActive: true },
    select: {
      provider: true,
      model: true,
      promptPriceUsd: true,
      completionPriceUsd: true,
      cachedPriceUsd: true,
      reasoningPriceUsd: true,
    },
  }) as ActiveModelPricingRow[];

  const prices: Record<string, {
    prompt: number;
    completion: number;
    cache: number;
    reasoning: number;
  }> = {};

  for (const row of rows) {
    const provider = normalizeText(row.provider);
    const model = normalizeText(row.model);
    if (!provider || !model) {
      continue;
    }

    const prompt = readFiniteNumber(row.promptPriceUsd);
    prices[modelPricingLookupKey(provider, model)] = {
      prompt,
      completion: readFiniteNumber(row.completionPriceUsd),
      cache: row.cachedPriceUsd === null || row.cachedPriceUsd === undefined
        ? prompt
        : readFiniteNumber(row.cachedPriceUsd),
      reasoning: row.reasoningPriceUsd === null || row.reasoningPriceUsd === undefined
        ? 0
        : readFiniteNumber(row.reasoningPriceUsd),
    };
  }

  return prices;
}

async function sumRawUsageWindowTokenStats(
  authIndex: string,
  start: Date,
  end: Date
): Promise<UsageWindowTokenStatsRow[]> {
  return prisma.$queryRaw<UsageWindowTokenStatsRow[]>(Prisma.sql`
    SELECT
      "provider",
      "model",
      COALESCE(SUM("totalTokens"), 0)::bigint AS "totalTokens",
      COALESCE(SUM("inputTokens"), 0)::bigint AS "inputTokens",
      COALESCE(SUM("outputTokens"), 0)::bigint AS "outputTokens",
      COALESCE(SUM("reasoningTokens"), 0)::bigint AS "reasoningTokens",
      COALESCE(SUM("cachedTokens"), 0)::bigint AS "cachedTokens",
      COALESCE(SUM("cacheReadTokens"), 0)::bigint AS "cacheReadTokens",
      COALESCE(SUM("cacheCreationTokens"), 0)::bigint AS "cacheCreationTokens"
    FROM "usage_records"
    WHERE "authIndex" = ${authIndex}
      AND "timestamp" >= ${start}
      AND "timestamp" < ${end}
    GROUP BY "provider", "model"
  `);
}

export async function sumUsageWindowStatsByAuthIndex(
  authIndex: string,
  start: Date,
  end: Date
): Promise<UsageWindowStats> {
  const normalizedAuthIndex = authIndex.trim();
  if (!normalizedAuthIndex) {
    throw new Error("authIndex is required");
  }

  if (!(start instanceof Date) || Number.isNaN(start.getTime())) {
    return { tokens: 0, cost: 0 };
  }

  if (!(end instanceof Date) || Number.isNaN(end.getTime()) || start >= end) {
    return { tokens: 0, cost: 0 };
  }

  const [prices, rows] = await Promise.all([
    loadActiveModelPrices(),
    sumRawUsageWindowTokenStats(normalizedAuthIndex, start, end),
  ]);

  let tokens = 0;
  let cost = 0;

  for (const row of rows) {
    const model = normalizeText(row.model);
    if (!model) {
      continue;
    }

    const totalTokens = Math.max(0, readFiniteNumber(row.totalTokens));
    tokens += totalTokens;

    const provider = normalizeText(row.provider);
    const price = resolveModelPriceForUsageKey(`${provider}:${model}`, prices);
    if (!price) {
      continue;
    }

    cost += calculateUsageTokenCost({
      inputTokens: readFiniteNumber(row.inputTokens),
      outputTokens: readFiniteNumber(row.outputTokens),
      cachedTokens: readFiniteNumber(row.cachedTokens),
      cacheReadTokens: readFiniteNumber(row.cacheReadTokens),
      cacheCreationTokens: readFiniteNumber(row.cacheCreationTokens),
      reasoningTokens: readFiniteNumber(row.reasoningTokens),
    }, price);
  }

  return { tokens, cost };
}
