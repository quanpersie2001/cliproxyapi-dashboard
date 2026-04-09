import Link from "next/link";
import { redirect } from "next/navigation";
import { Badge } from "@/components/ui/badge";
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
      className="rounded-lg border border-[var(--surface-border)] bg-[var(--surface-base)] p-4 transition-colors hover:border-[var(--surface-border-strong)] hover:bg-[var(--surface-hover)]"
    >
      <div className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--text-muted)]">
        {label}
      </div>
      <div className="mt-2 text-2xl font-semibold tracking-tight text-[var(--text-primary)]">
        {value}
      </div>
      <div className="mt-1 text-sm text-[var(--text-muted)]">{detail}</div>
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

  return (
    <div className="space-y-6">
      <section className="rounded-lg border border-[var(--surface-border)] bg-[var(--surface-base)] p-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h1 className="text-xl font-semibold tracking-tight text-[var(--text-primary)]">
              Proxy Control Plane
            </h1>
            <p className="mt-1 text-sm text-[var(--text-muted)]">
              Manage API keys, upstream providers, runtime settings, and usage for the proxy only.
            </p>
          </div>
          <Badge
            tone={managementHealthy ? "success" : "warning"}
            className="px-3 py-1.5 text-xs font-semibold"
          >
            {proxyStatusLabel}
          </Badge>
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

      <section className="rounded-lg border border-[var(--surface-border)] bg-[var(--surface-base)] p-4">
        <h2 className="text-sm font-semibold text-[var(--text-primary)]">Quick Actions</h2>
        <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          <Link className="rounded-md border border-[var(--surface-border)] px-3 py-2 text-sm text-[var(--text-primary)] transition-colors hover:bg-[var(--surface-muted)]" href="/dashboard/providers">
            Connect or manage providers
          </Link>
          <Link className="rounded-md border border-[var(--surface-border)] px-3 py-2 text-sm text-[var(--text-primary)] transition-colors hover:bg-[var(--surface-muted)]" href="/dashboard/api-keys">
            Create dashboard API keys
          </Link>
          <Link className="rounded-md border border-[var(--surface-border)] px-3 py-2 text-sm text-[var(--text-primary)] transition-colors hover:bg-[var(--surface-muted)]" href="/dashboard/config">
            Tune proxy runtime settings
          </Link>
          <Link className="rounded-md border border-[var(--surface-border)] px-3 py-2 text-sm text-[var(--text-primary)] transition-colors hover:bg-[var(--surface-muted)]" href="/dashboard/usage">
            Review usage history
          </Link>
          <Link className="rounded-md border border-[var(--surface-border)] px-3 py-2 text-sm text-[var(--text-primary)] transition-colors hover:bg-[var(--surface-muted)]" href="/dashboard/quota">
            Check provider quota
          </Link>
          <Link className="rounded-md border border-[var(--surface-border)] px-3 py-2 text-sm text-[var(--text-primary)] transition-colors hover:bg-[var(--surface-muted)]" href="/dashboard/settings">
            System settings
          </Link>
        </div>
      </section>

      <section className="rounded-lg border border-[var(--surface-border)] bg-[var(--surface-muted)] p-4 text-sm text-[var(--text-secondary)]">
        The dashboard UI now focuses on proxy management, provider connections, usage, quota, and system settings.
      </section>
    </div>
  );
}
