"use client";

import { useHealthStatus } from "@/hooks/use-health-status";

const LATENCY_TONE_STYLES = {
  success: {
    dot: { backgroundColor: "var(--state-success-accent)" },
    text: { color: "var(--state-success-accent)" },
  },
  warning: {
    dot: { backgroundColor: "var(--state-warning-accent)" },
    text: { color: "var(--state-warning-accent)" },
  },
  danger: {
    dot: { backgroundColor: "var(--state-danger-accent)" },
    text: { color: "var(--state-danger-accent)" },
  },
} as const;

function getLatencyTone(ms: number) {
  if (ms < 100) return "success" as const;
  if (ms < 300) return "warning" as const;
  return "danger" as const;
}

export function LatencyIndicator() {
  const { latencyMs } = useHealthStatus();

  if (latencyMs === null) return null;

  if (latencyMs === -1) {
    return (
      <div className="flex items-center gap-1.5" title="Proxy unreachable">
        <div className="h-1.5 w-1.5 rounded-full" style={LATENCY_TONE_STYLES.danger.dot} />
        <span className="text-xs" style={LATENCY_TONE_STYLES.danger.text}>--ms</span>
      </div>
    );
  }

  const tone = getLatencyTone(latencyMs);

  return (
    <div className="flex items-center gap-1.5" title={`Latency: ${latencyMs}ms`}>
      <div className="h-1.5 w-1.5 rounded-full" style={LATENCY_TONE_STYLES[tone].dot} />
      <span className="text-xs tabular-nums" style={LATENCY_TONE_STYLES[tone].text}>{latencyMs}ms</span>
    </div>
  );
}
