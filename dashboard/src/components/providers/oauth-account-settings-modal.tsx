"use client";

import type { ReactNode } from "react";
import { Badge } from "@/components/ui/badge";
import { AlertSurface } from "@/components/ui/alert-surface";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Modal, ModalContent, ModalFooter, ModalHeader, ModalTitle } from "@/components/ui/modal";
import type { OAuthAccountWithOwnership } from "@/components/providers/oauth-credential-list";
import { getOAuthProviderPresentation } from "@/components/providers/oauth-provider-meta";
import type {
  DisableCoolingMode,
  OAuthAuthFileSettingsEditor,
} from "@/lib/providers/oauth-auth-file-settings";

interface OAuthAccountSettingsModalProps {
  isOpen: boolean;
  account: OAuthAccountWithOwnership | null;
  editor: OAuthAuthFileSettingsEditor | null;
  loading: boolean;
  saving: boolean;
  errorMessage: string | null;
  previewText: string;
  dirty: boolean;
  onClose: () => void;
  onCopyPreview: () => void;
  onSave: () => void;
  onStringFieldChange: (
    field: "prefix" | "proxyUrl" | "priority" | "excludedModelsText" | "note",
    value: string
  ) => void;
  onDisableCoolingChange: (value: DisableCoolingMode) => void;
  onWebsocketsChange: (value: boolean) => void;
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
        <label className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--text-muted)]">
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
  onClose,
  onCopyPreview,
  onSave,
  onStringFieldChange,
  onDisableCoolingChange,
  onWebsocketsChange,
}: OAuthAccountSettingsModalProps) {
  const provider = getOAuthProviderPresentation(account?.provider ?? "");
  const parsedStatusMessage = parseStatusMessage(account?.statusMessage ?? null);
  const authFileInfoText = buildAuthFileInfoText(account, editor, provider.name);

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      className="max-w-4xl rounded-xl border border-[var(--surface-border)] p-4 md:p-5"
    >
      <ModalHeader className="mb-0 border-b-0 pb-3 pr-8">
        <ModalTitle>
          {account ? `Auth file settings · ${account.accountName}` : "Auth file settings"}
        </ModalTitle>
        <p className="mt-1 text-sm text-[var(--text-muted)]">
          {account
            ? `Adjust runtime overrides for ${provider.name}${account.accountEmail ? ` · ${account.accountEmail}` : ""}.`
            : "Adjust runtime overrides for the selected OAuth auth file."}
        </p>
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
            <div className="rounded-xl border border-[var(--surface-border)] bg-[var(--surface-base)] p-4">
              <div className="flex flex-wrap gap-2">
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

              {parsedStatusMessage && account?.status !== "active" ? (
                <AlertSurface tone="warning" accent className="mt-3 rounded-lg px-3 py-2 text-xs">
                  {parsedStatusMessage}
                </AlertSurface>
              ) : null}
            </div>

            <div className="rounded-xl border border-[var(--surface-border)] bg-[var(--surface-base)] p-4">
              <h3 className="text-sm font-semibold text-[var(--text-primary)]">Auth file info (info)</h3>
              <p className="mt-1 text-xs text-[var(--text-muted)]">
                Snapshot metadata for the selected OAuth auth file.
              </p>
              <pre className="mt-3 max-h-56 overflow-auto whitespace-pre-wrap break-all rounded-lg border border-[var(--surface-border)] bg-[var(--surface-muted)]/50 p-3 text-xs leading-6 text-[var(--text-primary)]">
                {authFileInfoText}
              </pre>
            </div>

            <div className="rounded-xl border border-[var(--surface-border)] bg-[var(--surface-base)] p-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <h3 className="text-sm font-semibold text-[var(--text-primary)]">JSON preview</h3>
                  <p className="mt-1 text-xs text-[var(--text-muted)]">
                    This is the content that will be uploaded back to the proxy.
                  </p>
                </div>
                <Button variant="ghost" onClick={onCopyPreview} disabled={saving} className="rounded-md">
                  Copy
                </Button>
              </div>

              <pre className="mt-3 max-h-[420px] overflow-auto whitespace-pre-wrap break-all rounded-lg border border-[var(--surface-border)] bg-[var(--surface-muted)]/50 p-3 text-xs leading-6 text-[var(--text-primary)]">
                {previewText}
              </pre>
            </div>

            <div className="space-y-4 rounded-xl border border-[var(--surface-border)] bg-[var(--surface-base)] p-4">
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
                />
              </FieldBlock>

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
                />
              </FieldBlock>

              <FieldBlock
                label="Proxy URL"
                helper="Per-auth upstream proxy override. Leave blank to inherit the global setting."
              >
                <Input
                  name="oauth-proxy-url"
                  value={editor.proxyUrl}
                  onChange={(value) => onStringFieldChange("proxyUrl", value)}
                  placeholder="socks5://user:pass@host:port"
                  disabled={saving}
                  className="font-mono"
                />
              </FieldBlock>

              <FieldBlock
                label="Excluded models"
                helper="One model id per line. These models will be ignored for this auth file."
              >
                <textarea
                  value={editor.excludedModelsText}
                  onChange={(event) => onStringFieldChange("excludedModelsText", event.target.value)}
                  placeholder={"gpt-4.1\nclaude-sonnet-4"}
                  disabled={saving}
                  rows={6}
                  spellCheck={false}
                  className="w-full resize-y rounded-md border border-[var(--surface-border)] bg-[var(--surface-muted)]/50 px-3 py-2 font-mono text-sm text-[var(--text-primary)] outline-none transition-colors focus:border-[var(--surface-border-strong)]"
                />
              </FieldBlock>

              <FieldBlock
                label="Disable cooling"
                helper="Choose whether this file opts out of cooling delays or inherits the global behavior."
              >
                <select
                  value={editor.disableCooling}
                  onChange={(event) => onDisableCoolingChange(event.target.value as DisableCoolingMode)}
                  disabled={saving}
                  className="w-full rounded-md border border-[var(--surface-border)] bg-[var(--surface-muted)]/50 px-3 py-2 text-sm text-[var(--text-primary)] outline-none transition-colors focus:border-[var(--surface-border-strong)]"
                >
                  <option value="inherit">Inherit global setting</option>
                  <option value="true">Force disabled</option>
                  <option value="false">Force enabled</option>
                </select>
              </FieldBlock>

              {editor.isCodexFile ? (
                <FieldBlock
                  label="WebSockets"
                  helper="Codex auth files can opt into WebSocket transport."
                >
                  <label className="flex cursor-pointer items-center justify-between rounded-md border border-[var(--surface-border)] bg-[var(--surface-muted)]/50 px-3 py-2.5">
                    <span className="text-sm text-[var(--text-primary)]">
                      {editor.websockets ? "Enabled" : "Disabled"}
                    </span>
                    <input
                      type="checkbox"
                      checked={editor.websockets}
                      disabled={saving}
                      onChange={(event) => onWebsocketsChange(event.target.checked)}
                      className="size-4 accent-emerald-500"
                    />
                  </label>
                </FieldBlock>
              ) : null}

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
                  className="w-full resize-y rounded-md border border-[var(--surface-border)] bg-[var(--surface-muted)]/50 px-3 py-2 text-sm text-[var(--text-primary)] outline-none transition-colors focus:border-[var(--surface-border-strong)]"
                />
              </FieldBlock>
            </div>
          </div>
        ) : null}
      </ModalContent>

      <ModalFooter className="gap-2 border-t-0 pt-0">
        <Button variant="ghost" onClick={onClose} disabled={saving} className="rounded-md">
          {dirty ? "Cancel" : "Close"}
        </Button>
        <Button
          variant="pill"
          onClick={onSave}
          disabled={!editor || !dirty || saving}
          className="rounded-md"
        >
          {saving ? "Saving..." : "Save settings"}
        </Button>
      </ModalFooter>
    </Modal>
  );
}
