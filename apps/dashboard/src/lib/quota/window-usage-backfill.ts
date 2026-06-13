import type { UsageWindowStats } from "@/lib/usage/window-stats";

export const QUOTA_WINDOW_FIVE_HOURS_SECONDS = 5 * 60 * 60;
export const QUOTA_WINDOW_SEVEN_DAYS_SECONDS = 7 * 24 * 60 * 60;
export const QUOTA_WINDOW_THIRTY_DAYS_SECONDS = 30 * 24 * 60 * 60;

const BACKFILL_WINDOW_SECONDS = new Set([
  QUOTA_WINDOW_FIVE_HOURS_SECONDS,
  QUOTA_WINDOW_SEVEN_DAYS_SECONDS,
  QUOTA_WINDOW_THIRTY_DAYS_SECONDS,
]);

export interface QuotaWindowUsageModel {
  id: string;
  displayName: string;
  remainingFraction: number;
  resetTime: string | null;
  windowUsageTokens?: number;
  windowUsageCost?: number;
}

export interface QuotaWindowUsageGroup {
  id: string;
  label: string;
  remainingFraction: number;
  resetTime: string | null;
  windowSeconds?: number;
  windowUsageTokens?: number;
  windowUsageCost?: number;
  models: QuotaWindowUsageModel[];
}

interface BackfillOptions {
  now?: Date;
  sumWindowStats?: (authIndex: string, start: Date, end: Date) => Promise<UsageWindowStats>;
  onError?: (error: unknown, context: { authIndex: string; start: Date; end: Date }) => void;
}

interface UsageWindowRange {
  start: Date;
  end: Date;
}

function hasCompleteWindowUsage(value: { windowUsageTokens?: number; windowUsageCost?: number }): boolean {
  return Number.isFinite(value.windowUsageTokens) && Number.isFinite(value.windowUsageCost);
}

function stripPartialModelWindowUsage(model: QuotaWindowUsageModel): QuotaWindowUsageModel {
  if (
    hasCompleteWindowUsage(model) ||
    (model.windowUsageTokens === undefined && model.windowUsageCost === undefined)
  ) {
    return model;
  }

  return {
    ...model,
    windowUsageTokens: undefined,
    windowUsageCost: undefined,
  };
}

function stripPartialWindowUsage(group: QuotaWindowUsageGroup): QuotaWindowUsageGroup {
  if (
    (hasCompleteWindowUsage(group) ||
      (group.windowUsageTokens === undefined && group.windowUsageCost === undefined)) &&
    group.models.every((model) =>
      hasCompleteWindowUsage(model) ||
      (model.windowUsageTokens === undefined && model.windowUsageCost === undefined)
    )
  ) {
    return group;
  }

  return {
    ...group,
    windowUsageTokens: hasCompleteWindowUsage(group) ? group.windowUsageTokens : undefined,
    windowUsageCost: hasCompleteWindowUsage(group) ? group.windowUsageCost : undefined,
    models: group.models.map(stripPartialModelWindowUsage),
  };
}

export function quotaGroupUsageWindow(
  group: QuotaWindowUsageGroup,
  now: Date = new Date()
): UsageWindowRange | null {
  if (!group.windowSeconds || !BACKFILL_WINDOW_SECONDS.has(group.windowSeconds)) {
    return null;
  }

  if (!group.resetTime) {
    return null;
  }

  const resetAt = new Date(group.resetTime);
  if (Number.isNaN(resetAt.getTime()) || Number.isNaN(now.getTime())) {
    return null;
  }

  const start = new Date(resetAt.getTime() - group.windowSeconds * 1000);
  const end = now < resetAt ? now : resetAt;
  if (!(start < end)) {
    return null;
  }

  return { start, end };
}

function shouldBackfillWindowUsage(group: QuotaWindowUsageGroup): boolean {
  if (hasCompleteWindowUsage(group)) {
    return false;
  }

  return Boolean(group.windowSeconds && BACKFILL_WINDOW_SECONDS.has(group.windowSeconds));
}

function attachStatsToGroup(group: QuotaWindowUsageGroup, stats: UsageWindowStats): QuotaWindowUsageGroup {
  const windowUsageTokens = stats.tokens;
  const windowUsageCost = stats.cost;

  return {
    ...group,
    windowUsageTokens: hasCompleteWindowUsage(group) ? group.windowUsageTokens : windowUsageTokens,
    windowUsageCost: hasCompleteWindowUsage(group) ? group.windowUsageCost : windowUsageCost,
    models: group.models.map((model) => {
      if (hasCompleteWindowUsage(model)) {
        return model;
      }

      return {
        ...model,
        windowUsageTokens,
        windowUsageCost,
      };
    }),
  };
}

async function defaultSumWindowStats(
  authIndex: string,
  start: Date,
  end: Date
): Promise<UsageWindowStats> {
  const { sumUsageWindowStatsByAuthIndex } = await import("@/lib/usage/window-stats");
  return sumUsageWindowStatsByAuthIndex(authIndex, start, end);
}

export async function backfillQuotaWindowUsageStats(
  authIndex: string,
  groups: QuotaWindowUsageGroup[],
  options: BackfillOptions = {}
): Promise<QuotaWindowUsageGroup[]> {
  const normalizedAuthIndex = authIndex.trim();
  if (!normalizedAuthIndex || groups.length === 0) {
    return groups;
  }

  const now = options.now ?? new Date();
  const sumWindowStats = options.sumWindowStats ?? defaultSumWindowStats;
  const statsByWindow = new Map<string, UsageWindowStats>();
  const result: QuotaWindowUsageGroup[] = [];

  for (const group of groups) {
    if (!shouldBackfillWindowUsage(group)) {
      result.push(group);
      continue;
    }

    const strippedGroup = stripPartialWindowUsage(group);
    const range = quotaGroupUsageWindow(strippedGroup, now);
    if (!range) {
      result.push(strippedGroup);
      continue;
    }

    const cacheKey = `${range.start.toISOString()}..${range.end.toISOString()}`;
    let stats = statsByWindow.get(cacheKey);
    if (!stats) {
      try {
        stats = await sumWindowStats(normalizedAuthIndex, range.start, range.end);
        statsByWindow.set(cacheKey, stats);
      } catch (error) {
        options.onError?.(error, { authIndex: normalizedAuthIndex, ...range });
        result.push(strippedGroup);
        continue;
      }
    }

    result.push(attachStatsToGroup(strippedGroup, stats));
  }

  return result;
}
