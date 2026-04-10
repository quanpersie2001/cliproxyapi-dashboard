"use client";

import type { ReactNode } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { OwnerBadge, type CurrentUserLike } from "@/components/providers/api-key-section";
import { getOAuthProviderPresentation, OAuthProviderIcon } from "@/components/providers/oauth-provider-meta";
import { cn } from "@/lib/utils";

interface OAuthAccountWithOwnership {
  id: string;
  accountName: string;
  accountEmail: string | null;
  provider: string;
  ownerUsername: string | null;
  ownerUserId: string | null;
  isOwn: boolean;
  status: "active" | "error" | "disabled" | string;
  statusMessage: string | null;
  unavailable: boolean;
  claimedAt: string | null;
  fileSizeBytes: number | null;
  modifiedAt: string | null;
}

export interface OAuthAccountUsageStats {
  successCount: number;
  failureCount: number;
}

interface OAuthCredentialListProps {
  accounts: OAuthAccountWithOwnership[];
  loading: boolean;
  statsLoading: boolean;
  accountStats: Record<string, OAuthAccountUsageStats>;
  currentUser: CurrentUserLike | null;
  togglingAccountId: string | null;
  claimingAccountName: string | null;
  downloadingAccountName: string | null;
  inspectingModelsAccountName: string | null;
  inspectingSettingsAccountName: string | null;
  onToggle: (accountId: string, currentlyDisabled: boolean) => void;
  onDelete: (accountId: string) => void;
  onClaim: (accountName: string) => void;
  onOpenModels: (account: OAuthAccountWithOwnership) => void;
  onDownload: (account: OAuthAccountWithOwnership) => void;
  onOpenSettings: (account: OAuthAccountWithOwnership) => void;
}

function parseStatusMessage(raw: string | null): string | null {
  if (!raw) {
    return null;
  }

  try {
    const parsed = JSON.parse(raw);
    if (parsed?.error?.message) {
      return parsed.error.message;
    }
    if (typeof parsed?.message === "string") {
      return parsed.message;
    }
    return raw;
  } catch {
    return raw;
  }
}

function formatCompactNumber(value: number): string {
  return value.toLocaleString();
}

function formatFileSize(value: number | null): string {
  if (value === null || Number.isNaN(value) || value < 0) {
    return "Unknown";
  }

  if (value < 1024) {
    return `${value} B`;
  }

  const units = ["KB", "MB", "GB", "TB"];
  let size = value / 1024;
  let unitIndex = 0;

  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024;
    unitIndex += 1;
  }

  return `${size >= 10 ? size.toFixed(0) : size.toFixed(1)} ${units[unitIndex]}`;
}

