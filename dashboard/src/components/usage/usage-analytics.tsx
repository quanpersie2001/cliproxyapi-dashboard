"use client";

import Link from "next/link";
import { type ReactNode, useEffect, useMemo, useRef, useState } from "react";
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
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Modal, ModalContent, ModalFooter, ModalHeader, ModalTitle } from "@/components/ui/modal";
import { UsageCharts } from "@/components/usage/usage-charts";
import { UsageRequestEvents } from "@/components/usage/usage-request-events";
import { UsageTable } from "@/components/usage/usage-table";
import {
  AXIS_TICK_STYLE,
  CHART_COLORS,
  ChartContainer,
  formatCompact,
  TOOLTIP_STYLE,
} from "@/components/ui/chart-theme";
import { API_ENDPOINTS } from "@/lib/api-endpoints";
import type { UsageHistorySnapshot } from "@/lib/usage/history";
import { cn } from "@/lib/utils";

type UsageAnalyticsData = UsageHistorySnapshot["data"];
type UsageDetailRecord = UsageAnalyticsData["details"][number];
type TimeRange = "7h" | "24h" | "7d" | "all";
type TrendPeriod = "hour" | "day";

interface ModelPrice {
  prompt: number;
  completion: number;
  cache: number;
}

interface UsageAnalyticsProps {
  initialSnapshot: UsageHistorySnapshot;
  title?: string;
  embedded?: boolean;
}

const TIME_RANGE_STORAGE_KEY = "dashboard-usage-time-range-v1";
const CHART_LINES_STORAGE_KEY = "dashboard-usage-chart-lines-v1";
const MODEL_PRICES_STORAGE_KEY = "dashboard-usage-model-prices-v1";
const MAX_CHART_LINES = 9;
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

