"use client";

import {
  Area,
  AreaChart,
  ResponsiveContainer,
  Tooltip,
} from "recharts";
import {
  CHART_COLORS,
  formatCompact,
  TOOLTIP_STYLE,
} from "@/components/ui/chart-theme";

interface DailyPoint {
  date: string;
  requests: number;
  tokens: number;
  success: number;
  failure: number;
}

interface Totals {
  totalRequests: number;
  totalTokens: number;
  successCount: number;
  failureCount: number;
}

interface DashboardMiniChartsProps {
  dailyBreakdown?: DailyPoint[];
  totals: Totals;
}

interface MiniSparkPoint extends DailyPoint {
  successRate: number;
}

export function DashboardMiniCharts({
  dailyBreakdown,
  totals,
}: DashboardMiniChartsProps) {
  const safeDaily = (dailyBreakdown ?? []).map((point) => {
    const total = point.success + point.failure;
    return {
      ...point,
      successRate: total > 0 ? (point.success / total) * 100 : 0,
    } satisfies MiniSparkPoint;
  });

  if (safeDaily.length < 2) {
    return null;
  }

  const totalRequests = totals.totalRequests ?? 0;
  const totalTokens = totals.totalTokens ?? 0;
  const total = (totals.successCount ?? 0) + (totals.failureCount ?? 0);
  const successRate = total > 0 ? ((totals.successCount ?? 0) / total) * 100 : 0;

  return (
    <div className="grid grid-cols-1 gap-2 md:grid-cols-2 xl:grid-cols-3">
      <MiniSparkCard
        label="Requests (7d)"
        value={formatCompact(totalRequests)}
        data={safeDaily}
        dataKey="requests"
        color={CHART_COLORS.primary}
        gradientId="reqGrad"
      />
      <MiniSparkCard
        label="Tokens (7d)"
        value={formatCompact(totalTokens)}
        data={safeDaily}
        dataKey="tokens"
        color={CHART_COLORS.cyan}
        gradientId="tokGrad"
      />
      <MiniSparkCard
        label="Success Rate (7d)"
        value={`${successRate.toFixed(1)}%`}
        data={safeDaily}
        dataKey="successRate"
        color={CHART_COLORS.success}
        gradientId="sucGrad"
      />
    </div>
  );
}

function MiniSparkCard({
  label,
  value,
  data,
  dataKey,
  color,
  gradientId,
}: {
  label: string;
  value: string;
  data: MiniSparkPoint[];
  dataKey: keyof MiniSparkPoint;
  color: string;
  gradientId: string;
}) {
  return (
    <div className="dashboard-card-surface px-3 py-2">
      <div className="flex items-center justify-between">
        <div>
          <p className="dashboard-kicker">
            {label}
          </p>
          <p className="dashboard-metric-value mt-1 text-sm font-semibold">
            {value}
          </p>
        </div>
      </div>
      <div className="mt-1.5 h-10" role="img" aria-label={`${label}: ${value}`}>
        <ResponsiveContainer
          width="100%"
          height="100%"
          minWidth={0}
          minHeight={0}
          initialDimension={{ width: 320, height: 200 }}
        >
          <AreaChart data={data} margin={{ top: 2, right: 2, left: 2, bottom: 0 }}>
            <defs>
              <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={color} stopOpacity={0.3} />
                <stop offset="100%" stopColor={color} stopOpacity={0} />
              </linearGradient>
            </defs>
            <Tooltip
              contentStyle={TOOLTIP_STYLE.contentStyle}
              labelStyle={TOOLTIP_STYLE.labelStyle}
              itemStyle={TOOLTIP_STYLE.itemStyle}
              formatter={(val) => [formatCompact(Number(val ?? 0)), label.split(" ")[0]]}
              labelFormatter={(_label, payload) => {
                const dateStr = payload?.[0]?.payload?.date;
                if (!dateStr) return "";
                const date = new Date(`${String(dateStr)}T00:00:00`);
                return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
              }}
            />
            <Area
              type="monotone"
              dataKey={dataKey}
              stroke={color}
              strokeWidth={1.5}
              fill={`url(#${gradientId})`}
              dot={false}
              activeDot={{ r: 3, fill: color, strokeWidth: 0 }}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
