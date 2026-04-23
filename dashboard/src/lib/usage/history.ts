import "server-only";
import { Prisma } from "@/generated/prisma/client";
import { usageCache } from "@/lib/cache";
import { prisma } from "@/lib/db";
import { logger } from "@/lib/logger";
import type {
  ApiBreakdown,
  CredentialBreakdown,
  DailyBreakdown,
  KeyUsage,
  LatencyPoint,
  LatencySummary,
  ModelBreakdown,
  RecentRateSummary,
  RequestEvent,
  ServiceHealthSummary,
  UsageTotals,
} from "@/lib/usage/aggregation";
import { isUsageRecordEndpointUnavailableError } from "@/lib/usage/endpoint-compat";
import {
  maskRawUsageSource,
  maskUsageSensitiveValue,
  normalizeUsageSourceId,
} from "@/lib/usage/source";

const USAGE_HISTORY_CACHE_TTL_MS = 15_000;
const REQUEST_EVENT_LIMIT = 200;
const LATENCY_SERIES_LIMIT = 120;
const RECENT_WINDOW_MINUTES = 30;
const SERVICE_HEALTH_DAYS = 7;
const SERVICE_HEALTH_BLOCK_MINUTES = 15;

export interface UsageTrendPoint {
  label: string;
  displayLabel: string;
  all: number;
  [key: string]: string | number;
}

export interface UsageTrendSeries {
  hour: UsageTrendPoint[];
  day: UsageTrendPoint[];
}

export interface UsageTokenBreakdownPoint {
  label: string;
  displayLabel: string;
  input: number;
  output: number;
  cached: number;
  reasoning: number;
}

export interface UsageTokenBreakdownSeries {
  hour: UsageTokenBreakdownPoint[];
  day: UsageTokenBreakdownPoint[];
}

export interface UsageCostBasis {
  promptTokens: number;
  cachedTokens: number;
  outputTokens: number;
}

export interface UsageCostBreakdownPoint {
  label: string;
  displayLabel: string;
  models: Record<string, UsageCostBasis>;
}

export interface UsageCostBreakdownSeries {
  hour: UsageCostBreakdownPoint[];
  day: UsageCostBreakdownPoint[];
  totalsByModel: Record<string, UsageCostBasis>;
}

export interface UsageHistoryData {
  keys: Record<string, KeyUsage>;
  totals: UsageTotals;
  dailyBreakdown: DailyBreakdown[];
  modelBreakdown: ModelBreakdown[];
  apiBreakdown: ApiBreakdown[];
  credentialBreakdown: CredentialBreakdown[];
  requestEvents: RequestEvent[];
  latencySeries: LatencyPoint[];
  latencySummary: LatencySummary;
  recentRate: RecentRateSummary;
  serviceHealth: ServiceHealthSummary;
  modelNames: string[];
  requestTrend: UsageTrendSeries;
  tokenTrend: UsageTrendSeries;
  tokenBreakdown: UsageTokenBreakdownSeries;
  costBreakdown: UsageCostBreakdownSeries;
  period: {
    from: string;
    to: string;
  };
  collectorStatus: {
    lastCollectedAt: string;
    lastStatus: string;
  };
  truncated: boolean;
}

export interface UsageHistorySnapshot {
  data: UsageHistoryData;
  isAdmin: boolean;
}

interface UsageScope {
  isAdmin: boolean;
  sourceFilter: string[];
}

interface ResolvedSourceInfo {
  sourceId: string;
  sourceDisplay: string;
  sourceType?: string;
}

interface GetUsageHistorySnapshotOptions {
  userId: string;
  fromDate: Date;
  toDate: Date;
  fromParam?: string;
  toParam?: string;
}

interface UsageRecordRow {
  apiKeyId: string | null;
  userId: string | null;
  authIndex: string;
  endpoint?: string | null;
  model: string;
  source: string;
  latencyMs: number;
  totalTokens: number;
  inputTokens: number;
  outputTokens: number;
  reasoningTokens: number;
  cachedTokens: number;
  failed: boolean;
  timestamp: Date;
  user: {
    username: string;
  } | null;
  apiKey: {
    name: string;
  } | null;
}

interface UsageBucketRow {
  bucket: Date | string;
  model: string;
  requests: unknown;
  totalTokens: unknown;
  inputTokens: unknown;
  outputTokens: unknown;
  reasoningTokens: unknown;
  cachedTokens: unknown;
  promptTokens: unknown;
  successCount: unknown;
  failureCount: unknown;
}

interface UsageLatencySummaryRow {
  sampleCount: unknown;
  averageMs: unknown;
  p95Ms: unknown;
  maxMs: unknown;
}

interface UsageServiceHealthRow {
  blockIndex: unknown;
  successCount: unknown;
  failureCount: unknown;
}

const usageRecordBaseSelect = {
  apiKeyId: true,
  userId: true,
  authIndex: true,
  model: true,
  source: true,
  latencyMs: true,
  totalTokens: true,
  inputTokens: true,
  outputTokens: true,
  reasoningTokens: true,
  cachedTokens: true,
  failed: true,
  timestamp: true,
  user: {
    select: {
      username: true,
    },
  },
  apiKey: {
    select: {
      name: true,
    },
  },
} satisfies Prisma.UsageRecordSelect;

const usageRecordSelectWithEndpoint = {
  ...usageRecordBaseSelect,
  endpoint: true,
} satisfies Prisma.UsageRecordSelect;

function toDateParam(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function toSafeNumber(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "bigint") return Number(value);
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
}

function dedupeStrings(values: Array<string | null | undefined>): string[] {
  return [...new Set(values.map((value) => value?.trim()).filter((value): value is string => Boolean(value)))];
}

