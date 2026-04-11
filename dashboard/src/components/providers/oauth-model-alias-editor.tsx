"use client";

import { useCallback, useEffect, useId, useMemo, useState } from "react";
import { OAuthModelAliasDiagram } from "@/components/providers/oauth-model-alias-diagram";
import {
  getOAuthProviderPresentation,
  OAUTH_PROVIDERS,
  OAuthProviderIcon,
} from "@/components/providers/oauth-provider-meta";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Input } from "@/components/ui/input";
import { Modal, ModalContent, ModalFooter, ModalHeader, ModalTitle } from "@/components/ui/modal";
import { useToast } from "@/components/ui/toast";
import { Select } from "@/features/config/components/config-fields";
import { API_ENDPOINTS } from "@/lib/api-endpoints";
import { mergeConfigYaml } from "@/lib/config-yaml";
import {
  nextOAuthAliasId,
  readOAuthModelAliases,
  removeOAuthAlias,
  sanitizeOAuthModelAliases,
  saveOAuthAliasDefinition,
  stampOAuthModelAliasIds,
  stripOAuthModelAliasIds,
} from "@/lib/oauth-model-aliases";
import { cn, extractApiError } from "@/lib/utils";
import type { OAuthModelAliasEntry } from "@/features/config/types";

type ShowToast = ReturnType<typeof useToast>["showToast"];
type ViewMode = "list" | "diagram";
type ProviderModalMode = "create" | "edit";
type ProviderModelDefinition = {
  id: string;
  display_name?: string;
  type?: string;
  owned_by?: string;
};
type ProviderModelsState = {
  status: "loading" | "ready" | "unsupported" | "error";
  models: ProviderModelDefinition[];
};
type ProviderFormRow = {
  id: string;
  name: string;
  alias: string;
  fork: boolean;
};
type AliasFormRow = {
  id: string;
  provider: string;
  name: string;
  fork: boolean;
};
type AliasSummary = {
  alias: string;
  mappings: Array<{
    id: string;
    provider: string;
    name: string;
    fork: boolean;
  }>;
  mappingCount: number;
  providerCount: number;
  forkCount: number;
  providers: string[];
};
type ProviderSummary = {
  provider: string;
  mappings: Array<{
    id: string;
    name: string;
    alias: string;
    fork: boolean;
  }>;
  mappingCount: number;
  aliasCount: number;
  forkCount: number;
};

const OAUTH_MODEL_ALIAS_PROVIDER_PRESETS = Array.from(
  new Set([...OAUTH_PROVIDERS.map((provider) => provider.id), "vertex", "aistudio"])
);

function normalizeProviderKey(value: string) {
  return value.trim().toLowerCase();
}

function buildEmptyProviderFormRow(): ProviderFormRow {
  return {
    id: nextOAuthAliasId(),
    name: "",
    alias: "",
    fork: true,
  };
}

function buildEmptyAliasFormRow(provider = ""): AliasFormRow {
  return {
    id: nextOAuthAliasId(),
    provider,
    name: "",
    fork: true,
  };
}

function sanitizeAndStampAliases(value: unknown) {
  return stampOAuthModelAliasIds(
    sanitizeOAuthModelAliases(readOAuthModelAliases(value))
  );
}

function buildAliasSummaries(aliases: Record<string, OAuthModelAliasEntry[]>): AliasSummary[] {
  const summaryMap = new Map<
    string,
    {
      alias: string;
      mappings: AliasSummary["mappings"];
      providers: Set<string>;
      forkCount: number;
    }
  >();

  for (const [provider, entries] of Object.entries(sanitizeOAuthModelAliases(aliases))) {
    for (const entry of entries) {
      const alias = entry.alias.trim();
      const name = entry.name.trim();
      if (!alias || !name) {
        continue;
      }

      const key = alias.toLowerCase();
      const summary = summaryMap.get(key) ?? {
        alias,
        mappings: [],
        providers: new Set<string>(),
        forkCount: 0,
      };

      summary.providers.add(provider);
      summary.mappings.push({
        id: entry._id ?? `${provider}:${name}:${key}`,
        provider,
        name,
        fork: entry.fork === true,
      });
      if (entry.fork === true) {
        summary.forkCount += 1;
      }

      summaryMap.set(key, summary);
    }
  }

  return Array.from(summaryMap.values())
    .map((summary) => ({
      alias: summary.alias,
      mappings: summary.mappings.sort(
        (left, right) =>
          left.provider.localeCompare(right.provider) ||
          left.name.localeCompare(right.name)
      ),
      mappingCount: summary.mappings.length,
      providerCount: summary.providers.size,
      forkCount: summary.forkCount,
      providers: Array.from(summary.providers).sort((left, right) =>
        left.localeCompare(right)
      ),
    }))
    .sort((left, right) => {
      if (right.mappingCount !== left.mappingCount) {
        return right.mappingCount - left.mappingCount;
      }
      return left.alias.localeCompare(right.alias);
    });
}

function buildProviderSummaries(aliases: Record<string, OAuthModelAliasEntry[]>): ProviderSummary[] {
  return Object.entries(sanitizeOAuthModelAliases(aliases))
    .map(([provider, entries]) => ({
      provider,
      mappings: entries
        .map((entry) => ({
          id: entry._id ?? `${provider}:${entry.name}:${entry.alias}`,
          name: entry.name.trim(),
          alias: entry.alias.trim(),
          fork: entry.fork === true,
        }))
        .sort(
          (left, right) =>
            left.name.localeCompare(right.name) || left.alias.localeCompare(right.alias)
        ),
      mappingCount: entries.length,
      aliasCount: new Set(entries.map((entry) => entry.alias.trim().toLowerCase())).size,
      forkCount: entries.filter((entry) => entry.fork === true).length,
    }))
    .sort((left, right) => left.provider.localeCompare(right.provider));
}

function buildExpandedProviderState(providerSummaries: ProviderSummary[]) {
  return providerSummaries.reduce<Record<string, boolean>>((acc, summary, index) => {
    acc[summary.provider] = index === 0;
    return acc;
  }, {});
}

function replaceProviderMappings(
  aliases: Record<string, OAuthModelAliasEntry[]>,
  previousProvider: string | null,
  nextProvider: string,
  entries: OAuthModelAliasEntry[]
) {
  const sanitized = sanitizeOAuthModelAliases(aliases);
  const next: Record<string, OAuthModelAliasEntry[]> = {};

  for (const [provider, providerEntries] of Object.entries(sanitized)) {
    if (provider === previousProvider) {
      continue;
    }
    next[provider] = providerEntries;
  }

  if (entries.length > 0) {
    next[nextProvider] = entries;
  }

  return sanitizeOAuthModelAliases(next);
}

