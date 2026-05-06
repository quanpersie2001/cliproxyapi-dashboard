import { redirect } from "next/navigation";
import { UsageAnalytics } from "@/features/usage/components/usage-analytics";
import { loadModelPricing } from "@/features/usage/model-pricing";
import { verifySession } from "@/lib/auth/session";
import { loadRecentUsageHistorySnapshot } from "@/server/usage/services/get-usage-history-snapshot";
import { headers } from "next/headers";

export default async function UsagePage() {
  const session = await verifySession();
  if (!session) {
    redirect("/login");
  }

  const headerStore = await headers();
  const host = headerStore.get("x-forwarded-host") ?? headerStore.get("host");
  const proto = headerStore.get("x-forwarded-proto") ?? "http";
  const baseUrl = host ? `${proto}://${host}` : undefined;

  const usageSnapshot = await loadRecentUsageHistorySnapshot(session.userId, 7);
  const initialModelPricing = (await loadModelPricing(baseUrl, {
    headers: {
      cookie: headerStore.get("cookie") ?? "",
    },
  })) ?? [];

  return (
    <div className="space-y-6">
      <UsageAnalytics
        initialSnapshot={usageSnapshot}
        initialModelPricing={initialModelPricing}
        title="Usage analytics"
      />
    </div>
  );
}