function formatTrendDisplayLabel(label: string, period: "hour" | "day"): string {
  return period === "hour"
    ? new Date(label).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" })
    : new Date(`${label}T00:00:00`).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function createTrendPoint(label: string, period: "hour" | "day"): UsageTrendPoint {
  return {
    label,
    displayLabel: formatTrendDisplayLabel(label, period),
    all: 0,
  };
}

function createTokenBreakdownPoint(label: string, period: "hour" | "day"): UsageTokenBreakdownPoint {
  return {
    label,
    displayLabel: formatTrendDisplayLabel(label, period),
    input: 0,
    output: 0,
    cached: 0,
    reasoning: 0,
  };
}

function createCostBreakdownPoint(label: string, period: "hour" | "day"): UsageCostBreakdownPoint {
  return {
    label,
    displayLabel: formatTrendDisplayLabel(label, period),
    models: {},
  };
}

function getHourWindow(fromDate: Date, toDate: Date): number {
  const diffHours = Math.max(1, Math.ceil((toDate.getTime() - fromDate.getTime()) / (60 * 60 * 1000)));
  if (diffHours <= 7) return 7;
  if (diffHours <= 24) return 24;
  if (diffHours <= 7 * 24) return 7 * 24;
  return 24;
}

function buildHourlyLabels(now: Date, hourWindow: number): string[] {
  const currentHour = new Date(now);
  currentHour.setMinutes(0, 0, 0);
  const start = currentHour.getTime() - (hourWindow - 1) * 60 * 60 * 1000;

  return Array.from({ length: hourWindow }, (_, index) =>
    new Date(start + index * 60 * 60 * 1000).toISOString()
  );
}

function bucketToLabel(bucket: Date | string, period: "hour" | "day"): string {
  const bucketDate = bucket instanceof Date ? bucket : new Date(bucket);
  return period === "hour"
    ? bucketDate.toISOString()
    : bucketDate.toISOString().slice(0, 10);
}

function buildTrendSeries(
  bucketRows: UsageBucketRow[],
  period: "hour" | "day",
  metric: "requests" | "totalTokens",
  hourLabels: string[] = []
): UsageTrendPoint[] {
  const rowMap = new Map<string, UsageTrendPoint>();
  const labels = period === "hour"
    ? hourLabels
    : dedupeStrings(
        bucketRows
          .map((row) => bucketToLabel(row.bucket, period))
          .sort((left, right) => left.localeCompare(right))
      );

  for (const label of labels) {
    rowMap.set(label, createTrendPoint(label, period));
  }

  for (const row of bucketRows) {
    const label = bucketToLabel(row.bucket, period);
    const target = rowMap.get(label) ?? createTrendPoint(label, period);
    const value = metric === "requests" ? toSafeNumber(row.requests) : toSafeNumber(row.totalTokens);
    target[row.model] = toSafeNumber(target[row.model] ?? 0) + value;
    target.all += value;
    rowMap.set(label, target);
  }

  return [...rowMap.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([, value]) => value);
}

function buildTokenBreakdownSeries(
  bucketRows: UsageBucketRow[],
  period: "hour" | "day",
  hourLabels: string[] = []
): UsageTokenBreakdownPoint[] {
  const rowMap = new Map<string, UsageTokenBreakdownPoint>();
  const labels = period === "hour"
    ? hourLabels
    : dedupeStrings(
        bucketRows
          .map((row) => bucketToLabel(row.bucket, period))
          .sort((left, right) => left.localeCompare(right))
      );

  for (const label of labels) {
    rowMap.set(label, createTokenBreakdownPoint(label, period));
  }

  for (const row of bucketRows) {
    const label = bucketToLabel(row.bucket, period);
    const target = rowMap.get(label) ?? createTokenBreakdownPoint(label, period);
    target.input += toSafeNumber(row.inputTokens);
    target.output += toSafeNumber(row.outputTokens);
    target.cached += toSafeNumber(row.cachedTokens);
    target.reasoning += toSafeNumber(row.reasoningTokens);
    rowMap.set(label, target);
  }

  return [...rowMap.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([, value]) => value);
}

function buildCostBreakdownSeries(
  bucketRows: UsageBucketRow[],
  period: "hour" | "day",
  hourLabels: string[] = []
): UsageCostBreakdownPoint[] {
  const rowMap = new Map<string, UsageCostBreakdownPoint>();
  const labels = period === "hour"
    ? hourLabels
    : dedupeStrings(
        bucketRows
          .map((row) => bucketToLabel(row.bucket, period))
          .sort((left, right) => left.localeCompare(right))
      );

  for (const label of labels) {
    rowMap.set(label, createCostBreakdownPoint(label, period));
  }

  for (const row of bucketRows) {
    const label = bucketToLabel(row.bucket, period);
    const target = rowMap.get(label) ?? createCostBreakdownPoint(label, period);
    const existing = target.models[row.model] ?? {
      promptTokens: 0,
      cachedTokens: 0,
      outputTokens: 0,
    };

    existing.promptTokens += toSafeNumber(row.promptTokens);
    existing.cachedTokens += toSafeNumber(row.cachedTokens);
    existing.outputTokens += toSafeNumber(row.outputTokens);
    target.models[row.model] = existing;
    rowMap.set(label, target);
  }

  return [...rowMap.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([, value]) => value);
}

function buildDailyBreakdown(bucketRows: UsageBucketRow[]): DailyBreakdown[] {
  const dayMap = new Map<string, DailyBreakdown>();

  for (const row of bucketRows) {
    const label = bucketToLabel(row.bucket, "day");
    const entry = dayMap.get(label) ?? {
      date: label,
      requests: 0,
      tokens: 0,
      inputTokens: 0,
      outputTokens: 0,
      reasoningTokens: 0,
      cachedTokens: 0,
      success: 0,
      failure: 0,
    };

    entry.requests += toSafeNumber(row.requests);
    entry.tokens += toSafeNumber(row.totalTokens);
    entry.inputTokens += toSafeNumber(row.inputTokens);
    entry.outputTokens += toSafeNumber(row.outputTokens);
    entry.reasoningTokens += toSafeNumber(row.reasoningTokens);
    entry.cachedTokens += toSafeNumber(row.cachedTokens);
    entry.success += toSafeNumber(row.successCount);
    entry.failure += toSafeNumber(row.failureCount);
    dayMap.set(label, entry);
  }

  return [...dayMap.values()].sort((left, right) => left.date.localeCompare(right.date));
}

function buildModelBreakdown(bucketRows: UsageBucketRow[]): ModelBreakdown[] {
  const modelMap = new Map<string, ModelBreakdown>();

  for (const row of bucketRows) {
    const entry = modelMap.get(row.model) ?? {
      model: row.model,
      requests: 0,
      tokens: 0,
      inputTokens: 0,
      outputTokens: 0,
      successCount: 0,
      failureCount: 0,
    };

    entry.requests += toSafeNumber(row.requests);
    entry.tokens += toSafeNumber(row.totalTokens);
    entry.inputTokens += toSafeNumber(row.inputTokens);
    entry.outputTokens += toSafeNumber(row.outputTokens);
    entry.successCount += toSafeNumber(row.successCount);
    entry.failureCount += toSafeNumber(row.failureCount);
    modelMap.set(row.model, entry);
  }

  return [...modelMap.values()].sort((left, right) => {
    if (right.requests !== left.requests) return right.requests - left.requests;
    return right.tokens - left.tokens;
  });
}

function buildTotals(modelBreakdown: ModelBreakdown[], bucketRows: UsageBucketRow[]): UsageTotals {
  const totals = {
    totalRequests: 0,
    totalTokens: 0,
    inputTokens: 0,
    outputTokens: 0,
    reasoningTokens: 0,
    cachedTokens: 0,
    successCount: 0,
    failureCount: 0,
  };

  for (const model of modelBreakdown) {
    totals.totalRequests += model.requests;
    totals.totalTokens += model.tokens;
    totals.inputTokens += model.inputTokens;
    totals.outputTokens += model.outputTokens;
    totals.successCount += model.successCount;
    totals.failureCount += model.failureCount;
  }

  for (const row of bucketRows) {
    totals.reasoningTokens += toSafeNumber(row.reasoningTokens);
    totals.cachedTokens += toSafeNumber(row.cachedTokens);
  }

  return totals;
}

function buildCostTotals(bucketRows: UsageBucketRow[]): Record<string, UsageCostBasis> {
  const totalsByModel: Record<string, UsageCostBasis> = {};

  for (const row of bucketRows) {
    const entry = totalsByModel[row.model] ?? {
      promptTokens: 0,
      cachedTokens: 0,
      outputTokens: 0,
    };

    entry.promptTokens += toSafeNumber(row.promptTokens);
    entry.cachedTokens += toSafeNumber(row.cachedTokens);
    entry.outputTokens += toSafeNumber(row.outputTokens);
    totalsByModel[row.model] = entry;
  }

  return totalsByModel;
}

function buildUsageWhereSql(
  userId: string,
  scope: UsageScope,
  fromDate: Date,
  toDate: Date,
  extra?: Prisma.Sql
): Prisma.Sql {
  const scopedFilter = scope.isAdmin
    ? Prisma.sql``
    : scope.sourceFilter.length > 0
      ? Prisma.sql` AND ("userId" = ${userId} OR "source" IN (${Prisma.join(scope.sourceFilter)}))`
      : Prisma.sql` AND "userId" = ${userId}`;

  return Prisma.sql`
    "timestamp" >= ${fromDate}
    AND "timestamp" <= ${toDate}
    AND "apiKeyId" IS NOT NULL
    ${scopedFilter}
    ${extra ? Prisma.sql` AND ${extra}` : Prisma.sql``}
  `;
}

export function isValidUsageHistoryDateParam(dateString: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateString)) {
    return false;
  }

  const [year, month, day] = dateString.split("-").map(Number);
  const date = new Date(year, month - 1, day);

  return date.getFullYear() === year
    && date.getMonth() === month - 1
    && date.getDate() === day;
}

