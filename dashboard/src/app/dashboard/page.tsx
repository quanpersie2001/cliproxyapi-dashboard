import type { ReactNode } from "react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { UsageAnalytics } from "@/components/usage/usage-analytics";
import { verifySession } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { getUtcDayRange } from "@/lib/usage/dashboard-window";
import { getUsageHistorySnapshot } from "@/lib/usage/history";

interface HighlightMetricProps {
  label: string;
  value: string;
  detail: string;
}

interface CompactDetailMetricProps {
  label: string;
  value: string;
  detail: string;
}

interface OverviewPanelProps {
  kicker: string;
  title: string;
  description: string;
  children: ReactNode;
  footer?: ReactNode;
}

function formatCompactNumber(value: number): string {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(1)}K`;
  return value.toLocaleString();
}

function formatPercent(value: number): string {
  return `${value.toFixed(1)}%`;
}

function formatLatency(value: number): string {
  return `${Math.round(value).toLocaleString()} ms`;
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

function HighlightMetric({ label, value, detail }: HighlightMetricProps) {
  return (
    <div className="dashboard-stat-surface px-3 py-3">
      <div className="dashboard-kicker">{label}</div>
      <div className="mt-2 dashboard-metric-value text-[1.55rem] font-semibold sm:text-[1.7rem]">
        {value}
      </div>
      <div className="mt-1 text-xs leading-5 text-[var(--text-muted)]">{detail}</div>
    </div>
  );
}

function CompactDetailMetric({ label, value, detail }: CompactDetailMetricProps) {
  return (
    <div className="dashboard-card-surface px-2.5 py-2">
      <div className="dashboard-kicker">{label}</div>
      <div className="mt-1.5 dashboard-metric-value text-sm font-semibold text-[var(--text-primary)]">
        {value}
      </div>
      <div className="mt-1 text-xs leading-5 text-[var(--text-muted)]">{detail}</div>
    </div>
  );
}

function QuickLink({
  href,
  label,
  className = "",
}: {
  href: string;
  label: string;
  className?: string;
}) {
  return (
    <Link
      href={href}
      className={`dashboard-pill-link ${className}`.trim()}
    >
      {label}
    </Link>
  );
}

function OverviewPanel({
  kicker,
  title,
  description,
  children,
  footer,
}: OverviewPanelProps) {
  return (
    <section className="dashboard-card-surface dashboard-card-surface--muted p-3">
      <div className="dashboard-kicker">{kicker}</div>
      <h2 className="mt-2 text-sm font-semibold text-[var(--text-primary)]">{title}</h2>
      <p className="mt-1 text-xs leading-5 text-[var(--text-muted)]">{description}</p>
      <div className="mt-3">{children}</div>
      {footer ? <div className="mt-3 flex flex-wrap gap-2">{footer}</div> : null}
    </section>
  );
}

async function getManagementHealthy(): Promise<boolean> {
  try {
    const baseUrl =
      process.env.CLIPROXYAPI_MANAGEMENT_URL ||
      "http://cliproxyapi:8317/v0/management";
    const root = baseUrl.replace(/\/v0\/management\/?$/, "/");
    const response = await fetch(root, { cache: "no-store" });
    await response.text();
    return response.ok;
  } catch {
    return false;
  }
}

export default async function DashboardOverviewPage() {
  const session = await verifySession();
  if (!session) {
    redirect("/login");
  }

  const usageWindow = getUtcDayRange(7);
  const [
    apiKeyCount,
    providerKeyCount,
    oauthAccountCount,
    customProviderCount,
    usageRecordCount,
    managementHealthy,
    usageSnapshot,
  ] = await Promise.all([
    prisma.userApiKey.count({ where: { userId: session.userId } }),
    prisma.providerKeyOwnership.count({ where: { userId: session.userId } }),
    prisma.providerOAuthOwnership.count({ where: { userId: session.userId } }),
    prisma.customProvider.count({ where: { userId: session.userId } }),
    prisma.usageRecord.count({ where: { userId: session.userId } }),
    getManagementHealthy(),
    getUsageHistorySnapshot({
      userId: session.userId,
      fromDate: usageWindow.fromDate,
      toDate: usageWindow.toDate,
      fromParam: usageWindow.fromParam,
      toParam: usageWindow.toParam,
    }),
  ]);

  const proxyStatusLabel = managementHealthy ? "Proxy healthy" : "Proxy degraded";
  const totals = usageSnapshot.data.totals;
  const totalAttempts = totals.successCount + totals.failureCount;
  const successRate = totalAttempts > 0 ? (totals.successCount / totalAttempts) * 100 : 0;
  const hasLatencySamples = usageSnapshot.data.latencySummary.sampleCount > 0;
  const topModel = usageSnapshot.data.modelBreakdown[0];
  const trackedModels = usageSnapshot.data.modelBreakdown.length;
  const collectorLastSynced = formatRelativeTime(usageSnapshot.data.collectorStatus.lastCollectedAt);

  return (
    <div className="space-y-6">
      <section className="dashboard-panel-surface p-4">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="max-w-3xl">
            <div className="flex flex-wrap items-center gap-2">
              <Badge
                tone={managementHealthy ? "success" : "warning"}
                className="px-3 py-1.5 text-xs font-semibold"
              >
                {proxyStatusLabel}
              </Badge>
              <Badge tone="neutral" size="xs">
                {formatPeriodLabel(usageSnapshot.data.period.from, usageSnapshot.data.period.to)}
              </Badge>
              <span className="text-xs text-[var(--text-muted)]">
                Usage collector synced {collectorLastSynced}
              </span>
            </div>
            <h1 className="mt-3 text-xl font-semibold tracking-tight text-[var(--text-primary)] lg:text-2xl">
              Proxy control plane
            </h1>
            <p className="mt-1 max-w-2xl text-sm leading-6 text-[var(--text-secondary)]">
              Runtime health, credential coverage, and usage pressure for dashboard-owned traffic.
            </p>
          </div>
          <div className="flex flex-wrap gap-2 lg:justify-end">
            <QuickLink href="/dashboard/providers" label="Providers" className="px-3 py-1.5 text-xs" />
            <QuickLink href="/dashboard/api-keys" label="API keys" className="px-3 py-1.5 text-xs" />
            <QuickLink href="/dashboard/usage" label="Detailed usage" className="px-3 py-1.5 text-xs" />
          </div>
        </div>

        <div className="mt-4 grid gap-2 lg:grid-cols-4">
          <HighlightMetric
            label="Requests (7d)"
            value={totals.totalRequests.toLocaleString()}
            detail={`${totals.successCount.toLocaleString()} successful / ${totals.failureCount.toLocaleString()} failed`}
          />
          <HighlightMetric
            label="Success rate"
            value={totalAttempts > 0 ? formatPercent(successRate) : "--"}
            detail={totalAttempts > 0 ? "Delivery quality across routed requests" : "Waiting for request traffic"}
          />
          <HighlightMetric
            label="Avg latency"
            value={hasLatencySamples ? formatLatency(usageSnapshot.data.latencySummary.averageMs) : "--"}
            detail={hasLatencySamples
              ? `P95 ${formatLatency(usageSnapshot.data.latencySummary.p95Ms)}`
              : "Latency appears after requests are persisted"}
          />
          <HighlightMetric
            label="Tokens (7d)"
            value={formatCompactNumber(totals.totalTokens)}
            detail={`Input ${formatCompactNumber(totals.inputTokens)} / Output ${formatCompactNumber(totals.outputTokens)}`}
          />
        </div>

        <div className="mt-4 grid gap-3 xl:grid-cols-2">
          <OverviewPanel
            kicker="Access footprint"
            title="Keys and provider ownership"
            description="Credential coverage and upstream connectivity grouped together."
          >
            <div className="grid grid-cols-2 gap-2">
              <CompactDetailMetric
                label="Dashboard keys"
                value={apiKeyCount.toString()}
                detail="Issued from this dashboard"
              />
              <CompactDetailMetric
                label="Provider keys"
                value={providerKeyCount.toString()}
                detail="Claimed upstream ownerships"
              />
              <CompactDetailMetric
                label="OAuth accounts"
                value={oauthAccountCount.toString()}
                detail="Connected provider accounts"
              />
              <CompactDetailMetric
                label="Custom providers"
                value={customProviderCount.toString()}
                detail="OpenAI-compatible definitions"
              />
            </div>
          </OverviewPanel>

          <OverviewPanel
            kicker="Usage coverage"
            title="Persisted history snapshot"
            description="A compact read of dataset size, model coverage, and collector freshness."
          >
            <div className="grid grid-cols-2 gap-2">
              <CompactDetailMetric
                label="Usage records"
                value={formatCompactNumber(usageRecordCount)}
                detail="Persisted history rows"
              />
              <CompactDetailMetric
                label="Tracked models"
                value={trackedModels.toString()}
                detail="Seen in the current window"
              />
              <CompactDetailMetric
                label="Top model"
                value={topModel ? topModel.requests.toLocaleString() : "--"}
                detail={topModel ? `${topModel.model} leads request volume` : "No model traffic recorded yet"}
              />
              <CompactDetailMetric
                label="Collector freshness"
                value={collectorLastSynced}
                detail="Latest persisted history sync"
              />
            </div>
          </OverviewPanel>
        </div>
      </section>

      <section id="usage-analytics" className="scroll-mt-6">
        <UsageAnalytics initialSnapshot={usageSnapshot} title="Usage intelligence" embedded />
      </section>
    </div>
  );
}
