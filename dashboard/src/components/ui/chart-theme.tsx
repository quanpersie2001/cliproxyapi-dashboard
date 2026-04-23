"use client";

/**
 * Shared chart theme configuration for Recharts.
 * Uses CSS variables so charts adapt with the active dashboard theme.
 */

export const CHART_COLORS = {
  primary: "var(--chart-primary)",
  primaryLight: "var(--chart-primary-light)",
  primaryDark: "var(--chart-primary-strong)",
  success: "var(--chart-success)",
  successLight: "var(--chart-success-light)",
  warning: "var(--chart-warning)",
  warningLight: "var(--chart-warning-light)",
  danger: "var(--chart-danger)",
  dangerLight: "var(--chart-danger-light)",
  cyan: "var(--chart-cyan)",
  cyanLight: "var(--chart-cyan-light)",
  violet: "var(--chart-violet)",
  violetLight: "var(--chart-violet-light)",
  rose: "var(--chart-rose)",
  roseLight: "var(--chart-rose-light)",
  orange: "var(--chart-orange)",
  orangeLight: "var(--chart-orange-light)",
  text: {
    primary: "var(--text-primary)",
    muted: "var(--text-secondary)",
    dimmed: "var(--text-muted)",
  },
  grid: "var(--chart-grid)",
  border: "var(--chart-border)",
  surface: "var(--chart-surface)",
  surfaceHover: "var(--chart-surface-hover)",
} as const;

export const SERIES_PALETTE = [
  CHART_COLORS.primary,
  CHART_COLORS.success,
  CHART_COLORS.warning,
  CHART_COLORS.violet,
  CHART_COLORS.cyan,
  CHART_COLORS.rose,
  CHART_COLORS.orange,
  CHART_COLORS.primaryDark,
] as const;

export const AXIS_TICK_STYLE = {
  fill: CHART_COLORS.text.dimmed,
  fontSize: 10,
  fontFamily: "var(--font-geist-sans), system-ui, sans-serif",
} as const;

export const TOOLTIP_STYLE = {
  contentStyle: {
    backgroundColor: "var(--chart-surface)",
    border: "1px solid var(--chart-border)",
    borderRadius: "6px",
    padding: "8px 12px",
  },
  labelStyle: {
    color: CHART_COLORS.text.primary,
    fontSize: "11px",
    fontWeight: 600,
    marginBottom: "4px",
  },
  itemStyle: {
    color: CHART_COLORS.text.muted,
    fontSize: "11px",
    padding: "1px 0",
  },
  cursor: { fill: "var(--chart-cursor)" },
} as const;

export function formatCompact(value: number): string {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(1)}K`;
  return value.toLocaleString();
}

export function formatDateShort(dateStr: string): string {
  const d = new Date(dateStr + "T00:00:00");
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export function ChartContainer({
  children,
  title,
  subtitle,
  className = "",
}: {
  children: React.ReactNode;
  title?: string;
  subtitle?: string;
  className?: string;
}) {
  return (
    <div className={`dashboard-card-surface w-full min-w-0 p-4 ${className}`}>
      {(title || subtitle) && (
        <div className="mb-3">
          {title && (
            <h3 className="dashboard-kicker">
              {title}
            </h3>
          )}
          {subtitle && (
            <p className="mt-1 text-[11px] leading-5 text-[var(--text-muted)]">{subtitle}</p>
          )}
        </div>
      )}
      {children}
    </div>
  );
}

export function ChartEmpty({ message = "No data available" }: { message?: string }) {
  return (
    <div className="dashboard-card-surface dashboard-card-surface--muted flex h-48 items-center justify-center">
      <p className="text-xs text-[var(--text-muted)]">{message}</p>
    </div>
  );
}
