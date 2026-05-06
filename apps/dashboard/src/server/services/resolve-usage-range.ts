import "server-only";
import { isValidUsageHistoryDateParam } from "@/lib/usage/history";

export type UsageWindow = "7h" | "24h" | "7d" | "all";

export interface UsageHistoryRange {
  fromDate: Date;
  toDate: Date;
  fromParam: string;
  toParam: string;
}

export function isUsageWindow(value: string | null): value is UsageWindow {
  return value === "7h" || value === "24h" || value === "7d" || value === "all";
}

export function buildUsageWindowRange(window: UsageWindow): UsageHistoryRange {
  const now = new Date();
  const toDate = new Date(now);
  let fromDate: Date;

  switch (window) {
    case "7h":
      fromDate = new Date(now.getTime() - 7 * 60 * 60 * 1000);
      break;
    case "24h":
      fromDate = new Date(now.getTime() - 24 * 60 * 60 * 1000);
      break;
    case "7d":
      fromDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      break;
    case "all":
      fromDate = new Date("2020-01-01T00:00:00.000Z");
      break;
  }

  return {
    fromDate,
    toDate,
    fromParam: fromDate.toISOString().slice(0, 10),
    toParam: toDate.toISOString().slice(0, 10),
  };
}

export type ExplicitUsageRangeResult =
  | { ok: true; range: UsageHistoryRange }
  | { ok: false; error: "missing_fields" | "invalid_format" | "invalid_order" };

export function buildExplicitUsageRange(
  fromParam: string | null,
  toParam: string | null
): ExplicitUsageRangeResult {
  if (!fromParam || !toParam) {
    return { ok: false, error: "missing_fields" };
  }

  if (!isValidUsageHistoryDateParam(fromParam) || !isValidUsageHistoryDateParam(toParam)) {
    return { ok: false, error: "invalid_format" };
  }

  const fromDate = new Date(`${fromParam}T00:00:00.000Z`);
  const toDate = new Date(`${toParam}T23:59:59.999Z`);

  if (fromDate > toDate) {
    return { ok: false, error: "invalid_order" };
  }

  return {
    ok: true,
    range: {
      fromDate,
      toDate,
      fromParam,
      toParam,
    },
  };
}
