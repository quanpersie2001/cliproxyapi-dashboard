"use client";

import { useEffect, useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { AlertSurface } from "@/components/ui/alert-surface";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Modal, ModalContent, ModalFooter, ModalHeader, ModalTitle } from "@/components/ui/modal";
import {
  type ModelPricingDraft,
  type ModelPricingRecord,
  normalizeModelPricingDraft,
} from "@/features/usage/model-pricing";

interface UsageModelPricingPanelProps {
  records: ModelPricingRecord[];
  previewRecords?: ModelPricingRecord[];
  modelNames: string[];
  isAdmin: boolean;
  loading?: boolean;
  error?: string | null;
  onCreateOrUpdate: (draft: ModelPricingDraft, recordId?: string) => Promise<boolean> | boolean;
  onDelete: (recordId: string) => Promise<boolean> | boolean;
  onReload: () => Promise<void> | void;
  onSyncOfficial?: () => Promise<void> | void;
  onClearPreview?: () => void;
}

function formatCurrencyValue(value: number): string {
  return value.toFixed(4);
}

function PricingRow({
  record,
  isAdmin,
  onEdit,
  onDelete,
  preview = false,
}: {
  record: ModelPricingRecord;
  isAdmin: boolean;
  onEdit: (record: ModelPricingRecord) => void;
  onDelete: (record: ModelPricingRecord) => void;
  preview?: boolean;
}) {
  const badgeTone = record.isActive ? "success" : "neutral";
  const sourceTone = preview ? "info" : record.manualOverride ? "warning" : "info";

  return (
    <div className="dashboard-card-surface flex flex-col gap-3 p-3 lg:flex-row lg:items-center lg:justify-between">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <div className="font-medium text-[var(--text-primary)]">{record.displayName?.trim() || record.model}</div>
          <Badge tone={badgeTone} size="xs">
            {record.isActive ? "Active" : "Inactive"}
          </Badge>
          {preview ? (
            <Badge tone="info" size="xs">
              Preview
            </Badge>
          ) : null}
          <Badge tone={sourceTone} size="xs">
            {record.manualOverride ? "Manual" : (record.sourceType || "Synced")}
          </Badge>
        </div>
        <div className="mt-1 text-xs text-[var(--text-muted)]">
          <span className="font-mono">{record.provider}</span>
          {record.currency ? <span> · {record.currency}</span> : null}
          {record.sourceUrl ? <span> · {record.sourceUrl}</span> : null}
        </div>
        <div className="mt-1 text-xs text-[var(--text-muted)]">
          Prompt {formatCurrencyValue(record.promptPriceUsd)} / Completion {formatCurrencyValue(record.completionPriceUsd)} / Cache {formatCurrencyValue(record.cachePriceUsd ?? record.promptPriceUsd)}
        </div>
      </div>
      {isAdmin ? (
        <div className="flex flex-wrap gap-2">
          {preview ? (
            <Button variant="secondary" onClick={() => onEdit(record)}>
              Open form
            </Button>
          ) : (
            <>
              <Button variant="secondary" onClick={() => onEdit(record)}>
                Edit
              </Button>
              <Button variant="ghost" onClick={() => onDelete(record)} disabled={!record.id}>
                Delete
              </Button>
            </>
          )}
        </div>
      ) : null}
    </div>
  );
}