async function resolveUsageScope(userId: string): Promise<UsageScope> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { isAdmin: true, username: true },
  });

  if (!user) {
    throw new Error(`Usage scope user not found: ${userId}`);
  }

  if (user.isAdmin) {
    return {
      isAdmin: true,
      sourceFilter: [],
    };
  }

  const oauthOwnerships = await prisma.providerOAuthOwnership.findMany({
    where: { userId },
    select: { accountName: true, accountEmail: true },
  });

  return {
    isAdmin: false,
    sourceFilter: dedupeStrings([
      user.username,
      ...oauthOwnerships.flatMap((ownership) => [ownership.accountEmail, ownership.accountName]),
    ]),
  };
}

function buildUsageWhereClause(
  userId: string,
  scope: UsageScope,
  fromDate: Date,
  toDate: Date
): Prisma.UsageRecordWhereInput {
  return {
    timestamp: {
      gte: fromDate,
      lte: toDate,
    },
    apiKeyId: { not: null },
    ...(scope.isAdmin
      ? {}
      : {
          OR: [
            { userId },
            ...(scope.sourceFilter.length > 0
              ? [{ source: { in: scope.sourceFilter } }]
              : []),
          ],
        }),
  };
}

async function fetchUsageBucketRows(
  userId: string,
  scope: UsageScope,
  fromDate: Date,
  toDate: Date,
  period: "hour" | "day"
): Promise<UsageBucketRow[]> {
  const whereSql = buildUsageWhereSql(userId, scope, fromDate, toDate);
  const bucketSql = period === "hour"
    ? Prisma.sql`DATE_TRUNC('hour', "timestamp")`
    : Prisma.sql`DATE_TRUNC('day', "timestamp")`;

  return prisma.$queryRaw<UsageBucketRow[]>(Prisma.sql`
    SELECT
      ${bucketSql} AS "bucket",
      "model",
      COUNT(*)::int AS "requests",
      COALESCE(SUM("totalTokens"), 0)::bigint AS "totalTokens",
      COALESCE(SUM("inputTokens"), 0)::bigint AS "inputTokens",
      COALESCE(SUM("outputTokens"), 0)::bigint AS "outputTokens",
      COALESCE(SUM("reasoningTokens"), 0)::bigint AS "reasoningTokens",
      COALESCE(SUM("cachedTokens"), 0)::bigint AS "cachedTokens",
      COALESCE(SUM(GREATEST("inputTokens" - "cachedTokens", 0)), 0)::bigint AS "promptTokens",
      COALESCE(SUM(CASE WHEN "failed" THEN 0 ELSE 1 END), 0)::int AS "successCount",
      COALESCE(SUM(CASE WHEN "failed" THEN 1 ELSE 0 END), 0)::int AS "failureCount"
    FROM "usage_records"
    WHERE ${whereSql}
    GROUP BY 1, 2
    ORDER BY 1 ASC, 2 ASC
  `);
}

