export interface AggregationRecord {
  apiKeyId: string | null;
  userId: string | null;
  authIndex: string;
  endpoint: string | null;
  model: string;
  sourceId: string;
  sourceDisplay: string;
  sourceType?: string;
  latencyMs: number;
  totalTokens: number;
  inputTokens: number;
  outputTokens: number;
  reasoningTokens: number;
  cachedTokens: number;
  failed: boolean;
  timestamp: Date;
  displayNameFallback?: string;
  username?: string;
  apiKeyName?: string;
  exposeUsername?: boolean;
}

export interface KeyUsage {
  keyName: string;
  username?: string;
  userId?: string;
  totalRequests: number;
  totalTokens: number;
  inputTokens: number;
  outputTokens: number;
  reasoningTokens: number;
  cachedTokens: number;
  successCount: number;
  failureCount: number;
  models: Record<string, {
    totalRequests: number;
    totalTokens: number;
    inputTokens: number;
    outputTokens: number;
    successCount: number;
    failureCount: number;
  }>;
}

export interface RequestEvent {
  timestamp: string;
  endpoint: string | null;
  keyName: string;
  username?: string;
  sourceId: string;
  sourceDisplay: string;
  sourceType?: string;
  authIndex: string;
  model: string;
  latencyMs: number;
  totalTokens: number;
  inputTokens: number;
  outputTokens: number;
  reasoningTokens: number;
  cachedTokens: number;
  failed: boolean;
}

export interface LatencyPoint {
  timestamp: string;
  endpoint: string | null;
  keyName: string;
  username?: string;
  sourceDisplay: string;
  model: string;
  latencyMs: number;
  failed: boolean;
}

export interface LatencySummary {
  sampleCount: number;
  averageMs: number;
  p95Ms: number;
  maxMs: number;
}

export interface DailyBreakdown {
  date: string;
  requests: number;
  tokens: number;
  inputTokens: number;
  outputTokens: number;
  reasoningTokens: number;
  cachedTokens: number;
  success: number;
  failure: number;
}

export interface ModelBreakdown {
  model: string;
  requests: number;
  tokens: number;
  inputTokens: number;
  outputTokens: number;
  successCount: number;
  failureCount: number;
}

export interface ApiBreakdown {
  endpoint: string;
  requests: number;
  tokens: number;
  successCount: number;
  failureCount: number;
  models: Record<string, {
    requests: number;
    tokens: number;
    successCount: number;
    failureCount: number;
  }>;
}

export interface CredentialBreakdown {
  sourceId: string;
  sourceDisplay: string;
  sourceType?: string;
  requests: number;
  tokens: number;
  successCount: number;
  failureCount: number;
}

export interface UsageDetailRecord {
  timestamp: string;
  endpoint: string | null;
  keyName: string;
  username?: string;
  sourceId: string;
  sourceDisplay: string;
  sourceType?: string;
  authIndex: string;
  model: string;
  latencyMs: number;
  totalTokens: number;
  inputTokens: number;
  outputTokens: number;
  reasoningTokens: number;
  cachedTokens: number;
  failed: boolean;
}

export interface UsageTotals {
  totalRequests: number;
  totalTokens: number;
  inputTokens: number;
  outputTokens: number;
  reasoningTokens: number;
  cachedTokens: number;
  successCount: number;
  failureCount: number;
}

export interface RecentRateSummary {
  windowMinutes: number;
  requestCount: number;
  tokenCount: number;
  rpm: number;
  tpm: number;
}

export interface ServiceHealthBlockDetail {
  success: number;
  failure: number;
  rate: number;
  startTime: number;
  endTime: number;
}

export interface ServiceHealthSummary {
  successRate: number;
  totalSuccess: number;
  totalFailure: number;
  rows: number;
  cols: number;
  blockSizeMinutes: number;
  blockDetails: ServiceHealthBlockDetail[];
}

export interface UsageAggregationData {
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
  details: UsageDetailRecord[];
}

export interface AggregateUsageOptions {
  requestEventLimit?: number;
  latencySeriesLimit?: number;
  recentWindowMinutes?: number;
  serviceHealthDays?: number;
  serviceHealthBlockMinutes?: number;
  nowMs?: number;
}

interface CounterBucket {
  success: number;
  failure: number;
}

const DEFAULT_REQUEST_EVENT_LIMIT = 200;
const DEFAULT_LATENCY_SERIES_LIMIT = 120;
const DEFAULT_RECENT_WINDOW_MINUTES = 30;
const DEFAULT_SERVICE_HEALTH_DAYS = 7;
const DEFAULT_SERVICE_HEALTH_BLOCK_MINUTES = 15;

