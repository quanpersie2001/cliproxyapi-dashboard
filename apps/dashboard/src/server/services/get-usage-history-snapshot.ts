import "server-only";
import {
  getUsageHistorySnapshot as getUsageHistorySnapshotFromStore,
  type UsageHistorySnapshot,
} from "@/lib/usage/history";
import { getUtcDayRange } from "@/lib/usage/dashboard-window";

export interface UsageHistorySnapshotInput {
  userId: string;
  fromDate: Date;
  toDate: Date;
  fromParam?: string;
  toParam?: string;
}

export async function loadUsageHistorySnapshot(
  input: UsageHistorySnapshotInput
): Promise<UsageHistorySnapshot> {
  return getUsageHistorySnapshotFromStore(input);
}

export async function loadRecentUsageHistorySnapshot(
  userId: string,
  days: number
): Promise<UsageHistorySnapshot> {
  const range = getUtcDayRange(days);

  return getUsageHistorySnapshotFromStore({
    userId,
    fromDate: range.fromDate,
    toDate: range.toDate,
    fromParam: range.fromParam,
    toParam: range.toParam,
  });
}
