"use client";

import { useEffect, useRef, useState } from "react";
import { API_ENDPOINTS } from "@/lib/api-endpoints";
import type { ProxyModelGroup } from "@/lib/proxy-models";

interface AvailableModelGroupsProps {
  groups: ProxyModelGroup[];
  initialExcludedModels: string[];
}

const SAVE_STATUS = {
  IDLE: "idle",
  SAVING: "saving",
  SAVED: "saved",
  ERROR: "error",
} as const;

type SaveStatus = (typeof SAVE_STATUS)[keyof typeof SAVE_STATUS];

function buildExpandedState(groups: ProxyModelGroup[]): Record<string, boolean> {
  return groups.reduce<Record<string, boolean>>((acc, group, index) => {
    acc[group.id] = index === 0;
    return acc;
  }, {});
}

function buildExcludedSignature(models: Iterable<string>): string {
  return JSON.stringify(Array.from(new Set(models)).sort((left, right) => left.localeCompare(right)));
}

export function AvailableModelGroups({
  groups,
  initialExcludedModels,
}: AvailableModelGroupsProps) {
  const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>(
    () => buildExpandedState(groups),
  );
  const [excludedModels, setExcludedModels] = useState<Set<string>>(
    () => new Set(initialExcludedModels),
  );
  const [saveStatus, setSaveStatus] = useState<SaveStatus>(SAVE_STATUS.IDLE);

  const isFirstRender = useRef(true);
  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const statusTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastSavedSignatureRef = useRef(buildExcludedSignature(initialExcludedModels));

  useEffect(() => {
    setExpandedGroups((current) => {
      const next: Record<string, boolean> = {};
      let hasExpandedGroup = false;

      for (const [index, group] of groups.entries()) {
        const expanded = current[group.id] ?? index === 0;
        next[group.id] = expanded;
        hasExpandedGroup ||= expanded;
      }

      if (!hasExpandedGroup && groups.length > 0) {
        next[groups[0].id] = true;
      }

      return next;
    });
  }, [groups]);

  useEffect(() => {
    const incoming = new Set(initialExcludedModels);
    const incomingSignature = buildExcludedSignature(incoming);
    setExcludedModels((current) => (
      incomingSignature === buildExcludedSignature(current) ? current : incoming
    ));
    lastSavedSignatureRef.current = incomingSignature;
    setSaveStatus(SAVE_STATUS.IDLE);
  }, [initialExcludedModels]);

  useEffect(() => {
    const currentSignature = buildExcludedSignature(excludedModels);

    if (isFirstRender.current) {
      isFirstRender.current = false;
      return;
    }

    if (currentSignature === lastSavedSignatureRef.current) {
      return;
    }

    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
    }
    if (statusTimeoutRef.current) {
      clearTimeout(statusTimeoutRef.current);
    }

    saveTimeoutRef.current = setTimeout(() => {
      setSaveStatus(SAVE_STATUS.SAVING);

      const savePreferences = async () => {
        try {
          const response = await fetch(API_ENDPOINTS.MODEL_PREFERENCES, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              excludedModels: Array.from(excludedModels).sort((left, right) => left.localeCompare(right)),
            }),
          });

          if (!response.ok) {
            throw new Error("Failed to save model preferences");
          }

          lastSavedSignatureRef.current = currentSignature;
          setSaveStatus(SAVE_STATUS.SAVED);
          statusTimeoutRef.current = setTimeout(() => {
            setSaveStatus(SAVE_STATUS.IDLE);
          }, 2000);
        } catch {
          setSaveStatus(SAVE_STATUS.ERROR);
          statusTimeoutRef.current = setTimeout(() => {
            setSaveStatus(SAVE_STATUS.IDLE);
          }, 3000);
        }
      };

      void savePreferences();
    }, 450);

    return () => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }
      if (statusTimeoutRef.current) {
        clearTimeout(statusTimeoutRef.current);
      }
    };
  }, [excludedModels]);

  const toggleGroup = (groupId: string) => {
    setExpandedGroups((current) => ({
      ...current,
      [groupId]: !current[groupId],
    }));
  };

  const toggleModel = (modelId: string) => {
    setExcludedModels((current) => {
      const next = new Set(current);
      if (next.has(modelId)) {
        next.delete(modelId);
      } else {
        next.add(modelId);
      }
      return next;
    });
  };

  return (
    <div>
      <div className="mb-2 min-h-5 px-1 text-right text-xs text-[var(--text-muted)]">
        {saveStatus === SAVE_STATUS.SAVING ? "Saving model preferences..." : null}
        {saveStatus === SAVE_STATUS.SAVED ? "Model preferences saved" : null}
        {saveStatus === SAVE_STATUS.ERROR ? "Could not save model preferences" : null}
      </div>

      <div className="max-h-[34rem] space-y-3 overflow-y-auto pr-1">
        {groups.map((group) => {
          const expanded = expandedGroups[group.id] ?? false;
          const enabledCount = group.items.filter((model) => !excludedModels.has(model.id)).length;

          return (
            <section key={group.id} className="dashboard-card-surface p-3">
              <button
                type="button"
                onClick={() => toggleGroup(group.id)}
                aria-expanded={expanded}
                className="flex w-full items-center justify-between gap-3 text-left"
              >
                <h3 className="text-sm font-semibold text-[var(--text-primary)]">
                  {group.label}
                </h3>
                <span
                  className={`flex size-7 shrink-0 items-center justify-center rounded-md border border-[var(--surface-border)] bg-[var(--surface-muted)] text-[var(--text-muted)] transition-transform ${
                    expanded ? "rotate-180" : ""
                  }`}
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
              </button>

              {expanded ? (
                <div className="mt-3">
                  <p className="mb-3 text-xs text-[var(--text-muted)]">
                    {enabledCount.toLocaleString()} of {group.items.length.toLocaleString()} models enabled
                  </p>
                  <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
                    {group.items.map((model) => {
                      const enabled = !excludedModels.has(model.id);

                      return (
                        <label
                          key={`${group.id}-${model.id}`}
                          title={model.owned_by || undefined}
                          className={`flex cursor-pointer items-start justify-between gap-3 rounded-xl border px-3 py-3 ${
                            enabled
                              ? "border-[var(--surface-border)] bg-[var(--surface-base)] hover:border-[var(--surface-border-strong)]"
                              : "border-[var(--surface-border)] bg-[var(--surface-muted)] text-[var(--text-muted)] hover:border-[var(--surface-border-strong)]"
                          }`}
                        >
                          <span
                            className={`min-w-0 flex-1 break-all font-mono text-xs leading-5 ${
                              enabled ? "text-[var(--text-primary)]" : "text-[var(--text-muted)]"
                            }`}
                          >
                            {model.id}
                          </span>
                          <input
                            type="checkbox"
                            checked={enabled}
                            onChange={() => toggleModel(model.id)}
                            aria-label={`${enabled ? "Disable" : "Enable"} ${model.id}`}
                            className="mt-0.5 size-4 shrink-0 rounded border-[var(--surface-border)] bg-[var(--surface-base)] text-[var(--state-info-accent)] focus:ring-2 focus:ring-[var(--state-info-border)] focus:ring-offset-0"
                          />
                        </label>
                      );
                    })}
                  </div>
                </div>
              ) : null}
            </section>
          );
        })}
      </div>
    </div>
  );
}