async function fetchLatencySummary(
  userId: string,
  scope: UsageScope,
  fromDate: Date,
  toDate: Date
): Promise<LatencySummary> {
  const whereSql = buildUsageWhereSql(userId, scope, fromDate, toDate, Prisma.sql`"latencyMs" > 0`);
  const rows = await prisma.$queryRaw<UsageLatencySummaryRow[]>(Prisma.sql`
    SELECT
      COUNT(*)::int AS "sampleCount",
      COALESCE(ROUND(AVG("latencyMs")), 0)::int AS "averageMs",
      COALESCE(PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY "latencyMs"), 0)::numeric AS "p95Ms",
      COALESCE(MAX("latencyMs"), 0)::int AS "maxMs"
    FROM "usage_records"
    WHERE ${whereSql}
  `);
  const row = rows[0];

  return {
    sampleCount: row ? toSafeNumber(row.sampleCount) : 0,
    averageMs: row ? toSafeNumber(row.averageMs) : 0,
    p95Ms: row ? toSafeNumber(row.p95Ms) : 0,
    maxMs: row ? toSafeNumber(row.maxMs) : 0,
  };
}

async function fetchServiceHealthRows(
  userId: string,
  scope: UsageScope,
  healthWindowStart: Date,
  toDate: Date
): Promise<UsageServiceHealthRow[]> {
  const blockSeconds = SERVICE_HEALTH_BLOCK_MINUTES * 60;
  const whereSql = buildUsageWhereSql(userId, scope, healthWindowStart, toDate);

  return prisma.$queryRaw<UsageServiceHealthRow[]>(Prisma.sql`
    SELECT
      FLOOR(EXTRACT(EPOCH FROM ("timestamp" - ${healthWindowStart})) / ${blockSeconds})::int AS "blockIndex",
      COALESCE(SUM(CASE WHEN "failed" THEN 0 ELSE 1 END), 0)::int AS "successCount",
      COALESCE(SUM(CASE WHEN "failed" THEN 1 ELSE 0 END), 0)::int AS "failureCount"
    FROM "usage_records"
    WHERE ${whereSql}
    GROUP BY 1
    ORDER BY 1 ASC
  `);
}

async function fetchLimitedUsageRecords(
  whereClause: Prisma.UsageRecordWhereInput,
  userId: string
): Promise<{
  requestRecords: UsageRecordRow[];
  latencyRecords: UsageRecordRow[];
  endpointAvailable: boolean;
}> {
  try {
    const [requestRecords, latencyRecords] = await Promise.all([
      prisma.usageRecord.findMany({
        where: whereClause,
        select: usageRecordSelectWithEndpoint,
        orderBy: {
          timestamp: "desc",
        },
        take: REQUEST_EVENT_LIMIT,
      }),
      prisma.usageRecord.findMany({
        where: {
          ...whereClause,
          latencyMs: { gt: 0 },
        },
        select: usageRecordSelectWithEndpoint,
        orderBy: {
          timestamp: "desc",
        },
        take: LATENCY_SERIES_LIMIT,
      }),
    ]);

    return {
      requestRecords: requestRecords as UsageRecordRow[],
      latencyRecords: latencyRecords as UsageRecordRow[],
      endpointAvailable: true,
    };
  } catch (error) {
    if (!isUsageRecordEndpointUnavailableError(error)) {
      throw error;
    }

    logger.warn(
      { err: error, userId },
      "UsageRecord.endpoint unavailable for history snapshot, retrying without endpoint"
    );

    const [requestRecords, latencyRecords] = await Promise.all([
      prisma.usageRecord.findMany({
        where: whereClause,
        select: usageRecordBaseSelect,
        orderBy: {
          timestamp: "desc",
        },
        take: REQUEST_EVENT_LIMIT,
      }),
      prisma.usageRecord.findMany({
        where: {
          ...whereClause,
          latencyMs: { gt: 0 },
        },
        select: usageRecordBaseSelect,
        orderBy: {
          timestamp: "desc",
        },
        take: LATENCY_SERIES_LIMIT,
      }),
    ]);

    return {
      requestRecords: requestRecords as UsageRecordRow[],
      latencyRecords: latencyRecords as UsageRecordRow[],
      endpointAvailable: false,
    };
  }
}