function loadModelPrices(): Record<string, ModelPrice> {
  try {
    const raw = localStorage.getItem(MODEL_PRICES_STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Record<string, ModelPrice>;
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
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

function getHourWindow(timeRange: TimeRange): number {
  switch (timeRange) {
    case "7h":
      return 7;
    case "24h":
      return 24;
    case "7d":
      return 7 * 24;
    case "all":
      return 24;
  }
}

function calculateCost(detail: UsageDetailRecord, prices: Record<string, ModelPrice>): number {
  const price = prices[detail.model];
  if (!price) return 0;
  const cachedTokens = Math.max(detail.cachedTokens, 0);
  const promptTokens = Math.max(detail.inputTokens - cachedTokens, 0);
  return (
    (promptTokens / 1_000_000) * price.prompt +
    (cachedTokens / 1_000_000) * price.cache +
    (detail.outputTokens / 1_000_000) * price.completion
  );
}

function buildTrendData(
  details: UsageDetailRecord[],
  period: TrendPeriod,
  metric: "requests" | "tokens",
  lines: string[],
  timeRange: TimeRange
) {
  const selectedLines = lines.length > 0 ? lines : ["all"];
  const dataByModel = new Map<string, Map<string, number>>();
  const labels: string[] = [];
  const labelSet = new Set<string>();

  if (period === "hour") {
    const hourWindow = getHourWindow(timeRange);
    const hourMs = 60 * 60 * 1000;
    const now = new Date();
    now.setMinutes(0, 0, 0);
    const start = now.getTime() - (hourWindow - 1) * hourMs;

    for (let index = 0; index < hourWindow; index += 1) {
      const bucket = new Date(start + index * hourMs);
      labels.push(bucket.toISOString());
    }

    for (const detail of details) {
      const timestamp = new Date(detail.timestamp);
      timestamp.setMinutes(0, 0, 0);
      const bucketIso = timestamp.toISOString();
      if (!labels.includes(bucketIso)) continue;
      if (!dataByModel.has(detail.model)) {
        dataByModel.set(detail.model, new Map());
      }
      const map = dataByModel.get(detail.model)!;
      map.set(bucketIso, (map.get(bucketIso) ?? 0) + (metric === "tokens" ? detail.totalTokens : 1));
    }
  } else {
    for (const detail of details) {
      const label = detail.timestamp.slice(0, 10);
      labelSet.add(label);
      if (!dataByModel.has(detail.model)) {
        dataByModel.set(detail.model, new Map());
      }
      const map = dataByModel.get(detail.model)!;
      map.set(label, (map.get(label) ?? 0) + (metric === "tokens" ? detail.totalTokens : 1));
    }
    labels.push(...[...labelSet].sort());
  }

  return labels.map((label) => {
    const row: Record<string, string | number> = {
      label,
      displayLabel: period === "hour"
        ? new Date(label).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" })
        : new Date(`${label}T00:00:00`).toLocaleDateString("en-US", { month: "short", day: "numeric" }),
    };
    let allTotal = 0;
    for (const [model, values] of dataByModel.entries()) {
      const value = values.get(label) ?? 0;
      row[model] = value;
      allTotal += value;
    }
    row.all = allTotal;
    for (const selected of selectedLines) {
      if (!(selected in row)) {
        row[selected] = 0;
      }
    }
    return row;
  });
}

function buildTokenBreakdownData(details: UsageDetailRecord[], period: TrendPeriod, timeRange: TimeRange) {
  const bucketMap = new Map<string, { displayLabel: string; input: number; output: number; cached: number; reasoning: number }>();

  if (period === "hour") {
    const hourWindow = getHourWindow(timeRange);
    const now = new Date();
    now.setMinutes(0, 0, 0);
    for (let index = hourWindow - 1; index >= 0; index -= 1) {
      const bucket = new Date(now.getTime() - index * 60 * 60 * 1000);
      const key = bucket.toISOString();
      bucketMap.set(key, {
        displayLabel: bucket.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" }),
        input: 0,
        output: 0,
        cached: 0,
        reasoning: 0,
      });
    }
    for (const detail of details) {
      const bucket = new Date(detail.timestamp);
      bucket.setMinutes(0, 0, 0);
      const entry = bucketMap.get(bucket.toISOString());
      if (!entry) continue;
      entry.input += detail.inputTokens;
      entry.output += detail.outputTokens;
      entry.cached += detail.cachedTokens;
      entry.reasoning += detail.reasoningTokens;
    }
  } else {
    for (const detail of details) {
      const key = detail.timestamp.slice(0, 10);
      if (!bucketMap.has(key)) {
        bucketMap.set(key, {
          displayLabel: new Date(`${key}T00:00:00`).toLocaleDateString("en-US", { month: "short", day: "numeric" }),
          input: 0,
          output: 0,
          cached: 0,
          reasoning: 0,
        });
      }
      const entry = bucketMap.get(key)!;
      entry.input += detail.inputTokens;
      entry.output += detail.outputTokens;
      entry.cached += detail.cachedTokens;
      entry.reasoning += detail.reasoningTokens;
    }
  }

  return [...bucketMap.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([label, value]) => ({ label, ...value }));
}

function buildCostTrendData(details: UsageDetailRecord[], prices: Record<string, ModelPrice>, period: TrendPeriod, timeRange: TimeRange) {
  const bucketMap = new Map<string, { displayLabel: string; cost: number }>();

  if (period === "hour") {
    const hourWindow = getHourWindow(timeRange);
    const now = new Date();
    now.setMinutes(0, 0, 0);
    for (let index = hourWindow - 1; index >= 0; index -= 1) {
      const bucket = new Date(now.getTime() - index * 60 * 60 * 1000);
      bucketMap.set(bucket.toISOString(), {
        displayLabel: bucket.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" }),
        cost: 0,
      });
    }
    for (const detail of details) {
      const bucket = new Date(detail.timestamp);
      bucket.setMinutes(0, 0, 0);
      const entry = bucketMap.get(bucket.toISOString());
      if (!entry) continue;
      entry.cost += calculateCost(detail, prices);
    }
  } else {
    for (const detail of details) {
      const key = detail.timestamp.slice(0, 10);
      if (!bucketMap.has(key)) {
        bucketMap.set(key, {
          displayLabel: new Date(`${key}T00:00:00`).toLocaleDateString("en-US", { month: "short", day: "numeric" }),
          cost: 0,
        });
      }
      bucketMap.get(key)!.cost += calculateCost(detail, prices);
    }
  }

  return [...bucketMap.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([label, value]) => ({ label, ...value }));
}

function rateToColor(rate: number): string {
  const clamped = Math.max(0, Math.min(1, rate));
  const red = { r: 239, g: 68, b: 68 };
  const yellow = { r: 250, g: 204, b: 21 };
  const green = { r: 34, g: 197, b: 94 };
  const segment = clamped < 0.5 ? 0 : 1;
  const localT = segment === 0 ? clamped * 2 : (clamped - 0.5) * 2;
  const from = segment === 0 ? red : yellow;
  const to = segment === 0 ? yellow : green;
  const r = Math.round(from.r + (to.r - from.r) * localT);
  const g = Math.round(from.g + (to.g - from.g) * localT);
  const b = Math.round(from.b + (to.b - from.b) * localT);
  return `rgb(${r}, ${g}, ${b})`;
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
    <section className={cn("dashboard-panel-surface p-4", className)}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="dashboard-kicker">{title}</div>
          {description ? (
            <p className="mt-2 text-sm leading-6 text-[var(--text-secondary)]">
              {description}
            </p>
          ) : null}
        </div>
        {badge ? <div className="shrink-0">{badge}</div> : null}
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
  title = "Usage Analytics",
  embedded = false,
}: UsageAnalyticsProps) {
  const [windowRange, setWindowRange] = useState<TimeRange>(() => (typeof window === "undefined" ? "7d" : loadTimeRange()));
  const [chartLines, setChartLines] = useState<string[]>(() => (typeof window === "undefined" ? ["all"] : loadChartLines()));
  const [modelPrices, setModelPrices] = useState<Record<string, ModelPrice>>(() => (typeof window === "undefined" ? {} : loadModelPrices()));
  const [requestsPeriod, setRequestsPeriod] = useState<TrendPeriod>("day");
  const [tokensPeriod, setTokensPeriod] = useState<TrendPeriod>("day");
  const [tokenBreakdownPeriod, setTokenBreakdownPeriod] = useState<TrendPeriod>("hour");
  const [costPeriod, setCostPeriod] = useState<TrendPeriod>("hour");
  const [snapshot, setSnapshot] = useState<UsageHistorySnapshot>(initialSnapshot);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdatedAt, setLastUpdatedAt] = useState<string>(new Date().toISOString());
  const [priceFormModel, setPriceFormModel] = useState("");
  const [priceFormPrompt, setPriceFormPrompt] = useState("");
  const [priceFormCompletion, setPriceFormCompletion] = useState("");
  const [priceFormCache, setPriceFormCache] = useState("");
  const [editingModel, setEditingModel] = useState<string | null>(null);
  const [editPrompt, setEditPrompt] = useState("");
  const [editCompletion, setEditCompletion] = useState("");
  const [editCache, setEditCache] = useState("");
  const hasHydratedRef = useRef(false);

  const fetchSnapshot = async (targetWindow: TimeRange, showLoading: boolean) => {
    if (showLoading) setLoading(true);
    try {
      const response = await fetch(`${API_ENDPOINTS.USAGE.HISTORY}?window=${targetWindow}`);
      if (!response.ok) {
        throw new Error("Failed to load usage analytics");
      }
      const json = await response.json() as UsageHistorySnapshot;
      setSnapshot(json);
      setLastUpdatedAt(new Date().toISOString());
      setError(null);
    } catch (fetchError) {
      setError(fetchError instanceof Error ? fetchError.message : "Failed to load usage analytics");
    } finally {
      if (showLoading) setLoading(false);
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
  }, [windowRange]);

  useEffect(() => {
    const interval = setInterval(() => {
      if (typeof document !== "undefined" && document.visibilityState !== "visible") return;
      void fetchSnapshot(windowRange, false);
    }, 300_000);
    return () => clearInterval(interval);
  }, [windowRange]);

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

  useEffect(() => {
    try {
      localStorage.setItem(MODEL_PRICES_STORAGE_KEY, JSON.stringify(modelPrices));
    } catch {}
  }, [modelPrices]);

  const details = snapshot.data.details;
  const modelNames = useMemo(() => [...new Set(details.map((detail) => detail.model))].sort(), [details]);
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
    () => details.reduce((sum, detail) => sum + calculateCost(detail, modelPrices), 0),
    [details, modelPrices]
  );
  const requestTrendData = useMemo(
    () => buildTrendData(details, requestsPeriod, "requests", chartLines, windowRange),
    [chartLines, details, requestsPeriod, windowRange]
  );
  const tokenTrendData = useMemo(
    () => buildTrendData(details, tokensPeriod, "tokens", chartLines, windowRange),
    [chartLines, details, tokensPeriod, windowRange]
  );
  const tokenBreakdownData = useMemo(
    () => buildTokenBreakdownData(details, tokenBreakdownPeriod, windowRange),
    [details, tokenBreakdownPeriod, windowRange]
  );
  const costTrendData = useMemo(
    () => buildCostTrendData(details, modelPrices, costPeriod, windowRange),
    [costPeriod, details, modelPrices, windowRange]
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
  const pricedModelsCount = Object.keys(modelPrices).length;
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

  const savePrice = () => {
    if (!priceFormModel) return;
    setModelPrices((current) => ({
      ...current,
      [priceFormModel]: {
        prompt: Number(priceFormPrompt) || 0,
        completion: Number(priceFormCompletion) || 0,
        cache: priceFormCache.trim() === "" ? Number(priceFormPrompt) || 0 : Number(priceFormCache) || 0,
      },
    }));
    setPriceFormModel("");
    setPriceFormPrompt("");
    setPriceFormCompletion("");
    setPriceFormCache("");
  };

  const openEditPrice = (model: string) => {
    const current = modelPrices[model];
    setEditingModel(model);
    setEditPrompt(String(current?.prompt ?? ""));
    setEditCompletion(String(current?.completion ?? ""));
    setEditCache(String(current?.cache ?? ""));
  };

  const saveEditPrice = () => {
    if (!editingModel) return;
    setModelPrices((current) => ({
      ...current,
      [editingModel]: {
        prompt: Number(editPrompt) || 0,
        completion: Number(editCompletion) || 0,
        cache: editCache.trim() === "" ? Number(editPrompt) || 0 : Number(editCache) || 0,
      },
    }));
    setEditingModel(null);
  };

  const deletePrice = (model: string) => {
    setModelPrices((current) => {
      const next = { ...current };
      delete next[model];
      return next;
    });
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
              <div key={model.model} className="flex items-center justify-between gap-4 py-3 first:pt-0 last:pb-0">
                <div className="min-w-0">
                  <div className="truncate font-mono text-[12px] text-[var(--text-primary)]">{model.model}</div>
                  <div className="mt-1 text-xs text-[var(--text-muted)]">{formatCompact(model.tokens)} tokens</div>
                </div>
                <div className="flex items-center gap-3">
                  <div className="text-right">
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
      <div className="overflow-x-auto">
        <div className="min-w-[640px] space-y-1.5">
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
      <div className="mt-4 flex flex-wrap items-center justify-between gap-3 text-[11px] text-[var(--text-muted)]">
        <span>{snapshot.data.serviceHealth.totalSuccess.toLocaleString()} success</span>
        <div className="flex flex-wrap items-center gap-2">
          <span className="inline-block h-2.5 w-2.5 rounded-[3px] bg-[var(--surface-muted)]" />
          <span>Idle</span>
          <span className="inline-block h-2.5 w-2.5 rounded-[3px] bg-rose-500" />
          <span>Poor</span>
          <span className="inline-block h-2.5 w-2.5 rounded-[3px] bg-yellow-400" />
          <span>Mixed</span>
          <span className="inline-block h-2.5 w-2.5 rounded-[3px] bg-emerald-500" />
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
              detail={`${recentRate.requestCount.toLocaleString()} requests and ${formatCompact(recentRate.tokenCount)} tokens in the last 30 minutes`}
            />
            <MetricCard
              label="Collector freshness"
              value={formatRelativeTime(snapshot.data.collectorStatus.lastCollectedAt)}
              detail={`Collector status: ${snapshot.data.collectorStatus.lastStatus}`}
            />
            <MetricCard
              label="Estimated cost"
              value={pricedModelsCount > 0 ? formatUsd(totalCost) : "--"}
              detail={pricedModelsCount > 0 ? `${pricedModelsCount} models priced locally` : "Configure model prices on the analytics page to unlock cost estimates"}
            />
          </div>

          <div className="mt-4 grid gap-4 xl:grid-cols-[minmax(0,0.95fr)_minmax(0,1.05fr)]">
            {topModelsCard}
            {serviceHealthCard}
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
              <Button onClick={() => void fetchSnapshot(windowRange, true)} disabled={loading}>
                {loading ? "Refreshing..." : "Refresh"}
              </Button>
              <Link href="/dashboard" className={detailLinkClassName}>
                Back to overview
              </Link>
            </div>
          </div>
        </div>
        {error ? (
          <div className="mt-4 rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
            {error}
          </div>
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
          value={formatCompact(totals.totalTokens)}
          detail={`Input ${formatCompact(totals.inputTokens)} / Output ${formatCompact(totals.outputTokens)}`}
        />
        <MetricCard
          label="Avg latency"
          value={hasLatencySamples ? formatLatency(latencySummary.averageMs) : "--"}
          detail={hasLatencySamples ? `P95 ${formatLatency(latencySummary.p95Ms)} / Max ${formatLatency(latencySummary.maxMs)}` : "Latency appears after requests are persisted"}
        />
        <MetricCard
          label="Recent throughput"
          value={`${formatPerMinuteValue(recentRate.rpm)} / ${formatPerMinuteValue(recentRate.tpm)}`}
          detail={`${recentRate.requestCount.toLocaleString()} requests and ${formatCompact(recentRate.tokenCount)} tokens in the last 30 minutes`}
        />
        <MetricCard
          label="Estimated cost"
          value={pricedModelsCount > 0 ? formatUsd(totalCost) : "--"}
          detail={pricedModelsCount > 0 ? `${pricedModelsCount} models priced locally` : "Add model prices below to enable cost analytics"}
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
              value={formatCompact(totals.cachedTokens)}
              detail={formatShare(totals.cachedTokens, totals.totalTokens)}
            />
          </div>
          <div className="dashboard-card-surface p-4">
            <SummaryRow
              label="Reasoning tokens"
              value={formatCompact(totals.reasoningTokens)}
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
            <Button variant={requestsPeriod === "hour" ? "primary" : "secondary"} onClick={() => setRequestsPeriod("hour")}>By Hour</Button>
            <Button variant={requestsPeriod === "day" ? "primary" : "secondary"} onClick={() => setRequestsPeriod("day")}>By Day</Button>
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
            <Button variant={tokensPeriod === "hour" ? "primary" : "secondary"} onClick={() => setTokensPeriod("hour")}>By Hour</Button>
            <Button variant={tokensPeriod === "day" ? "primary" : "secondary"} onClick={() => setTokensPeriod("day")}>By Day</Button>
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
            <Button variant={tokenBreakdownPeriod === "hour" ? "primary" : "secondary"} onClick={() => setTokenBreakdownPeriod("hour")}>By Hour</Button>
            <Button variant={tokenBreakdownPeriod === "day" ? "primary" : "secondary"} onClick={() => setTokenBreakdownPeriod("day")}>By Day</Button>
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
          subtitle={Object.keys(modelPrices).length > 0 ? "Calculated from local model pricing" : "Add prices below to enable"}
        >
          <div className="mb-3 flex gap-2">
            <Button variant={costPeriod === "hour" ? "primary" : "secondary"} onClick={() => setCostPeriod("hour")}>By Hour</Button>
            <Button variant={costPeriod === "day" ? "primary" : "secondary"} onClick={() => setCostPeriod("day")}>By Day</Button>
          </div>
          {Object.keys(modelPrices).length === 0 ? (
            <div className="flex h-[85%] items-center justify-center text-sm text-[var(--text-muted)]">
              No model prices configured.
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

      <section className="grid gap-4 xl:grid-cols-2">
        <div className="dashboard-panel-surface p-4">
          <h2 className="text-sm font-semibold text-[var(--text-primary)]">API Details</h2>
          <div className="mt-4 overflow-auto">
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

        <div className="dashboard-panel-surface p-4">
          <h2 className="text-sm font-semibold text-[var(--text-primary)]">Model Stats</h2>
          <div className="mt-4 overflow-auto">
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

      <section className="dashboard-panel-surface p-4">
        <h2 className="text-sm font-semibold text-[var(--text-primary)]">Model Price Settings</h2>
        <p className="mt-1 text-xs text-[var(--text-muted)]">
          Prices are stored locally in your browser and used to calculate estimated cost charts.
        </p>
        <div className="mt-4 grid gap-3 xl:grid-cols-[1.2fr_1fr_1fr_1fr_auto]">
          <SelectField value={priceFormModel} onChange={setPriceFormModel} options={[{ value: "", label: "Select model" }, ...modelNames.map((model) => ({ value: model, label: model }))]} />
          <Input name="prompt-price" value={priceFormPrompt} onChange={setPriceFormPrompt} placeholder="Prompt ($/1M)" type="number" />
          <Input name="completion-price" value={priceFormCompletion} onChange={setPriceFormCompletion} placeholder="Completion ($/1M)" type="number" />
          <Input name="cache-price" value={priceFormCache} onChange={setPriceFormCache} placeholder="Cache ($/1M)" type="number" />
          <Button onClick={savePrice} disabled={!priceFormModel}>Save</Button>
        </div>
        <div className="mt-4 space-y-2">
          {Object.entries(modelPrices).length > 0 ? Object.entries(modelPrices).map(([model, price]) => (
            <div key={model} className="dashboard-card-surface flex flex-col gap-3 p-3 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <div className="font-medium text-[var(--text-primary)]">{model}</div>
                <div className="mt-1 text-xs text-[var(--text-muted)]">
                  Prompt {price.prompt.toFixed(4)} / Completion {price.completion.toFixed(4)} / Cache {price.cache.toFixed(4)}
                </div>
              </div>
              <div className="flex gap-2">
                <Button variant="secondary" onClick={() => openEditPrice(model)}>Edit</Button>
                <Button variant="ghost" onClick={() => deletePrice(model)}>Delete</Button>
              </div>
            </div>
          )) : (
            <div className="text-sm text-[var(--text-muted)]">No model prices configured yet.</div>
          )}
        </div>
      </section>

      <Modal isOpen={editingModel !== null} onClose={() => setEditingModel(null)}>
        <ModalHeader>
          <ModalTitle>Edit Model Price</ModalTitle>
        </ModalHeader>
        <ModalContent className="space-y-3">
          <div className="text-sm text-[var(--text-secondary)]">{editingModel}</div>
          <Input name="edit-prompt-price" value={editPrompt} onChange={setEditPrompt} placeholder="Prompt ($/1M)" type="number" />
          <Input name="edit-completion-price" value={editCompletion} onChange={setEditCompletion} placeholder="Completion ($/1M)" type="number" />
          <Input name="edit-cache-price" value={editCache} onChange={setEditCache} placeholder="Cache ($/1M)" type="number" />
        </ModalContent>
        <ModalFooter>
          <Button variant="ghost" onClick={() => setEditingModel(null)}>Cancel</Button>
          <Button onClick={saveEditPrice}>Save</Button>
        </ModalFooter>
      </Modal>
    </div>
  );
}
