"use client";

import { Badge } from "@/components/ui/badge";
import { AlertSurface } from "@/components/ui/alert-surface";
import { Button } from "@/components/ui/button";
import { Modal, ModalContent, ModalFooter, ModalHeader, ModalTitle } from "@/components/ui/modal";
import type { OAuthAccountWithOwnership } from "@/components/providers/oauth-credential-list";
import { getOAuthProviderPresentation } from "@/components/providers/oauth-provider-meta";

export interface OAuthAccountModel {
  id: string;
  display_name?: string;
  type?: string;
  owned_by?: string;
}

interface OAuthAccountModelsModalProps {
  isOpen: boolean;
  account: OAuthAccountWithOwnership | null;
  loading: boolean;
  errorMessage: string | null;
  models: OAuthAccountModel[];
  onClose: () => void;
  onCopyModelId: (modelId: string) => void;
}

export function OAuthAccountModelsModal({
  isOpen,
  account,
  loading,
  errorMessage,
  models,
  onClose,
  onCopyModelId,
}: OAuthAccountModelsModalProps) {
  const provider = getOAuthProviderPresentation(account?.provider ?? "");

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      className="max-w-[1100px] rounded-xl border border-[var(--surface-border)] p-4 md:p-5"
    >
      <ModalHeader className="mb-0 border-b-0 pb-3 pr-8">
        <ModalTitle>{account ? `Models · ${provider.name}` : "Models"}</ModalTitle>
        <p className="mt-1 text-sm text-[var(--text-muted)]">
          {account
            ? `Live model discovery for ${account.accountName}.`
            : "Live model discovery for the selected OAuth auth file."}
        </p>
      </ModalHeader>

      <ModalContent className="space-y-4 pt-2">
        {loading ? (
          <div className="rounded-lg border border-[var(--surface-border)] bg-[var(--surface-muted)]/50 p-5 text-sm text-[var(--text-muted)]">
            Loading supported models...
          </div>
        ) : errorMessage ? (
          <AlertSurface tone="danger" className="rounded-lg p-5 text-sm">
            {errorMessage}
          </AlertSurface>
        ) : models.length === 0 ? (
          <div className="rounded-lg border border-[var(--surface-border)] bg-[var(--surface-muted)]/50 p-5 text-sm text-[var(--text-muted)]">
            This account has no discoverable models yet.
          </div>
        ) : (
          <>
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-[var(--surface-border)] bg-[var(--surface-muted)]/50 px-4 py-3">
              <div>
                <p className="text-sm font-medium text-[var(--text-primary)]">
                  {models.length.toLocaleString()} models available
                </p>
                <p className="mt-1 text-xs text-[var(--text-muted)]">
                  Click any row to copy the model id.
                </p>
              </div>
              <Badge tone="info" size="xs" className="rounded-sm uppercase tracking-[0.08em]">
                Live lookup
              </Badge>
            </div>

            <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
              {models.map((model) => (
                <button
                  key={model.id}
                  type="button"
                  onClick={() => onCopyModelId(model.id)}
                  className="group rounded-lg border border-[var(--surface-border)] bg-[var(--surface-base)] p-2.5 text-left transition-[border-color,background-color,transform] hover:border-[var(--surface-border-strong)] hover:bg-[var(--surface-muted)]/60 active:translate-y-px"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate font-mono text-[11px] text-[var(--text-primary)] md:text-[12px]">
                        {model.id}
                      </p>
                      {model.display_name && model.display_name !== model.id ? (
                        <p className="mt-1 truncate text-xs text-[var(--text-secondary)]">
                          {model.display_name}
                        </p>
                      ) : null}
                    </div>
                    <Badge
                      tone="neutral"
                      size="xs"
                      className="rounded-sm opacity-0 transition-opacity group-hover:opacity-100"
                    >
                      Copy
                    </Badge>
                  </div>

                  {(model.type || model.owned_by) ? (
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {model.type ? (
                        <Badge tone="neutral" size="xs" className="rounded-sm">
                          {model.type}
                        </Badge>
                      ) : null}
                      {model.owned_by ? (
                        <Badge tone="neutral" size="xs" className="rounded-sm">
                          {model.owned_by}
                        </Badge>
                      ) : null}
                    </div>
                  ) : null}
                </button>
              ))}
            </div>
          </>
        )}
      </ModalContent>

      <ModalFooter className="gap-2 border-t-0 pt-0">
        <Button variant="ghost" onClick={onClose} className="rounded-md">
          Close
        </Button>
      </ModalFooter>
    </Modal>
  );
}
