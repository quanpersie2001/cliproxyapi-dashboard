import "server-only";
import { Prisma } from "@/generated/prisma/client";
import { usageCache } from "@/lib/cache";
import { prisma } from "@/lib/db";
import { logger } from "@/lib/logger";
import {
  aggregateUsageRecords,
  type UsageAggregationData,
} from "@/lib/usage/aggregation";
import { isUsageRecordEndpointUnavailableError } from "@/lib/usage/endpoint-compat";
import {
  maskRawUsageSource,
  maskUsageSensitiveValue,
  normalizeUsageSourceId,
} from "@/lib/usage/source";

const USAGE_HISTORY_CACHE_TTL_MS = 15_000;
const USAGE_RECORD_LIMIT = 25_000;

export interface UsageHistoryData extends UsageAggregationData {
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

function dedupeStrings(values: Array<string | null | undefined>): string[] {
  return [...new Set(values.map((value) => value?.trim()).filter((value): value is string => Boolean(value)))];
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

async function findUsageRecords(
  whereClause: Prisma.UsageRecordWhereInput,
  userId: string
): Promise<{
  records: UsageRecordRow[];
  endpointAvailable: boolean;
}> {
  try {
    const records = await prisma.usageRecord.findMany({
      where: whereClause,
      select: usageRecordSelectWithEndpoint,
      orderBy: {
        timestamp: "desc",
      },
      take: USAGE_RECORD_LIMIT + 1,
    });

    return {
      records: records as UsageRecordRow[],
      endpointAvailable: true,
    };
  } catch (error) {
    if (!isUsageRecordEndpointUnavailableError(error)) {
      throw error;
    }

    logger.warn(
      { err: error, userId },
      "UsageRecord.endpoint unavailable for history query, retrying without endpoint"
    );

    const records = await prisma.usageRecord.findMany({
      where: whereClause,
      select: usageRecordBaseSelect,
      orderBy: {
        timestamp: "desc",
      },
      take: USAGE_RECORD_LIMIT + 1,
    });

    return {
      records: records as UsageRecordRow[],
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

export async function getUsageHistorySnapshot(
  options: GetUsageHistorySnapshotOptions
): Promise<UsageHistorySnapshot> {
  const requestStartedAt = Date.now();
  const fromParam = options.fromParam ?? toDateParam(options.fromDate);
  const toParam = options.toParam ?? toDateParam(options.toDate);
  const fromCacheKey = options.fromDate.toISOString();
  const toCacheKey = options.toDate.toISOString();

  const scope = await resolveUsageScope(options.userId);
  const cacheKey = `usage-history:v3:${options.userId}:${scope.isAdmin ? "admin" : "user"}:${fromCacheKey}:${toCacheKey}`;
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
    const usageRecordResult = await findUsageRecords(whereClause, options.userId);
    const [collectorState, oauthOwnerships, providerKeys, customProviders] = await relatedDataPromise;
    const usageRecords = usageRecordResult.records;

    const truncated = usageRecords.length > USAGE_RECORD_LIMIT;
    if (truncated) {
      usageRecords.pop();
    }

    const resolveSource = buildSourceResolver({
      oauthOwnerships,
      providerKeys,
      customProviders,
    });

    const aggregated = aggregateUsageRecords(
      usageRecords.map((record) => {
        const source = resolveSource(record.source);

        return {
          apiKeyId: record.apiKeyId,
          userId: record.userId,
          authIndex: record.authIndex,
          endpoint: usageRecordResult.endpointAvailable ? record.endpoint ?? null : null,
          model: record.model,
          sourceId: source.sourceId,
          sourceDisplay: source.sourceDisplay,
          sourceType: source.sourceType,
          latencyMs: record.latencyMs,
          totalTokens: record.totalTokens,
          inputTokens: record.inputTokens,
          outputTokens: record.outputTokens,
          reasoningTokens: record.reasoningTokens,
          cachedTokens: record.cachedTokens,
          failed: record.failed,
          timestamp: record.timestamp,
          displayNameFallback: record.user?.username ?? undefined,
          username: record.user?.username ?? undefined,
          apiKeyName: record.apiKey?.name ?? undefined,
          exposeUsername: scope.isAdmin,
        };
      })
    );

    const responseData: UsageHistorySnapshot = {
      data: {
        ...aggregated,
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
        recordCount: usageRecords.length,
        truncated,
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
