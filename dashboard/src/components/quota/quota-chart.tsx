"use client";

import { RadialBarChart, RadialBar, ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, Legend, ReferenceLine } from "recharts";
import { ChartContainer, ChartEmpty, CHART_COLORS, TOOLTIP_STYLE, AXIS_TICK_STYLE } from "@/components/ui/chart-theme";
import { QUOTA_WARNING_THRESHOLD } from "@/hooks/notification-utils";
import type { ProviderSummary } from "@/app/dashboard/quota/quota-metrics";

interface QuotaChartProps {
  overallCapacity: { value: number; label: string; provider: string };
  providerSummaries: ProviderSummary[];
}

export function QuotaChart({ overallCapacity, providerSummaries }: QuotaChartProps) {
  return (
    <section className="grid grid-cols-1 gap-3 lg:grid-cols-2">
      <ChartContainer title="Overall Usable Capacity" subtitle="Weighted across healthy provider accounts">
        {providerSummaries.length === 0 ? (
          <ChartEmpty message="No provider data" />
        ) : (() => {
          const pct = Math.round(overallCapacity.value * 100);
          const gaugeColor =
            overallCapacity.value > 0.6
              ? CHART_COLORS.success
              : overallCapacity.value > 0.2
              ? CHART_COLORS.warning
              : CHART_COLORS.danger;
          const gaugeData = [{ value: pct, fill: gaugeColor }];
          return (
            <div className="relative flex h-48 items-center justify-center">
              <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={0} initialDimension={{ width: 320, height: 200 }}>
                <RadialBarChart
                  cx="50%"
                  cy="60%"
                  innerRadius="55%"
                  outerRadius="80%"
                  startAngle={210}
                  endAngle={-30}
                  data={[{ value: 100, fill: "rgba(148,163,184,0.1)" }, ...gaugeData]}
                  barSize={14}
                >
                  <RadialBar dataKey="value" background={false} cornerRadius={4} />
                </RadialBarChart>
              </ResponsiveContainer>
              <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
                <span className="text-3xl font-bold" style={{ color: gaugeColor }}>{pct}%</span>
                <span className="mt-0.5 text-[10px] uppercase tracking-widest" style={{ color: CHART_COLORS.text.dimmed }}>Usable</span>
              </div>
            </div>
          );
        })()}
      </ChartContainer>

      <ChartContainer title="Provider Usable Quota" subtitle="Effective usable quota with short-term headroom context">
        {providerSummaries.length === 0 ? (
          <ChartEmpty message="No provider data" />
        ) : (() => {
          const barData = providerSummaries.map((summary) => ({
            provider: summary.provider,
            effective: summary.effectiveCapacity === null ? null : Math.round(summary.effectiveCapacity * 100),
            shortTermHeadroom: summary.shortTermMin === null ? null : Math.round(summary.shortTermMin * 100),
            healthy: summary.healthyAccounts,
            total: summary.totalAccounts,
            issues: summary.errorAccounts,
            hasLongTermWindows: summary.hasLongTermWindows,
          }));
          return (
            <div className="h-48">
              <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={0} initialDimension={{ width: 320, height: 200 }}>
                <BarChart
                  data={barData}
                  layout="vertical"
                  margin={{ top: 4, right: 12, bottom: 4, left: 4 }}
                  barSize={8}
                  barGap={2}
                >
                  <XAxis
                    type="number"
                    domain={[0, 100]}
                    tick={AXIS_TICK_STYLE}
                    tickLine={false}
                    axisLine={{ stroke: CHART_COLORS.border }}
                    tickFormatter={(value) => `${value}%`}
                  />
                  <YAxis
                    type="category"
                    dataKey="provider"
                    tick={{ ...AXIS_TICK_STYLE, fontSize: 10 }}
                    tickLine={false}
                    axisLine={false}
                    width={72}
                  />
                  <ReferenceLine x={Math.round(QUOTA_WARNING_THRESHOLD * 100)} stroke={CHART_COLORS.rose} strokeDasharray="4 4" />
                  <Tooltip
                    {...TOOLTIP_STYLE}
                    formatter={(value, name, props) => {
                      if (value === null) return ["-", name];
                      const label = name === "effective" ? "Effective usable" : "Short-term headroom";
                      const effectiveExtra = ` (${props.payload.healthy}/${props.payload.total} healthy${props.payload.issues > 0 ? `, ${props.payload.issues} issues` : ""})`;
                      const shortTermExtra = name === "shortTermHeadroom"
                        && props.payload.hasLongTermWindows
                        && props.payload.effective !== null
                        && Number(value) > props.payload.effective
                        ? " (context only; gated by long-term)"
                        : "";
                      return [`${value}%${name === "effective" ? effectiveExtra : shortTermExtra}`, label];
                    }}
                  />
                  <Legend
                    verticalAlign="top"
                    height={24}
                    formatter={(value: string) => value === "effective" ? "Effective usable" : "Short-term headroom"}
                    wrapperStyle={{ fontSize: 10, color: CHART_COLORS.text.dimmed }}
                  />
                  <Bar dataKey="effective" radius={[0, 3, 3, 0]} fill={CHART_COLORS.success} />
                  <Bar dataKey="shortTermHeadroom" radius={[0, 3, 3, 0]} fill={CHART_COLORS.cyan} fillOpacity={0.7} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          );
        })()}
      </ChartContainer>
    </section>
  );
}