function MetricCard({
  label,
  value,
  detail,
}: {
  label: string;
  value: string;
  detail: string;
}) {
  return (
    <div className="rounded-lg border border-[var(--surface-border)] bg-[var(--surface-base)] px-3 py-2.5">
      <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--text-muted)]">
        {label}
      </p>
      <p className="mt-1 text-sm font-semibold text-[var(--text-primary)]">{value}</p>
      <p className="mt-0.5 text-xs text-[var(--text-muted)]">{detail}</p>
    </div>
  );
}

function TogglePill({
  checked,
  onChange,
  disabled = false,
}: {
  checked: boolean;
  onChange: (value: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      disabled={disabled}
      className={cn(
        "inline-flex w-full items-center justify-between rounded-lg border px-3 py-2.5 text-sm transition-[border-color,background-color,color] duration-200",
        "disabled:cursor-not-allowed disabled:opacity-50",
        checked
          ? "text-[var(--text-primary)]"
          : "border-[var(--surface-border)] bg-[var(--surface-muted)]/50 text-[var(--text-secondary)]"
      )}
      style={
        checked
          ? {
              borderColor: "var(--state-warning-border)",
              backgroundColor: "var(--state-warning-bg)",
              color: "var(--text-primary)",
            }
          : undefined
      }
    >
      <span>{checked ? "Fork enabled" : "Fork disabled"}</span>
      <span
        className={cn(
          "relative inline-flex h-5 w-9 shrink-0 rounded-full border p-0.5 transition-colors duration-200",
          checked
            ? "border-transparent"
            : "border-[var(--surface-border)] bg-[var(--surface-base)]"
        )}
        style={
          checked
            ? {
                borderColor: "color-mix(in srgb, var(--state-warning-accent) 30%, transparent)",
                backgroundColor: "var(--state-warning-accent)",
              }
            : undefined
        }
      >
        <span
          className={cn(
            "pointer-events-none inline-block size-4 rounded-full bg-[var(--surface-base)] shadow-[var(--shadow-edge)] transition-transform duration-200",
            checked ? "translate-x-4" : "translate-x-0"
          )}
        />
      </span>
    </button>
  );
}

interface OAuthModelAliasEditorProps {
  showToast: ShowToast;
}

export function OAuthModelAliasEditor({ showToast }: OAuthModelAliasEditorProps) {
  const [aliases, setAliases] = useState<Record<string, OAuthModelAliasEntry[]>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [loadFailed, setLoadFailed] = useState(false);
  const [viewMode, setViewMode] = useState<ViewMode>("list");
  const [providerModels, setProviderModels] = useState<Record<string, ProviderModelsState>>({});
  const [expandedProviders, setExpandedProviders] = useState<Record<string, boolean>>({});

  const [providerModalOpen, setProviderModalOpen] = useState(false);
  const [providerModalMode, setProviderModalMode] = useState<ProviderModalMode>("create");
  const [editingProvider, setEditingProvider] = useState<string | null>(null);
  const [providerFormProvider, setProviderFormProvider] = useState("");
  const [providerFormRows, setProviderFormRows] = useState<ProviderFormRow[]>([
    buildEmptyProviderFormRow(),
  ]);
  const [providerFormError, setProviderFormError] = useState("");

  const [aliasModalOpen, setAliasModalOpen] = useState(false);
  const [editingAlias, setEditingAlias] = useState<string | null>(null);
  const [aliasFormAlias, setAliasFormAlias] = useState("");
  const [aliasFormRows, setAliasFormRows] = useState<AliasFormRow[]>([buildEmptyAliasFormRow()]);
  const [aliasFormError, setAliasFormError] = useState("");

  const [providerToDelete, setProviderToDelete] = useState<string | null>(null);
  const [aliasToDelete, setAliasToDelete] = useState<string | null>(null);

  const providerModelListId = useId();

  const aliasSummaries = useMemo(() => buildAliasSummaries(aliases), [aliases]);
  const providerSummaries = useMemo(() => buildProviderSummaries(aliases), [aliases]);

  const aliasSummaryMap = useMemo(
    () =>
      new Map(aliasSummaries.map((summary) => [summary.alias.toLowerCase(), summary])),
    [aliasSummaries]
  );
  const providerSummaryMap = useMemo(
    () =>
      new Map(providerSummaries.map((summary) => [summary.provider.toLowerCase(), summary])),
    [providerSummaries]
  );

  const totals = useMemo(() => {
    const providerSet = new Set<string>();
    let mappings = 0;
    let forkMappings = 0;

    for (const summary of aliasSummaries) {
      mappings += summary.mappingCount;
      forkMappings += summary.forkCount;
      for (const provider of summary.providers) {
        providerSet.add(provider);
      }
    }

    return {
      aliases: aliasSummaries.length,
      mappings,
      providers: providerSet.size,
      forkMappings,
    };
  }, [aliasSummaries]);

  const providerOptions = useMemo(() => {
    const seen = new Set<string>();
    const ordered: string[] = [];

    for (const provider of OAUTH_MODEL_ALIAS_PROVIDER_PRESETS) {
      const normalized = normalizeProviderKey(provider);
      if (!normalized || seen.has(normalized)) {
        continue;
      }
      seen.add(normalized);
      ordered.push(normalized);
    }

    for (const provider of Object.keys(aliases)) {
      const normalized = normalizeProviderKey(provider);
      if (!normalized || seen.has(normalized)) {
        continue;
      }
      seen.add(normalized);
      ordered.push(normalized);
    }

    for (const row of aliasFormRows) {
      const normalized = normalizeProviderKey(row.provider);
      if (!normalized || seen.has(normalized)) {
        continue;
      }
      seen.add(normalized);
      ordered.push(normalized);
    }

    return ordered;
  }, [aliases, aliasFormRows]);

  const selectedProviderModels = useMemo(() => {
    const providerKey = normalizeProviderKey(providerFormProvider);
    if (!providerKey) {
      return null;
    }
    return providerModels[providerKey] ?? null;
  }, [providerFormProvider, providerModels]);

  const providerSelectOptions = useMemo(
    () => [
      { value: "", label: "Select provider" },
      ...providerOptions.map((provider) => ({
        value: provider,
        label: getOAuthProviderPresentation(provider).name,
      })),
    ],
    [providerOptions]
  );

  useEffect(() => {
    setExpandedProviders((current) => {
      const next = buildExpandedProviderState(providerSummaries);

      for (const summary of providerSummaries) {
        if (summary.provider in current) {
          next[summary.provider] = current[summary.provider];
        }
      }

      if (
        providerSummaries.length > 0 &&
        !providerSummaries.some((summary) => next[summary.provider])
      ) {
        next[providerSummaries[0].provider] = true;
      }

      return next;
    });
  }, [providerSummaries]);

  const loadAliases = useCallback(async () => {
    setLoading(true);
    setLoadFailed(false);

    try {
      const response = await fetch(API_ENDPOINTS.MANAGEMENT.CONFIG);
      if (!response.ok) {
        const payload = await response.json().catch(() => null);
        showToast(
          extractApiError(payload, "Failed to load OAuth model aliases"),
          "error"
        );
        setLoadFailed(true);
        setLoading(false);
        return;
      }

      const data = (await response.json()) as Record<string, unknown>;
      const nextAliases = sanitizeAndStampAliases(data["oauth-model-alias"]);
      setAliases(nextAliases);
      setLoading(false);
    } catch {
      showToast("Network error while loading OAuth model aliases", "error");
      setLoadFailed(true);
      setLoading(false);
    }
  }, [showToast]);

  const persistAliases = useCallback(
    async (
      nextAliasesInput: Record<string, OAuthModelAliasEntry[]>,
      {
        previousAliases,
        successMessage,
      }: {
        previousAliases: Record<string, OAuthModelAliasEntry[]>;
        successMessage: string;
      }
    ) => {
      const normalizedAliases = stampOAuthModelAliasIds(
        sanitizeOAuthModelAliases(nextAliasesInput)
      );

      setSaving(true);
      setAliases(normalizedAliases);

      try {
        const rawYamlResponse = await fetch(API_ENDPOINTS.MANAGEMENT.CONFIG_YAML);
        if (!rawYamlResponse.ok) {
          const payload = await rawYamlResponse.json().catch(() => null);
          throw new Error(extractApiError(payload, "Failed to fetch config.yaml"));
        }

        const rawYaml = await rawYamlResponse.text();
        const mergedYaml = mergeConfigYaml(rawYaml, {
          "oauth-model-alias": stripOAuthModelAliasIds(normalizedAliases),
        });

        const saveResponse = await fetch(API_ENDPOINTS.MANAGEMENT.CONFIG_YAML, {
          method: "PUT",
          headers: { "Content-Type": "text/yaml" },
          body: mergedYaml,
        });

        if (!saveResponse.ok) {
          const payload = await saveResponse.json().catch(() => null);
          throw new Error(extractApiError(payload, "Failed to save OAuth model aliases"));
        }

        showToast(successMessage, "success");
        return true;
      } catch (error) {
        setAliases(previousAliases);
        const message =
          error instanceof Error
            ? error.message
            : "Network error while saving OAuth model aliases";
        showToast(message, "error");
        return false;
      } finally {
        setSaving(false);
      }
    },
    [showToast]
  );

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      void loadAliases();
    }, 0);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [loadAliases]);

  const ensureProviderModels = useCallback(async (providerInput: string) => {
    const provider = normalizeProviderKey(providerInput);
    if (!provider) {
      return;
    }

    let shouldFetch = false;
    setProviderModels((current) => {
      const existing = current[provider];
      if (
        existing &&
        (existing.status === "loading" ||
          existing.status === "ready" ||
          existing.status === "unsupported")
      ) {
        return current;
      }

      shouldFetch = true;
      return {
        ...current,
        [provider]: {
          status: "loading",
          models: existing?.models ?? [],
        },
      };
    });

    if (!shouldFetch) {
      return;
    }

    try {
      const response = await fetch(API_ENDPOINTS.MANAGEMENT.MODEL_DEFINITIONS(provider));
      if (response.status === 404) {
        setProviderModels((current) => ({
          ...current,
          [provider]: { status: "unsupported", models: [] },
        }));
        return;
      }

      if (!response.ok) {
        const payload = await response.json().catch(() => null);
        throw new Error(extractApiError(payload, "Failed to load model definitions"));
      }

      const payload = (await response.json()) as { models?: unknown };
      const models = Array.isArray(payload.models)
        ? payload.models
            .filter(
              (item): item is ProviderModelDefinition =>
                typeof item === "object" &&
                item !== null &&
                typeof (item as ProviderModelDefinition).id === "string"
            )
            .map((item) => ({
              id: item.id,
              display_name: item.display_name,
              type: item.type,
              owned_by: item.owned_by,
            }))
            .sort((left, right) => left.id.localeCompare(right.id))
        : [];

      setProviderModels((current) => ({
        ...current,
        [provider]: { status: "ready", models },
      }));
    } catch {
      setProviderModels((current) => ({
        ...current,
        [provider]: { status: "error", models: [] },
      }));
    }
  }, []);

  useEffect(() => {
    if (!providerModalOpen) {
      return;
    }

    const provider = normalizeProviderKey(providerFormProvider);
    if (!provider) {
      return;
    }

    void ensureProviderModels(provider);
  }, [ensureProviderModels, providerFormProvider, providerModalOpen]);

  useEffect(() => {
    if (!aliasModalOpen) {
      return;
    }

    const providers = Array.from(
      new Set(
        aliasFormRows
          .map((row) => normalizeProviderKey(row.provider))
          .filter((provider) => provider.length > 0)
      )
    );

    providers.forEach((provider) => {
      void ensureProviderModels(provider);
    });
  }, [aliasFormRows, aliasModalOpen, ensureProviderModels]);

  const openCreateProviderModal = () => {
    setProviderModalMode("create");
    setEditingProvider(null);
    setProviderFormProvider("");
    setProviderFormRows([buildEmptyProviderFormRow()]);
    setProviderFormError("");
    setProviderModalOpen(true);
  };

  const openEditProviderModal = (provider: string) => {
    const summary = providerSummaryMap.get(provider.toLowerCase());
    if (!summary) {
      return;
    }

    setProviderModalMode("edit");
    setEditingProvider(summary.provider);
    setProviderFormProvider(summary.provider);
    setProviderFormRows(
      summary.mappings.map((mapping) => ({
        id: mapping.id,
        name: mapping.name,
        alias: mapping.alias,
        fork: mapping.fork,
      }))
    );
    setProviderFormError("");
    setProviderModalOpen(true);
  };

  const closeProviderModal = () => {
    setProviderModalOpen(false);
    setProviderFormError("");
  };

  const updateProviderFormRow = (
    rowId: string,
    field: keyof Omit<ProviderFormRow, "id">,
    value: string | boolean
  ) => {
    setProviderFormRows((current) =>
      current.map((row) => (row.id === rowId ? { ...row, [field]: value } : row))
    );
  };

  const addProviderFormRow = () => {
    setProviderFormRows((current) => [...current, buildEmptyProviderFormRow()]);
  };

  const removeProviderFormRow = (rowId: string) => {
    setProviderFormRows((current) => {
      const next = current.filter((row) => row.id !== rowId);
      return next.length > 0 ? next : [buildEmptyProviderFormRow()];
    });
  };

  const handleProviderModalSave = async () => {
    const provider = normalizeProviderKey(providerFormProvider);
    if (!provider) {
      setProviderFormError("Choose an OAuth provider before saving.");
      return;
    }

    let hasPartialRow = false;
    const deduped = new Map<string, OAuthModelAliasEntry>();

    for (const row of providerFormRows) {
      const name = row.name.trim();
      const alias = row.alias.trim();

      if (!name && !alias) {
        continue;
      }

      if (!name || !alias) {
        hasPartialRow = true;
        continue;
      }

      const key = `${name.toLowerCase()}::${alias.toLowerCase()}`;
      const nextEntry = row.fork ? { name, alias, fork: true } : { name, alias };
      const existing = deduped.get(key);
      if (!existing || (row.fork && existing.fork !== true)) {
        deduped.set(key, nextEntry);
      }
    }

    if (hasPartialRow) {
      setProviderFormError("Complete or remove unfinished mappings before saving.");
      return;
    }

    if (deduped.size === 0) {
      setProviderFormError("Add at least one model mapping.");
      return;
    }

    const nextAliases = stampOAuthModelAliasIds(
      replaceProviderMappings(
        aliases,
        editingProvider,
        provider,
        Array.from(deduped.values())
      )
    );

    const saved = await persistAliases(nextAliases, {
      previousAliases: aliases,
      successMessage:
        providerModalMode === "create"
          ? "Provider alias mappings saved"
          : "Provider alias mappings updated",
    });

    if (saved) {
      setProviderModalOpen(false);
      setProviderFormError("");
    }
  };

  const openEditAliasModal = (alias: string) => {
    const summary = aliasSummaryMap.get(alias.toLowerCase());
    if (!summary) {
      return;
    }

    setEditingAlias(summary.alias);
    setAliasFormAlias(summary.alias);
    setAliasFormRows(
      summary.mappings.map((mapping) => ({
        id: mapping.id,
        provider: mapping.provider,
        name: mapping.name,
        fork: mapping.fork,
      }))
    );
    setAliasFormError("");
    setAliasModalOpen(true);
  };

  const closeAliasModal = () => {
    setAliasModalOpen(false);
    setAliasFormError("");
  };

  const updateAliasFormRow = (
    rowId: string,
    field: keyof Omit<AliasFormRow, "id">,
    value: string | boolean
  ) => {
    setAliasFormRows((current) =>
      current.map((row) => (row.id === rowId ? { ...row, [field]: value } : row))
    );
  };

  const addAliasFormRow = () => {
    const fallbackProvider = normalizeProviderKey(aliasFormRows[aliasFormRows.length - 1]?.provider ?? "");
    setAliasFormRows((current) => [...current, buildEmptyAliasFormRow(fallbackProvider)]);
  };

  const removeAliasFormRow = (rowId: string) => {
    setAliasFormRows((current) => {
      const next = current.filter((row) => row.id !== rowId);
      return next.length > 0 ? next : [buildEmptyAliasFormRow()];
    });
  };

  const handleAliasModalSave = async () => {
    const alias = aliasFormAlias.trim();
    if (!alias) {
      setAliasFormError("Alias name is required.");
      return;
    }

    let hasPartialRow = false;
    const dedupedMappings = new Map<string, { provider: string; name: string; fork: boolean }>();

    for (const row of aliasFormRows) {
      const provider = normalizeProviderKey(row.provider);
      const name = row.name.trim();

      if (!provider && !name) {
        continue;
      }

      if (!provider || !name) {
        hasPartialRow = true;
        continue;
      }

      const key = `${provider}::${name.toLowerCase()}`;
      const existing = dedupedMappings.get(key);
      if (!existing || (row.fork && !existing.fork)) {
        dedupedMappings.set(key, {
          provider,
          name,
          fork: row.fork,
        });
      }
    }

    if (hasPartialRow) {
      setAliasFormError("Complete or remove unfinished mappings before saving.");
      return;
    }

    if (dedupedMappings.size === 0) {
      setAliasFormError("Add at least one provider/model mapping.");
      return;
    }

    const nextAliases = stampOAuthModelAliasIds(
      saveOAuthAliasDefinition(aliases, {
        previousAlias: editingAlias,
        alias,
        mappings: Array.from(dedupedMappings.values()),
      })
    );

    const saved = await persistAliases(nextAliases, {
      previousAliases: aliases,
      successMessage: editingAlias ? "Alias updated" : "Alias saved",
    });

    if (saved) {
      setAliasModalOpen(false);
      setAliasFormError("");
    }
  };

  const providerPendingDeleteSummary = providerToDelete
    ? providerSummaryMap.get(providerToDelete.toLowerCase()) ?? null
    : null;
  const aliasPendingDeleteSummary = aliasToDelete
    ? aliasSummaryMap.get(aliasToDelete.toLowerCase()) ?? null
    : null;

  return (
    <>
      <div className="space-y-4">
        <section className="grid grid-cols-2 gap-2 xl:grid-cols-4">
          <MetricCard label="Aliases" value={String(totals.aliases)} detail="Unique alias names" />
          <MetricCard
            label="Mappings"
            value={String(totals.mappings)}
            detail="Provider/model links"
          />
          <MetricCard
            label="Providers"
            value={String(totals.providers)}
            detail="Providers with aliases"
          />
          <MetricCard
            label="Fork"
            value={String(totals.forkMappings)}
            detail="Mappings with fork enabled"
          />
        </section>

        <section className="rounded-lg border border-[var(--surface-border)] bg-[var(--surface-base)] p-4">
          <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
            <div className="max-w-2xl">
              <h3 className="text-sm font-semibold text-[var(--text-primary)]">
                OAuth Model Aliases
              </h3>
              <p className="mt-1 text-sm leading-relaxed text-[var(--text-muted)]">
                Review aliases by provider in the list view or inspect provider-to-alias
                relationships in the diagram view. Diagram mode is read-only, while add, edit,
                and delete actions stay in list view and save directly to{" "}
                <code className="rounded bg-[var(--surface-muted)] px-1 py-0.5 font-mono text-xs">
                  config.yaml
                </code>
                .
              </p>
            </div>

            <div className="flex flex-col gap-2 xl:items-end">
              <div className="flex flex-wrap items-center gap-2">
                <div className="inline-flex rounded-md border border-[var(--surface-border)] bg-[var(--surface-muted)]/50 p-0.5">
                  <button
                    type="button"
                    onClick={() => setViewMode("list")}
                    className={cn(
                      "rounded-[0.375rem] border px-2.5 py-1 text-[11px] font-semibold transition-[background-color,border-color,color,transform] duration-200",
                      "active:translate-y-px",
                      viewMode === "list"
                        ? "border-[var(--state-info-accent)] bg-[var(--state-info-accent)] text-white shadow-[var(--shadow-edge)]"
                        : "border-transparent bg-transparent text-[var(--text-muted)] hover:border-[var(--surface-border)] hover:bg-[var(--surface-base)] hover:text-[var(--text-primary)]"
                    )}
                  >
                    List
                  </button>
                  <button
                    type="button"
                    onClick={() => setViewMode("diagram")}
                    className={cn(
                      "rounded-[0.375rem] border px-2.5 py-1 text-[11px] font-semibold transition-[background-color,border-color,color,transform] duration-200",
                      "active:translate-y-px",
                      viewMode === "diagram"
                        ? "border-[var(--state-warning-accent)] bg-[var(--state-warning-accent)] text-[#1f2937] shadow-[var(--shadow-edge)]"
                        : "border-transparent bg-transparent text-[var(--text-muted)] hover:border-[var(--surface-border)] hover:bg-[var(--surface-base)] hover:text-[var(--text-primary)]"
                    )}
                  >
                    Diagram
                  </button>
                </div>

                {viewMode === "list" ? (
                  <Button
                    variant="pill"
                    onClick={openCreateProviderModal}
                    disabled={saving || loading}
                    className="px-3 py-1.5 text-xs"
                  >
                    Add Alias
                  </Button>
                ) : null}
              </div>

              <div className="min-h-5 text-right text-xs text-[var(--text-muted)]">
                {saving
                  ? "Saving alias changes..."
                  : viewMode === "diagram"
                    ? "Diagram is read-only. Switch to list view to manage aliases."
                    : "Changes apply immediately after confirmation."}
              </div>
            </div>
          </div>

          {loading ? (
            <div className="mt-4 flex items-center gap-3 rounded-lg border border-[var(--surface-border)] bg-[var(--surface-muted)] px-4 py-3 text-sm text-[var(--text-muted)]">
              <div className="size-4 animate-spin rounded-full border-2 border-[var(--surface-border)] border-t-blue-500" />
              <span>Loading OAuth model aliases...</span>
            </div>
          ) : loadFailed ? (
            <div className="mt-4 rounded-lg border border-[var(--surface-border)] bg-[var(--surface-muted)] p-4">
              <p className="text-sm text-[var(--text-secondary)]">
                Could not load OAuth model aliases.
              </p>
              <Button
                variant="ghost"
                onClick={() => void loadAliases()}
                className="mt-3 px-2.5 py-1 text-xs"
              >
                Retry
              </Button>
            </div>
          ) : viewMode === "diagram" ? (
            <div className="mt-4">
              {aliasSummaries.length === 0 ? (
                <div className="rounded-md border border-dashed border-[var(--surface-border)] bg-[var(--surface-muted)]/30 px-4 py-8 text-center">
                  <p className="text-sm font-medium text-[var(--text-primary)]">
                    No OAuth model aliases configured.
                  </p>
                  <p className="mt-1 text-xs text-[var(--text-muted)]">
                    Add provider mappings first to populate the diagram.
                  </p>
                  <Button
                    variant="ghost"
                    onClick={() => setViewMode("list")}
                    className="mt-4 px-3 py-1.5 text-xs"
                  >
                    Open List View
                  </Button>
                </div>
              ) : (
                <OAuthModelAliasDiagram items={aliasSummaries} />
              )}
            </div>
          ) : (
            <div className="mt-4 space-y-3">
              {providerSummaries.length === 0 ? (
                <div className="rounded-md border border-dashed border-[var(--surface-border)] bg-[var(--surface-muted)]/30 px-4 py-8 text-center">
                  <p className="text-sm font-medium text-[var(--text-primary)]">
                    No OAuth model aliases configured.
                  </p>
                  <p className="mt-1 text-xs text-[var(--text-muted)]">
                    Add a provider and its model mappings to start using aliases.
                  </p>
                  <Button
                    variant="pill"
                    onClick={openCreateProviderModal}
                    disabled={saving || loading}
                    className="mt-4 px-3 py-1.5 text-xs"
                  >
                    Add Alias
                  </Button>
                </div>
              ) : null}

              {providerSummaries.map((summary) => {
                const providerPresentation = getOAuthProviderPresentation(summary.provider);
                const expanded = expandedProviders[summary.provider] ?? false;

                return (
                  <article key={summary.provider} className="dashboard-card-surface overflow-hidden">
                    <button
                      type="button"
                      onClick={() =>
                        setExpandedProviders((current) => ({
                          ...current,
                          [summary.provider]: !current[summary.provider],
                        }))
                      }
                      aria-expanded={expanded}
                      className="flex w-full items-start justify-between gap-3 px-4 py-4 text-left transition-colors hover:bg-[var(--surface-muted)]/40"
                    >
                      <div className="flex min-w-0 items-start gap-3">
                        <OAuthProviderIcon provider={summary.provider} size="sm" className="mt-0.5" />
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="text-sm font-semibold text-[var(--text-primary)]">
                              {providerPresentation.name}
                            </span>
                            <Badge tone="info" size="xs" className="rounded-sm">
                              {summary.mappingCount} mapping{summary.mappingCount === 1 ? "" : "s"}
                            </Badge>
                            <Badge tone="neutral" size="xs" className="rounded-sm">
                              {summary.aliasCount} alias{summary.aliasCount === 1 ? "" : "es"}
                            </Badge>
                            {summary.forkCount > 0 ? (
                              <Badge tone="warning" size="xs" className="rounded-sm">
                                {summary.forkCount} fork
                              </Badge>
                            ) : null}
                          </div>

                          <p className="mt-1 text-xs text-[var(--text-muted)]">
                            Expand to review current mappings and manage this provider.
                          </p>
                        </div>
                      </div>

                      <span
                        className={cn(
                          "flex size-8 shrink-0 items-center justify-center rounded-md border border-[var(--surface-border)] bg-[var(--surface-muted)] text-[var(--text-muted)] transition-transform",
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
                    </button>

                    {expanded ? (
                      <div className="border-t border-[var(--surface-border)]">
                        <div className="flex flex-col gap-3 px-4 py-3 lg:flex-row lg:items-center lg:justify-between">
                          <p className="text-xs text-[var(--text-muted)]">
                            Source models below resolve to the alias names exposed by the proxy.
                          </p>

                          <div className="flex shrink-0 flex-wrap items-center gap-2">
                            <Button
                              variant="ghost"
                              onClick={() => openEditProviderModal(summary.provider)}
                              disabled={saving}
                              className="px-3 py-1.5 text-xs"
                            >
                              Edit Provider
                            </Button>
                            <Button
                              variant="danger"
                              onClick={() => setProviderToDelete(summary.provider)}
                              disabled={saving}
                              className="px-3 py-1.5 text-xs"
                            >
                              Delete Provider
                            </Button>
                          </div>
                        </div>

                        <div className="dashboard-table-surface mx-4 mb-4">
                          <div className="hidden grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] gap-3 border-b border-[var(--surface-border)] bg-[var(--surface-muted)]/50 px-4 py-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--text-muted)] md:grid">
                            <span>Source model</span>
                            <span>Alias</span>
                            <span>Status</span>
                          </div>

                          <div className="divide-y divide-[var(--surface-border)]">
                            {summary.mappings.map((mapping) => (
                              <div
                                key={mapping.id}
                                className="grid gap-2 px-4 py-3 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] md:items-center md:gap-3"
                              >
                                <div className="min-w-0">
                                  <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--text-muted)] md:hidden">
                                    Source model
                                  </p>
                                  <code className="mt-1 block truncate rounded-md bg-[var(--surface-muted)] px-2 py-1 font-mono text-xs text-[var(--text-primary)] md:mt-0">
                                    {mapping.name}
                                  </code>
                                </div>

                                <div className="min-w-0">
                                  <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--text-muted)] md:hidden">
                                    Alias
                                  </p>
                                  <code className="mt-1 block truncate rounded-md bg-[var(--surface-muted)] px-2 py-1 font-mono text-xs font-semibold text-[var(--text-primary)] md:mt-0">
                                    {mapping.alias}
                                  </code>
                                </div>

                                <div className="min-w-0">
                                  <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--text-muted)] md:hidden">
                                    Status
                                  </p>
                                  <Badge
                                    tone={mapping.fork ? "warning" : "neutral"}
                                    size="xs"
                                    className="mt-1 w-fit rounded-sm md:mt-0"
                                  >
                                    {mapping.fork ? "Fork enabled" : "Shared alias"}
                                  </Badge>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      </div>
                    ) : null}
                  </article>
                );
              })}
            </div>
          )}
        </section>
      </div>

      <Modal
        isOpen={providerModalOpen}
        onClose={closeProviderModal}
        className="max-w-4xl"
      >
        <ModalHeader className="mb-0 border-b-0 pb-3 pr-8">
          <ModalTitle>
            {providerModalMode === "create"
              ? "Add Alias"
              : `Edit Provider Mappings · ${getOAuthProviderPresentation(providerFormProvider).name}`}
          </ModalTitle>
          <p className="mt-1 text-sm text-[var(--text-muted)]">
            Choose an OAuth provider first, then map its source models to alias names. This modal
            mirrors the provider-based flow in the reference auth-files UI.
          </p>
        </ModalHeader>

        <ModalContent className="space-y-4 pt-2">
          <div className="dashboard-card-surface p-4">
            <label
              htmlFor="oauth-model-alias-provider"
              className="block text-sm font-semibold text-[var(--text-primary)]"
            >
              OAuth Provider
            </label>
            <p className="mt-1 text-xs text-[var(--text-muted)]">
              Pick the provider whose source models should map to aliases.
            </p>
            <div className="mt-3">
              <Select
                id="oauth-model-alias-provider"
                value={providerFormProvider}
                onChange={(value) => {
                  setProviderFormProvider(value);
                  if (providerFormError) {
                    setProviderFormError("");
                  }
                }}
                options={providerSelectOptions}
                disabled={saving}
              />
            </div>
          </div>

          <div className="dashboard-card-surface p-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <h4 className="text-sm font-semibold text-[var(--text-primary)]">Mappings</h4>
                <p className="mt-1 text-xs text-[var(--text-muted)]">
                  Source model names come from the selected provider. Alias values are what the
                  proxy will expose downstream.
                </p>
              </div>
              <Button
                variant="pill"
                onClick={addProviderFormRow}
                disabled={saving}
                className="w-fit px-3 py-1.5 text-xs"
              >
                Add Mapping
              </Button>
            </div>

            <div className="mt-3 rounded-md border border-[var(--surface-border)] bg-[var(--surface-muted)]/40 px-3 py-2 text-xs text-[var(--text-muted)]">
              {!normalizeProviderKey(providerFormProvider)
                ? "Choose a provider to load model suggestions."
                : selectedProviderModels?.status === "loading"
                  ? "Loading model definitions..."
                  : selectedProviderModels?.status === "unsupported"
                    ? "No model definition endpoint is available for this provider. Type model names manually."
                    : selectedProviderModels?.status === "error"
                      ? "Could not load model suggestions. You can still type model names manually."
                      : selectedProviderModels?.models.length
                        ? `${selectedProviderModels.models.length} model suggestion${selectedProviderModels.models.length === 1 ? "" : "s"} available.`
                        : "Type model names manually for this provider."}
            </div>

            <div className="mt-4 space-y-3">
              {providerFormRows.map((row) => (
                <div
                  key={row.id}
                  className="dashboard-card-surface dashboard-card-surface--muted p-3"
                >
                  <div className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(180px,0.58fr)_44px] xl:items-end">
                    <div>
                      <label className="block text-xs font-semibold uppercase tracking-[0.12em] text-[var(--text-muted)]">
                        Source model
                      </label>
                      <input
                        list={providerModelListId}
                        value={row.name}
                        onChange={(event) => {
                          updateProviderFormRow(row.id, "name", event.target.value);
                          if (providerFormError) {
                            setProviderFormError("");
                          }
                        }}
                        disabled={saving}
                        placeholder="gpt-5"
                        className="mt-2 w-full rounded-md border border-[var(--surface-border)] bg-[var(--surface-base)] px-3 py-2 font-mono text-sm text-[var(--text-primary)] outline-none transition-colors focus:border-[var(--surface-border-strong)] disabled:cursor-not-allowed disabled:opacity-50"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-semibold uppercase tracking-[0.12em] text-[var(--text-muted)]">
                        Alias
                      </label>
                      <input
                        value={row.alias}
                        onChange={(event) => {
                          updateProviderFormRow(row.id, "alias", event.target.value);
                          if (providerFormError) {
                            setProviderFormError("");
                          }
                        }}
                        disabled={saving}
                        placeholder="assistant-model"
                        className="mt-2 w-full rounded-md border border-[var(--surface-border)] bg-[var(--surface-base)] px-3 py-2 font-mono text-sm text-[var(--text-primary)] outline-none transition-colors focus:border-[var(--surface-border-strong)] disabled:cursor-not-allowed disabled:opacity-50"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-semibold uppercase tracking-[0.12em] text-[var(--text-muted)]">
                        Fork
                      </label>
                      <div className="mt-2">
                        <TogglePill
                          checked={row.fork}
                          onChange={(value) => updateProviderFormRow(row.id, "fork", value)}
                          disabled={saving}
                        />
                      </div>
                    </div>

                    <div className="flex xl:justify-end">
                      <button
                        type="button"
                        onClick={() => removeProviderFormRow(row.id)}
                        disabled={saving}
                        className="flex h-10 w-full items-center justify-center self-end rounded-md border border-red-200/70 bg-red-50/80 text-sm font-medium text-red-600 transition-colors hover:border-red-300 hover:bg-red-100 disabled:cursor-not-allowed disabled:opacity-50 dark:border-red-500/20 dark:bg-red-500/10 dark:text-red-300 xl:w-10"
                        aria-label="Remove mapping"
                        title="Remove mapping"
                      >
                        <svg viewBox="0 0 16 16" fill="currentColor" className="size-3.5" aria-hidden="true">
                          <path d="M5.25 2a.75.75 0 0 1 .75.75V3h4v-.25a.75.75 0 0 1 1.5 0V3h1.25a.75.75 0 0 1 0 1.5H12v7.25A1.25 1.25 0 0 1 10.75 13h-5.5A1.25 1.25 0 0 1 4 11.75V4.5H2.75a.75.75 0 0 1 0-1.5H4v-.25A.75.75 0 0 1 4.75 2h.5Zm.25 2.5v7h1.5v-7H5.5Zm3 0v7H10v-7H8.5Z" />
                        </svg>
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            <datalist id={providerModelListId}>
              {(selectedProviderModels?.models ?? []).map((model) => (
                <option
                  key={`provider-model-${model.id}`}
                  value={model.id}
                  label={
                    model.display_name && model.display_name !== model.id
                      ? model.display_name
                      : undefined
                  }
                />
              ))}
            </datalist>
          </div>

          {providerFormError ? (
            <div className="rounded-md border border-rose-200/70 bg-rose-50/80 px-4 py-3 text-sm text-rose-700 dark:border-rose-500/20 dark:bg-rose-500/10 dark:text-rose-200">
              {providerFormError}
            </div>
          ) : null}
        </ModalContent>

        <ModalFooter className="gap-2 border-t-0 pt-0">
          <Button variant="ghost" onClick={closeProviderModal} disabled={saving}>
            Cancel
          </Button>
          <Button variant="pill" onClick={() => void handleProviderModalSave()} disabled={saving}>
            {saving
              ? "Saving..."
              : providerModalMode === "create"
                ? "Add Alias"
                : "Update Provider"}
          </Button>
        </ModalFooter>
      </Modal>

      <Modal isOpen={aliasModalOpen} onClose={closeAliasModal} className="max-w-4xl">
        <ModalHeader className="mb-0 border-b-0 pb-3 pr-8">
          <ModalTitle>{`Edit Alias · ${editingAlias ?? ""}`}</ModalTitle>
          <p className="mt-1 text-sm text-[var(--text-muted)]">
            Update the alias name and all provider/model mappings that currently point to it.
          </p>
        </ModalHeader>

        <ModalContent className="space-y-4 pt-2">
          <div className="dashboard-card-surface p-4">
            <label
              htmlFor="oauth-model-alias-name"
              className="block text-sm font-semibold text-[var(--text-primary)]"
            >
              Alias Name
            </label>
            <p className="mt-1 text-xs text-[var(--text-muted)]">
              Renaming here updates every mapping connected to this alias.
            </p>
            <div className="mt-3">
              <Input
                id="oauth-model-alias-name"
                name="oauth-model-alias-name"
                value={aliasFormAlias}
                onChange={(value) => {
                  setAliasFormAlias(value);
                  if (aliasFormError) {
                    setAliasFormError("");
                  }
                }}
                disabled={saving}
                placeholder="assistant-model"
              />
            </div>
          </div>

          <div className="dashboard-card-surface p-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <h4 className="text-sm font-semibold text-[var(--text-primary)]">Connected mappings</h4>
                <p className="mt-1 text-xs text-[var(--text-muted)]">
                  Add or remove provider connections for this alias.
                </p>
              </div>
              <Button
                variant="pill"
                onClick={addAliasFormRow}
                disabled={saving}
                className="w-fit px-3 py-1.5 text-xs"
              >
                Add Mapping
              </Button>
            </div>

            <div className="mt-4 space-y-3">
              {aliasFormRows.map((row) => {
                const providerKey = normalizeProviderKey(row.provider);
                const modelsState = providerKey ? providerModels[providerKey] : null;
                const modelsListId = `${providerModelListId}-${row.id}-models`;

                return (
                  <div
                    key={row.id}
                    className="dashboard-card-surface dashboard-card-surface--muted p-3"
                  >
                    <div className="grid gap-3 xl:grid-cols-[minmax(0,0.8fr)_minmax(0,1fr)_minmax(180px,0.58fr)_44px] xl:items-end">
                      <div>
                        <label className="block text-xs font-semibold uppercase tracking-[0.12em] text-[var(--text-muted)]">
                          Provider
                        </label>
                        <select
                          value={row.provider}
                          onChange={(event) => {
                            updateAliasFormRow(row.id, "provider", event.target.value);
                            if (aliasFormError) {
                              setAliasFormError("");
                            }
                          }}
                          disabled={saving}
                          className="mt-2 w-full rounded-md border border-[var(--surface-border)] bg-[var(--surface-base)] px-3 py-2 text-sm text-[var(--text-primary)] outline-none transition-colors focus:border-[var(--surface-border-strong)] disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          {providerSelectOptions.map((option) => (
                            <option
                              key={`alias-provider-${row.id}-${option.value || "empty"}`}
                              value={option.value}
                            >
                              {option.label}
                            </option>
                          ))}
                        </select>
                      </div>

                      <div>
                        <label className="block text-xs font-semibold uppercase tracking-[0.12em] text-[var(--text-muted)]">
                          Source model
                        </label>
                        <input
                          list={modelsListId}
                          value={row.name}
                          onChange={(event) => {
                            updateAliasFormRow(row.id, "name", event.target.value);
                            if (aliasFormError) {
                              setAliasFormError("");
                            }
                          }}
                          disabled={saving}
                          placeholder="gpt-5"
                          className="mt-2 w-full rounded-md border border-[var(--surface-border)] bg-[var(--surface-base)] px-3 py-2 font-mono text-sm text-[var(--text-primary)] outline-none transition-colors focus:border-[var(--surface-border-strong)] disabled:cursor-not-allowed disabled:opacity-50"
                        />
                        <datalist id={modelsListId}>
                          {(modelsState?.models ?? []).map((model) => (
                            <option
                              key={`${row.id}-${model.id}`}
                              value={model.id}
                              label={
                                model.display_name && model.display_name !== model.id
                                  ? model.display_name
                                  : undefined
                              }
                            />
                          ))}
                        </datalist>
                      </div>

                      <div>
                        <label className="block text-xs font-semibold uppercase tracking-[0.12em] text-[var(--text-muted)]">
                          Fork
                        </label>
                        <div className="mt-2">
                          <TogglePill
                            checked={row.fork}
                            onChange={(value) => updateAliasFormRow(row.id, "fork", value)}
                            disabled={saving}
                          />
                        </div>
                      </div>

                      <div className="flex xl:justify-end">
                        <button
                          type="button"
                          onClick={() => removeAliasFormRow(row.id)}
                          disabled={saving}
                          className="flex h-10 w-full items-center justify-center self-end rounded-md border border-red-200/70 bg-red-50/80 text-sm font-medium text-red-600 transition-colors hover:border-red-300 hover:bg-red-100 disabled:cursor-not-allowed disabled:opacity-50 dark:border-red-500/20 dark:bg-red-500/10 dark:text-red-300 xl:w-10"
                          aria-label="Remove mapping"
                          title="Remove mapping"
                        >
                          <svg viewBox="0 0 16 16" fill="currentColor" className="size-3.5" aria-hidden="true">
                            <path d="M5.25 2a.75.75 0 0 1 .75.75V3h4v-.25a.75.75 0 0 1 1.5 0V3h1.25a.75.75 0 0 1 0 1.5H12v7.25A1.25 1.25 0 0 1 10.75 13h-5.5A1.25 1.25 0 0 1 4 11.75V4.5H2.75a.75.75 0 0 1 0-1.5H4v-.25A.75.75 0 0 1 4.75 2h.5Zm.25 2.5v7h1.5v-7H5.5Zm3 0v7H10v-7H8.5Z" />
                          </svg>
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {aliasFormError ? (
            <div className="rounded-md border border-rose-200/70 bg-rose-50/80 px-4 py-3 text-sm text-rose-700 dark:border-rose-500/20 dark:bg-rose-500/10 dark:text-rose-200">
              {aliasFormError}
            </div>
          ) : null}
        </ModalContent>

        <ModalFooter className="gap-2 border-t-0 pt-0">
          <Button variant="ghost" onClick={closeAliasModal} disabled={saving}>
            Cancel
          </Button>
          <Button variant="pill" onClick={() => void handleAliasModalSave()} disabled={saving}>
            {saving ? "Saving..." : "Update Alias"}
          </Button>
        </ModalFooter>
      </Modal>

      <ConfirmDialog
        isOpen={providerPendingDeleteSummary !== null}
        onClose={() => setProviderToDelete(null)}
        onConfirm={() => {
          if (!providerPendingDeleteSummary) {
            return;
          }

          const nextAliases = stampOAuthModelAliasIds(
            replaceProviderMappings(aliases, providerPendingDeleteSummary.provider, "", [])
          );
          void persistAliases(nextAliases, {
            previousAliases: aliases,
            successMessage: "Provider mappings deleted",
          });
          setProviderToDelete(null);
        }}
        title="Delete Provider Mappings"
        message={
          providerPendingDeleteSummary ? (
            <span>
              Remove all alias mappings for{" "}
              <code>{getOAuthProviderPresentation(providerPendingDeleteSummary.provider).name}</code>?
            </span>
          ) : (
            ""
          )
        }
        confirmLabel="Delete Provider"
        cancelLabel="Cancel"
        variant="danger"
      />

      <ConfirmDialog
        isOpen={aliasPendingDeleteSummary !== null}
        onClose={() => setAliasToDelete(null)}
        onConfirm={() => {
          if (!aliasPendingDeleteSummary) {
            return;
          }

          const nextAliases = stampOAuthModelAliasIds(
            removeOAuthAlias(aliases, aliasPendingDeleteSummary.alias)
          );
          void persistAliases(nextAliases, {
            previousAliases: aliases,
            successMessage: "Alias deleted",
          });
          setAliasToDelete(null);
        }}
        title="Delete Alias"
        message={
          aliasPendingDeleteSummary ? (
            <span>
              Remove <code>{aliasPendingDeleteSummary.alias}</code> from{" "}
              {aliasPendingDeleteSummary.mappingCount} mapping
              {aliasPendingDeleteSummary.mappingCount === 1 ? "" : "s"} across{" "}
              {aliasPendingDeleteSummary.providerCount} provider
              {aliasPendingDeleteSummary.providerCount === 1 ? "" : "s"}?
            </span>
          ) : (
            ""
          )
        }
        confirmLabel="Delete Alias"
        cancelLabel="Cancel"
        variant="danger"
      />
    </>
  );
}