function buildSourceResolver(input: {
  oauthOwnerships: Array<{
    id: string;
    provider: string;
    accountName: string;
    accountEmail: string | null;
  }>;
  providerKeys: Array<{
    id: string;
    provider: string;
    keyHash: string;
    keyIdentifier: string;
    name: string;
  }>;
  customProviders: Array<{
    id: string;
    providerId: string;
    name: string;
    prefix: string | null;
  }>;
}): (rawSource: string) => ResolvedSourceInfo {
  const oauthByLookup = new Map<string, { id: string; provider: string; accountName: string }>();
  for (const ownership of input.oauthOwnerships) {
    oauthByLookup.set(ownership.accountName.toLowerCase(), {
      id: ownership.id,
      provider: ownership.provider,
      accountName: ownership.accountName,
    });
    if (ownership.accountEmail) {
      oauthByLookup.set(ownership.accountEmail.toLowerCase(), {
        id: ownership.id,
        provider: ownership.provider,
        accountName: ownership.accountName,
      });
    }
  }

  const providerKeyByLookup = new Map<string, {
    id: string;
    provider: string;
    keyHash: string;
    keyIdentifier: string;
    name: string;
  }>();
  for (const key of input.providerKeys) {
    providerKeyByLookup.set(key.keyIdentifier.toLowerCase(), key);
  }

  const customProviderByLookup = new Map<string, {
    id: string;
    providerId: string;
    name: string;
  }>();
  for (const provider of input.customProviders) {
    customProviderByLookup.set(provider.providerId.toLowerCase(), {
      id: provider.id,
      providerId: provider.providerId,
      name: provider.name,
    });
    customProviderByLookup.set(provider.name.toLowerCase(), {
      id: provider.id,
      providerId: provider.providerId,
      name: provider.name,
    });
    if (provider.prefix) {
      customProviderByLookup.set(provider.prefix.toLowerCase(), {
        id: provider.id,
        providerId: provider.providerId,
        name: provider.name,
      });
    }
  }

  return (rawSource: string): ResolvedSourceInfo => {
    const trimmed = rawSource.trim();
    if (!trimmed) {
      return {
        sourceId: "empty:",
        sourceDisplay: "Unknown",
      };
    }

    const lower = trimmed.toLowerCase();
    const oauth = oauthByLookup.get(lower);
    if (oauth) {
      return {
        sourceId: `oauth:${oauth.id}`,
        sourceDisplay: oauth.accountName,
        sourceType: oauth.provider,
      };
    }

    const customProvider = customProviderByLookup.get(lower);
    if (customProvider) {
      return {
        sourceId: `custom:${customProvider.id}`,
        sourceDisplay: customProvider.name,
        sourceType: "custom-provider",
      };
    }

    const maskedSource = maskRawUsageSource(trimmed);
    const providerKey = providerKeyByLookup.get(lower) ?? providerKeyByLookup.get(maskedSource.toLowerCase());
    if (providerKey) {
      return {
        sourceId: `key:${providerKey.keyHash}`,
        sourceDisplay: providerKey.name === "Unnamed Key" ? providerKey.keyIdentifier : providerKey.name,
        sourceType: providerKey.provider,
      };
    }

    return {
      sourceId: normalizeUsageSourceId(trimmed),
      sourceDisplay: maskUsageSensitiveValue(trimmed),
    };
  };
}

function buildRequestEvent(
  record: UsageRecordRow,
  resolveSource: (rawSource: string) => ResolvedSourceInfo,
  exposeUsername: boolean,
  endpointAvailable: boolean
): RequestEvent {
  const source = resolveSource(record.source);
  const username = record.user?.username ?? undefined;

  return {
    timestamp: record.timestamp.toISOString(),
    endpoint: endpointAvailable ? record.endpoint ?? null : null,
    keyName: record.apiKey?.name ?? username ?? `Key ${record.authIndex.slice(0, 6)}`,
    ...(exposeUsername && username ? { username } : {}),
    sourceId: source.sourceId,
    sourceDisplay: source.sourceDisplay,
    ...(source.sourceType ? { sourceType: source.sourceType } : {}),
    authIndex: record.authIndex,
    model: record.model,
    latencyMs: Math.max(0, record.latencyMs),
    totalTokens: Math.max(0, record.totalTokens),
    inputTokens: Math.max(0, record.inputTokens),
    outputTokens: Math.max(0, record.outputTokens),
    reasoningTokens: Math.max(0, record.reasoningTokens),
    cachedTokens: Math.max(0, record.cachedTokens),
    failed: record.failed,
  };
}

function buildLatencyPoint(event: RequestEvent): LatencyPoint {
  return {
    timestamp: event.timestamp,
    endpoint: event.endpoint,
    keyName: event.keyName,
    ...(event.username ? { username: event.username } : {}),
    sourceDisplay: event.sourceDisplay,
    model: event.model,
    latencyMs: event.latencyMs,
    failed: event.failed,
  };
}

function buildApiBreakdown(
  rows: Array<{
    endpoint: string | null;
    model: string;
    failed: boolean;
    _count: { _all: number };
    _sum: { totalTokens: number | null };
  }>
): ApiBreakdown[] {
  const apiMap: Record<string, ApiBreakdown> = {};

  for (const row of rows) {
    const endpointLabel = row.endpoint ?? "Unknown endpoint";
    if (!apiMap[endpointLabel]) {
      apiMap[endpointLabel] = {
        endpoint: endpointLabel,
        requests: 0,
        tokens: 0,
        successCount: 0,
        failureCount: 0,
        models: {},
      };
    }

    const target = apiMap[endpointLabel];
    const requestCount = row._count._all;
    const totalTokens = row._sum.totalTokens ?? 0;

    target.requests += requestCount;
    target.tokens += totalTokens;
    if (row.failed) {
      target.failureCount += requestCount;
    } else {
      target.successCount += requestCount;
    }

    if (!target.models[row.model]) {
      target.models[row.model] = {
        requests: 0,
        tokens: 0,
        successCount: 0,
        failureCount: 0,
      };
    }

    target.models[row.model].requests += requestCount;
    target.models[row.model].tokens += totalTokens;
    if (row.failed) {
      target.models[row.model].failureCount += requestCount;
    } else {
      target.models[row.model].successCount += requestCount;
    }
  }

  return Object.values(apiMap).sort((left, right) => {
    if (right.requests !== left.requests) return right.requests - left.requests;
    return right.tokens - left.tokens;
  });
}

