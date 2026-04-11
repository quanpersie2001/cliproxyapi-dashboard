import type { OAuthModelAliasEntry } from "@/features/config/types";

type OAuthModelAliasMap = Record<string, OAuthModelAliasEntry[]>;
type OAuthAliasDraftMapping = {
  provider: string;
  name: string;
  fork?: boolean;
};

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function readString(value: unknown, fallback: string): string {
  return typeof value === "string" ? value : fallback;
}

let idCounter = 0;

export function nextOAuthAliasId(): string {
  return `oauth-alias-${Date.now()}-${++idCounter}`;
}

export function readOAuthModelAliases(value: unknown): OAuthModelAliasMap {
  const source =
    isPlainObject(value) && isPlainObject(value["oauth-model-alias"])
      ? value["oauth-model-alias"]
      : value;

  if (!isPlainObject(source)) {
    return {};
  }

  const next: OAuthModelAliasMap = {};

  for (const [provider, entries] of Object.entries(source)) {
    if (!Array.isArray(entries)) {
      continue;
    }

    next[provider] = entries
      .filter(isPlainObject)
      .map((entry) => ({
        name: readString(entry.name, ""),
        alias: readString(entry.alias, ""),
        fork: typeof entry.fork === "boolean" ? entry.fork : undefined,
        _id: readString(entry._id, ""),
      }))
      .map((entry) => (entry._id ? entry : { ...entry, _id: undefined }));
  }

  return next;
}

function compareAliasEntries(left: OAuthModelAliasEntry, right: OAuthModelAliasEntry) {
  return (
    left.alias.localeCompare(right.alias) ||
    left.name.localeCompare(right.name)
  );
}

function toNormalizedProviderKey(value: string): string {
  return value.trim().toLowerCase();
}

function normalizeEntry(entry: OAuthModelAliasEntry): OAuthModelAliasEntry | null {
  const name = entry.name.trim();
  const alias = entry.alias.trim();

  if (!name || !alias) {
    return null;
  }

  return entry.fork
    ? { name, alias, fork: true, _id: entry._id }
    : { name, alias, _id: entry._id };
}

export function sanitizeOAuthModelAliases(aliases: OAuthModelAliasMap): OAuthModelAliasMap {
  if (Object.keys(aliases).length === 0) {
    return {};
  }

  const next: OAuthModelAliasMap = {};

  for (const [rawProvider, entries] of Object.entries(aliases)) {
    const provider = toNormalizedProviderKey(rawProvider);
    if (!provider || !Array.isArray(entries)) {
      continue;
    }

    const deduped = new Map<string, OAuthModelAliasEntry>();

    for (const entry of entries) {
      const normalized = normalizeEntry(entry);
      if (!normalized) {
        continue;
      }

      const dedupeKey = `${normalized.name.toLowerCase()}::${normalized.alias.toLowerCase()}`;
      const existing = deduped.get(dedupeKey);

      if (!existing || (normalized.fork === true && existing.fork !== true)) {
        deduped.set(dedupeKey, normalized);
      }
    }

    const normalizedEntries = Array.from(deduped.values()).sort(compareAliasEntries);
    if (normalizedEntries.length > 0) {
      next[provider] = normalizedEntries;
    }
  }

  return next;
}

export function stampOAuthModelAliasIds(aliases: OAuthModelAliasMap): OAuthModelAliasMap {
  if (Object.keys(aliases).length === 0) {
    return aliases;
  }

  let changed = false;
  const stamped: OAuthModelAliasMap = {};

  for (const [provider, entries] of Object.entries(aliases)) {
    stamped[provider] = entries.map((entry) => {
      if (entry._id) {
        return entry;
      }

      changed = true;
      return { ...entry, _id: nextOAuthAliasId() };
    });
  }

  return changed ? stamped : aliases;
}

export function stripOAuthModelAliasIds(aliases: OAuthModelAliasMap): OAuthModelAliasMap {
  if (Object.keys(aliases).length === 0) {
    return aliases;
  }

  const cleaned: OAuthModelAliasMap = {};

  for (const [provider, entries] of Object.entries(aliases)) {
    cleaned[provider] = entries.map((entry) => {
      const { _id, ...rest } = entry;
      void _id;
      return rest;
    });
  }

  return cleaned;
}

export function removeOAuthAlias(
  aliases: OAuthModelAliasMap,
  aliasName: string
): OAuthModelAliasMap {
  const normalizedAlias = aliasName.trim().toLowerCase();
  if (!normalizedAlias) {
    return sanitizeOAuthModelAliases(aliases);
  }

  const next: OAuthModelAliasMap = {};

  for (const [provider, entries] of Object.entries(aliases)) {
    const filtered = entries.filter(
      (entry) => entry.alias.trim().toLowerCase() !== normalizedAlias
    );
    if (filtered.length > 0) {
      next[provider] = filtered;
    }
  }

  return sanitizeOAuthModelAliases(next);
}

export function saveOAuthAliasDefinition(
  aliases: OAuthModelAliasMap,
  {
    previousAlias,
    alias,
    mappings,
  }: {
    previousAlias?: string | null;
    alias: string;
    mappings: OAuthAliasDraftMapping[];
  }
): OAuthModelAliasMap {
  const normalizedAlias = alias.trim();
  if (!normalizedAlias) {
    return sanitizeOAuthModelAliases(aliases);
  }

  const base =
    previousAlias && previousAlias.trim()
      ? removeOAuthAlias(aliases, previousAlias)
      : sanitizeOAuthModelAliases(aliases);

  const next: OAuthModelAliasMap = { ...base };

  for (const mapping of mappings) {
    const provider = toNormalizedProviderKey(mapping.provider);
    const name = mapping.name.trim();
    if (!provider || !name) {
      continue;
    }

    const entries = next[provider] ?? [];
    entries.push(
      mapping.fork
        ? { name, alias: normalizedAlias, fork: true }
        : { name, alias: normalizedAlias }
    );
    next[provider] = entries;
  }

  return sanitizeOAuthModelAliases(next);
}
