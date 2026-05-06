import Link from "next/link";
import { DashboardMiniCharts } from "@/components/dashboard-mini-charts";
import { Badge, type BadgeTone } from "@/components/ui/badge";
import { formatCompact } from "@/components/ui/chart-theme";
import { formatMetricCompact } from "@/lib/metric-format";
import type { UsageHistoryData } from "@/lib/usage/history";

interface OverviewUsagePanelProps {
  snapshot: UsageHistoryData;
  isAdmin: boolean;
}

function formatPerMinuteValue(value: number): string {
  if (!Number.isFinite(value)) return "0.00";
  if (value >= 1_000) return Math.round(value).toLocaleString();
  if (value >= 100) return value.toFixed(0);
  if (value >= 10) return value.toFixed(1);
  return value.toFixed(2);
}

function formatLatency(value: number): string {
  return `${Math.round(value).toLocaleString()} ms`;
}

function formatPercent(value: number): string {
  return `${value.toFixed(1)}%`;
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

function formatTimestamp(isoString: string): string {
  return new Date(isoString).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

function getCollectorTone(lastStatus: string, lastCollectedAt: string): BadgeTone {
  if (lastStatus === "error") return "danger";
  if (!lastCollectedAt) return "warning";

  const diff = Date.now() - new Date(lastCollectedAt).getTime();
  const minutes = Math.floor(diff / 60_000);

  if (minutes < 10) return "success";
  if (minutes < 30) return "warning";
  return "danger";
}

function rateToColor(rate: number): string {
  const clamped = Math.max(0, Math.min(1, rate));
  const transitionPercent = Math.round((clamped < 0.5 ? clamped * 2 : (clamped - 0.5) * 2) * 100);

  if (clamped < 0.5) {
    return `color-mix(in srgb, var(--state-danger-accent) ${100 - transitionPercent}%, var(--state-warning-accent) ${transitionPercent}%)`;
  }

  return `color-mix(in srgb, var(--state-warning-accent) ${100 - transitionPercent}%, var(--state-success-accent) ${transitionPercent}%)`;
}

function formatHealthRange(startTime: number, endTime: number): string {
  const start = new Date(startTime).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
  const end = new Date(endTime).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
  return `${start} - ${end}`;
}

function chunkBlocks<T>(items: T[], chunkSize: number): T[][] {
  const chunks: T[][] = [];
  for (let index = 0; index < items.length; index += chunkSize) {
    chunks.push(items.slice(index, index + chunkSize));
  }
  return chunks;
}

function MetricCard({
  label,
  value,
  detail,
}: {
  label: string;
  value: string;
  detail: string;
}) {
  return (
    <div className="rounded-lg border border-[var(--surface-border)] bg-[var(--surface-base)] p-4">
      <div className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--text-muted)]">
        {label}
      </div>
      <div className="mt-2 text-2xl font-semibold tracking-tight text-[var(--text-primary)]">
        {value}
      </div>
      <div className="mt-1 text-sm text-[var(--text-muted)]">
        {detail}
      </div>
    </div>
  );
}