function buildFallbackApiBreakdown(modelBreakdown: ModelBreakdown[]): ApiBreakdown[] {
  if (modelBreakdown.length === 0) {
    return [];
  }

  return [{
    endpoint: "Unknown endpoint",
    requests: modelBreakdown.reduce((sum, model) => sum + model.requests, 0),
    tokens: modelBreakdown.reduce((sum, model) => sum + model.tokens, 0),
    successCount: modelBreakdown.reduce((sum, model) => sum + model.successCount, 0),
    failureCount: modelBreakdown.reduce((sum, model) => sum + model.failureCount, 0),
    models: Object.fromEntries(
      modelBreakdown.map((model) => [
        model.model,
        {
          requests: model.requests,
          tokens: model.tokens,
          successCount: model.successCount,
          failureCount: model.failureCount,
        },
      ])
    ),
  }];
}

async function buildKeyUsage(
  whereClause: Prisma.UsageRecordWhereInput,
  exposeUsername: boolean
): Promise<Record<string, KeyUsage>> {
  const rows = await prisma.usageRecord.groupBy({
    by: ["apiKeyId", "userId", "authIndex", "model", "failed"],
    where: whereClause,
    _count: { _all: true },
    _sum: {
      totalTokens: true,
      inputTokens: true,
      outputTokens: true,
      reasoningTokens: true,
      cachedTokens: true,
    },
  });

  const apiKeyIds = dedupeStrings(rows.map((row) => row.apiKeyId));
  const userIds = dedupeStrings(rows.map((row) => row.userId));
  const [apiKeys, users] = await Promise.all([
    apiKeyIds.length > 0
      ? prisma.userApiKey.findMany({
          where: { id: { in: apiKeyIds } },
          select: { id: true, name: true },
        })
      : Promise.resolve([]),
    userIds.length > 0
      ? prisma.user.findMany({
          where: { id: { in: userIds } },
          select: { id: true, username: true },
        })
      : Promise.resolve([]),
  ]);

  const apiKeyNameById = new Map(apiKeys.map((apiKey) => [apiKey.id, apiKey.name]));
  const usernameById = new Map(users.map((user) => [user.id, user.username]));
  const keyUsageMap: Record<string, KeyUsage> = {};

  for (const row of rows) {
    const groupKey = row.apiKeyId ?? row.userId ?? row.authIndex;
    const username = row.userId ? usernameById.get(row.userId) : undefined;

    if (!keyUsageMap[groupKey]) {
      keyUsageMap[groupKey] = {
        keyName:
          (row.apiKeyId ? apiKeyNameById.get(row.apiKeyId) : undefined)
          ?? username
          ?? `Key ${row.authIndex.slice(0, 6)}`,
        ...(exposeUsername && username ? { username } : {}),
        ...(row.userId ? { userId: row.userId } : {}),
        totalRequests: 0,
        totalTokens: 0,
        inputTokens: 0,
        outputTokens: 0,
        reasoningTokens: 0,
        cachedTokens: 0,
        successCount: 0,
        failureCount: 0,
        models: {},
      };
    }

    const keyUsage = keyUsageMap[groupKey];
    if (!keyUsage.models[row.model]) {
      keyUsage.models[row.model] = {
        totalRequests: 0,
        totalTokens: 0,
        inputTokens: 0,
        outputTokens: 0,
        successCount: 0,
        failureCount: 0,
      };
    }

    const requestCount = row._count._all;
    const totalTokens = row._sum.totalTokens ?? 0;
    const inputTokens = row._sum.inputTokens ?? 0;
    const outputTokens = row._sum.outputTokens ?? 0;
    const reasoningTokens = row._sum.reasoningTokens ?? 0;
    const cachedTokens = row._sum.cachedTokens ?? 0;

    keyUsage.totalRequests += requestCount;
    keyUsage.totalTokens += totalTokens;
    keyUsage.inputTokens += inputTokens;
    keyUsage.outputTokens += outputTokens;
    keyUsage.reasoningTokens += reasoningTokens;
    keyUsage.cachedTokens += cachedTokens;

    keyUsage.models[row.model].totalRequests += requestCount;
    keyUsage.models[row.model].totalTokens += totalTokens;
    keyUsage.models[row.model].inputTokens += inputTokens;
    keyUsage.models[row.model].outputTokens += outputTokens;

    if (row.failed) {
      keyUsage.failureCount += requestCount;
      keyUsage.models[row.model].failureCount += requestCount;
    } else {
      keyUsage.successCount += requestCount;
      keyUsage.models[row.model].successCount += requestCount;
    }
  }

  return keyUsageMap;
}

