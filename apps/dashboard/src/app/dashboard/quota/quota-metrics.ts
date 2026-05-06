import { QUOTA_WARNING_THRESHOLD } from "@/lib/hooks/notification-utils";

export interface QuotaModel {
  id: string;
  displayName: string;
  remainingFraction?: number | null;
  resetTime: string | null;
}

export interface QuotaGroup {
  id: string;
  label: string;
  remainingFraction?: number | null;
  resetTime: string | null;
  models: QuotaModel[];
}

export interface QuotaAccount {
  auth_index: string;
  provider: string;
  email?: string | null;
  supported: boolean;
  plan?: string | null;
  error?: string;
  groups?: QuotaGroup[];
  raw?: unknown;
}

export interface QuotaResponse {
  accounts: QuotaAccount[];
}

export interface WindowCapacity {
  id: string;
  label: string;
  capacity: number;
  resetTime: string | null;
  isShortTerm: boolean;
}

export interface ProviderSummary {
  provider: string;
  totalAccounts: number;
  healthyAccounts: number;
  errorAccounts: number;
  windowCapacities: WindowCapacity[];
  longTermMin: number | null;
  shortTermMin: number | null;
  effectiveCapacity: number | null;
  hasLongTermWindows: boolean;
}

export function normalizeFraction(value: unknown): number | null {
  if (typeof value !== "number" || Number.isNaN(value) || !Number.isFinite(value)) {
    return null;
  }
  if (value < 0) return 0;
  if (value > 1) return 1;
  return value;
}

export function isShortTermGroup(group: QuotaGroup): boolean {
  const id = group.id.toLowerCase();
  const label = group.label.toLowerCase();
  return (
    id.includes("five-hour") ||
    id.includes("primary") ||
    id.includes("request") ||
    id.includes("token") ||
    label.includes("5h") ||
    label.includes("5m") ||
    label.includes("request") ||
    label.includes("token")
  );
}

function getMinCapacity(windows: WindowCapacity[]): number | null {
  if (windows.length === 0) {
    return null;
  }

  return Math.min(...windows.map((window) => window.capacity));
}

export function calcProviderSummary(accounts: QuotaAccount[]): ProviderSummary {
  const totalAccounts = accounts.length;
  const healthy = accounts.filter(
    (account) => account.supported && !account.error && account.groups && account.groups.length > 0
  );
  const errorAccounts = totalAccounts - healthy.length;

  const allWindowIds = new Set<string>();
  for (const account of healthy) {
    for (const group of account.groups ?? []) {
      if (group.id !== "extra-usage") allWindowIds.add(group.id);
    }
  }

  const windowCapacities: WindowCapacity[] = [];

  for (const windowId of allWindowIds) {
    const relevantAccounts = healthy.filter((account) =>
      account.groups?.some((group) => group.id === windowId)
    );
    if (relevantAccounts.length === 0) continue;

    const scores = relevantAccounts
      .map((account) => {
        const group = account.groups?.find((entry) => entry.id === windowId);
        return normalizeFraction(group?.remainingFraction);
      })
      .filter((score): score is number => score !== null);

    if (scores.length === 0) {
      continue;
    }

    const exhaustedProduct = scores.reduce((product, score) => product * (1 - score), 1);
    const capacity = 1 - exhaustedProduct;

    let earliestReset: string | null = null;
    let minResetTime = Infinity;
    let label = "";
    let shortTerm = false;

    for (const account of relevantAccounts) {
      const group = account.groups?.find((entry) => entry.id === windowId);
      if (!group) {
        continue;
      }

      if (!label) {
        label = group.label;
        shortTerm = isShortTermGroup(group);
      }

      if (!group.resetTime) {
        continue;
      }

      const resetTimestamp = new Date(group.resetTime).getTime();
      if (resetTimestamp < minResetTime) {
        minResetTime = resetTimestamp;
        earliestReset = group.resetTime;
      }
    }

    windowCapacities.push({
      id: windowId,
      label,
      capacity: Math.max(0, Math.min(1, capacity)),
      resetTime: earliestReset,
      isShortTerm: shortTerm,
    });
  }

  windowCapacities.sort((left, right) => {
    if (left.isShortTerm !== right.isShortTerm) return left.isShortTerm ? 1 : -1;
    return left.label.localeCompare(right.label);
  });

  const longTermWindows = windowCapacities.filter((window) => !window.isShortTerm);
  const shortTermWindows = windowCapacities.filter((window) => window.isShortTerm);
  const longTermMin = getMinCapacity(longTermWindows);
  const shortTermMin = getMinCapacity(shortTermWindows);

  return {
    provider: accounts[0]?.provider ?? "unknown",
    totalAccounts,
    healthyAccounts: healthy.length,
    errorAccounts,
    windowCapacities,
    longTermMin,
    shortTermMin,
    effectiveCapacity: longTermMin ?? shortTermMin,
    hasLongTermWindows: longTermWindows.length > 0,
  };
}

export function calcOverallCapacity(summaries: ProviderSummary[]): { value: number; label: string; provider: string } {
  if (summaries.length === 0) return { value: 0, label: "No Data", provider: "" };

  let weightedCapacity = 0;
  let weightedAccounts = 0;

  for (const summary of summaries) {
    if (summary.healthyAccounts === 0 || summary.effectiveCapacity === null) {
      continue;
    }

    weightedCapacity += summary.effectiveCapacity * summary.healthyAccounts;
    weightedAccounts += summary.healthyAccounts;
  }

  if (weightedAccounts === 0) {
    return { value: 0, label: "No Data", provider: "" };
  }

  return {
    value: weightedCapacity / weightedAccounts,
    label: "Weighted usable capacity",
    provider: "all",
  };
}

export function countLowCapacityProviders(
  summaries: ProviderSummary[],
  threshold: number = QUOTA_WARNING_THRESHOLD
): number {
  return summaries.filter(
    (summary) => summary.totalAccounts > 0 && summary.effectiveCapacity !== null && summary.effectiveCapacity < threshold
  ).length;
}
