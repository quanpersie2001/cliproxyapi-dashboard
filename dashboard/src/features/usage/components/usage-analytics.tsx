"use client";

import Link from "next/link";
import { type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { DashboardMiniCharts } from "@/components/dashboard-mini-charts";
import { AlertSurface } from "@/components/ui/alert-surface";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { UsageCharts } from "@/features/usage/components/usage-charts";
import { UsageModelPricingPanel } from "@/features/usage/components/usage-model-pricing-panel";
import { UsageRequestEvents } from "@/features/usage/components/usage-request-events";
import { UsageTable } from "@/features/usage/components/usage-table";
import {
  AXIS_TICK_STYLE,
  CHART_COLORS,
  ChartContainer,
  formatCompact,
  TOOLTIP_STYLE,
} from "@/components/ui/chart-theme";
import { API_ENDPOINTS } from "@/lib/api-endpoints";
import type { UsageHistorySnapshot } from "@/lib/usage/history";
import {
  deleteModelPricingRecord,
  saveModelPricingRecord,
  MODEL_PRICING_ENDPOINT,
  syncModelPricingRecords,
  type ModelPricingDraft,
  type ModelPrice,
  type ModelPricingRecord,
  modelPricingToLookup,
  normalizeModelPricing,
} from "@/features/usage/model-pricing";
import { formatMetricCompact } from "@/lib/metric-format";
import { cn } from "@/lib/utils";

type UsageAnalyticsData = UsageHistorySnapshot["data"];
type UsageTrendPoint = UsageAnalyticsData["requestTrend"]["day"][number];
type UsageTokenBreakdownPoint = UsageAnalyticsData["tokenBreakdown"]["day"][number];
type UsageCostBreakdownPoint = UsageAnalyticsData["costBreakdown"]["day"][number];
type UsageCostBasis = UsageAnalyticsData["costBreakdown"]["totalsByModel"][string];
type TimeRange = "7h" | "24h" | "7d" | "all";
type TrendPeriod = "hour" | "day";

interface UsageAnalyticsProps {
  initialSnapshot: UsageHistorySnapshot;
  initialModelPricing?: ModelPricingRecord[];
  title?: string;
  embedded?: boolean;
}

const TIME_RANGE_STORAGE_KEY = "dashboard-usage-time-range-v1";
const CHART_LINES_STORAGE_KEY = "dashboard-usage-chart-lines-v1";
const MAX_CHART_LINES = 9;
const TREND_PERIOD_BUTTON_CLASS_NAME = "px-2.5 py-1 text-xs leading-5";
const SERIES_COLORS = [
  CHART_COLORS.primary,
  CHART_COLORS.success,
  CHART_COLORS.warning,
  CHART_COLORS.violet,
  CHART_COLORS.cyan,
  CHART_COLORS.rose,
  CHART_COLORS.orange,
  CHART_COLORS.primaryDark,
] as const;

function nativeDateTimeLabel(value: string): string {
  return new Date(value).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

function formatRelativeTime(isoString: string): string {
  if (!isoString) return "Never";
  const diff = Date.now() - new Date(isoString).getTime();
  const minutes = Math.floor(diff / 60_000);
  if (minutes < 1) return "Just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

function formatPeriodLabel(from: string, to: string): string {
  const fromDate = new Date(from);
  const toDate = new Date(to);
  if (Number.isNaN(fromDate.getTime()) || Number.isNaN(toDate.getTime())) {
    return `${from} to ${to}`;
  }
  const sameMonth = fromDate.getFullYear() === toDate.getFullYear()
    && fromDate.getMonth() === toDate.getMonth();
  const fromLabel = fromDate.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
  const toLabel = toDate.toLocaleDateString("en-US", sameMonth
    ? { day: "numeric" }
    : { month: "short", day: "numeric" });
  return `${fromLabel} - ${toLabel}`;
}

function formatPerMinuteValue(value: number): string {
  if (!Number.isFinite(value)) return "0.00";
  if (Math.abs(value) >= 1000) return Math.round(value).toLocaleString();
  if (Math.abs(value) >= 100) return value.toFixed(0);
  if (Math.abs(value) >= 10) return value.toFixed(1);
  return value.toFixed(2);
}

function formatUsd(value: number): string {
  return `$${value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function formatPercent(value: number): string {
  return `${value.toFixed(1)}%`;
}

function formatLatency(value: number): string {
  return `${Math.round(value).toLocaleString()} ms`;
}

function formatShare(value: number, total: number): string {
  if (total <= 0) return "0.0% of total";
  return `${formatPercent((value / total) * 100)} of total`;
}

function loadTimeRange(): TimeRange {
  try {
    const value = localStorage.getItem(TIME_RANGE_STORAGE_KEY);
    return value === "7h" || value === "24h" || value === "7d" || value === "all" ? value : "7d";
  } catch {
    return "7d";
  }
}

function loadChartLines(): string[] {
  try {
    const raw = localStorage.getItem(CHART_LINES_STORAGE_KEY);
    if (!raw) return ["all"];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return ["all"];
    const lines = parsed
      .filter((entry): entry is string => typeof entry === "string")
      .map((entry) => entry.trim())
      .filter(Boolean)
      .slice(0, MAX_CHART_LINES);
    return lines.length > 0 ? lines : ["all"];
  } catch {
    return ["all"];
  }
}

function getCollectorTone(lastStatus: string, lastCollectedAt: string) {
  if (lastStatus === "error") return "danger" as const;
  if (!lastCollectedAt) return "warning" as const;
  const diff = Date.now() - new Date(lastCollectedAt).getTime();
  const minutes = Math.floor(diff / 60_000);
  if (minutes < 10) return "success" as const;
  if (minutes < 30) return "warning" as const;
  return "danger" as const;
}

function calculateCostForModel(
  model: string,
  basis: UsageCostBasis,
  prices: Record<string, ModelPrice>
): number {
  const price = prices[model];
  if (!price) return 0;
  const promptTokens = Math.max(basis.promptTokens, 0);
  const cachedTokens = Math.max(basis.cachedTokens, 0);
  const outputTokens = Math.max(basis.outputTokens, 0);

  return (
    (promptTokens / 1_000_000) * price.prompt +
    (cachedTokens / 1_000_000) * price.cache +
    (outputTokens / 1_000_000) * price.completion
  );
}

function calculateTotalCost(
  totalsByModel: Record<string, UsageCostBasis>,
  prices: Record<string, ModelPrice>
): number {
  return Object.entries(totalsByModel).reduce(
    (sum, [model, basis]) => sum + calculateCostForModel(model, basis, prices),
    0
  );
}

function mergeSelectedTrendLines(
  rows: UsageTrendPoint[],
  lines: string[]
): UsageTrendPoint[] {
  const selectedLines = lines.length > 0 ? lines : ["all"];

  return rows.map((row) => {
    const nextRow: UsageTrendPoint = { ...row };
    for (const selected of selectedLines) {
      if (!(selected in nextRow)) {
        nextRow[selected] = 0;
      }
    }
    return nextRow;
  });
}

function buildCostTrendData(
  rows: UsageCostBreakdownPoint[],
  prices: Record<string, ModelPrice>
): Array<{ label: string; displayLabel: string; cost: number }> {
  return rows.map((row) => ({
    label: row.label,
    displayLabel: row.displayLabel,
    cost: Object.entries(row.models).reduce(
      (sum, [model, basis]) => sum + calculateCostForModel(model, basis, prices),
      0
    ),
  }));
}

function rateToColor(rate: number): string {
  const clamped = Math.max(0, Math.min(1, rate));
  const transitionPercent = Math.round((clamped < 0.5 ? clamped * 2 : (clamped - 0.5) * 2) * 100);

  if (clamped < 0.5) {
    return `color-mix(in srgb, var(--state-danger-accent) ${100 - transitionPercent}%, var(--state-warning-accent) ${transitionPercent}%)`;
  }

  return `color-mix(in srgb, var(--state-warning-accent) ${100 - transitionPercent}%, var(--state-success-accent) ${transitionPercent}%)`;
}

function chunkBlocks<T>(items: T[], chunkSize: number): T[][] {
  const chunks: T[][] = [];
  for (let index = 0; index < items.length; index += chunkSize) {
    chunks.push(items.slice(index, index + chunkSize));
  }
  return chunks;
}

function SelectField({
  value,
  onChange,
  options,
  className = "",
}: {
  value: string;
  onChange: (value: string) => void;
  options: Array<{ value: string; label: string }>;
  className?: string;
}) {
  return (
    <select
      value={value}
      onChange={(event) => onChange(event.target.value)}
      className={`glass-input rounded-md border border-[var(--surface-border)] bg-[var(--surface-base)] px-3 py-2 text-sm text-[var(--text-primary)] ${className}`}
    >
      {options.map((option) => (
        <option key={option.value} value={option.value}>
          {option.label}
        </option>
      ))}
    </select>
  );
}

function SummaryPanel({
  title,
  description,
  badge,
  children,
  className,
}: {
  title: string;
  description?: string;
  badge?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={cn("dashboard-panel-surface min-w-0 p-4", className)}>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <div className="dashboard-kicker">{title}</div>
          {description ? (
            <p className="mt-2 text-sm leading-6 text-[var(--text-secondary)]">
              {description}
            </p>
          ) : null}
        </div>
        {badge ? <div className="self-start sm:shrink-0">{badge}</div> : null}
      </div>
      <div className="mt-4">{children}</div>
    </section>
  );
}

function SummaryRow({
  label,
  value,
  detail,
  emphasize = false,
}: {
  label: string;
  value: string;
  detail: string;
  emphasize?: boolean;
}) {
  return (
    <div className="flex items-start justify-between gap-4 py-2.5 first:pt-0 last:pb-0">
      <div className="min-w-0">
        <div className="text-sm font-medium text-[var(--text-primary)]">{label}</div>
        <div className="mt-1 text-xs leading-5 text-[var(--text-muted)]">{detail}</div>
      </div>
      <div className={cn(
        "dashboard-metric-value shrink-0 text-right font-medium",
        emphasize ? "text-2xl sm:text-[1.8rem]" : "text-sm"
      )}>
        {value}
      </div>
    </div>
  );
}

function MetricCard({
  label,
  value,
  detail,
  badge,
}: {
  label: string;
  value: string;
  detail: string;
  badge?: ReactNode;
}) {
  return (
    <div className="dashboard-stat-surface px-3 py-3">
      <div className="flex items-start justify-between gap-3">
        <div className="dashboard-kicker">{label}</div>
        {badge ? <div className="shrink-0">{badge}</div> : null}
      </div>
      <div className="mt-2">
        <div className="dashboard-metric-value text-[1.35rem] font-semibold sm:text-[1.5rem]">
          {value}
        </div>
        <p className="mt-1 text-xs leading-5 text-[var(--text-muted)]">{detail}</p>
      </div>
    </div>
  );
}

export function UsageAnalytics({
  initialSnapshot,
  initialModelPricing = [],
  title = "Usage Analytics",
  embedded = false,
}: UsageAnalyticsProps) {
  const [windowRange, setWindowRange] = useState<TimeRange>(() => (typeof window === "undefined" ? "7d" : loadTimeRange()));
  const [chartLines, setChartLines] = useState<string[]>(() => (typeof window === "undefined" ? ["all"] : loadChartLines()));
  const [modelPricingRecords, setModelPricingRecords] = useState<ModelPricingRecord[]>(() => initialModelPricing);
  const [previewModelPricingRecords, setPreviewModelPricingRecords] = useState<ModelPricingRecord[]>([]);
  const [requestsPeriod, setRequestsPeriod] = useState<TrendPeriod>("day");
  const [tokensPeriod, setTokensPeriod] = useState<TrendPeriod>("day");
  const [tokenBreakdownPeriod, setTokenBreakdownPeriod] = useState<TrendPeriod>("hour");
  const [costPeriod, setCostPeriod] = useState<TrendPeriod>("hour");
  const [snapshot, setSnapshot] = useState<UsageHistorySnapshot>(initialSnapshot);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pricingLoading, setPricingLoading] = useState(false);
  const [pricingError, setPricingError] = useState<string | null>(null);
  const [lastUpdatedAt, setLastUpdatedAt] = useState<string>(new Date().toISOString());
  const hasHydratedRef = useRef(false);

  const loadSnapshot = useCallback(async (targetWindow: TimeRange) => {
    const response = await fetch(`${API_ENDPOINTS.USAGE.HISTORY}?window=${targetWindow}`);
    if (!response.ok) {
      throw new Error("Failed to load usage analytics");
    }
    const json = await response.json() as UsageHistorySnapshot;
    setSnapshot(json);
    setLastUpdatedAt(new Date().toISOString());
    setError(null);
  }, []);

  const fetchSnapshot = useCallback(async (targetWindow: TimeRange, showLoading: boolean) => {
    if (showLoading) setLoading(true);
    try {
      await loadSnapshot(targetWindow);
    } catch (fetchError) {
      setError(fetchError instanceof Error ? fetchError.message : "Failed to load usage analytics");
    } finally {
      if (showLoading) setLoading(false);
    }
  }, [loadSnapshot]);

  const triggerCollector = async () => {
    const response = await fetch(API_ENDPOINTS.USAGE.COLLECT, {
      method: "POST",
    });

    if (response.ok || response.status === 202) {
      return;
    }

    let errorMessage = "Failed to sync latest usage data";
    try {
      const payload = await response.json() as { message?: string; error?: string };
      errorMessage = payload.message ?? payload.error ?? errorMessage;
    } catch {
      // Ignore malformed error bodies and fall back to the generic message.
    }

    throw new Error(errorMessage);
  };

  const handleRefresh = async () => {
    setLoading(true);
    setError(null);

    try {
      if (snapshot.isAdmin) {
        await triggerCollector();
      }

      await loadSnapshot(windowRange);
    } catch (refreshError) {
      setError(refreshError instanceof Error ? refreshError.message : "Failed to refresh usage analytics");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!hasHydratedRef.current) {
      hasHydratedRef.current = true;
      if (windowRange !== "7d") {
        void fetchSnapshot(windowRange, true);
      }
      return;
    }
    void fetchSnapshot(windowRange, true);
  }, [fetchSnapshot, windowRange]);

  useEffect(() => {
    const interval = setInterval(() => {
      if (typeof document !== "undefined" && document.visibilityState !== "visible") return;
      void fetchSnapshot(windowRange, false);
    }, 300_000);
    return () => clearInterval(interval);
  }, [fetchSnapshot, windowRange]);

  const refreshModelPricing = async (showLoading: boolean) => {
    if (showLoading) setPricingLoading(true);
    try {
      const response = await fetch(MODEL_PRICING_ENDPOINT, {
        cache: "no-store",
        credentials: "include",
      });

      if (!response.ok) {
        if (response.status !== 404 && response.status !== 204) {
          setPricingError("Failed to load global pricing");
        }
        return;
      }

      const payload = await response.json() as unknown;
      setModelPricingRecords(normalizeModelPricing(payload));
      setPricingError(null);
    } catch {
      setPricingError("Failed to load global pricing");
    } finally {
      if (showLoading) setPricingLoading(false);
    }
  };

  useEffect(() => {
    void refreshModelPricing(false);
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(TIME_RANGE_STORAGE_KEY, windowRange);
    } catch {}
  }, [windowRange]);

  useEffect(() => {
    try {
      localStorage.setItem(CHART_LINES_STORAGE_KEY, JSON.stringify(chartLines));
    } catch {}
  }, [chartLines]);

  const modelNames = snapshot.data.modelNames;
  const modelPriceLookup = useMemo(() => modelPricingToLookup(modelPricingRecords), [modelPricingRecords]);
  const recentRate = snapshot.data.recentRate;
  const totals = snapshot.data.totals;
  const totalAttempts = totals.successCount + totals.failureCount;
  const successRate = totalAttempts > 0 ? (totals.successCount / totalAttempts) * 100 : 0;
  const failureRate = totalAttempts > 0 ? (totals.failureCount / totalAttempts) * 100 : 0;
  const serviceHealthRate = snapshot.data.serviceHealth.successRate;
  const latencySummary = snapshot.data.latencySummary;
  const latencySamples = latencySummary.sampleCount;
  const hasLatencySamples = latencySamples > 0;
  const totalCost = useMemo(
    () => calculateTotalCost(snapshot.data.costBreakdown.totalsByModel, modelPriceLookup),
    [modelPriceLookup, snapshot.data.costBreakdown.totalsByModel]
  );
  const requestTrendData = useMemo(
    () => mergeSelectedTrendLines(snapshot.data.requestTrend[requestsPeriod], chartLines),
    [chartLines, requestsPeriod, snapshot.data.requestTrend]
  );
  const tokenTrendData = useMemo(
    () => mergeSelectedTrendLines(snapshot.data.tokenTrend[tokensPeriod], chartLines),
    [chartLines, tokensPeriod, snapshot.data.tokenTrend]
  );
  const tokenBreakdownData: UsageTokenBreakdownPoint[] = snapshot.data.tokenBreakdown[tokenBreakdownPeriod];
  const costTrendData = useMemo(
    () => buildCostTrendData(snapshot.data.costBreakdown[costPeriod], modelPriceLookup),
    [costPeriod, modelPriceLookup, snapshot.data.costBreakdown]
  );
  const serviceHealthRows = useMemo(
    () => chunkBlocks(snapshot.data.serviceHealth.blockDetails, snapshot.data.serviceHealth.cols),
    [snapshot.data.serviceHealth.blockDetails, snapshot.data.serviceHealth.cols]
  );
  const collectorTone = getCollectorTone(snapshot.data.collectorStatus.lastStatus, snapshot.data.collectorStatus.lastCollectedAt);
  const hasHealthTraffic = (snapshot.data.serviceHealth.totalSuccess + snapshot.data.serviceHealth.totalFailure) > 0;
  const serviceHealthBadgeTone = !hasHealthTraffic
    ? "neutral"
    : serviceHealthRate >= 95
      ? "success"
      : serviceHealthRate >= 80
        ? "warning"
        : "danger";
  const pricedModelsCount = Object.keys(modelPriceLookup).length;
  const topModels = snapshot.data.modelBreakdown.slice(0, 5);

  const addChartLine = () => {
    if (chartLines.length >= MAX_CHART_LINES) return;
    const nextModel = modelNames.find((model) => !chartLines.includes(model));
    setChartLines((current) => [...current, nextModel ?? "all"]);
  };

  const updateChartLine = (index: number, value: string) => {
    setChartLines((current) => current.map((line, lineIndex) => (lineIndex === index ? value : line)));
  };

  const removeChartLine = (index: number) => {
    setChartLines((current) => (current.length <= 1 ? current : current.filter((_, lineIndex) => lineIndex !== index)));
  };

  const handlePricingReload = async () => {
    await refreshModelPricing(true);
  };

  const handlePricingSyncOfficial = async () => {
    setPricingLoading(true);
    try {
      const preview = await syncModelPricingRecords();
      if (!preview) {
        setPricingError("Failed to sync official model pricing");
        return;
      }

      const existingByKey = new Map(
        modelPricingRecords.map((record) => [`${record.provider}:${record.model}`, record] as const)
      );
      setPreviewModelPricingRecords(
        preview.records.map((record) => {
          const existing = existingByKey.get(`${record.provider}:${record.model}`);
          return existing ? { ...record, id: existing.id } : record;
        })
      );
      setPricingError(null);
    } finally {
      setPricingLoading(false);
    }
  };

  const handlePricingSave = async (draft: ModelPricingDraft, recordId?: string) => {
    const saved = await saveModelPricingRecord(draft, recordId);
    if (!saved) {
      setPricingError("Failed to save model pricing");
      return false;
    }

    await refreshModelPricing(false);
    setPreviewModelPricingRecords((current) =>
      current.filter((record) => !(record.provider === draft.provider.trim() && record.model === draft.model.trim()))
    );
    setPricingError(null);
    return true;
  };

  const handlePricingDelete = async (recordId: string) => {
    const removed = await deleteModelPricingRecord(recordId);
    if (!removed) {
      setPricingError("Failed to delete model pricing");
      return false;
    }

    await refreshModelPricing(false);
    setPricingError(null);
    return true;
  };

  const detailLinkClassName = "dashboard-pill-link";
  const topModelsCard = (
    <SummaryPanel
      title="Top models"
      description="Highest-volume models for the active time range."
      badge={(
        <Badge tone="neutral" size="xs">
          {snapshot.data.modelBreakdown.length.toLocaleString()} tracked
        </Badge>
      )}
    >
      {topModels.length > 0 ? (
        <div className="divide-y divide-[var(--surface-border)]">
          {topModels.map((model) => {
            const total = model.successCount + model.failureCount;
            const modelSuccessRate = total > 0 ? (model.successCount / total) * 100 : 0;

            return (
              <div key={model.model} className="flex flex-col gap-2 py-3 first:pt-0 last:pb-0 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0 flex-1">
                  <div className="break-all font-mono text-[12px] text-[var(--text-primary)] sm:truncate">{model.model}</div>
                  <div className="mt-1 text-xs text-[var(--text-muted)]">{formatCompact(model.tokens)} tokens</div>
                </div>
                <div className="flex w-full items-center justify-between gap-3 sm:w-auto sm:shrink-0 sm:justify-start">
                  <div className="text-left sm:text-right">
                    <div className="text-sm font-medium tabular-nums text-[var(--text-primary)]">{model.requests.toLocaleString()}</div>
                    <div className="mt-1 text-[11px] text-[var(--text-muted)]">requests</div>
                  </div>
                  <Badge
                    tone={modelSuccessRate >= 95 ? "success" : modelSuccessRate >= 80 ? "warning" : "danger"}
                    size="xs"
                  >
                    {formatPercent(modelSuccessRate)}
                  </Badge>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <p className="text-sm text-[var(--text-muted)]">No model usage has been collected yet.</p>
      )}
    </SummaryPanel>
  );
  const serviceHealthCard = (
    <SummaryPanel
      title="Service health"
      description={`Success heatmap in ${snapshot.data.serviceHealth.blockSizeMinutes}-minute blocks.`}
      badge={<Badge tone={serviceHealthBadgeTone} size="xs">{hasHealthTraffic ? formatPercent(serviceHealthRate) : "No traffic"}</Badge>}
    >
      <div className="-mx-1 overflow-x-auto px-1 pb-1">
        <div className="min-w-[560px] space-y-1.5 sm:min-w-[640px]">
          {serviceHealthRows.map((row, rowIndex) => (
            <div
              key={`health-row-${rowIndex}`}
              className="grid gap-1"
              style={{ gridTemplateColumns: `repeat(${snapshot.data.serviceHealth.cols}, minmax(0, 1fr))` }}
            >
              {row.map((block, blockIndex) => (
                <div
                  key={`health-block-${rowIndex}-${blockIndex}`}
                  className="h-3 rounded-[3px]"
                  style={{ backgroundColor: block.rate < 0 ? "var(--surface-muted)" : rateToColor(block.rate) }}
                  title={block.rate < 0
                    ? `${nativeDateTimeLabel(new Date(block.startTime).toISOString())} - ${nativeDateTimeLabel(new Date(block.endTime).toISOString())}\nNo requests`
                    : `${nativeDateTimeLabel(new Date(block.startTime).toISOString())} - ${nativeDateTimeLabel(new Date(block.endTime).toISOString())}\nSuccess ${block.success} / Failure ${block.failure}\nRate ${formatPercent(block.rate * 100)}`}
                />
              ))}
            </div>
          ))}
        </div>
      </div>
      <div className="mt-4 flex flex-col gap-2 text-[11px] text-[var(--text-muted)] sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
        <span>{snapshot.data.serviceHealth.totalSuccess.toLocaleString()} success</span>
        <div className="flex flex-wrap items-center gap-2">
          <span className="inline-block h-2.5 w-2.5 rounded-[3px] bg-[var(--surface-muted)]" />
          <span>Idle</span>
          <span className="inline-block h-2.5 w-2.5 rounded-[3px] bg-[var(--state-danger-accent)]" />
          <span>Poor</span>
          <span className="inline-block h-2.5 w-2.5 rounded-[3px] bg-[var(--state-warning-accent)]" />
          <span>Mixed</span>
          <span className="inline-block h-2.5 w-2.5 rounded-[3px] bg-[var(--state-success-accent)]" />
          <span>Healthy</span>
        </div>
        <span>{snapshot.data.serviceHealth.totalFailure.toLocaleString()} failed</span>
      </div>
    </SummaryPanel>
  );

  if (embedded) {
    return (
      <div className="space-y-5">
        <section className="dashboard-panel-surface p-4">
          <div className="flex flex-col gap-3 xl:flex-row xl:items-start xl:justify-between">
            <div className="max-w-3xl">
              <div className="flex flex-wrap items-center gap-2">
                <Badge tone={collectorTone} dot size="xs">
                  Collector {snapshot.data.collectorStatus.lastStatus}
                </Badge>
                <Badge tone="neutral" size="xs">
                  {formatPeriodLabel(snapshot.data.period.from, snapshot.data.period.to)}
                </Badge>
                <span className="text-xs text-[var(--text-muted)]">
                  Last synced {formatRelativeTime(snapshot.data.collectorStatus.lastCollectedAt)}
                </span>
              </div>
              <h2 className="mt-3 text-xl font-semibold tracking-tight text-[var(--text-primary)]">
                {title}
              </h2>
              <p className="mt-1 max-w-2xl text-sm leading-6 text-[var(--text-secondary)]">
                Model mix, collector freshness, and service health for the active window.
              </p>
            </div>
          </div>

          <div className="mt-4 grid gap-3 md:grid-cols-3">
            <MetricCard
              label="Recent throughput"
              value={`${formatPerMinuteValue(recentRate.rpm)} / ${formatPerMinuteValue(recentRate.tpm)}`}
              detail={`${recentRate.requestCount.toLocaleString()} requests and ${formatMetricCompact(recentRate.tokenCount)} tokens in the last 30 minutes`}
            />
            <MetricCard
              label="Collector freshness"
              value={formatRelativeTime(snapshot.data.collectorStatus.lastCollectedAt)}
              detail={`Collector status: ${snapshot.data.collectorStatus.lastStatus}`}
            />
            <MetricCard
              label="Estimated cost"
              value={pricedModelsCount > 0 ? formatUsd(totalCost) : "--"}
              detail={pricedModelsCount > 0 ? `${pricedModelsCount} models priced globally` : "Configure global model prices to unlock cost estimates"}
            />
          </div>

          <div className="mt-4 grid gap-4 xl:grid-cols-3">
            <div className="xl:col-span-1">
              {topModelsCard}
            </div>
            <div className="xl:col-span-2">
              {serviceHealthCard}
            </div>
          </div>
        </section>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <section className="dashboard-panel-surface p-4">
        <div className="flex flex-col gap-3 2xl:flex-row 2xl:items-start 2xl:justify-between">
          <div className="max-w-2xl">
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <Badge tone={collectorTone} dot size="xs">
                Collector {snapshot.data.collectorStatus.lastStatus}
              </Badge>
              <Badge tone="neutral" size="xs">
                {formatPeriodLabel(snapshot.data.period.from, snapshot.data.period.to)}
              </Badge>
              <span className="text-xs text-[var(--text-muted)]">
                Last synced {formatRelativeTime(snapshot.data.collectorStatus.lastCollectedAt)}
              </span>
              <span className="text-xs text-[var(--text-muted)]">
                Refreshed {formatRelativeTime(lastUpdatedAt)}
              </span>
            </div>
            <h1 className="mt-3 text-xl font-semibold tracking-tight text-[var(--text-primary)] lg:text-2xl">
              {title}
            </h1>
            <p className="mt-1 text-sm leading-6 text-[var(--text-secondary)]">
              Persisted traffic, latency, model mix, and local cost estimates for dashboard-owned credentials.
            </p>
          </div>
          <div className="flex flex-col gap-2 2xl:items-end">
            <div className="flex flex-wrap gap-2">
              {(["7h", "24h", "7d", "all"] as TimeRange[]).map((range) => (
                <button
                  key={range}
                  type="button"
                  onClick={() => setWindowRange(range)}
                  className={cn(
                    "dashboard-pill-link px-3 py-1.5 text-xs",
                    windowRange === range && "dashboard-pill-link--active"
                  )}
                >
                  {range.toUpperCase()}
                </button>
              ))}
            </div>
            <div className="flex flex-wrap gap-2">
              <Button onClick={() => void handleRefresh()} disabled={loading}>
                {loading ? (snapshot.isAdmin ? "Syncing..." : "Refreshing...") : "Refresh"}
              </Button>
              <Link href="/dashboard" className={detailLinkClassName}>
                Back to overview
              </Link>
            </div>
          </div>
        </div>
        {error ? (
          <AlertSurface tone="danger" className="mt-4 text-sm">
            {error}
          </AlertSurface>
        ) : null}
      </section>

      <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-6">
        <MetricCard
          label="Total requests"
          value={totals.totalRequests.toLocaleString()}
          detail={totalAttempts > 0
            ? `${totals.successCount.toLocaleString()} successful / ${totals.failureCount.toLocaleString()} failed`
            : "No requests collected in the selected time range."}
          badge={<Badge tone={totalAttempts > 0 ? (successRate >= 95 ? "success" : successRate >= 80 ? "warning" : "danger") : "neutral"} size="xs">{totalAttempts > 0 ? formatPercent(successRate) : "No traffic"}</Badge>}
        />
        <MetricCard
          label="Success rate"
          value={totalAttempts > 0 ? formatPercent(successRate) : "--"}
          detail={totalAttempts > 0 ? `${formatPercent(failureRate)} failure share across the active window` : "Waiting for delivery data"}
        />
        <MetricCard
          label="Token footprint"
          value={formatMetricCompact(totals.totalTokens)}
          detail={`Input ${formatMetricCompact(totals.inputTokens)} / Output ${formatMetricCompact(totals.outputTokens)}`}
        />
        <MetricCard
          label="Avg latency"
          value={hasLatencySamples ? formatLatency(latencySummary.averageMs) : "--"}
          detail={hasLatencySamples ? `P95 ${formatLatency(latencySummary.p95Ms)} / Max ${formatLatency(latencySummary.maxMs)}` : "Latency appears after requests are persisted"}
        />
        <MetricCard
          label="Recent throughput"
          value={`${formatPerMinuteValue(recentRate.rpm)} / ${formatPerMinuteValue(recentRate.tpm)}`}
          detail={`${recentRate.requestCount.toLocaleString()} requests and ${formatMetricCompact(recentRate.tokenCount)} tokens in the last 30 minutes`}
        />
        <MetricCard
          label="Estimated cost"
          value={pricedModelsCount > 0 ? formatUsd(totalCost) : "--"}
          detail={pricedModelsCount > 0 ? `${pricedModelsCount} models priced globally` : "Add global model prices to enable cost analytics"}
        />
      </section>

      <section className="grid gap-4 xl:grid-cols-[minmax(0,0.95fr)_minmax(0,1.05fr)]">
        {topModelsCard}
        {serviceHealthCard}
      </section>

      <div className="dashboard-panel-surface p-4">
        <div className="grid gap-3 xl:grid-cols-[minmax(0,1.5fr)_minmax(0,0.75fr)_minmax(0,0.75fr)]">
          <div className="dashboard-card-surface p-3">
            <div className="dashboard-kicker">Daily signal</div>
            <div className="mt-3">
              <DashboardMiniCharts
                dailyBreakdown={snapshot.data.dailyBreakdown}
                totals={snapshot.data.totals}
              />
            </div>
          </div>
          <div className="dashboard-card-surface p-4">
            <SummaryRow
              label="Cached tokens"
              value={formatMetricCompact(totals.cachedTokens)}
              detail={formatShare(totals.cachedTokens, totals.totalTokens)}
            />
          </div>
          <div className="dashboard-card-surface p-4">
            <SummaryRow
              label="Reasoning tokens"
              value={formatMetricCompact(totals.reasoningTokens)}
              detail="Observed in persisted request history"
            />
          </div>
        </div>
      </div>

      <UsageCharts
        dailyBreakdown={snapshot.data.dailyBreakdown}
        modelBreakdown={snapshot.data.modelBreakdown}
        latencySeries={snapshot.data.latencySeries}
        latencySummary={snapshot.data.latencySummary}
        totals={snapshot.data.totals}
        showTrafficCharts={false}
      />

      <section className="dashboard-panel-surface p-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <h2 className="text-sm font-semibold text-[var(--text-primary)]">Chart line selection</h2>
            <p className="mt-1 text-xs text-[var(--text-muted)]">
              Choose which model lines should appear in request and token trends.
            </p>
          </div>
          <Button variant="secondary" onClick={addChartLine} disabled={chartLines.length >= MAX_CHART_LINES}>
            Add line
          </Button>
        </div>
        <div className="mt-4 space-y-2">
          {chartLines.map((line, index) => (
            <div key={`${line}-${index}`} className="dashboard-card-surface flex flex-col gap-2 p-3 lg:flex-row lg:items-center">
              <div className="w-full text-xs font-medium text-[var(--text-muted)] lg:w-24">
                Line {index + 1}
              </div>
              <SelectField
                value={line}
                onChange={(value) => updateChartLine(index, value)}
                options={[{ value: "all", label: "All models" }, ...modelNames.map((model) => ({ value: model, label: model }))]}
                className="w-full lg:flex-1"
              />
              <Button variant="ghost" onClick={() => removeChartLine(index)} disabled={chartLines.length <= 1}>
                Remove
              </Button>
            </div>
          ))}
        </div>
      </section>

      <section className="grid gap-4 xl:grid-cols-2">
        <ChartContainer title="Requests Trend" className="h-[320px] lg:h-[340px]">
          <div className="mb-3 flex gap-2">
            <Button
              variant={requestsPeriod === "hour" ? "primary" : "secondary"}
              className={TREND_PERIOD_BUTTON_CLASS_NAME}
              onClick={() => setRequestsPeriod("hour")}
            >
              By Hour
            </Button>
            <Button
              variant={requestsPeriod === "day" ? "primary" : "secondary"}
              className={TREND_PERIOD_BUTTON_CLASS_NAME}
              onClick={() => setRequestsPeriod("day")}
            >
              By Day
            </Button>
          </div>
          <ResponsiveContainer width="100%" height="85%">
            <LineChart data={requestTrendData} margin={{ top: 8, right: 8, left: -12, bottom: 0 }}>
              <CartesianGrid stroke={CHART_COLORS.grid} />
              <XAxis dataKey="displayLabel" tick={AXIS_TICK_STYLE} tickLine={false} axisLine={false} minTickGap={20} />
              <YAxis tick={AXIS_TICK_STYLE} tickFormatter={formatCompact} tickLine={false} axisLine={false} />
              <Tooltip
                {...TOOLTIP_STYLE}
                formatter={(value) => [formatCompact(Number(value)), "Requests"]}
                labelFormatter={(label) => String(label)}
              />
              {chartLines.map((line, index) => (
                <Line
                  key={`request-line-${line}-${index}`}
                  type="monotone"
                  dataKey={line}
                  stroke={SERIES_COLORS[index % SERIES_COLORS.length]}
                  strokeWidth={2}
                  dot={false}
                  name={line === "all" ? "All models" : line}
                />
              ))}
            </LineChart>
          </ResponsiveContainer>
        </ChartContainer>

        <ChartContainer title="Tokens Trend" className="h-[320px] lg:h-[340px]">
          <div className="mb-3 flex gap-2">
            <Button
              variant={tokensPeriod === "hour" ? "primary" : "secondary"}
              className={TREND_PERIOD_BUTTON_CLASS_NAME}
              onClick={() => setTokensPeriod("hour")}
            >
              By Hour
            </Button>
            <Button
              variant={tokensPeriod === "day" ? "primary" : "secondary"}
              className={TREND_PERIOD_BUTTON_CLASS_NAME}
              onClick={() => setTokensPeriod("day")}
            >
              By Day
            </Button>
          </div>
          <ResponsiveContainer width="100%" height="85%">
            <LineChart data={tokenTrendData} margin={{ top: 8, right: 8, left: -12, bottom: 0 }}>
              <CartesianGrid stroke={CHART_COLORS.grid} />
              <XAxis dataKey="displayLabel" tick={AXIS_TICK_STYLE} tickLine={false} axisLine={false} minTickGap={20} />
              <YAxis tick={AXIS_TICK_STYLE} tickFormatter={formatCompact} tickLine={false} axisLine={false} />
              <Tooltip
                {...TOOLTIP_STYLE}
                formatter={(value) => [formatCompact(Number(value)), "Tokens"]}
                labelFormatter={(label) => String(label)}
              />
              {chartLines.map((line, index) => (
                <Line
                  key={`token-line-${line}-${index}`}
                  type="monotone"
                  dataKey={line}
                  stroke={SERIES_COLORS[index % SERIES_COLORS.length]}
                  strokeWidth={2}
                  dot={false}
                  name={line === "all" ? "All models" : line}
                />
              ))}
            </LineChart>
          </ResponsiveContainer>
        </ChartContainer>
      </section>

      <section className="grid gap-4 xl:grid-cols-2">
        <ChartContainer title="Token Breakdown" className="h-[320px] lg:h-[340px]">
          <div className="mb-3 flex gap-2">
            <Button
              variant={tokenBreakdownPeriod === "hour" ? "primary" : "secondary"}
              className={TREND_PERIOD_BUTTON_CLASS_NAME}
              onClick={() => setTokenBreakdownPeriod("hour")}
            >
              By Hour
            </Button>
            <Button
              variant={tokenBreakdownPeriod === "day" ? "primary" : "secondary"}
              className={TREND_PERIOD_BUTTON_CLASS_NAME}
              onClick={() => setTokenBreakdownPeriod("day")}
            >
              By Day
            </Button>
          </div>
          <ResponsiveContainer width="100%" height="85%">
            <AreaChart data={tokenBreakdownData} margin={{ top: 8, right: 8, left: -12, bottom: 0 }}>
              <CartesianGrid stroke={CHART_COLORS.grid} />
              <XAxis dataKey="displayLabel" tick={AXIS_TICK_STYLE} tickLine={false} axisLine={false} minTickGap={20} />
              <YAxis tick={AXIS_TICK_STYLE} tickFormatter={formatCompact} tickLine={false} axisLine={false} />
              <Tooltip {...TOOLTIP_STYLE} formatter={(value) => [formatCompact(Number(value)), ""]} />
              <Area type="monotone" dataKey="input" stackId="1" stroke={SERIES_COLORS[0]} fill={SERIES_COLORS[0]} fillOpacity={0.18} />
              <Area type="monotone" dataKey="output" stackId="1" stroke={SERIES_COLORS[1]} fill={SERIES_COLORS[1]} fillOpacity={0.18} />
              <Area type="monotone" dataKey="cached" stackId="1" stroke={SERIES_COLORS[2]} fill={SERIES_COLORS[2]} fillOpacity={0.18} />
              <Area type="monotone" dataKey="reasoning" stackId="1" stroke={SERIES_COLORS[3]} fill={SERIES_COLORS[3]} fillOpacity={0.18} />
            </AreaChart>
          </ResponsiveContainer>
        </ChartContainer>

        <ChartContainer
          title="Cost Trend"
          className="h-[320px] lg:h-[340px]"
          subtitle={pricedModelsCount > 0 ? "Calculated from global model pricing" : "Add global prices to enable"}
        >
          <div className="mb-3 flex gap-2">
            <Button
              variant={costPeriod === "hour" ? "primary" : "secondary"}
              className={TREND_PERIOD_BUTTON_CLASS_NAME}
              onClick={() => setCostPeriod("hour")}
            >
              By Hour
            </Button>
            <Button
              variant={costPeriod === "day" ? "primary" : "secondary"}
              className={TREND_PERIOD_BUTTON_CLASS_NAME}
              onClick={() => setCostPeriod("day")}
            >
              By Day
            </Button>
          </div>
          {pricedModelsCount === 0 ? (
            <div className="flex h-[85%] items-center justify-center text-sm text-[var(--text-muted)]">
              No global model prices configured.
            </div>
          ) : (
            <ResponsiveContainer width="100%" height="85%">
              <AreaChart data={costTrendData} margin={{ top: 8, right: 8, left: -12, bottom: 0 }}>
                <CartesianGrid stroke={CHART_COLORS.grid} />
                <XAxis dataKey="displayLabel" tick={AXIS_TICK_STYLE} tickLine={false} axisLine={false} minTickGap={20} />
                <YAxis tick={AXIS_TICK_STYLE} tickLine={false} axisLine={false} tickFormatter={(value) => formatUsd(Number(value))} />
                <Tooltip {...TOOLTIP_STYLE} formatter={(value) => [formatUsd(Number(value)), "Cost"]} />
                <Area type="monotone" dataKey="cost" stroke={SERIES_COLORS[2]} fill={SERIES_COLORS[2]} fillOpacity={0.18} />
              </AreaChart>
            </ResponsiveContainer>
          )}
        </ChartContainer>
      </section>

      <UsageTable keys={snapshot.data.keys} isAdmin={snapshot.isAdmin} />

      <UsageRequestEvents
        events={snapshot.data.requestEvents}
        isAdmin={snapshot.isAdmin}
        truncated={snapshot.data.truncated}
      />

      <section className="space-y-4">
        <div className="dashboard-panel-surface min-w-0 p-4">
          <h2 className="text-sm font-semibold text-[var(--text-primary)]">API Details</h2>
          <div className="mt-4 overflow-x-auto pb-1">
            <table className="w-full min-w-[720px] text-sm">
              <thead>
                <tr className="border-b border-[var(--surface-border)]">
                  <th className="px-0 py-2 text-left text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--text-muted)]">Endpoint</th>
                  <th className="px-0 py-2 text-right text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--text-muted)]">Requests</th>
                  <th className="px-0 py-2 text-right text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--text-muted)]">Tokens</th>
                  <th className="px-0 py-2 text-right text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--text-muted)]">Success</th>
                </tr>
              </thead>
              <tbody>
                {snapshot.data.apiBreakdown.map((api) => {
                  const apiTotal = api.successCount + api.failureCount;
                  const apiSuccessRate = apiTotal > 0 ? (api.successCount / apiTotal) * 100 : 0;
                  return (
                    <tr key={api.endpoint} className="border-b border-[var(--surface-border)] last:border-b-0">
                      <td className="py-3 pr-3 font-mono text-[12px] text-[var(--text-primary)]">{api.endpoint}</td>
                      <td className="py-3 text-right tabular-nums text-[var(--text-primary)]">{api.requests.toLocaleString()}</td>
                      <td className="py-3 text-right tabular-nums text-[var(--text-muted)]">{formatCompact(api.tokens)}</td>
                      <td className="py-3 text-right"><Badge tone={apiSuccessRate >= 95 ? "success" : apiSuccessRate >= 80 ? "warning" : "danger"} size="xs">{formatPercent(apiSuccessRate)}</Badge></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        <div className="dashboard-panel-surface min-w-0 p-4">
          <h2 className="text-sm font-semibold text-[var(--text-primary)]">Model Stats</h2>
          <div className="mt-4 overflow-x-auto pb-1">
            <table className="w-full min-w-[640px] text-sm">
              <thead>
                <tr className="border-b border-[var(--surface-border)]">
                  <th className="px-0 py-2 text-left text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--text-muted)]">Model</th>
                  <th className="px-0 py-2 text-right text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--text-muted)]">Requests</th>
                  <th className="px-0 py-2 text-right text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--text-muted)]">Tokens</th>
                  <th className="px-0 py-2 text-right text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--text-muted)]">Success</th>
                </tr>
              </thead>
              <tbody>
                {snapshot.data.modelBreakdown.map((model) => {
                  const total = model.successCount + model.failureCount;
                  const modelSuccessRate = total > 0 ? (model.successCount / total) * 100 : 0;
                  return (
                    <tr key={model.model} className="border-b border-[var(--surface-border)] last:border-b-0">
                      <td className="py-3 pr-3 font-mono text-[12px] text-[var(--text-primary)]">{model.model}</td>
                      <td className="py-3 text-right tabular-nums text-[var(--text-primary)]">{model.requests.toLocaleString()}</td>
                      <td className="py-3 text-right tabular-nums text-[var(--text-muted)]">{formatCompact(model.tokens)}</td>
                      <td className="py-3 text-right"><Badge tone={modelSuccessRate >= 95 ? "success" : modelSuccessRate >= 80 ? "warning" : "danger"} size="xs">{formatPercent(modelSuccessRate)}</Badge></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      <section className="dashboard-panel-surface p-4">
        <h2 className="text-sm font-semibold text-[var(--text-primary)]">Credential Stats</h2>
        <div className="mt-4 overflow-auto">
          <table className="w-full min-w-[640px] text-sm">
            <thead>
              <tr className="border-b border-[var(--surface-border)]">
                <th className="px-0 py-2 text-left text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--text-muted)]">Credential</th>
                <th className="px-0 py-2 text-right text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--text-muted)]">Requests</th>
                <th className="px-0 py-2 text-right text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--text-muted)]">Tokens</th>
                <th className="px-0 py-2 text-right text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--text-muted)]">Success</th>
              </tr>
            </thead>
            <tbody>
              {snapshot.data.credentialBreakdown.map((credential) => {
                const total = credential.successCount + credential.failureCount;
                const credentialSuccessRate = total > 0 ? (credential.successCount / total) * 100 : 0;
                return (
                  <tr key={credential.sourceId} className="border-b border-[var(--surface-border)] last:border-b-0">
                    <td className="py-3 pr-3 text-[var(--text-primary)]">
                      <div className="flex flex-col">
                        <span>{credential.sourceDisplay}</span>
                        {credential.sourceType ? <span className="text-[11px] text-[var(--text-muted)]">{credential.sourceType}</span> : null}
                      </div>
                    </td>
                    <td className="py-3 text-right tabular-nums text-[var(--text-primary)]">{credential.requests.toLocaleString()}</td>
                    <td className="py-3 text-right tabular-nums text-[var(--text-muted)]">{formatCompact(credential.tokens)}</td>
                    <td className="py-3 text-right"><Badge tone={credentialSuccessRate >= 95 ? "success" : credentialSuccessRate >= 80 ? "warning" : "danger"} size="xs">{formatPercent(credentialSuccessRate)}</Badge></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      <UsageModelPricingPanel
        records={modelPricingRecords}
        previewRecords={previewModelPricingRecords}
        modelNames={modelNames}
        isAdmin={snapshot.isAdmin}
        loading={pricingLoading}
        error={pricingError}
        onCreateOrUpdate={handlePricingSave}
        onDelete={handlePricingDelete}
        onReload={handlePricingReload}
        onSyncOfficial={handlePricingSyncOfficial}
        onClearPreview={() => setPreviewModelPricingRecords([])}
      />
    </div>
  );
}
