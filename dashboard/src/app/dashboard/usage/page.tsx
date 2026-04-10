import { redirect } from "next/navigation";
import { UsageAnalytics } from "@/features/usage/components/usage-analytics";
import { verifySession } from "@/lib/auth/session";
import { loadRecentUsageHistorySnapshot } from "@/server/usage/services/get-usage-history-snapshot";

export default async function UsagePage() {
  const session = await verifySession();
  if (!session) {
    redirect("/login");
  }

  const usageSnapshot = await loadRecentUsageHistorySnapshot(session.userId, 7);

  return (
    <div className="space-y-6">
      <UsageAnalytics initialSnapshot={usageSnapshot} title="Usage analytics" />
    </div>
  );
}
