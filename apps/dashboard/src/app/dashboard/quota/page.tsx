"use client";

import dynamic from "next/dynamic";
import { Button } from "@/components/ui/button";
import { HelpTooltip } from "@/components/ui/tooltip";
import { QuotaDetails } from "@/components/quota/quota-details";
import { QUOTA_WARNING_THRESHOLD } from "@/hooks/notification-utils";
import { API_ENDPOINTS } from "@/lib/api-endpoints";
import { useEffect, useState } from "react";
import {
  calcOverallCapacity,
  calcProviderSummary,
  countLowCapacityProviders,
  type QuotaAccount,
  type QuotaResponse,
} from "./quota-metrics";

const QuotaChart = dynamic(
  () => import("@/components/quota/quota-chart").then(mod => ({ default: mod.QuotaChart })),
  { ssr: false, loading: () => <div className="h-64 animate-pulse rounded-lg bg-[var(--surface-muted)]" /> }
);

const PROVIDERS = {
  ALL: "all",
  ANTIGRAVITY: "antigravity",
  CLAUDE: "claude",
  CODEX: "codex",
  GEMINI_CLI: "gemini-cli",
} as const;

type ProviderType = (typeof PROVIDERS)[keyof typeof PROVIDERS];

export default function QuotaPage() {
  const [quotaData, setQuotaData] = useState<QuotaResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedProvider, setSelectedProvider] = useState<ProviderType>(PROVIDERS.ALL);

  const fetchQuota = async (signal?: AbortSignal) => {
    setLoading(true);
    try {
      const res = await fetch(API_ENDPOINTS.QUOTA.BASE, { signal });
      if (res.ok) {
        const data = await res.json();
        setQuotaData(data);
      }
    } catch {
      if (signal?.aborted) return;
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  };

  useEffect(() => {
    const controller = new AbortController();
    fetchQuota(controller.signal);
    const interval = setInterval(() => fetchQuota(controller.signal), 120_000);
    return () => {
      controller.abort();
      clearInterval(interval);
    };
  }, []);

  const filteredAccounts = quotaData?.accounts.filter((account) => {
    if (selectedProvider === PROVIDERS.ALL) return true;
    if (selectedProvider === PROVIDERS.GEMINI_CLI) {
      return account.provider === "gemini" || account.provider === "gemini-cli";
    }
    return account.provider === selectedProvider;
  }) || [];

  const activeAccounts = filteredAccounts.filter((account) => account.supported && !account.error).length;

  const providerGroups = new Map<string, QuotaAccount[]>();
  for (const account of filteredAccounts) {
    const existing = providerGroups.get(account.provider) ?? [];
    existing.push(account);
    providerGroups.set(account.provider, existing);
  }

  const providerSummaries = Array.from(providerGroups.entries())
    .map(([, accounts]) => calcProviderSummary(accounts))
    .sort((a, b) => b.healthyAccounts - a.healthyAccounts);

  const overallCapacity = calcOverallCapacity(providerSummaries);

  const lowCapacityCount = countLowCapacityProviders(providerSummaries);

  const providerFilters = [
    { key: PROVIDERS.ALL, label: "All" },
    { key: PROVIDERS.ANTIGRAVITY, label: "Antigravity" },
    { key: PROVIDERS.CLAUDE, label: "Claude" },
    { key: PROVIDERS.CODEX, label: "Codex" },
    { key: PROVIDERS.GEMINI_CLI, label: "Gemini CLI" },
  ] as const;

  return (
    <div className="space-y-4">
      <section className="rounded-lg border border-[var(--surface-border)] bg-[var(--surface-base)] p-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h1 className="text-xl font-semibold tracking-tight text-[var(--text-primary)]">Quota</h1>
            <p className="mt-1 text-sm text-[var(--text-muted)]">Monitor OAuth account quotas and usage windows.</p>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
            <div className="flex flex-wrap gap-1">
              {providerFilters.map((filter) => (
                <Button
                  key={filter.key}
                  variant={selectedProvider === filter.key ? "secondary" : "ghost"}
                  onClick={() => {
                    setSelectedProvider(filter.key);
                    if (filter.key !== PROVIDERS.ALL) {
                      setTimeout(() => {
                        document.getElementById("quota-accounts")?.scrollIntoView({ behavior: "smooth", block: "nearest" });
                      }, 50);
                    }
                  }}
                  className="px-2.5 py-1 text-xs"
                >
                  {filter.label}
                </Button>
              ))}
            </div>
            <Button onClick={fetchQuota} disabled={loading} className="px-2.5 py-1 text-xs">
              {loading ? "Loading..." : "Refresh"}
            </Button>
          </div>
        </div>
      </section>

      {loading && !quotaData ? (
        <div className="rounded-lg border border-[var(--surface-border)] bg-[var(--surface-base)] p-6 text-center text-sm text-[var(--text-muted)]">
          Loading quota data...
        </div>
      ) : (
        <>
          <section className="grid grid-cols-2 gap-2 lg:grid-cols-4">
            <div className="rounded-lg border border-[var(--surface-border)] bg-[var(--surface-base)] px-2.5 py-2">
              <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--text-muted)]">Active Accounts</p>
              <p className="mt-0.5 text-xs font-semibold text-[var(--text-primary)]">{activeAccounts}</p>
            </div>
            <div className="rounded-lg border border-[var(--surface-border)] bg-[var(--surface-base)] px-2.5 py-2">
              <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--text-muted)]">Overall Capacity <HelpTooltip content="Weighted average of provider effective usable quota across healthy accounts." /></p>
              <p className="mt-0.5 text-xs font-semibold text-[var(--text-primary)]">{Math.round(overallCapacity.value * 100)}%</p>
            </div>
            <div className="rounded-lg border border-[var(--surface-border)] bg-[var(--surface-base)] px-2.5 py-2">
              <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--text-muted)]">Low Capacity <HelpTooltip content={`Providers whose effective usable quota is below ${Math.round(QUOTA_WARNING_THRESHOLD * 100)}%.`} /></p>
              <p className="mt-0.5 text-xs font-semibold text-[var(--text-primary)]">{lowCapacityCount}</p>
            </div>
            <div className="rounded-lg border border-[var(--surface-border)] bg-[var(--surface-base)] px-2.5 py-2">
              <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--text-muted)]">Providers</p>
              <p className="mt-0.5 text-xs font-semibold text-[var(--text-primary)]">{providerSummaries.length}</p>
            </div>
          </section>

          <QuotaChart overallCapacity={overallCapacity} providerSummaries={providerSummaries} />

          <QuotaDetails
            filteredAccounts={filteredAccounts}
            loading={loading}
          />
        </>
      )}
    </div>
  );
}