async function buildCredentialBreakdown(
  whereClause: Prisma.UsageRecordWhereInput,
  resolveSource: (rawSource: string) => ResolvedSourceInfo
): Promise<CredentialBreakdown[]> {
  const rows = await prisma.usageRecord.groupBy({
    by: ["source", "failed"],
    where: whereClause,
    _count: { _all: true },
    _sum: { totalTokens: true },
  });
  const breakdownMap: Record<string, CredentialBreakdown> = {};

  for (const row of rows) {
    const resolved = resolveSource(row.source);
    if (!breakdownMap[resolved.sourceId]) {
      breakdownMap[resolved.sourceId] = {
        sourceId: resolved.sourceId,
        sourceDisplay: resolved.sourceDisplay,
        ...(resolved.sourceType ? { sourceType: resolved.sourceType } : {}),
        requests: 0,
        tokens: 0,
        successCount: 0,
        failureCount: 0,
      };
    }

    const entry = breakdownMap[resolved.sourceId];
    entry.requests += row._count._all;
    entry.tokens += row._sum.totalTokens ?? 0;
    if (row.failed) {
      entry.failureCount += row._count._all;
    } else {
      entry.successCount += row._count._all;
    }
  }

  return Object.values(breakdownMap).sort((left, right) => {
    if (right.requests !== left.requests) return right.requests - left.requests;
    return right.tokens - left.tokens;
  });
}

function buildServiceHealth(
  rows: UsageServiceHealthRow[],
  healthWindowStart: Date
): ServiceHealthSummary {
  const blocksPerDay = Math.max(1, Math.floor((24 * 60) / SERVICE_HEALTH_BLOCK_MINUTES));
  const blockCount = Math.max(1, SERVICE_HEALTH_DAYS * blocksPerDay);
  const blockDurationMs = SERVICE_HEALTH_BLOCK_MINUTES * 60_000;
  const healthBuckets = Array.from({ length: blockCount }, () => ({
    success: 0,
    failure: 0,
  }));

  let totalSuccess = 0;
  let totalFailure = 0;

  for (const row of rows) {
    const blockIndex = toSafeNumber(row.blockIndex);
    if (blockIndex < 0 || blockIndex >= blockCount) continue;

    const successCount = toSafeNumber(row.successCount);
    const failureCount = toSafeNumber(row.failureCount);
    healthBuckets[blockIndex].success += successCount;
    healthBuckets[blockIndex].failure += failureCount;
    totalSuccess += successCount;
    totalFailure += failureCount;
  }

  const totalTraffic = totalSuccess + totalFailure;

  return {
    successRate: totalTraffic > 0 ? (totalSuccess / totalTraffic) * 100 : 100,
    totalSuccess,
    totalFailure,
    rows: SERVICE_HEALTH_DAYS,
    cols: blocksPerDay,
    blockSizeMinutes: SERVICE_HEALTH_BLOCK_MINUTES,
    blockDetails: healthBuckets.map((bucket, index) => {
      const total = bucket.success + bucket.failure;
      const startTime = healthWindowStart.getTime() + index * blockDurationMs;

      return {
        success: bucket.success,
        failure: bucket.failure,
        rate: total > 0 ? bucket.success / total : -1,
        startTime,
        endTime: startTime + blockDurationMs,
      };
    }),
  };
}

function buildRecentRate(
  requestCount: number,
  tokenCount: number
): RecentRateSummary {
  return {
    windowMinutes: RECENT_WINDOW_MINUTES,
    requestCount,
    tokenCount,
    rpm: RECENT_WINDOW_MINUTES > 0 ? requestCount / RECENT_WINDOW_MINUTES : 0,
    tpm: RECENT_WINDOW_MINUTES > 0 ? tokenCount / RECENT_WINDOW_MINUTES : 0,
  };
}