export function OverviewUsagePanel({
  snapshot,
  isAdmin,
}: OverviewUsagePanelProps) {
  const totalAttempts = snapshot.totals.successCount + snapshot.totals.failureCount;
  const hasTraffic = totalAttempts > 0;
  const hasLatencySamples = snapshot.latencySummary.sampleCount > 0;
  const hasHealthTraffic = (snapshot.serviceHealth.totalSuccess + snapshot.serviceHealth.totalFailure) > 0;
  const successRate = totalAttempts > 0
    ? (snapshot.totals.successCount / totalAttempts) * 100
    : 0;
  const collectorTone = getCollectorTone(
    snapshot.collectorStatus.lastStatus,
    snapshot.collectorStatus.lastCollectedAt
  );
  const topModels = snapshot.modelBreakdown.slice(0, 6);
  const recentEvents = snapshot.requestEvents.slice(0, 8);
  const serviceHealthRows = chunkBlocks(
    snapshot.serviceHealth.blockDetails,
    snapshot.serviceHealth.cols
  );

  return (
    <div className="space-y-6">
      <section className="rounded-lg border border-[var(--surface-border)] bg-[var(--surface-base)] p-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <h2 className="text-lg font-semibold tracking-tight text-[var(--text-primary)]">
              Usage Metrics
            </h2>
            <p className="mt-1 text-sm text-[var(--text-muted)]">
              Last 7 days of persisted dashboard API key traffic, adapted for this control-plane architecture.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone={collectorTone} dot size="xs" className="uppercase tracking-[0.08em]">
              Collector {snapshot.collectorStatus.lastStatus}
            </Badge>
            <span className="text-xs text-[var(--text-muted)]">
              Last synced {formatRelativeTime(snapshot.collectorStatus.lastCollectedAt)}
            </span>
            <Link
              href="/dashboard/usage"
              className="rounded-full border border-[var(--surface-border)] px-3 py-1.5 text-xs font-medium text-[var(--text-primary)] transition-colors hover:bg-[var(--surface-muted)]"
            >
              Open full usage
            </Link>
          </div>
        </div>

        <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
          <MetricCard
            label="Requests (7d)"
            value={snapshot.totals.totalRequests.toLocaleString()}
            detail={`${snapshot.totals.successCount.toLocaleString()} ok / ${snapshot.totals.failureCount.toLocaleString()} failed`}
          />
          <MetricCard
            label="Tokens (7d)"
            value={formatMetricCompact(snapshot.totals.totalTokens)}
            detail={`Input ${formatMetricCompact(snapshot.totals.inputTokens)} / Output ${formatMetricCompact(snapshot.totals.outputTokens)}`}
          />
          <MetricCard
            label="Success Rate"
            value={hasTraffic ? formatPercent(successRate) : "--"}
            detail={`Cached ${formatMetricCompact(snapshot.totals.cachedTokens)} / Reasoning ${formatMetricCompact(snapshot.totals.reasoningTokens)}`}
          />
          <MetricCard
            label="Avg Latency"
            value={hasLatencySamples ? formatLatency(snapshot.latencySummary.averageMs) : "--"}
            detail={hasLatencySamples
              ? `P95 ${formatLatency(snapshot.latencySummary.p95Ms)} / Max ${formatLatency(snapshot.latencySummary.maxMs)}`
              : "No latency samples collected yet"}
          />
          <MetricCard
            label="RPM (30m)"
            value={formatPerMinuteValue(snapshot.recentRate.rpm)}
            detail={`${snapshot.recentRate.requestCount.toLocaleString()} requests in the last 30 minutes`}
          />
          <MetricCard
            label="TPM (30m)"
            value={formatPerMinuteValue(snapshot.recentRate.tpm)}
            detail={`${formatMetricCompact(snapshot.recentRate.tokenCount)} tokens in the last 30 minutes`}
          />
        </div>

        <div className="mt-4">
          <DashboardMiniCharts
            dailyBreakdown={snapshot.dailyBreakdown}
            totals={snapshot.totals}
          />
        </div>
      </section>

      <section className="grid gap-4 xl:grid-cols-[minmax(0,0.95fr)_minmax(0,1.05fr)]">
        <div className="rounded-lg border border-[var(--surface-border)] bg-[var(--surface-base)] p-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h3 className="text-sm font-semibold text-[var(--text-primary)]">Top Models</h3>
              <p className="mt-1 text-xs text-[var(--text-muted)]">
                Highest-volume models across the selected 7-day overview window.
              </p>
            </div>
            <Link
              href="/dashboard/usage"
              className="text-xs font-medium text-[var(--text-primary)] underline decoration-[var(--surface-border-strong)] underline-offset-4"
            >
              Full breakdown
            </Link>
          </div>

          {topModels.length > 0 ? (
            <div className="mt-4 overflow-auto">
              <table className="w-full min-w-[560px] text-sm">
                <thead>
                  <tr className="border-b border-[var(--surface-border)]">
                    <th className="px-0 py-2 text-left text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--text-muted)]">Model</th>
                    <th className="px-0 py-2 text-right text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--text-muted)]">Requests</th>
                    <th className="px-0 py-2 text-right text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--text-muted)]">Tokens</th>
                    <th className="px-0 py-2 text-right text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--text-muted)]">Success</th>
                  </tr>
                </thead>
                <tbody>
                  {topModels.map((model) => {
                    const total = model.successCount + model.failureCount;
                    const modelSuccessRate = total > 0 ? (model.successCount / total) * 100 : 0;

                    return (
                      <tr key={model.model} className="border-b border-[var(--surface-border)] last:border-b-0">
                        <td className="py-3 pr-3 font-mono text-[12px] text-[var(--text-primary)]">
                          {model.model}
                        </td>
                        <td className="py-3 text-right tabular-nums text-[var(--text-primary)]">
                          {model.requests.toLocaleString()}
                        </td>
                        <td className="py-3 text-right tabular-nums text-[var(--text-muted)]">
                          {formatCompact(model.tokens)}
                        </td>
                        <td className="py-3 text-right">
                          <Badge
                            tone={modelSuccessRate >= 95 ? "success" : modelSuccessRate >= 80 ? "warning" : "danger"}
                            size="xs"
                          >
                            {formatPercent(modelSuccessRate)}
                          </Badge>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="mt-4 text-sm text-[var(--text-muted)]">
              No model usage has been collected yet.
            </p>
          )}
        </div>

        <div className="rounded-lg border border-[var(--surface-border)] bg-[var(--surface-base)] p-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h3 className="text-sm font-semibold text-[var(--text-primary)]">Service Health</h3>
              <p className="mt-1 text-xs text-[var(--text-muted)]">
                7-day success heatmap in {snapshot.serviceHealth.blockSizeMinutes}-minute blocks.
              </p>
            </div>
            <Badge
              tone={
                !hasHealthTraffic
                  ? "neutral"
                  : snapshot.serviceHealth.successRate >= 95
                  ? "success"
                  : snapshot.serviceHealth.successRate >= 80
                    ? "warning"
                    : "danger"
              }
              size="xs"
            >
              {hasHealthTraffic ? formatPercent(snapshot.serviceHealth.successRate) : "No traffic"}
            </Badge>
          </div>

          <div className="mt-4 overflow-x-auto">
            <div className="min-w-[720px] space-y-1.5">
              {serviceHealthRows.map((row, rowIndex) => (
                <div
                  key={`health-row-${rowIndex}`}
                  className="grid gap-1"
                  style={{ gridTemplateColumns: `repeat(${snapshot.serviceHealth.cols}, minmax(0, 1fr))` }}
                >
                  {row.map((block, blockIndex) => {
                    const tone = block.rate < 0
                      ? "var(--surface-muted)"
                      : rateToColor(block.rate);
                    const title = block.rate < 0
                      ? `${formatHealthRange(block.startTime, block.endTime)}\nNo requests`
                      : `${formatHealthRange(block.startTime, block.endTime)}\nSuccess ${block.success} / Failure ${block.failure}\nRate ${formatPercent(block.rate * 100)}`;

                    return (
                      <div
                        key={`health-${rowIndex}-${blockIndex}`}
                        className="h-3 rounded-[3px]"
                        style={{ backgroundColor: tone }}
                        title={title}
                      />
                    );
                  })}
                </div>
              ))}
            </div>
          </div>

          <div className="mt-4 flex items-center justify-between gap-3 text-[11px] text-[var(--text-muted)]">
            <span>{snapshot.serviceHealth.totalSuccess.toLocaleString()} success</span>
            <div className="flex items-center gap-2">
              <span className="inline-block h-2.5 w-2.5 rounded-[3px] bg-[var(--surface-muted)]" />
              <span>Idle</span>
              <span className="inline-block h-2.5 w-2.5 rounded-[3px] bg-[var(--state-danger-accent)]" />
              <span>Poor</span>
              <span className="inline-block h-2.5 w-2.5 rounded-[3px] bg-[var(--state-warning-accent)]" />
              <span>Mixed</span>
              <span className="inline-block h-2.5 w-2.5 rounded-[3px] bg-[var(--state-success-accent)]" />
              <span>Healthy</span>
            </div>
            <span>{snapshot.serviceHealth.totalFailure.toLocaleString()} failed</span>
          </div>
        </div>
      </section>

      <section className="rounded-lg border border-[var(--surface-border)] bg-[var(--surface-base)] p-4">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h3 className="text-sm font-semibold text-[var(--text-primary)]">Recent Request Events</h3>
            <p className="mt-1 text-xs text-[var(--text-muted)]">
              Latest persisted requests from dashboard-issued API keys.
              {snapshot.truncated ? " Larger result sets were truncated by the history API." : ""}
            </p>
          </div>
          <Link
            href="/dashboard/usage"
            className="text-xs font-medium text-[var(--text-primary)] underline decoration-[var(--surface-border-strong)] underline-offset-4"
          >
            Explore usage analytics
          </Link>
        </div>

        {recentEvents.length > 0 ? (
          <div className="mt-4 overflow-auto">
            <table className="w-full min-w-[780px] text-sm">
              <thead>
                <tr className="border-b border-[var(--surface-border)]">
                  <th className="px-0 py-2 text-left text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--text-muted)]">Time</th>
                  <th className="px-0 py-2 text-left text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--text-muted)]">Key</th>
                  {isAdmin ? (
                    <th className="px-0 py-2 text-left text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--text-muted)]">User</th>
                  ) : null}
                  <th className="px-0 py-2 text-left text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--text-muted)]">Model</th>
                  <th className="px-0 py-2 text-left text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--text-muted)]">Status</th>
                  <th className="px-0 py-2 text-right text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--text-muted)]">Latency</th>
                  <th className="px-0 py-2 text-right text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--text-muted)]">Tokens</th>
                </tr>
              </thead>
              <tbody>
                {recentEvents.map((event, index) => (
                  <tr key={`${event.timestamp}-${event.model}-${index}`} className="border-b border-[var(--surface-border)] last:border-b-0">
                    <td className="py-3 pr-3">
                      <div className="flex flex-col">
                        <span className="text-xs text-[var(--text-primary)]">
                          {formatRelativeTime(event.timestamp)}
                        </span>
                        <span className="text-[11px] text-[var(--text-muted)]">
                          {formatTimestamp(event.timestamp)}
                        </span>
                      </div>
                    </td>
                    <td className="py-3 pr-3 font-mono text-[11px] text-[var(--text-primary)]">
                      {event.keyName}
                    </td>
                    {isAdmin ? (
                      <td className="py-3 pr-3 text-xs text-[var(--text-muted)]">
                        {event.username ?? "-"}
                      </td>
                    ) : null}
                    <td className="py-3 pr-3 font-mono text-[11px] text-[var(--text-secondary)]">
                      {event.model}
                    </td>
                    <td className="py-3 pr-3">
                      <Badge tone={event.failed ? "danger" : "success"} size="xs">
                        {event.failed ? "Failed" : "Success"}
                      </Badge>
                    </td>
                    <td className="py-3 text-right text-xs tabular-nums text-[var(--text-muted)]">
                      {event.latencyMs > 0 ? formatLatency(event.latencyMs) : "-"}
                    </td>
                    <td className="py-3 text-right text-xs tabular-nums text-[var(--text-primary)]">
                      {event.totalTokens.toLocaleString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="mt-4 text-sm text-[var(--text-muted)]">
            No request events have been collected yet.
          </p>
        )}
      </section>
    </div>
  );
}
