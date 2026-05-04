"use client";

import type { ReactNode } from "react";
import { Badge } from "@/components/ui/badge";
import { AlertSurface } from "@/components/ui/alert-surface";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Modal, ModalContent, ModalFooter, ModalHeader, ModalTitle } from "@/components/ui/modal";
import type { OAuthAccountWithOwnership } from "@/components/providers/oauth-credential-list";
import { getOAuthProviderPresentation } from "@/components/providers/oauth-provider-meta";
import type { OAuthAuthFileSettingsEditor } from "@/lib/providers/oauth-auth-file-settings";

interface OAuthAccountSettingsModalProps {
  isOpen: boolean;
  account: OAuthAccountWithOwnership | null;
  editor: OAuthAuthFileSettingsEditor | null;
  loading: boolean;
  saving: boolean;
  errorMessage: string | null;
  previewText: string;
  dirty: boolean;
  validationErrorMessage: string | null;
  onClose: () => void;
  onCopyPreview: () => void;
  onSave: () => void;
  onStringFieldChange: (
    field: "prefix" | "proxyUrl" | "priority" | "headersText" | "note",
    value: string
  ) => void;
}

function FieldBlock({
  label,
  helper,
  children,
}: {
  label: string;
  helper?: string;
  children: ReactNode;
}) {
  return (
    <div className="space-y-2">
      <div className="space-y-1">
        <label className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--text-secondary)]">
          {label}
        </label>
        {helper ? (
          <p className="mt-1 text-xs leading-relaxed text-[var(--text-muted)]">{helper}</p>
        ) : null}
      </div>
      {children}
    </div>
  );
}

function SectionPanel({
  title,
  description,
  action,
  children,
  variant = "plain",
  className = "",
}: {
  title: string;
  description: string;
  action?: ReactNode;
  children: ReactNode;
  variant?: "plain" | "card";
  className?: string;
}) {
  return (
    <section
      className={`${variant === "card"
        ? "rounded-lg border border-[var(--surface-border)] bg-[var(--surface-base)] p-4 shadow-[var(--shadow-edge)] sm:p-5"
        : "space-y-1"
        } ${className}`.trim()}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-[var(--text-primary)]">
            {title}
          </p>
          <p className="mt-2 max-w-[52ch] text-sm leading-relaxed text-[var(--text-muted)]">
            {description}
          </p>
        </div>
        {action ? <div className="shrink-0">{action}</div> : null}
      </div>
      <div className="mt-4">{children}</div>
    </section>
  );
}

