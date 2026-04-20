const METRIC_UNITS = ["", "K", "M", "B", "T"] as const;
const METRIC_DIVISORS = [1, 1_000, 1_000_000, 1_000_000_000, 1_000_000_000_000] as const;

export function formatMetricCompact(value: number): string {
  if (!Number.isFinite(value)) return "0";

  const sign = value < 0 ? "-" : "";
  const absoluteValue = Math.abs(value);

  if (absoluteValue < 1_000) {
    return `${sign}${absoluteValue.toLocaleString()}`;
  }

  let unitIndex = 0;
  while (unitIndex < METRIC_DIVISORS.length - 1 && absoluteValue >= METRIC_DIVISORS[unitIndex + 1]) {
    unitIndex += 1;
  }

  let scaledValue = absoluteValue / METRIC_DIVISORS[unitIndex];
  if (unitIndex < METRIC_UNITS.length - 1 && Number(scaledValue.toFixed(1)) >= 1_000) {
    unitIndex += 1;
    scaledValue = absoluteValue / METRIC_DIVISORS[unitIndex];
  }

  return `${sign}${scaledValue.toFixed(1)}${METRIC_UNITS[unitIndex]}`;
}
