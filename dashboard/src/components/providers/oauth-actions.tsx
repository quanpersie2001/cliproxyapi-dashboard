"use client";

import type { OAuthProviderEntry, OAuthProviderId } from "@/components/providers/oauth-provider-meta";
import { OAuthProviderIcon } from "@/components/providers/oauth-provider-meta";
import { Button } from "@/components/ui/button";
import { getStateToneStyle } from "@/components/ui/state-styles";
import { cn } from "@/lib/utils";

interface OAuthActionsProps {
  providers: readonly OAuthProviderEntry[];
  expanded: boolean;
  collapsible?: boolean;
  note: string;
  showHeader?: boolean;
  showNote?: boolean;
  onToggleExpand: () => void;
  onConnect: (providerId: OAuthProviderId) => void;
  onImport: (providerId: OAuthProviderId) => void;
}

export function OAuthActions({
  providers,
  expanded,
  collapsible = true,
  note,
  showHeader = true,
  showNote = true,
  onToggleExpand,
  onConnect,
  onImport,
}: OAuthActionsProps) {
  return (
    <div className="overflow-hidden rounded-md border border-[var(--surface-border)] bg-[var(--surface-base)]">
      {showHeader && collapsible ? (
        <button
          type="button"
          onClick={onToggleExpand}
          aria-expanded={expanded}
          className="flex w-full items-center justify-between gap-3 px-3 py-3 text-left hover:bg-[var(--surface-muted)]/60"
        >
          <div>
            <h3 className="text-xs font-semibold uppercase tracking-[0.08em] text-[var(--text-muted)]">
              Connect New Account
            </h3>
            <p className="mt-1 text-xs text-[var(--text-muted)]">
              {providers.length} OAuth providers available
            </p>
          </div>

          <div className="flex items-center gap-2">
            <span className="rounded-full border border-[var(--surface-border)] bg-[var(--surface-muted)] px-2 py-0.5 text-[11px] font-medium text-[var(--text-secondary)]">
              {providers.length}
            </span>
            <span
              className={cn(
                "flex size-8 items-center justify-center rounded-lg border border-[var(--surface-border)] bg-[var(--surface-muted)] text-[var(--text-muted)] transition-transform",
                expanded && "rotate-180"
              )}
              aria-hidden="true"
            >
              <svg viewBox="0 0 16 16" fill="none" className="size-3.5">
                <path
                  d="M4 6.25L8 10.25L12 6.25"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </span>
          </div>
        </button>
      ) : showHeader ? (
        <div className="flex items-center justify-between gap-3 px-3 py-3">
          <div>
            <h3 className="text-xs font-semibold uppercase tracking-[0.08em] text-[var(--text-muted)]">
              Connect New Account
            </h3>
            <p className="mt-1 text-xs text-[var(--text-muted)]">
              {providers.length} OAuth providers available
            </p>
          </div>

          <span className="rounded-full border border-[var(--surface-border)] bg-[var(--surface-muted)] px-2 py-0.5 text-[11px] font-medium text-[var(--text-secondary)]">
            {providers.length}
          </span>
        </div>
      ) : null}

      {!collapsible || expanded ? (
        <div className={cn(collapsible && showHeader && "border-t border-[var(--surface-border)]")}>
          {showNote ? (
            <div
              className="m-3 rounded-md border p-3 text-sm"
              style={getStateToneStyle("warning")}
            >
              <strong className="text-[var(--text-primary)]">Note:</strong> {note}
            </div>
          ) : null}

          {providers.map((provider, index) => (
            <div
              key={provider.id}
              className={cn(
                "flex flex-col gap-3 px-3 py-3 sm:flex-row sm:items-center sm:justify-between",
                index !== providers.length - 1 && "border-b border-[var(--surface-border)]"
              )}
            >
              <div className="flex min-w-0 items-start gap-3">
                <OAuthProviderIcon provider={provider.id} size="sm" className="mt-0.5" />
                <div className="min-w-0 space-y-1">
                  <div className="text-sm font-medium text-[var(--text-primary)]">{provider.name}</div>
                  <p className="text-xs leading-relaxed text-[var(--text-muted)]">{provider.description}</p>
                </div>
              </div>

              <div className="flex shrink-0 flex-wrap items-center gap-1.5">
                <Button
                  variant="pill"
                  onClick={() => onConnect(provider.id)}
                  className="shrink-0 px-2.5 py-1 text-xs"
                >
                  Connect
                </Button>
                <Button
                  variant="pill"
                  onClick={() => onImport(provider.id)}
                  className="shrink-0 px-2.5 py-1 text-xs"
                >
                  Import JSON
                </Button>
              </div>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}
