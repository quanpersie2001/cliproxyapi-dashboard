"use client";

import { getOAuthProviderPresentation, OAuthProviderIcon } from "@/components/providers/oauth-provider-meta";
import { Badge, type BadgeTone } from "@/components/ui/badge";
import { AlertSurface } from "@/components/ui/alert-surface";
import { cn } from "@/lib/utils";

interface QuotaModel {
  id: string;
  displayName: string;
  remainingFraction?: number | null;
  resetTime: string | null;
}

interface QuotaGroup {
  id: string;
  label: string;
  remainingFraction?: number | null;
  resetTime: string | null;
  models: QuotaModel[];
}

interface QuotaAccount {
  auth_index: string;
  provider: string;
  email?: string | null;
  supported: boolean;
  plan?: string | null;
  error?: string;
  groups?: QuotaGroup[];
  raw?: unknown;
}

function normalizeFraction(value: unknown): number | null {
  if (typeof value !== "number" || Number.isNaN(value) || !Number.isFinite(value)) {
    return null;
  }
  if (value < 0) return 0;
  if (value > 1) return 1;
  return value;
}

function maskEmail(email: unknown): string {
  if (typeof email !== "string") return "Email not exposed by provider";
  const trimmed = email.trim();
  if (trimmed === "") return "Email not exposed by provider";

  const atIndex = trimmed.indexOf("@");
  if (atIndex <= 0 || atIndex === trimmed.length - 1) {
    return trimmed;
  }

  const local = trimmed.slice(0, atIndex);
  const domain = trimmed.slice(atIndex + 1);
  const maskedLocal = local.length <= 3 ? `${local}***` : `${local.slice(0, 3)}***`;
  return `${maskedLocal}@${domain}`;
}

function formatRelativeTime(isoDate: string | null): string {
  if (!isoDate) return "Reset time unknown";

  try {
    const resetDate = new Date(isoDate);
    if (Number.isNaN(resetDate.getTime())) return "Reset time unknown";
    const now = new Date();
    const diffMs = resetDate.getTime() - now.getTime();

    if (diffMs <= 0) return "Resetting now";

    const days = Math.floor(diffMs / (1000 * 60 * 60 * 24));
    const hours = Math.floor((diffMs % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
    const minutes = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));

    if (days > 0) {
      return `Resets in ${days}d ${hours}h`;
    }
    if (hours > 0) {
      return `Resets in ${hours}h ${minutes}m`;
    }
    return `Resets in ${minutes}m`;
  } catch {
    return "Reset time unknown";
  }
}