export function UsageModelPricingPanel({
  records,
  previewRecords = [],
  modelNames,
  isAdmin,
  loading = false,
  error = null,
  onCreateOrUpdate,
  onDelete,
  onReload,
  onSyncOfficial,
  onClearPreview,
}: UsageModelPricingPanelProps) {
  const [editingRecord, setEditingRecord] = useState<ModelPricingRecord | null>(null);
  const [isEditorOpen, setIsEditorOpen] = useState(false);
  const [draft, setDraft] = useState<ModelPricingDraft>(() => normalizeModelPricingDraft(null));
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!editingRecord) return;
    setDraft(normalizeModelPricingDraft(editingRecord));
  }, [editingRecord]);

  const sortedRecords = useMemo(
    () => [...records].sort((left, right) => left.model.localeCompare(right.model) || left.provider.localeCompare(right.provider)),
    [records]
  );

  const openCreate = () => {
    setEditingRecord(null);
    setDraft(normalizeModelPricingDraft(null));
    setIsEditorOpen(true);
  };

  const openEdit = (record: ModelPricingRecord) => {
    setEditingRecord(record);
    setDraft(normalizeModelPricingDraft(record));
    setIsEditorOpen(true);
  };

  const closeEditor = () => {
    setIsEditorOpen(false);
    setEditingRecord(null);
    setDraft(normalizeModelPricingDraft(null));
  };

  const submit = async () => {
    setSubmitting(true);
    try {
      const saved = await onCreateOrUpdate(draft, editingRecord?.id);
      if (saved === false) {
        return;
      }
      closeEditor();
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <section className="dashboard-panel-surface p-4">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <h2 className="text-sm font-semibold text-[var(--text-primary)]">Model Price Settings</h2>
          <p className="mt-1 text-xs leading-5 text-[var(--text-muted)]">
            Global pricing is shared across users. Admins can edit it here; everyone else sees a read-only view.
          </p>
          <p className="mt-1 text-[11px] text-[var(--text-muted)]">
            {modelNames.length > 0 ? `${modelNames.length.toLocaleString()} models are present in the current usage window.` : "No models found in the current usage window."}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" onClick={() => void onReload()} disabled={loading}>
            {loading ? "Refreshing..." : "Reload"}
          </Button>
          {isAdmin ? (
            <>
              <Button variant="secondary" onClick={() => void onSyncOfficial?.()} disabled={loading}>
                Sync official
              </Button>
              <Button onClick={openCreate}>Add price</Button>
            </>
          ) : (
            <Badge tone="neutral" size="xs" className="self-center">
              Read only
            </Badge>
          )}
        </div>
      </div>

      {error ? (
        <AlertSurface tone="warning" className="mt-4 text-sm">
          {error}
        </AlertSurface>
      ) : null}

      <div className="mt-4 space-y-2">
        {isAdmin && previewRecords.length > 0 ? (
          <AlertSurface tone="info" className="p-3">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <div className="text-sm font-medium text-[var(--text-primary)]">Official sync preview</div>
                <div className="mt-1 text-xs text-[var(--text-secondary)]">
                  These entries are only loaded into the UI. Nothing is saved until you open a form and press Save.
                </div>
              </div>
              <Button variant="ghost" onClick={() => void onClearPreview?.()}>
                Clear preview
              </Button>
            </div>
            <div className="mt-3 space-y-2">
              {previewRecords.map((record) => (
                <PricingRow
                  key={`preview-${record.id ?? `${record.provider}:${record.model}`}`}
                  record={record}
                  isAdmin={isAdmin}
                  onEdit={openEdit}
                  onDelete={() => {}}
                  preview
                />
              ))}
            </div>
          </AlertSurface>
        ) : null}

        {sortedRecords.length > 0 ? (
          sortedRecords.map((record) => (
            <PricingRow
              key={record.id ?? `${record.provider}:${record.model}`}
              record={record}
              isAdmin={isAdmin}
              onEdit={openEdit}
              onDelete={(target) => {
                if (!target.id) return;
                void onDelete(target.id);
              }}
            />
          ))
        ) : (
          <div className="rounded-md border border-dashed border-[var(--surface-border)] px-4 py-6 text-sm text-[var(--text-muted)]">
            No model prices configured yet.
            {isAdmin ? (
              <span className="ml-1 text-[var(--text-secondary)]">Add one to enable cost analytics.</span>
            ) : (
              <span className="ml-1 text-[var(--text-secondary)]">Admins can publish a shared pricing table here.</span>
            )}
          </div>
        )}
      </div>

      <Modal isOpen={isEditorOpen} onClose={closeEditor}>
        <ModalHeader>
          <ModalTitle>{editingRecord ? "Edit Model Price" : "Add Model Price"}</ModalTitle>
        </ModalHeader>
        <ModalContent className="space-y-3">
          <Input
            name="modal-provider"
            value={draft.provider}
            onChange={(value) => setDraft((current) => ({ ...current, provider: value }))}
            placeholder="Provider"
            disabled={!isAdmin}
          />
          <Input
            name="modal-model"
            value={draft.model}
            onChange={(value) => setDraft((current) => ({ ...current, model: value }))}
            placeholder="Model"
            disabled={!isAdmin}
          />
          <Input
            name="modal-display-name"
            value={draft.displayName}
            onChange={(value) => setDraft((current) => ({ ...current, displayName: value }))}
            placeholder="Display name"
            disabled={!isAdmin}
          />
          <Input
            name="modal-prompt"
            value={draft.promptPriceUsd}
            onChange={(value) => setDraft((current) => ({ ...current, promptPriceUsd: value }))}
            placeholder="Prompt ($/1M)"
            type="number"
            disabled={!isAdmin}
          />
          <Input
            name="modal-completion"
            value={draft.completionPriceUsd}
            onChange={(value) => setDraft((current) => ({ ...current, completionPriceUsd: value }))}
            placeholder="Completion ($/1M)"
            type="number"
            disabled={!isAdmin}
          />
          <Input
            name="modal-cache"
            value={draft.cachePriceUsd}
            onChange={(value) => setDraft((current) => ({ ...current, cachePriceUsd: value }))}
            placeholder="Cache ($/1M)"
            type="number"
            disabled={!isAdmin}
          />
          <Input
            name="modal-source-url"
            value={draft.sourceUrl}
            onChange={(value) => setDraft((current) => ({ ...current, sourceUrl: value }))}
            placeholder="Source URL"
            disabled={!isAdmin}
          />
          <div className="flex flex-wrap gap-2 text-xs text-[var(--text-muted)]">
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={draft.manualOverride}
                onChange={(event) => setDraft((current) => ({ ...current, manualOverride: event.target.checked }))}
                disabled={!isAdmin}
              />
              Manual override
            </label>
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={draft.isActive}
                onChange={(event) => setDraft((current) => ({ ...current, isActive: event.target.checked }))}
                disabled={!isAdmin}
              />
              Active
            </label>
          </div>
        </ModalContent>
        <ModalFooter>
          <Button variant="ghost" onClick={closeEditor}>Cancel</Button>
          <Button onClick={() => void submit()} disabled={!isAdmin || submitting || !draft.model.trim() || !draft.provider.trim()}>
            {submitting ? "Saving..." : editingRecord ? "Update" : "Create"}
          </Button>
        </ModalFooter>
      </Modal>
    </section>
  );
}