function formatFileSize(value: number | null): string {
  if (value === null || Number.isNaN(value) || value < 0) {
    return "Unknown size";
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
    return "Unknown date";
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "Unknown date";
  }

  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
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

function isUsageLimitMessage(value: string | null): boolean {
  if (!value) {
    return false;
  }

  const normalized = value.toLowerCase();
  return normalized.includes("usage limit") && normalized.includes("reach");
}

function buildAuthFileInfoText(
  account: OAuthAccountWithOwnership | null,
  editor: OAuthAuthFileSettingsEditor | null,
  providerName: string
): string {
  const json = editor?.json ?? {};
  const authIndex = json["auth_index"];
  const accountId = json["account_id"];
  const statusMessage = parseStatusMessage(account?.statusMessage ?? null);

  const info: Record<string, unknown> = {
    name: account?.accountName ?? null,
    provider: account?.provider ?? null,
    providerName,
    email: account?.accountEmail ?? null,
    mode: editor?.isCodexFile ? "codex-auth" : "oauth-auth",
    status: account?.status ?? null,
    unavailable: account?.unavailable ?? false,
    ownerUsername: account?.ownerUsername ?? null,
    isOwn: account?.isOwn ?? false,
    claimedAt: account?.claimedAt ?? null,
    modifiedAt: account?.modifiedAt ?? null,
    fileSizeBytes: account?.fileSizeBytes ?? null,
  };

  if (authIndex !== undefined) {
    info.authIndex = authIndex;
  }

  if (accountId !== undefined) {
    info.accountId = accountId;
  }

  if (statusMessage) {
    info.statusMessage = statusMessage;
  }

  return JSON.stringify(info, null, 2);
}

export function OAuthAccountSettingsModal({
  isOpen,
  account,
  editor,
  loading,
  saving,
  errorMessage,
  previewText,
  dirty,
  validationErrorMessage,
  onClose,
  onCopyPreview,
  onSave,
  onStringFieldChange,
}: OAuthAccountSettingsModalProps) {
  const provider = getOAuthProviderPresentation(account?.provider ?? "");
  const parsedStatusMessage = parseStatusMessage(account?.statusMessage ?? null);
  const usageLimitReached = isUsageLimitMessage(parsedStatusMessage);
  const authFileInfoText = buildAuthFileInfoText(account, editor, provider.name);

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      className="max-w-6xl rounded-xl border border-[var(--surface-border)] p-4 md:p-5"
    >
      <ModalHeader className="mb-0 border-b-0 pb-4 pr-8">
        <ModalTitle>Auth File Details</ModalTitle>
        {usageLimitReached ? (
          <Badge
            tone="danger"
            className="mt-2 flex w-full justify-start rounded-lg px-4 py-2 text-sm font-semibold leading-5"
          >
            The usage limit has been reached
          </Badge>
        ) : null}
      </ModalHeader>

      <ModalContent className="space-y-4 pt-2">
        {loading ? (
          <div className="rounded-lg border border-[var(--surface-border)] bg-[var(--surface-muted)]/50 p-5 text-sm text-[var(--text-muted)]">
            Loading auth file settings...
          </div>
        ) : errorMessage ? (
          <AlertSurface tone="danger" className="rounded-lg p-5 text-sm">
            {errorMessage}
          </AlertSurface>
        ) : editor ? (
          <div className="space-y-4">
            <div className="rounded-lg border border-[var(--surface-border)] bg-[var(--surface-base)] p-4">
              <p className="text-xs font-semibold uppercase tracking-[0.09em] text-[var(--text-secondary)]">
                Metadata
              </p>
              <div className="mt-3 space-y-3">
                <div className="grid gap-3 sm:grid-cols-2">
                  <div>
                    <p className="text-[11px] uppercase tracking-[0.08em] text-[var(--text-muted)]">File</p>
                    <p className="mt-1 truncate text-sm font-medium text-[var(--text-primary)]">
                      {account?.accountName ?? "Unknown"}
                    </p>
                  </div>
                  <div>
                    <p className="text-[11px] uppercase tracking-[0.08em] text-[var(--text-muted)]">Email</p>
                    <p className="mt-1 truncate text-sm font-medium text-[var(--text-primary)]">
                      {account?.accountEmail || "Not exposed"}
                    </p>
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <Badge tone="info" size="xs" className="rounded-sm">
                    Provider: {provider.name}
                  </Badge>
                  <Badge tone="neutral" size="xs" className="rounded-sm">
                    Size: {formatFileSize(account?.fileSizeBytes ?? null)}
                  </Badge>
                  <Badge tone="neutral" size="xs" className="rounded-sm">
                    Modified: {formatModifiedAt(account?.modifiedAt ?? null)}
                  </Badge>
                </div>
              </div>
            </div>

            <div className="grid gap-4 xl:grid-cols-[minmax(0,1.1fr)_minmax(320px,0.9fr)]">
              <SectionPanel
                title="Editable Settings"
                description="Update the auth-file fields that operators are expected to tune for routing, proxying, and note-taking."
                variant="card"
                className="h-full"
              >
                <div className="space-y-5">
                  <FieldBlock
                    label="Prefix"
                    helper="Optional routing prefix stored in the auth file."
                  >
                    <Input
                      name="oauth-prefix"
                      value={editor.prefix}
                      onChange={(value) => onStringFieldChange("prefix", value)}
                      placeholder="codex"
                      disabled={saving}
                      className="h-11 rounded-lg"
                    />
                  </FieldBlock>

                  <div className="grid gap-5 md:grid-cols-2">
                    <FieldBlock
                      label="Priority"
                      helper="Integer priority used by the proxy when selecting this credential."
                    >
                      <Input
                        type="number"
                        name="oauth-priority"
                        value={editor.priority}
                        onChange={(value) => onStringFieldChange("priority", value)}
                        placeholder="10"
                        disabled={saving}
                        className="h-11 rounded-lg"
                      />
                    </FieldBlock>

                    <FieldBlock
                      label="Proxy URL"
                      helper="Per-auth upstream proxy override. Leave blank to inherit the global setting."
                    >
                      <div className="space-y-2">
                        <Input
                          name="oauth-proxy-url"
                          value={editor.proxyUrl}
                          onChange={(value) => onStringFieldChange("proxyUrl", value)}
                          placeholder="socks5://user:pass@host:port"
                          disabled={saving}
                          aria-invalid={Boolean(editor.proxyUrlError)}
                          className="h-11 rounded-lg font-mono"
                        />
                        {editor.proxyUrlError ? (
                          <p className="text-xs text-rose-500">{editor.proxyUrlError}</p>
                        ) : null}
                      </div>
                    </FieldBlock>
                  </div>

                  <FieldBlock
                    label="Custom Headers"
                    helper="JSON object of extra headers stored in the auth file."
                  >
                    <div className="space-y-2">
                      <textarea
                        value={editor.headersText}
                        onChange={(event) => onStringFieldChange("headersText", event.target.value)}
                        placeholder={'{\n  "x-tenant": "priority"\n}'}
                        disabled={saving}
                        rows={7}
                        spellCheck={false}
                        aria-invalid={Boolean(editor.headersError)}
                        className="w-full resize-y rounded-lg border border-[var(--surface-border)] bg-[var(--surface-muted)]/50 px-3 py-3 font-mono text-sm leading-6 text-[var(--text-primary)] outline-none transition-colors focus:border-[var(--surface-border-strong)] aria-[invalid=true]:border-rose-400"
                      />
                      {editor.headersError ? (
                        <p className="text-xs text-rose-500">{editor.headersError}</p>
                      ) : (
                        <p className="text-xs text-[var(--text-muted)]">
                          Use a JSON object with string values only.
                        </p>
                      )}
                    </div>
                  </FieldBlock>

                  <FieldBlock
                    label="Note"
                    helper="Free-form operator note stored inside the auth file."
                  >
                    <textarea
                      value={editor.note}
                      onChange={(event) => onStringFieldChange("note", event.target.value)}
                      placeholder="Reserved for high-priority fallback traffic"
                      disabled={saving}
                      rows={4}
                      className="w-full resize-y rounded-lg border border-[var(--surface-border)] bg-[var(--surface-muted)]/50 px-3 py-3 text-sm leading-6 text-[var(--text-primary)] outline-none transition-colors focus:border-[var(--surface-border-strong)]"
                    />
                  </FieldBlock>
                </div>
              </SectionPanel>

              <div className="space-y-4">
                <SectionPanel
                  title="Auth File Info"
                  description="Snapshot metadata for the selected OAuth auth file."
                  variant="card"
                >
                  <pre className="max-h-56 overflow-auto whitespace-pre-wrap break-all rounded-lg border border-[var(--surface-border)] bg-[var(--surface-muted)]/50 p-3 text-xs leading-6 text-[var(--text-primary)]">
                    {authFileInfoText}
                  </pre>
                </SectionPanel>

                <SectionPanel
                  title="JSON Preview"
                  description="This is the content that will be uploaded back to the proxy."
                  variant="card"
                  action={
                    <Button
                      variant="ghost"
                      onClick={onCopyPreview}
                      disabled={saving || !previewText || Boolean(validationErrorMessage)}
                      className="rounded-md"
                    >
                      Copy
                    </Button>
                  }
                >
                  {validationErrorMessage ? (
                    <AlertSurface tone="danger" className="mb-3 rounded-lg px-3 py-2 text-xs">
                      {validationErrorMessage}
                    </AlertSurface>
                  ) : null}

                  <pre className="max-h-[420px] overflow-auto whitespace-pre-wrap break-all rounded-lg bg-[var(--surface-muted)]/50 p-3 text-xs leading-6 text-[var(--text-primary)]">
                    {previewText}
                  </pre>
                </SectionPanel>
              </div>
            </div>
          </div>
        ) : null}
      </ModalContent>

      <ModalFooter className="mt-1 gap-2 border-t border-[var(--surface-border)] pt-3">
        <Button variant="secondary" onClick={onClose} disabled={saving} className="min-w-24 rounded-lg">
          {dirty ? "Cancel" : "Close"}
        </Button>
        <Button
          variant="primary"
          onClick={onSave}
          disabled={!editor || !dirty || saving || Boolean(validationErrorMessage)}
          className="min-w-32 rounded-lg"
        >
          {saving ? "Saving..." : "Save settings"}
        </Button>
      </ModalFooter>
    </Modal>
  );
}