export function summarizeLatency(values: number[]): LatencySummary {
  if (values.length === 0) {
    return {
      sampleCount: 0,
      averageMs: 0,
      p95Ms: 0,
      maxMs: 0,
    };
  }

  const sorted = [...values].sort((a, b) => a - b);
  const total = values.reduce((sum, value) => sum + value, 0);
  const p95Index = Math.min(sorted.length - 1, Math.max(0, Math.ceil(sorted.length * 0.95) - 1));

  return {
    sampleCount: values.length,
    averageMs: Math.round(total / values.length),
    p95Ms: sorted[p95Index] ?? 0,
    maxMs: sorted[sorted.length - 1] ?? 0,
  };
}

export function aggregateUsageRecords(
  records: AggregationRecord[],
  options: AggregateUsageOptions = {}
): UsageAggregationData {
  const requestEventLimit = options.requestEventLimit ?? DEFAULT_REQUEST_EVENT_LIMIT;
  const latencySeriesLimit = options.latencySeriesLimit ?? DEFAULT_LATENCY_SERIES_LIMIT;
  const recentWindowMinutes = options.recentWindowMinutes ?? DEFAULT_RECENT_WINDOW_MINUTES;
  const serviceHealthDays = options.serviceHealthDays ?? DEFAULT_SERVICE_HEALTH_DAYS;
  const serviceHealthBlockMinutes = options.serviceHealthBlockMinutes ?? DEFAULT_SERVICE_HEALTH_BLOCK_MINUTES;
  const nowMs = options.nowMs ?? Date.now();

  const keyUsageMap: Record<string, KeyUsage> = {};
  const dailyMap: Record<string, DailyBreakdown> = {};
  const modelTotalsMap: Record<string, ModelBreakdown> = {};
  const apiTotalsMap: Record<string, ApiBreakdown> = {};
  const credentialTotalsMap: Record<string, CredentialBreakdown> = {};
  const details: UsageDetailRecord[] = [];
  const requestEvents: RequestEvent[] = [];
  const latencySeriesSeed: LatencyPoint[] = [];
  const latencyValues: number[] = [];

  const blocksPerDay = Math.max(1, Math.floor((24 * 60) / serviceHealthBlockMinutes));
  const blockCount = Math.max(1, serviceHealthDays * blocksPerDay);
  const healthWindowMs = blockCount * serviceHealthBlockMinutes * 60_000;
  const healthWindowStart = nowMs - healthWindowMs;
  const healthBuckets: CounterBucket[] = Array.from({ length: blockCount }, () => ({
    success: 0,
    failure: 0,
  }));

  const recentWindowStart = nowMs - recentWindowMinutes * 60_000;

  let totalRequests = 0;
  let totalTokens = 0;
  let totalInputTokens = 0;
  let totalOutputTokens = 0;
  let totalReasoningTokens = 0;
  let totalCachedTokens = 0;
  let totalSuccessCount = 0;
  let totalFailureCount = 0;
  let recentRequestCount = 0;
  let recentTokenCount = 0;
  let healthSuccessCount = 0;
  let healthFailureCount = 0;

  const sortedRecords = [...records].sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());

  for (const record of sortedRecords) {
    const timestampMs = record.timestamp.getTime();
    const visibleUsername = record.exposeUsername ? record.username : undefined;
    const safeLatencyMs = Math.max(0, record.latencyMs);
    const safeTotalTokens = Math.max(0, record.totalTokens);
    const safeInputTokens = Math.max(0, record.inputTokens);
    const safeOutputTokens = Math.max(0, record.outputTokens);
    const safeReasoningTokens = Math.max(0, record.reasoningTokens);
    const safeCachedTokens = Math.max(0, record.cachedTokens);
    const groupKey = record.apiKeyId ?? record.userId ?? record.authIndex;
    const endpointLabel = record.endpoint ?? "Unknown endpoint";

    if (!keyUsageMap[groupKey]) {
      keyUsageMap[groupKey] = {
        keyName: record.apiKeyName ?? record.displayNameFallback ?? `Key ${record.authIndex.slice(0, 6)}`,
        ...(visibleUsername ? { username: visibleUsername } : {}),
        ...(record.userId ? { userId: record.userId } : {}),
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
    keyUsage.totalRequests += 1;
    keyUsage.totalTokens += safeTotalTokens;
    keyUsage.inputTokens += safeInputTokens;
    keyUsage.outputTokens += safeOutputTokens;
    keyUsage.reasoningTokens += safeReasoningTokens;
    keyUsage.cachedTokens += safeCachedTokens;

    if (record.failed) {
      keyUsage.failureCount += 1;
    } else {
      keyUsage.successCount += 1;
    }

    if (!keyUsage.models[record.model]) {
      keyUsage.models[record.model] = {
        totalRequests: 0,
        totalTokens: 0,
        inputTokens: 0,
        outputTokens: 0,
        successCount: 0,
        failureCount: 0,
      };
    }

    keyUsage.models[record.model].totalRequests += 1;
    keyUsage.models[record.model].totalTokens += safeTotalTokens;
    keyUsage.models[record.model].inputTokens += safeInputTokens;
    keyUsage.models[record.model].outputTokens += safeOutputTokens;

    if (record.failed) {
      keyUsage.models[record.model].failureCount += 1;
    } else {
      keyUsage.models[record.model].successCount += 1;
    }

    const dayKey = record.timestamp.toISOString().slice(0, 10);
    if (!dailyMap[dayKey]) {
      dailyMap[dayKey] = {
        date: dayKey,
        requests: 0,
        tokens: 0,
        inputTokens: 0,
        outputTokens: 0,
        reasoningTokens: 0,
        cachedTokens: 0,
        success: 0,
        failure: 0,
      };
    }

    dailyMap[dayKey].requests += 1;
    dailyMap[dayKey].tokens += safeTotalTokens;
    dailyMap[dayKey].inputTokens += safeInputTokens;
    dailyMap[dayKey].outputTokens += safeOutputTokens;
    dailyMap[dayKey].reasoningTokens += safeReasoningTokens;
    dailyMap[dayKey].cachedTokens += safeCachedTokens;

    if (record.failed) {
      dailyMap[dayKey].failure += 1;
    } else {
      dailyMap[dayKey].success += 1;
    }

    if (!modelTotalsMap[record.model]) {
      modelTotalsMap[record.model] = {
        model: record.model,
        requests: 0,
        tokens: 0,
        inputTokens: 0,
        outputTokens: 0,
        successCount: 0,
        failureCount: 0,
      };
    }

    modelTotalsMap[record.model].requests += 1;
    modelTotalsMap[record.model].tokens += safeTotalTokens;
    modelTotalsMap[record.model].inputTokens += safeInputTokens;
    modelTotalsMap[record.model].outputTokens += safeOutputTokens;

    if (record.failed) {
      modelTotalsMap[record.model].failureCount += 1;
    } else {
      modelTotalsMap[record.model].successCount += 1;
    }

    if (!apiTotalsMap[endpointLabel]) {
      apiTotalsMap[endpointLabel] = {
        endpoint: endpointLabel,
        requests: 0,
        tokens: 0,
        successCount: 0,
        failureCount: 0,
        models: {},
      };
    }

    apiTotalsMap[endpointLabel].requests += 1;
    apiTotalsMap[endpointLabel].tokens += safeTotalTokens;
    if (record.failed) {
      apiTotalsMap[endpointLabel].failureCount += 1;
    } else {
      apiTotalsMap[endpointLabel].successCount += 1;
    }

    if (!apiTotalsMap[endpointLabel].models[record.model]) {
      apiTotalsMap[endpointLabel].models[record.model] = {
        requests: 0,
        tokens: 0,
        successCount: 0,
        failureCount: 0,
      };
    }

    apiTotalsMap[endpointLabel].models[record.model].requests += 1;
    apiTotalsMap[endpointLabel].models[record.model].tokens += safeTotalTokens;
    if (record.failed) {
      apiTotalsMap[endpointLabel].models[record.model].failureCount += 1;
    } else {
      apiTotalsMap[endpointLabel].models[record.model].successCount += 1;
    }

    if (!credentialTotalsMap[record.sourceId]) {
      credentialTotalsMap[record.sourceId] = {
        sourceId: record.sourceId,
        sourceDisplay: record.sourceDisplay,
        ...(record.sourceType ? { sourceType: record.sourceType } : {}),
        requests: 0,
        tokens: 0,
        successCount: 0,
        failureCount: 0,
      };
    }

    credentialTotalsMap[record.sourceId].requests += 1;
    credentialTotalsMap[record.sourceId].tokens += safeTotalTokens;
    if (record.failed) {
      credentialTotalsMap[record.sourceId].failureCount += 1;
    } else {
      credentialTotalsMap[record.sourceId].successCount += 1;
    }

    const detailRecord: UsageDetailRecord = {
      timestamp: record.timestamp.toISOString(),
      endpoint: record.endpoint,
      keyName: keyUsage.keyName,
      ...(visibleUsername ? { username: visibleUsername } : {}),
      sourceId: record.sourceId,
      sourceDisplay: record.sourceDisplay,
      ...(record.sourceType ? { sourceType: record.sourceType } : {}),
      authIndex: record.authIndex,
      model: record.model,
      latencyMs: safeLatencyMs,
      totalTokens: safeTotalTokens,
      inputTokens: safeInputTokens,
      outputTokens: safeOutputTokens,
      reasoningTokens: safeReasoningTokens,
      cachedTokens: safeCachedTokens,
      failed: record.failed,
    };

    details.push(detailRecord);

    const event: RequestEvent = {
      ...detailRecord,
    };

    if (requestEvents.length < requestEventLimit) {
      requestEvents.push(event);
    }

    if (safeLatencyMs > 0) {
      latencyValues.push(safeLatencyMs);
      if (latencySeriesSeed.length < latencySeriesLimit) {
        latencySeriesSeed.push({
          timestamp: event.timestamp,
          endpoint: event.endpoint,
          keyName: event.keyName,
          ...(event.username ? { username: event.username } : {}),
          sourceDisplay: event.sourceDisplay,
          model: event.model,
          latencyMs: event.latencyMs,
          failed: event.failed,
        });
      }
    }

    totalRequests += 1;
    totalTokens += safeTotalTokens;
    totalInputTokens += safeInputTokens;
    totalOutputTokens += safeOutputTokens;
    totalReasoningTokens += safeReasoningTokens;
    totalCachedTokens += safeCachedTokens;

    if (record.failed) {
      totalFailureCount += 1;
    } else {
      totalSuccessCount += 1;
    }

    if (timestampMs >= recentWindowStart && timestampMs <= nowMs) {
      recentRequestCount += 1;
      recentTokenCount += safeTotalTokens;
    }

    if (timestampMs >= healthWindowStart && timestampMs <= nowMs) {
      const ageMs = nowMs - timestampMs;
      const blockIndex = blockCount - 1 - Math.floor(ageMs / (serviceHealthBlockMinutes * 60_000));
      if (blockIndex >= 0 && blockIndex < blockCount) {
        if (record.failed) {
          healthBuckets[blockIndex].failure += 1;
          healthFailureCount += 1;
        } else {
          healthBuckets[blockIndex].success += 1;
          healthSuccessCount += 1;
        }
      }
    }
  }

  const dailyBreakdown = Object.values(dailyMap).sort((a, b) => a.date.localeCompare(b.date));
  const modelBreakdown = Object.values(modelTotalsMap).sort((a, b) => {
    if (b.requests !== a.requests) return b.requests - a.requests;
    return b.tokens - a.tokens;
  });
  const apiBreakdown = Object.values(apiTotalsMap).sort((a, b) => {
    if (b.requests !== a.requests) return b.requests - a.requests;
    return b.tokens - a.tokens;
  });
  const credentialBreakdown = Object.values(credentialTotalsMap).sort((a, b) => {
    if (b.requests !== a.requests) return b.requests - a.requests;
    return b.tokens - a.tokens;
  });

  const recentRate: RecentRateSummary = {
    windowMinutes: recentWindowMinutes,
    requestCount: recentRequestCount,
    tokenCount: recentTokenCount,
    rpm: recentWindowMinutes > 0 ? recentRequestCount / recentWindowMinutes : 0,
    tpm: recentWindowMinutes > 0 ? recentTokenCount / recentWindowMinutes : 0,
  };

  const serviceHealthTotal = healthSuccessCount + healthFailureCount;
  const serviceHealth: ServiceHealthSummary = {
    successRate: serviceHealthTotal > 0 ? (healthSuccessCount / serviceHealthTotal) * 100 : 100,
    totalSuccess: healthSuccessCount,
    totalFailure: healthFailureCount,
    rows: serviceHealthDays,
    cols: blocksPerDay,
    blockSizeMinutes: serviceHealthBlockMinutes,
    blockDetails: healthBuckets.map((bucket, index) => {
      const total = bucket.success + bucket.failure;
      const startTime = healthWindowStart + index * serviceHealthBlockMinutes * 60_000;
      return {
        success: bucket.success,
        failure: bucket.failure,
        rate: total > 0 ? bucket.success / total : -1,
        startTime,
        endTime: startTime + serviceHealthBlockMinutes * 60_000,
      };
    }),
  };

  return {
    keys: keyUsageMap,
    totals: {
      totalRequests,
      totalTokens,
      inputTokens: totalInputTokens,
      outputTokens: totalOutputTokens,
      reasoningTokens: totalReasoningTokens,
      cachedTokens: totalCachedTokens,
      successCount: totalSuccessCount,
      failureCount: totalFailureCount,
    },
    dailyBreakdown,
    modelBreakdown,
    apiBreakdown,
    credentialBreakdown,
    requestEvents,
    latencySeries: [...latencySeriesSeed].reverse(),
    latencySummary: summarizeLatency(latencyValues),
    recentRate,
    serviceHealth,
    details,
  };
}
