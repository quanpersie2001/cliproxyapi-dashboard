import { CACHE_KEYS, CACHE_TTL, proxyModelsCache } from "@/lib/cache";
import {
  MODEL_PROVIDER_ORDER,
  detectModelProvider,
  resolveOwnedByDisplay,
} from "@/lib/providers/model-grouping";

export interface ProxyModel {
  id: string;
  owned_by: string;
}

export interface ProxyModelGroup {
  id: string;
  label: string;
  items: ProxyModel[];
}

export interface AuthFileDescriptor {
  name: string;
  provider: string;
}

const DEFAULT_INTERNAL_PROXY_URL = "http://cliproxyapi:8317";
const DEFAULT_MANAGEMENT_URL = `${DEFAULT_INTERNAL_PROXY_URL}/v0/management`;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function parseProxyModel(input: unknown): ProxyModel | null {
  if (!isRecord(input)) {
    return null;
  }

  const modelIdCandidate = input.id ?? input.name ?? input.model ?? input.value;
  if (typeof modelIdCandidate !== "string") {
    return null;
  }

  const id = modelIdCandidate.trim();
  if (!id) {
    return null;
  }

  return {
    id,
    owned_by:
      typeof input.owned_by === "string"
        ? input.owned_by.trim()
        : typeof input.provider === "string"
          ? input.provider.trim()
          : typeof input.type === "string"
            ? input.type.trim()
            : "",
  };
}

export function getInternalProxyUrl(
  managementUrl = process.env.CLIPROXYAPI_MANAGEMENT_URL ?? `${DEFAULT_INTERNAL_PROXY_URL}/v0/management`,
): string {
  try {
    const url = new URL(managementUrl);
    return `${url.protocol}//${url.host}`;
  } catch {
    return DEFAULT_INTERNAL_PROXY_URL;
  }
}

function getManagementBaseUrl(
  managementUrl = process.env.CLIPROXYAPI_MANAGEMENT_URL ?? DEFAULT_MANAGEMENT_URL,
): string {
  return managementUrl.trim().replace(/\/+$/, "");
}

function extractActiveAuthFiles(payload: unknown): AuthFileDescriptor[] {
  if (!isRecord(payload) || !Array.isArray(payload.files)) {
    return [];
  }

  return payload.files
    .filter((entry): entry is Record<string, unknown> => isRecord(entry))
    .map((entry) => ({
      name: typeof entry.name === "string" ? entry.name.trim() : "",
      provider:
        typeof entry.provider === "string"
          ? entry.provider.trim()
          : typeof entry.type === "string"
            ? entry.type.trim()
            : "",
      disabled: typeof entry.disabled === "boolean" ? entry.disabled : false,
    }))
    .filter((entry) => entry.name && !entry.disabled)
    .map(({ name, provider }) => ({ name, provider }));
}

function extractModelsFromPayload(payload: unknown, fallbackOwnedBy = ""): ProxyModel[] {
  if (!payload) {
    return [];
  }

  const modelsSource = isRecord(payload) && Array.isArray(payload.models)
    ? payload.models
    : isRecord(payload) && Array.isArray(payload.data)
      ? payload.data
      : Array.isArray(payload)
        ? payload
        : [];

  return normalizeProxyModels(
    modelsSource
      .map((entry) => parseProxyModel(entry))
      .filter((entry): entry is ProxyModel => entry !== null)
      .map((entry) => ({
        ...entry,
        owned_by: entry.owned_by || fallbackOwnedBy,
      })),
  );
}

async function fetchManagementJson(path: string): Promise<unknown> {
  const managementApiKey = process.env.MANAGEMENT_API_KEY?.trim();
  if (!managementApiKey) {
    return null;
  }

  const targetUrl = `${getManagementBaseUrl()}/${path.replace(/^\/+/, "")}`;

  try {
    const response = await fetch(targetUrl, {
      headers: { Authorization: `Bearer ${managementApiKey}` },
      cache: "no-store",
      signal: AbortSignal.timeout(5_000),
    });

    if (!response.ok) {
      await response.body?.cancel();
      return null;
    }

    return await response.json();
  } catch {
    return null;
  }
}

export function normalizeProxyModels(models: ProxyModel[]): ProxyModel[] {
  const deduped = new Map<string, ProxyModel>();

  for (const model of models) {
    if (!deduped.has(model.id)) {
      deduped.set(model.id, model);
    }
  }

  return Array.from(deduped.values()).sort((left, right) =>
    left.id.localeCompare(right.id),
  );
}