function formatModifiedAt(value: string | null): string {
  if (!value) {
    return "Unknown";
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "Unknown";
  }

  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

function OAuthStatusBadge({
  status,
  statusMessage,
  unavailable,
}: {
  status: string;
  statusMessage: string | null;
  unavailable: boolean;
}) {
  const message = parseStatusMessage(statusMessage);

  if (status === "active" && !unavailable) {
    return (
      <Badge tone="success" size="xs" dot title="Token is valid and working" className="rounded-sm">
        Active
      </Badge>
    );
  }

  if (status === "error" || unavailable) {
    return (
      <Badge
        tone="danger"
        size="xs"
        dot
        title={message || "Account has an error"}
        className="rounded-sm"
      >
        {message ? (message.length > 40 ? `${message.slice(0, 40)}…` : message) : "Error"}
      </Badge>
    );
  }

  if (status === "disabled") {
    return (
      <Badge tone="neutral" size="xs" dot title="Account is disabled" className="rounded-sm">
        Disabled
      </Badge>
    );
  }

  return null;
}

function ActionButton({
  title,
  label,
  icon,
  busy,
  disabled,
  iconOnly = false,
  tone = "default",
  onClick,
}: {
  title: string;
  label: string;
  icon: ReactNode;
  busy: boolean;
  disabled?: boolean;
  iconOnly?: boolean;
  tone?: "default" | "danger";
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      title={title}
      aria-label={label}
      disabled={disabled || busy}
      onClick={onClick}
      className={cn(
        "inline-flex items-center justify-center border text-[10px] font-medium transition-[background-color,border-color,color,transform,box-shadow] duration-200 active:translate-y-px disabled:cursor-not-allowed disabled:opacity-50",
        iconOnly ? "size-8 rounded-md px-0 py-0 shadow-[var(--shadow-edge)]" : "h-8 gap-1.5 rounded-md px-2.5",
        tone === "danger"
          ? "border-red-200 bg-red-50/80 text-red-600 hover:border-red-300 hover:bg-red-100 disabled:hover:border-red-200 disabled:hover:bg-red-50/80"
          : iconOnly
            ? "border-[var(--surface-border)] bg-[var(--surface-muted)] text-[var(--text-secondary)] hover:border-[var(--surface-border-strong)] hover:bg-[var(--surface-hover)] hover:text-[var(--text-primary)] disabled:hover:border-[var(--surface-border)] disabled:hover:bg-[var(--surface-muted)]"
            : "border-[var(--surface-border)] bg-[var(--surface-base)] text-[var(--text-primary)] hover:border-[var(--surface-border-strong)] hover:bg-[var(--surface-muted)] disabled:hover:border-[var(--surface-border)] disabled:hover:bg-[var(--surface-base)]"
      )}
    >
      <span
        className={cn(
          "flex items-center justify-center",
          "size-3.5",
          tone === "danger" ? "text-current" : "text-[var(--text-muted)]"
        )}
      >
        {busy ? <span className="size-3 rounded-full border border-current border-t-transparent animate-spin" /> : icon}
      </span>
      {iconOnly ? <span className="sr-only">{label}</span> : <span>{label}</span>}
    </button>
  );
}

function AccountToggle({
  enabled,
  disabled = false,
  onToggle,
}: {
  enabled: boolean;
  disabled?: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={enabled}
      aria-label={enabled ? "Disable account" : "Enable account"}
      onClick={onToggle}
      disabled={disabled}
      className={cn(
        "relative inline-flex h-6 w-11 shrink-0 rounded-full border p-0.5 transition-colors duration-200 ease-in-out focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/35 focus-visible:ring-offset-2 focus-visible:ring-offset-transparent disabled:cursor-not-allowed disabled:opacity-50",
        enabled
          ? "border-emerald-500/70 bg-emerald-500/90"
          : "border-[var(--surface-border)] bg-[var(--surface-muted)]"
      )}
    >
      <span
        className={cn(
          "pointer-events-none inline-block size-5 rounded-full bg-[var(--surface-base)] shadow-[var(--shadow-edge)] transition-transform duration-200 ease-in-out",
          enabled ? "translate-x-5" : "translate-x-0"
        )}
      />
    </button>
  );
}

function UsageBadge({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: "success" | "danger";
}) {
  return (
    <Badge tone={tone} size="xs" className="rounded-sm px-1.5 py-0.5">
      {label} {formatCompactNumber(value)}
    </Badge>
  );
}

function ModelsIcon() {
  return (
    <svg viewBox="0 0 16 16" fill="none" className="size-3.5">
      <path
        d="M2.75 4.25h10.5M2.75 8h10.5m-10.5 3.75h6.25"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
      />
    </svg>
  );
}

function DownloadIcon() {
  return (
    <svg viewBox="0 0 16 16" fill="none" className="size-3.5">
      <path
        d="M8 2.75v5.5m0 0 2.25-2.25M8 8.25 5.75 6m-1.5 4.5h7.5v1.25a.75.75 0 0 1-.75.75h-6a.75.75 0 0 1-.75-.75V10.5Z"
        stroke="currentColor"
        strokeWidth="1.35"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function SettingsIcon() {
  return (
    <svg viewBox="0 0 16 16" fill="none" className="size-3.5">
      <path
        d="M3 4.5h6m1.75 0H13M6 8h7M3 8h1.25m5 3.5H13M3 11.5h4.5M9 3.25v2.5M5.25 6.75v2.5m4 1v2.5"
        stroke="currentColor"
        strokeWidth="1.35"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function TrashIcon() {
  return (
    <svg viewBox="0 0 16 16" fill="none" className="size-3.5">
      <path
        d="M6.25 2.75h3.5m-5.75 1.5h8.5m-7.5 0 .45 6.25A1.5 1.5 0 0 0 6.95 12h2.1a1.5 1.5 0 0 0 1.5-1.5L11 4.25m-3.5 2.1v3.1m2-3.1v3.1"
        stroke="currentColor"
        strokeWidth="1.35"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export type { OAuthAccountWithOwnership };

export function OAuthCredentialList({
  accounts,
  loading,
  statsLoading,
  accountStats,
  currentUser,
  togglingAccountId,
  claimingAccountName,
  downloadingAccountName,
  inspectingModelsAccountName,
  inspectingSettingsAccountName,
  onToggle,
  onDelete,
  onClaim,
  onOpenModels,
  onDownload,
  onOpenSettings,
}: OAuthCredentialListProps) {
  return (
    <>
      {loading ? (
        <div className="flex items-center justify-center rounded-lg border border-[var(--surface-border)] bg-[var(--surface-base)] p-8">
          <div className="flex flex-col items-center gap-3">
            <div className="size-8 animate-spin rounded-full border-4 border-[var(--surface-border)] border-t-[var(--state-info-accent)]" />
            <p className="text-sm text-[var(--text-muted)]">Loading accounts...</p>
          </div>
        </div>
      ) : accounts.length === 0 ? (
        <div className="rounded-lg border border-[var(--surface-border)] bg-[var(--surface-base)] p-4 text-sm text-[var(--text-muted)]">
          No OAuth accounts connected yet. Connect or import your first auth file below.
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
          {accounts.map((account) => {
            const providerPresentation = getOAuthProviderPresentation(account.provider);
            const stats = accountStats[account.accountName] ?? { successCount: 0, failureCount: 0 };
            const canOperate = Boolean(currentUser && (account.isOwn || currentUser.isAdmin));
            const statusMessage = parseStatusMessage(account.statusMessage);
            const isEnabled = account.status !== "disabled";

            return (
              <div
                key={`${account.id}-${account.accountName}`}
                className="min-h-[236px] overflow-hidden rounded-xl border border-[var(--surface-border)] bg-[var(--surface-base)] shadow-[var(--shadow-edge)] transition-[border-color,box-shadow] duration-200 hover:border-[var(--surface-border-strong)]"
                style={{
                  backgroundImage: `radial-gradient(circle at top left, ${providerPresentation.theme.bg} 0%, transparent 58%)`,
                }}
              >
                <div className="flex h-full flex-col gap-4 p-4">
                  <div className="flex min-w-0 items-start gap-3.5">
                    <div className="relative">
                      <OAuthProviderIcon
                        provider={account.provider}
                        size="md"
                        className="size-14 rounded-[1.125rem] border-[color:var(--surface-border)] bg-[var(--surface-base)] shadow-none"
                      />
                    </div>

                    <div className="min-w-0 flex-1 space-y-3">
                      <div className="space-y-1.5">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <h4 className="text-base font-semibold tracking-tight text-[var(--text-primary)]">
                            {providerPresentation.name}
                          </h4>
                          {currentUser ? (
                            <OwnerBadge ownerUsername={account.ownerUsername} isOwn={account.isOwn} />
                          ) : null}
                          <OAuthStatusBadge
                            status={account.status}
                            statusMessage={account.statusMessage}
                            unavailable={account.unavailable}
                          />
                        </div>

                        <p className="truncate text-sm text-[var(--text-muted)]">
                          {account.accountEmail ?? "Email not exposed by provider"}
                        </p>
                      </div>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-[var(--text-muted)]">
                      <span>
                        <span className="mr-1 font-medium tracking-[0.06em] text-[var(--text-secondary)]">size.</span>
                        {formatFileSize(account.fileSizeBytes)}
                      </span>
                      <span>
                        <span className="mr-1 font-medium tracking-[0.06em] text-[var(--text-secondary)]">modified.</span>
                        {formatModifiedAt(account.modifiedAt)}
                      </span>
                    </div>

                    <div className="flex flex-wrap items-center gap-1.5">
                      {statsLoading ? (
                        <Badge tone="neutral" size="xs" className="rounded-sm">
                          Syncing usage
                        </Badge>
                      ) : (
                        <>
                          <UsageBadge label="Success" value={stats.successCount} tone="success" />
                          <UsageBadge label="Failure" value={stats.failureCount} tone="danger" />
                        </>
                      )}
                    </div>
                  </div>

                  {statusMessage && account.status !== "active" ? (
                    <div className="rounded-md border border-amber-200/70 bg-amber-50/80 px-3 py-2 text-xs text-amber-800 dark:border-amber-500/20 dark:bg-amber-500/10 dark:text-amber-100">
                      {statusMessage}
                    </div>
                  ) : null}

                  {canOperate ? (
                    <div className="mt-auto space-y-3 border-t border-[var(--surface-border)] pt-3">
                      <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2">
                        <div className="flex min-w-0 flex-wrap items-center gap-1.5">
                          <ActionButton
                            title="Inspect models"
                            label="Models"
                            icon={<ModelsIcon />}
                            busy={inspectingModelsAccountName === account.accountName}
                            onClick={() => onOpenModels(account)}
                          />

                          <ActionButton
                            title="Download auth file"
                            label="Download auth file"
                            icon={<DownloadIcon />}
                            busy={downloadingAccountName === account.accountName}
                            iconOnly
                            onClick={() => onDownload(account)}
                          />

                          <ActionButton
                            title="Edit auth file settings"
                            label="Edit auth file settings"
                            icon={<SettingsIcon />}
                            busy={inspectingSettingsAccountName === account.accountName}
                            iconOnly
                            onClick={() => onOpenSettings(account)}
                          />

                          <ActionButton
                            title="Disconnect account"
                            label="Disconnect account"
                            icon={<TrashIcon />}
                            busy={false}
                            iconOnly
                            tone="danger"
                            onClick={() => onDelete(account.id)}
                          />

                          {currentUser?.isAdmin && !account.ownerUsername ? (
                            <Button
                              variant="pill"
                              className="rounded-md px-2.5 py-1 text-[11px]"
                              disabled={claimingAccountName === account.accountName}
                              onClick={() => onClaim(account.accountName)}
                            >
                              {claimingAccountName === account.accountName ? "Claiming..." : "Claim"}
                            </Button>
                          ) : null}
                        </div>

                        <div className="flex shrink-0 items-center gap-2">
                          <span className="text-[10px] font-medium uppercase tracking-[0.08em] text-[var(--text-muted)]">
                            {isEnabled ? "Enabled" : "Disabled"}
                          </span>
                          <AccountToggle
                            enabled={isEnabled}
                            disabled={togglingAccountId === account.id}
                            onToggle={() => onToggle(account.id, account.status === "disabled")}
                          />
                        </div>
                      </div>

                      <p className="text-[11px] text-[var(--text-muted)]">
                        {account.isOwn
                          ? "Owned by you."
                          : account.ownerUsername
                            ? `Managed by ${account.ownerUsername}.`
                            : "Unclaimed auth file."}
                      </p>
                    </div>
                  ) : null}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </>
  );
}
