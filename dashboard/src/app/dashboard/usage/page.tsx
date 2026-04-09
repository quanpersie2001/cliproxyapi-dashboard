import { redirect } from "next/navigation";
import { UsageAnalytics } from "@/components/usage/usage-analytics";
import { verifySession } from "@/lib/auth/session";
import { getUtcDayRange } from "@/lib/usage/dashboard-window";
import { getUsageHistorySnapshot } from "@/lib/usage/history";

export default async function UsagePage() {
  const session = await verifySession();
  if (!session) {
    redirect("/login");
  }

  const usageWindow = getUtcDayRange(7);
  const usageSnapshot = await getUsageHistorySnapshot({
    userId: session.userId,
    fromDate: usageWindow.fromDate,
    toDate: usageWindow.toDate,
    fromParam: usageWindow.fromParam,
    toParam: usageWindow.toParam,
  });

  return (
    <div className="space-y-6">
      <UsageAnalytics initialSnapshot={usageSnapshot} title="Usage analytics" />
    </div>
  );
}
