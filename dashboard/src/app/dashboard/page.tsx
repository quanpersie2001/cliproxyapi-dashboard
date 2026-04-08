import Link from "next/link";
import { redirect } from "next/navigation";
import { verifySession } from "@/lib/auth/session";
import { prisma } from "@/lib/db";

interface StatCardProps {
  label: string;
  value: string;
  detail: string;
  href: string;
}

function StatCard({ label, value, detail, href }: StatCardProps) {
  return (
    <Link
      href={href}
      className="rounded-lg border border-[#e5e5e5] bg-white p-4 transition-colors hover:border-[#cfcfcf] hover:bg-[#fcfcfc]"
    >
      <div className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[#777169]">
        {label}
      </div>
      <div className="mt-2 text-2xl font-semibold tracking-tight text-black">
        {value}
      </div>
      <div className="mt-1 text-sm text-[#777169]">{detail}</div>
    </Link>
  );
}

async function getManagementHealthy(): Promise<boolean> {
  try {
    const baseUrl =
      process.env.CLIPROXYAPI_MANAGEMENT_URL ||
      "http://cliproxyapi:8317/v0/management";
    const root = baseUrl.replace(/\/v0\/management\/?$/, "/");
    const response = await fetch(root, { cache: "no-store" });
    await response.text();
    return response.ok;
  } catch {
    return false;
  }
}

export default async function DashboardOverviewPage() {
  const session = await verifySession();
  if (!session) {
    redirect("/login");
  }

  const [
    apiKeyCount,
    providerKeyCount,
    oauthAccountCount,
    customProviderCount,
    usageRecordCount,
    managementHealthy,
  ] = await Promise.all([
    prisma.userApiKey.count({ where: { userId: session.userId } }),
    prisma.providerKeyOwnership.count({ where: { userId: session.userId } }),
    prisma.providerOAuthOwnership.count({ where: { userId: session.userId } }),
    prisma.customProvider.count({ where: { userId: session.userId } }),
    prisma.usageRecord.count({ where: { userId: session.userId } }),
    getManagementHealthy(),
  ]);

  const proxyStatusLabel = managementHealthy ? "Proxy healthy" : "Proxy degraded";
  const proxyStatusTone = managementHealthy
    ? "bg-emerald-50 text-emerald-700 border-emerald-200"
    : "bg-amber-50 text-amber-700 border-amber-200";

  return (
    <div className="space-y-6">
      <section className="rounded-lg border border-[#e5e5e5] bg-white p-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h1 className="text-xl font-semibold tracking-tight text-black">
              Proxy Control Plane
            </h1>
            <p className="mt-1 text-sm text-[#777169]">
              Manage API keys, upstream providers, runtime settings, and usage for the proxy only.
            </p>
          </div>
          <div className={`rounded-full border px-3 py-1.5 text-xs font-semibold ${proxyStatusTone}`}>
            {proxyStatusLabel}
          </div>
        </div>
      </section>

      <section className="grid grid-cols-2 gap-2 lg:grid-cols-5">
        <StatCard
          label="API Keys"
          value={apiKeyCount.toString()}
          detail="Client credentials"
          href="/dashboard/api-keys"
        />
        <StatCard
          label="Provider Keys"
          value={providerKeyCount.toString()}
          detail="OAuth / API key ownership"
          href="/dashboard/providers"
        />
        <StatCard
          label="OAuth Accounts"
          value={oauthAccountCount.toString()}
          detail="Connected accounts"
          href="/dashboard/providers"
        />
        <StatCard
          label="Custom Providers"
          value={customProviderCount.toString()}
          detail="OpenAI-compatible upstreams"
          href="/dashboard/providers"
        />
        <StatCard
          label="Usage Records"
          value={usageRecordCount.toString()}
          detail="Collected request history"
          href="/dashboard/usage"
        />
      </section>

      <section className="rounded-lg border border-[#e5e5e5] bg-white p-4">
        <h2 className="text-sm font-semibold text-black">Quick Actions</h2>
        <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          <Link className="rounded-md border border-[#e5e5e5] px-3 py-2 text-sm text-black transition-colors hover:bg-[#f5f5f5]" href="/dashboard/providers">
            Connect or manage providers
          </Link>
          <Link className="rounded-md border border-[#e5e5e5] px-3 py-2 text-sm text-black transition-colors hover:bg-[#f5f5f5]" href="/dashboard/api-keys">
            Create dashboard API keys
          </Link>
          <Link className="rounded-md border border-[#e5e5e5] px-3 py-2 text-sm text-black transition-colors hover:bg-[#f5f5f5]" href="/dashboard/config">
            Tune proxy runtime settings
          </Link>
          <Link className="rounded-md border border-[#e5e5e5] px-3 py-2 text-sm text-black transition-colors hover:bg-[#f5f5f5]" href="/dashboard/usage">
            Review usage history
          </Link>
          <Link className="rounded-md border border-[#e5e5e5] px-3 py-2 text-sm text-black transition-colors hover:bg-[#f5f5f5]" href="/dashboard/quota">
            Check provider quota
          </Link>
          <Link className="rounded-md border border-[#e5e5e5] px-3 py-2 text-sm text-black transition-colors hover:bg-[#f5f5f5]" href="/dashboard/settings">
            System settings
          </Link>
        </div>
      </section>

      <section className="rounded-lg border border-[#e5e5e5] bg-[#fcfcfc] p-4 text-sm text-[#4e4e4e]">
        The dashboard UI now focuses on proxy management, provider connections, usage, quota, and system settings.
      </section>
    </div>
  );
}
