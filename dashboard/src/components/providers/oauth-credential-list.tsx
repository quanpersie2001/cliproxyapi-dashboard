"use client";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { OwnerBadge, type CurrentUserLike } from "@/components/providers/api-key-section";
import { getOAuthProviderPresentation, OAuthProviderIcon } from "@/components/providers/oauth-provider-meta";

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
}

interface OAuthCredentialListProps {
  accounts: OAuthAccountWithOwnership[];
  loading: boolean;
  currentUser: CurrentUserLike | null;
  togglingAccountId: string | null;
  claimingAccountName: string | null;
  onToggle: (accountId: string, currentlyDisabled: boolean) => void;
  onDelete: (accountId: string) => void;
  onClaim: (accountName: string) => void;
}

function parseStatusMessage(raw: string | null): string | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    if (parsed?.error?.message) return parsed.error.message;
    if (typeof parsed?.message === "string") return parsed.message;
    return raw;
  } catch {
    return raw;
  }
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
      <Badge tone="success" size="xs" dot title="Token is valid and working">
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
      >
        {message
          ? message.length > 40 ? `${message.slice(0, 40)}…` : message
          : "Error"}
      </Badge>
    );
  }

  if (status === "disabled") {
    return (
      <Badge tone="neutral" size="xs" dot title="Account is disabled">
        Disabled
      </Badge>
    );
  }

  return null;
}

export type { OAuthAccountWithOwnership };

export function OAuthCredentialList({
  accounts,
  loading,
  currentUser,
  togglingAccountId,
  claimingAccountName,
  onToggle,
  onDelete,
  onClaim,
}: OAuthCredentialListProps) {
  return (
    <>
      <div>
        <h3 className="text-xs font-semibold uppercase tracking-[0.08em] text-[var(--text-muted)]">Connected Accounts</h3>
        <p className="mt-1 text-xs text-[var(--text-muted)]">Active OAuth provider connections</p>
      </div>
      {loading ? (
        <div className="flex items-center justify-center rounded-md border border-[var(--surface-border)] bg-[var(--surface-base)] p-8">
          <div className="flex flex-col items-center gap-3">
            <div className="size-8 animate-spin rounded-full border-4 border-[var(--surface-border)] border-t-[var(--state-info-accent)]"></div>
            <p className="text-sm text-[var(--text-muted)]">Loading accounts...</p>
          </div>
        </div>
      ) : accounts.length === 0 ? (
        <div className="rounded-sm border border-[var(--surface-border)] bg-[var(--surface-base)] p-3 text-xs text-[var(--text-muted)]">
          No OAuth accounts connected yet. Connect your first account below.
        </div>
      ) : (
        <div className="divide-y divide-[var(--surface-border)] rounded-md border border-[var(--surface-border)] bg-[var(--surface-base)]">
          {accounts.map((account) => {
            const providerPresentation = getOAuthProviderPresentation(account.provider);

            return (
              <div key={account.id} className="group p-3">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div className="flex min-w-0 flex-1 items-start gap-3">
                    <OAuthProviderIcon provider={account.provider} size="sm" className="mt-0.5" />
                    <div className="min-w-0 flex-1 space-y-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-sm font-semibold text-[var(--text-primary)]">
                          {providerPresentation.name}
                        </span>
                        {currentUser && (
                          <OwnerBadge ownerUsername={account.ownerUsername} isOwn={account.isOwn} />
                        )}
                        <OAuthStatusBadge status={account.status} statusMessage={account.statusMessage} unavailable={account.unavailable} />
                      </div>
                      {account.accountEmail && (
                        <p className="truncate text-xs text-[var(--text-secondary)]">{account.accountEmail}</p>
                      )}
                      <p className="truncate text-xs font-mono text-[var(--text-muted)]">{account.accountName}</p>
                    </div>
                  </div>

                  {currentUser && (account.isOwn || currentUser.isAdmin) && (
                    <div className="flex shrink-0 flex-wrap items-center gap-2">
                      {currentUser.isAdmin && !account.ownerUsername && (
                        <Button
                          variant="pill"
                          className="px-2.5 py-1 text-xs"
                          disabled={claimingAccountName === account.accountName}
                          onClick={() => onClaim(account.accountName)}
                        >
                          {claimingAccountName === account.accountName ? "..." : "Claim"}
                        </Button>
                      )}
                      <Button
                        variant="pill"
                        className="px-2.5 py-1 text-xs"
                        disabled={togglingAccountId === account.id}
                        onClick={() => onToggle(account.id, account.status === "disabled")}
                      >
                        {togglingAccountId === account.id ? "..." : account.status === "disabled" ? "Enable" : "Disable"}
                      </Button>
                      <Button
                        variant="danger"
                        className="px-2.5 py-1 text-xs"
                        onClick={() => onDelete(account.id)}
                      >
                        Disconnect
                      </Button>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </>
  );
}