function isShortTermGroup(group: QuotaGroup): boolean {
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

function getCapacityBarClass(value: number): string {
  if (value > 0.6) return "bg-emerald-500/80";
  if (value > 0.2) return "bg-amber-500";
  return "bg-rose-500/80";
}

function getCapacityTone(value: number | null): BadgeTone {
  if (value === null) return "neutral";
  if (value > 0.6) return "success";
  if (value > 0.2) return "warning";
  return "danger";
}

function getStatusMeta(account: QuotaAccount): { label: string; tone: BadgeTone; title: string } {
  if (account.error) {
    return {
      label: "Error",
      tone: "danger",
      title: account.error,
    };
  }

  if (!account.supported) {
    return {
      label: "Unsupported",
      tone: "warning",
      title: "Quota monitoring not available for this provider.",
    };
  }

  return {
    label: "Active",
    tone: "success",
    title: "Quota monitoring is active.",
  };
}

function formatPercent(value: number | null): string {
  return value === null ? "N/A" : `${Math.round(value * 100)}%`;
}

function titleCaseWords(value: string): string {
  return value.replace(/\b\w/g, (char) => char.toUpperCase());
}

function formatGenericPlanLabel(value: string): string {
  const normalized = value
    .replace(/^plan[_-]?/i, "")
    .replace(/[_-]+/g, " ")
    .trim();

  return normalized ? titleCaseWords(normalized) : titleCaseWords(value);
}

function formatPlanLabel(account: QuotaAccount): string | null {
  if (typeof account.plan !== "string") {
    return null;
  }

  const normalizedPlan = account.plan.trim().toLowerCase();
  if (!normalizedPlan) {
    return null;
  }

  const provider = account.provider.trim().toLowerCase();

  if (provider === "codex") {
    if (normalizedPlan === "plus") return "Plus";
    if (normalizedPlan === "team") return "Team";
    if (normalizedPlan === "free") return "Free";
    if (normalizedPlan === "pro") return "Pro";
    return formatGenericPlanLabel(normalizedPlan);
  }

  if (provider === "claude") {
    if (normalizedPlan === "plan_free") return "Free";
    if (normalizedPlan === "plan_pro") return "Pro";
    if (normalizedPlan === "plan_max") return "Max";
    if (normalizedPlan === "plan_max5") return "Max 5x";
    if (normalizedPlan === "plan_max20") return "Max 20x";
    return formatGenericPlanLabel(normalizedPlan);
  }

  return formatGenericPlanLabel(normalizedPlan);
}

function getPlanTone(account: QuotaAccount): BadgeTone {
  const normalizedPlan = typeof account.plan === "string" ? account.plan.trim().toLowerCase() : "";

  if (!normalizedPlan) {
    return "neutral";
  }

  if (normalizedPlan.includes("free")) {
    return "neutral";
  }

  if (normalizedPlan.includes("pro") || normalizedPlan.includes("plus") || normalizedPlan.includes("team")) {
    return "info";
  }

  if (normalizedPlan.includes("max")) {
    return "success";
  }

  return "neutral";
}

interface QuotaDetailsProps {
  filteredAccounts: QuotaAccount[];
  loading: boolean;
}

export function QuotaDetails({ filteredAccounts, loading }: QuotaDetailsProps) {
  return (
    <section id="quota-accounts" className="scroll-mt-24 space-y-2">
      <div className="rounded-xl border border-[var(--surface-border)] bg-[var(--surface-base)] p-4">
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <h2 className="text-xs font-semibold uppercase tracking-[0.08em] text-[var(--text-muted)]">Accounts</h2>
            <p className="mt-1 text-sm text-[var(--text-secondary)]">
              Detailed quota windows for {filteredAccounts.length} account{filteredAccounts.length === 1 ? "" : "s"}.
            </p>
          </div>
          {loading && filteredAccounts.length > 0 ? (
            <Badge tone="neutral" size="xs" className="rounded-sm">
              Refreshing
            </Badge>
          ) : null}
        </div>

        {filteredAccounts.length > 0 ? (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
            {filteredAccounts.map((account) => {
              const trackedWindows = account.groups?.length ?? 0;
              const trackedModels = account.groups?.reduce((sum, group) => sum + group.models.length, 0) ?? 0;
              const status = getStatusMeta(account);
              const providerPresentation = getOAuthProviderPresentation(account.provider);
              const planLabel = formatPlanLabel(account);

              return (
                <div
                  key={account.auth_index}
                  className="overflow-hidden rounded-xl border border-[var(--surface-border)] bg-[var(--surface-base)] shadow-[var(--shadow-edge)] hover:border-[var(--surface-border-strong)]"
                  style={{
                    backgroundImage: `radial-gradient(circle at top left, ${providerPresentation.theme.bg} 0%, transparent 58%)`,
                  }}
                >
                  <div className="flex h-full flex-col gap-4 p-4">
                    <div className="flex min-w-0 items-start gap-3.5">
                      <OAuthProviderIcon
                        provider={account.provider}
                        size="md"
                        className="size-14 rounded-[1.125rem] border-[color:var(--surface-border)] bg-[var(--surface-base)] shadow-none"
                      />

                      <div className="min-w-0 flex-1 space-y-3">
                        <div className="space-y-1.5">
                          <div className="flex flex-wrap items-center gap-1.5">
                            <h4 className="text-base font-semibold tracking-tight text-[var(--text-primary)]">
                              {providerPresentation.name}
                            </h4>
                            <Badge
                              tone={status.tone}
                              size="xs"
                              dot
                              title={status.title}
                              className="rounded-sm"
                            >
                              {status.label}
                            </Badge>
                            {planLabel ? (
                              <Badge
                                tone={getPlanTone(account)}
                                size="xs"
                                className="rounded-sm"
                                title={`Detected plan: ${planLabel}`}
                              >
                                Plan: {planLabel}
                              </Badge>
                            ) : null}
                          </div>

                          <p className="truncate text-sm text-[var(--text-muted)]">{maskEmail(account.email)}</p>
                        </div>

                        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-[var(--text-muted)]">
                          <span>
                            <span className="mr-1 font-medium tracking-[0.06em] text-[var(--text-secondary)]">
                              auth.
                            </span>
                            {account.auth_index}
                          </span>
                          <span>
                            <span className="mr-1 font-medium tracking-[0.06em] text-[var(--text-secondary)]">
                              windows.
                            </span>
                            {trackedWindows}
                          </span>
                          <span>
                            <span className="mr-1 font-medium tracking-[0.06em] text-[var(--text-secondary)]">
                              models.
                            </span>
                            {trackedModels}
                          </span>
                        </div>
                      </div>
                    </div>

                    {account.error ? (
                      <AlertSurface tone="danger" className="px-3 py-2 text-xs">
                        {account.error}
                      </AlertSurface>
                    ) : !account.supported ? (
                      <AlertSurface tone="warning" className="px-3 py-2 text-xs">
                        Quota monitoring not available for this provider.
                      </AlertSurface>
                    ) : null}

                    <div className="mt-auto space-y-2 border-t border-[var(--surface-border)] pt-3">
                      <div>
                        <p className="text-[11px] font-medium uppercase tracking-[0.08em] text-[var(--text-muted)]">
                          Quota windows
                        </p>
                        <p className="mt-1 text-sm text-[var(--text-secondary)]">
                          Detailed window breakdown for this account.
                        </p>
                      </div>

                      {account.groups && account.groups.length > 0 ? (
                        <div className="space-y-2">
                          {account.groups.map((group) => {
                            const fraction = normalizeFraction(group.remainingFraction);
                            const percentage = fraction === null ? null : Math.round(fraction * 100);

                            return (
                              <div
                                key={group.id}
                                className="rounded-lg border border-[var(--surface-border)] bg-[var(--surface-base)]/70 px-3 py-2.5"
                              >
                                <div className="flex items-start justify-between gap-3">
                                  <div className="min-w-0">
                                    <p className="truncate text-xs font-medium text-[var(--text-primary)]">
                                      {group.label}
                                    </p>
                                    <p className="mt-1 text-[11px] text-[var(--text-muted)]">
                                      {formatRelativeTime(group.resetTime)}
                                    </p>
                                  </div>

                                  <div className="flex shrink-0 items-center gap-1.5">
                                    <Badge
                                      tone={isShortTermGroup(group) ? "info" : "neutral"}
                                      size="xs"
                                      className="rounded-sm"
                                    >
                                      {isShortTermGroup(group) ? "Short-term" : "Long-term"}
                                    </Badge>
                                    <Badge tone={getCapacityTone(fraction)} size="xs" className="rounded-sm">
                                      {formatPercent(fraction)}
                                    </Badge>
                                  </div>
                                </div>

                                <span className="mt-3 block h-1.5 w-full overflow-hidden rounded-full bg-[var(--surface-muted)]">
                              <span
                                  className={cn(
                                    "block h-full transition-[width] duration-300",
                                    fraction === null ? "bg-[var(--surface-border)]" : getCapacityBarClass(fraction)
                                  )}
                                  style={{ width: fraction === null ? "18%" : `${percentage}%` }}
                                />
                              </span>
                            </div>
                          );
                        })}
                        </div>
                      ) : (
                        <div className="rounded-lg border border-[var(--surface-border)] bg-[var(--surface-base)]/70 px-3 py-2.5 text-xs text-[var(--text-muted)]">
                          No quota windows returned for this account.
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        ) : !loading ? (
          <div className="p-2 text-center text-sm text-[var(--text-muted)]">
            No accounts found for the selected filter.
          </div>
        ) : null}
      </div>
    </section>
  );
}