function resolveProviderLabel(model: ProxyModel): string {
  const ownedBy = model.owned_by.trim();
  if (ownedBy) {
    return resolveOwnedByDisplay(ownedBy);
  }

  return detectModelProvider(model.id);
}

function buildUniqueProviderGroupId(provider: string, usedIds: Set<string>): string {
  const baseId = provider
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || "provider";

  let candidateId = baseId;
  let duplicateIndex = 2;

  while (usedIds.has(candidateId)) {
    candidateId = `${baseId}-${duplicateIndex}`;
    duplicateIndex += 1;
  }

  usedIds.add(candidateId);
  return candidateId;
}

export function groupProxyModelsByProvider(models: ProxyModel[]): ProxyModelGroup[] {
  const grouped = new Map<string, Map<string, ProxyModel>>();

  for (const model of models) {
    const provider = resolveProviderLabel(model);
    const providerModels = grouped.get(provider) ?? new Map<string, ProxyModel>();
    if (!providerModels.has(model.id)) {
      providerModels.set(model.id, model);
    }
    grouped.set(provider, providerModels);
  }

  const orderedProviders = [
    ...MODEL_PROVIDER_ORDER.filter((provider) => grouped.has(provider)),
    ...Array.from(grouped.keys())
      .filter((provider) => !MODEL_PROVIDER_ORDER.includes(provider as (typeof MODEL_PROVIDER_ORDER)[number]))
      .sort((left, right) => left.localeCompare(right)),
  ];
  const usedGroupIds = new Set<string>();

  return orderedProviders.flatMap((provider) => {
    const providerModels = grouped.get(provider);
    if (!providerModels || providerModels.size === 0) {
      return [];
    }

    return [{
      id: buildUniqueProviderGroupId(provider, usedGroupIds),
      label: provider,
      items: Array.from(providerModels.values()).sort((left, right) => left.id.localeCompare(right.id)),
    }];
  });
}

export async function fetchAvailableProxyModels(
  apiKey: string,
  proxyUrl = getInternalProxyUrl(),
): Promise<ProxyModel[]> {
  const trimmedApiKey = apiKey.trim();
  const trimmedProxyUrl = proxyUrl.trim().replace(/\/+$/, "");

  if (!trimmedApiKey || !trimmedProxyUrl) {
    return [];
  }

  const cacheKey = CACHE_KEYS.proxyModels(trimmedProxyUrl, trimmedApiKey);
  const cached = proxyModelsCache.get(cacheKey) as ProxyModel[] | null;
  if (cached) {
    return cached;
  }

  try {
    const response = await fetch(`${trimmedProxyUrl}/v1/models`, {
      headers: { Authorization: `Bearer ${trimmedApiKey}` },
      cache: "no-store",
      signal: AbortSignal.timeout(5_000),
    });

    if (!response.ok) {
      await response.body?.cancel();
      return [];
    }

    const payload = (await response.json()) as { data?: unknown };
    if (!Array.isArray(payload.data)) {
      return [];
    }

    const models = normalizeProxyModels(
      payload.data
        .map((entry) => parseProxyModel(entry))
        .filter((entry): entry is ProxyModel => entry !== null),
    );

    proxyModelsCache.set(cacheKey, models, CACHE_TTL.PROXY_MODELS);
    return models;
  } catch {
    return [];
  }
}

export async function fetchAvailableAuthFileModels(): Promise<{
  activeAuthFiles: AuthFileDescriptor[];
  models: ProxyModel[];
}> {
  const authFilesPayload = await fetchManagementJson("auth-files");
  const activeAuthFiles = extractActiveAuthFiles(authFilesPayload);

  if (activeAuthFiles.length === 0) {
    return { activeAuthFiles: [], models: [] };
  }

  const modelGroups = await Promise.all(
    activeAuthFiles.map(async (authFile) => {
      const directPayload = await fetchManagementJson(
        `auth-files/models?name=${encodeURIComponent(authFile.name)}`,
      );
      const directModels = extractModelsFromPayload(directPayload, authFile.provider);
      if (directModels.length > 0) {
        return directModels;
      }

      const providerChannel = authFile.provider.trim().toLowerCase();
      if (!providerChannel) {
        return [];
      }

      const definitionsPayload = await fetchManagementJson(
        `model-definitions/${encodeURIComponent(providerChannel)}`,
      );
      return extractModelsFromPayload(definitionsPayload, authFile.provider);
    }),
  );

  return {
    activeAuthFiles,
    models: modelGroups.flat(),
  };
}