export async function getUsageHistorySnapshot(
  options: GetUsageHistorySnapshotOptions
): Promise<UsageHistorySnapshot> {
  const requestStartedAt = Date.now();
  const fromParam = options.fromParam ?? toDateParam(options.fromDate);
  const toParam = options.toParam ?? toDateParam(options.toDate);
  const fromCacheKey = Math.floor(options.fromDate.getTime() / USAGE_HISTORY_CACHE_TTL_MS);
  const toCacheKey = Math.floor(options.toDate.getTime() / USAGE_HISTORY_CACHE_TTL_MS);

  const scope = await resolveUsageScope(options.userId);
  const cacheKey = `usage-history:v4:${options.userId}:${scope.isAdmin ? "admin" : "user"}:${fromCacheKey}:${toCacheKey}`;
  const cached = usageCache.get(cacheKey) as UsageHistorySnapshot | null;

  if (cached) {
    logger.debug(
      { userId: options.userId, from: fromParam, to: toParam },
      "Usage history cache hit"
    );
    return cached;
  }

  try {
    const whereClause = buildUsageWhereClause(options.userId, scope, options.fromDate, options.toDate);
    const ownershipWhere = scope.isAdmin ? {} : { userId: options.userId };
    const now = options.toDate;
    const hourWindow = getHourWindow(options.fromDate, options.toDate);
    const hourLabels = buildHourlyLabels(now, hourWindow);
    const hourRangeStart = new Date(hourLabels[0] ?? now.toISOString());
    const recentWindowStart = new Date(now.getTime() - RECENT_WINDOW_MINUTES * 60_000);
    const healthWindowStart = new Date(now.getTime() - SERVICE_HEALTH_DAYS * 24 * 60 * 60_000);

    const relatedDataPromise = Promise.all([
      prisma.collectorState.findFirst({
        orderBy: { updatedAt: "desc" },
      }),
      prisma.providerOAuthOwnership.findMany({
        where: ownershipWhere,
        select: {
          id: true,
          provider: true,
          accountName: true,
          accountEmail: true,
        },
      }),
      prisma.providerKeyOwnership.findMany({
        where: ownershipWhere,
        select: {
          id: true,
          provider: true,
          keyHash: true,
          keyIdentifier: true,
          name: true,
        },
      }),
      prisma.customProvider.findMany({
        where: ownershipWhere,
        select: {
          id: true,
          providerId: true,
          name: true,
          prefix: true,
        },
      }),
    ]);

    const dayBucketPromise = fetchUsageBucketRows(
      options.userId,
      scope,
      options.fromDate,
      options.toDate,
      "day"
    );
    const hourBucketPromise = fetchUsageBucketRows(
      options.userId,
      scope,
      hourRangeStart,
      options.toDate,
      "hour"
    );
    const limitedRecordsPromise = fetchLimitedUsageRecords(whereClause, options.userId);
    const keyUsagePromise = buildKeyUsage(whereClause, scope.isAdmin);
    const latencySummaryPromise = fetchLatencySummary(
      options.userId,
      scope,
      options.fromDate,
      options.toDate
    );
    const recentRatePromise = prisma.usageRecord.aggregate({
      where: buildUsageWhereClause(options.userId, scope, recentWindowStart, options.toDate),
      _count: { _all: true },
      _sum: { totalTokens: true },
    });
    const serviceHealthPromise = fetchServiceHealthRows(
      options.userId,
      scope,
      healthWindowStart,
      options.toDate
    );

    const [
      [collectorState, oauthOwnerships, providerKeys, customProviders],
      dayBuckets,
      hourBuckets,
      limitedRecords,
      keyUsage,
      latencySummary,
      recentRateAggregate,
      serviceHealthRows,
    ] = await Promise.all([
      relatedDataPromise,
      dayBucketPromise,
      hourBucketPromise,
      limitedRecordsPromise,
      keyUsagePromise,
      latencySummaryPromise,
      recentRatePromise,
      serviceHealthPromise,
    ]);

    const resolveSource = buildSourceResolver({
      oauthOwnerships,
      providerKeys,
      customProviders,
    });

    const dailyBreakdown = buildDailyBreakdown(dayBuckets);
    const modelBreakdown = buildModelBreakdown(dayBuckets);
    const modelNames = modelBreakdown.map((model) => model.model).sort();
    const totals = buildTotals(modelBreakdown, dayBuckets);
    const requestTrend: UsageTrendSeries = {
      hour: buildTrendSeries(hourBuckets, "hour", "requests", hourLabels),
      day: buildTrendSeries(dayBuckets, "day", "requests"),
    };
    const tokenTrend: UsageTrendSeries = {
      hour: buildTrendSeries(hourBuckets, "hour", "totalTokens", hourLabels),
      day: buildTrendSeries(dayBuckets, "day", "totalTokens"),
    };
    const tokenBreakdown: UsageTokenBreakdownSeries = {
      hour: buildTokenBreakdownSeries(hourBuckets, "hour", hourLabels),
      day: buildTokenBreakdownSeries(dayBuckets, "day"),
    };
    const costBreakdown: UsageCostBreakdownSeries = {
      hour: buildCostBreakdownSeries(hourBuckets, "hour", hourLabels),
      day: buildCostBreakdownSeries(dayBuckets, "day"),
      totalsByModel: buildCostTotals(dayBuckets),
    };

    const requestEvents = limitedRecords.requestRecords.map((record) =>
      buildRequestEvent(record, resolveSource, scope.isAdmin, limitedRecords.endpointAvailable)
    );
    const latencySeries = limitedRecords.latencyRecords
      .map((record) => buildRequestEvent(record, resolveSource, scope.isAdmin, limitedRecords.endpointAvailable))
      .map((event) => buildLatencyPoint(event))
      .reverse();

    const credentialBreakdown = await buildCredentialBreakdown(whereClause, resolveSource);
    let apiBreakdown: ApiBreakdown[];
    if (limitedRecords.endpointAvailable) {
      const apiBreakdownRows = await prisma.usageRecord.groupBy({
        by: ["endpoint", "model", "failed"],
        where: whereClause,
        _count: { _all: true },
        _sum: { totalTokens: true },
      });
      apiBreakdown = buildApiBreakdown(apiBreakdownRows);
    } else {
      apiBreakdown = buildFallbackApiBreakdown(modelBreakdown);
    }

    const recentRate = buildRecentRate(
      recentRateAggregate._count._all,
      recentRateAggregate._sum.totalTokens ?? 0
    );
    const serviceHealth = buildServiceHealth(serviceHealthRows, healthWindowStart);
    const truncated = totals.totalRequests > requestEvents.length;

    const responseData: UsageHistorySnapshot = {
      data: {
        keys: keyUsage,
        totals,
        dailyBreakdown,
        modelBreakdown,
        apiBreakdown,
        credentialBreakdown,
        requestEvents,
        latencySeries,
        latencySummary,
        recentRate,
        serviceHealth,
        modelNames,
        requestTrend,
        tokenTrend,
        tokenBreakdown,
        costBreakdown,
        period: {
          from: options.fromDate.toISOString(),
          to: options.toDate.toISOString(),
        },
        collectorStatus: {
          lastCollectedAt: collectorState?.lastCollectedAt?.toISOString() ?? "",
          lastStatus: collectorState?.lastStatus ?? "unknown",
        },
        truncated,
      },
      isAdmin: scope.isAdmin,
    };

    usageCache.set(cacheKey, responseData, USAGE_HISTORY_CACHE_TTL_MS);

    logger.info(
      {
        userId: options.userId,
        isAdmin: scope.isAdmin,
        from: fromParam,
        to: toParam,
        requestCount: totals.totalRequests,
        eventCount: requestEvents.length,
        durationMs: Date.now() - requestStartedAt,
      },
      "Usage history request completed"
    );

    return responseData;
  } catch (error) {
    logger.error(
      {
        err: error,
        userId: options.userId,
        from: fromParam,
        to: toParam,
        durationMs: Date.now() - requestStartedAt,
      },
      "Failed to fetch usage history"
    );
    throw error;
  }
}
