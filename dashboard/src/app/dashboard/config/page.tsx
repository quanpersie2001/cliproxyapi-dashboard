"use client";

import { useCallback, useEffect, useState } from "react";
import yaml from "js-yaml";
import AgentConfigEditor from "@/components/config/agent-config-editor";
import ConfigPreview from "@/components/config/config-preview";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { useToast } from "@/components/ui/toast";
import { API_ENDPOINTS } from "@/lib/api-endpoints";
import { mergeConfigYaml } from "@/lib/config-yaml";
import {
  DEFAULT_ROUTING_STRATEGY,
  isRoutingStrategy,
  type RoutingStrategy,
} from "@/lib/routing-strategy";

export interface StreamingConfig {
  "keepalive-seconds": number;
  "bootstrap-retries": number;
  "nonstream-keepalive-interval": number;
}

export interface QuotaExceededConfig {
  "switch-project": boolean;
  "switch-preview-model": boolean;
}

export interface RoutingConfig {
  strategy: RoutingStrategy;
}

export interface TlsConfig {
  enable: boolean;
  cert: string;
  key: string;
}

export interface PprofConfig {
  enable: boolean;
  addr: string;
}

export interface ClaudeHeaderDefaults {
  "user-agent": string;
  "package-version": string;
  "runtime-version": string;
  timeout: string;
}

export interface AmpcodeConfig {
  "upstream-url": string;
  "upstream-api-key": string;
  "restrict-management-to-localhost": boolean;
  "model-mappings": unknown;
  "force-model-mappings": boolean;
}

export interface PayloadConfig {
  default: unknown;
  "default-raw": unknown;
  override: unknown;
  "override-raw": unknown;
  filter: unknown;
}

export interface OAuthModelAliasEntry {
  name: string;
  alias: string;
  fork?: boolean;
  _id?: string;
}

export interface Config {
  "proxy-url": string;
  "auth-dir": string;
  "force-model-prefix": boolean;
  streaming: StreamingConfig;
  debug: boolean;
  "commercial-mode": boolean;
  "logging-to-file": boolean;
  "logs-max-total-size-mb": number;
  "error-logs-max-files": number;
  "usage-statistics-enabled": boolean;
  "request-retry": number;
  "max-retry-interval": number;
  "quota-exceeded": QuotaExceededConfig;
  routing: RoutingConfig;
  "ws-auth": boolean;
  "disable-cooling": boolean;
  "request-log": boolean;
  "max-retry-credentials": number;
  "passthrough-headers": boolean;
  "incognito-browser": boolean;
  "kiro-preferred-endpoint": string;
  kiro: unknown;
  tls: TlsConfig;
  pprof: PprofConfig;
  "claude-header-defaults": ClaudeHeaderDefaults;
  ampcode: AmpcodeConfig;
  payload: PayloadConfig;
  "oauth-model-alias": Record<string, OAuthModelAliasEntry[]>;
}

const DEFAULT_CONFIG: Config = {
  "proxy-url": "",
  "auth-dir": "~/.cli-proxy-api",
  "force-model-prefix": false,
  streaming: {
    "keepalive-seconds": 15,
    "bootstrap-retries": 1,
    "nonstream-keepalive-interval": 0,
  },
  debug: false,
  "commercial-mode": false,
  "logging-to-file": false,
  "logs-max-total-size-mb": 0,
  "error-logs-max-files": 10,
  "usage-statistics-enabled": true,
  "request-retry": 3,
  "max-retry-interval": 30,
  "quota-exceeded": {
    "switch-project": true,
    "switch-preview-model": true,
  },
  routing: {
    strategy: DEFAULT_ROUTING_STRATEGY,
  },
  "ws-auth": true,
  "disable-cooling": false,
  "request-log": false,
  "max-retry-credentials": 0,
  "passthrough-headers": false,
  "incognito-browser": false,
  "kiro-preferred-endpoint": "",
  kiro: null,
  tls: {
    enable: false,
    cert: "",
    key: "",
  },
  pprof: {
    enable: false,
    addr: "127.0.0.1:8316",
  },
  "claude-header-defaults": {
    "user-agent": "",
    "package-version": "",
    "runtime-version": "",
    timeout: "",
  },
  ampcode: {
    "upstream-url": "",
    "upstream-api-key": "",
    "restrict-management-to-localhost": false,
    "model-mappings": null,
    "force-model-mappings": false,
  },
  payload: {
    default: null,
    "default-raw": null,
    override: null,
    "override-raw": null,
    filter: null,
  },
  "oauth-model-alias": {},
};

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function readBoolean(value: unknown, fallback: boolean): boolean {
  return typeof value === "boolean" ? value : fallback;
}

function readNumber(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function readString(value: unknown, fallback: string): string {
  return typeof value === "string" ? value : fallback;
}

function readObject(value: unknown): Record<string, unknown> {
  return isPlainObject(value) ? value : {};
}

function readRoutingStrategy(value: unknown, fallback: RoutingStrategy): RoutingStrategy {
  return isRoutingStrategy(value) ? value : fallback;
}

function readOAuthModelAliases(
  value: unknown
): Record<string, OAuthModelAliasEntry[]> {
  const aliases = readObject(value);
  const next: Record<string, OAuthModelAliasEntry[]> = {};

  for (const [provider, entries] of Object.entries(aliases)) {
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

function toConfig(data: Record<string, unknown>): Config {
  const streaming = readObject(data.streaming);
  const quotaExceeded = readObject(data["quota-exceeded"]);
  const routing = readObject(data.routing);
  const tls = readObject(data.tls);
  const pprof = readObject(data.pprof);
  const claudeHeaderDefaults = readObject(data["claude-header-defaults"]);
  const ampcode = readObject(data.ampcode);
  const payload = readObject(data.payload);

  return {
    "proxy-url": readString(data["proxy-url"], DEFAULT_CONFIG["proxy-url"]),
    "auth-dir": readString(data["auth-dir"], DEFAULT_CONFIG["auth-dir"]),
    "force-model-prefix": readBoolean(data["force-model-prefix"], DEFAULT_CONFIG["force-model-prefix"]),
    streaming: {
      "keepalive-seconds": readNumber(streaming["keepalive-seconds"], DEFAULT_CONFIG.streaming["keepalive-seconds"]),
      "bootstrap-retries": readNumber(streaming["bootstrap-retries"], DEFAULT_CONFIG.streaming["bootstrap-retries"]),
      "nonstream-keepalive-interval": readNumber(
        streaming["nonstream-keepalive-interval"],
        DEFAULT_CONFIG.streaming["nonstream-keepalive-interval"]
      ),
    },
    debug: readBoolean(data.debug, DEFAULT_CONFIG.debug),
    "commercial-mode": readBoolean(data["commercial-mode"], DEFAULT_CONFIG["commercial-mode"]),
    "logging-to-file": readBoolean(data["logging-to-file"], DEFAULT_CONFIG["logging-to-file"]),
    "logs-max-total-size-mb": readNumber(data["logs-max-total-size-mb"], DEFAULT_CONFIG["logs-max-total-size-mb"]),
    "error-logs-max-files": readNumber(data["error-logs-max-files"], DEFAULT_CONFIG["error-logs-max-files"]),
    "usage-statistics-enabled": readBoolean(
      data["usage-statistics-enabled"],
      DEFAULT_CONFIG["usage-statistics-enabled"]
    ),
    "request-retry": readNumber(data["request-retry"], DEFAULT_CONFIG["request-retry"]),
    "max-retry-interval": readNumber(data["max-retry-interval"], DEFAULT_CONFIG["max-retry-interval"]),
    "quota-exceeded": {
      "switch-project": readBoolean(
        quotaExceeded["switch-project"],
        DEFAULT_CONFIG["quota-exceeded"]["switch-project"]
      ),
      "switch-preview-model": readBoolean(
        quotaExceeded["switch-preview-model"],
        DEFAULT_CONFIG["quota-exceeded"]["switch-preview-model"]
      ),
    },
    routing: {
      strategy: readRoutingStrategy(routing.strategy, DEFAULT_CONFIG.routing.strategy),
    },
    "ws-auth": readBoolean(data["ws-auth"], DEFAULT_CONFIG["ws-auth"]),
    "disable-cooling": readBoolean(data["disable-cooling"], DEFAULT_CONFIG["disable-cooling"]),
    "request-log": readBoolean(data["request-log"], DEFAULT_CONFIG["request-log"]),
    "max-retry-credentials": readNumber(
      data["max-retry-credentials"],
      DEFAULT_CONFIG["max-retry-credentials"]
    ),
    "passthrough-headers": readBoolean(
      data["passthrough-headers"],
      DEFAULT_CONFIG["passthrough-headers"]
    ),
    "incognito-browser": readBoolean(
      data["incognito-browser"],
      DEFAULT_CONFIG["incognito-browser"]
    ),
    "kiro-preferred-endpoint": readString(
      data["kiro-preferred-endpoint"],
      DEFAULT_CONFIG["kiro-preferred-endpoint"]
    ),
    kiro: data.kiro ?? DEFAULT_CONFIG.kiro,
    tls: {
      enable: readBoolean(tls.enable, DEFAULT_CONFIG.tls.enable),
      cert: readString(tls.cert, DEFAULT_CONFIG.tls.cert),
      key: readString(tls.key, DEFAULT_CONFIG.tls.key),
    },
    pprof: {
      enable: readBoolean(pprof.enable, DEFAULT_CONFIG.pprof.enable),
      addr: readString(pprof.addr, DEFAULT_CONFIG.pprof.addr),
    },
    "claude-header-defaults": {
      "user-agent": readString(
        claudeHeaderDefaults["user-agent"],
        DEFAULT_CONFIG["claude-header-defaults"]["user-agent"]
      ),
      "package-version": readString(
        claudeHeaderDefaults["package-version"],
        DEFAULT_CONFIG["claude-header-defaults"]["package-version"]
      ),
      "runtime-version": readString(
        claudeHeaderDefaults["runtime-version"],
        DEFAULT_CONFIG["claude-header-defaults"]["runtime-version"]
      ),
      timeout: readString(
        claudeHeaderDefaults.timeout,
        DEFAULT_CONFIG["claude-header-defaults"].timeout
      ),
    },
    ampcode: {
      "upstream-url": readString(ampcode["upstream-url"], DEFAULT_CONFIG.ampcode["upstream-url"]),
      "upstream-api-key": readString(
        ampcode["upstream-api-key"],
        DEFAULT_CONFIG.ampcode["upstream-api-key"]
      ),
      "restrict-management-to-localhost": readBoolean(
        ampcode["restrict-management-to-localhost"],
        DEFAULT_CONFIG.ampcode["restrict-management-to-localhost"]
      ),
      "model-mappings": ampcode["model-mappings"] ?? DEFAULT_CONFIG.ampcode["model-mappings"],
      "force-model-mappings": readBoolean(
        ampcode["force-model-mappings"],
        DEFAULT_CONFIG.ampcode["force-model-mappings"]
      ),
    },
    payload: {
      default: payload.default ?? DEFAULT_CONFIG.payload.default,
      "default-raw": payload["default-raw"] ?? DEFAULT_CONFIG.payload["default-raw"],
      override: payload.override ?? DEFAULT_CONFIG.payload.override,
      "override-raw": payload["override-raw"] ?? DEFAULT_CONFIG.payload["override-raw"],
      filter: payload.filter ?? DEFAULT_CONFIG.payload.filter,
    },
    "oauth-model-alias": readOAuthModelAliases(data["oauth-model-alias"]),
  };
}

function sameConfig<T>(a: T, b: T): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

let idCounter = 0;
function nextStableId(): string {
  return `oauth-alias-${Date.now()}-${++idCounter}`;
}

function stampOAuthIds(cfg: Config): Config {
  const aliases = cfg["oauth-model-alias"];
  if (!aliases || Object.keys(aliases).length === 0) {
    return cfg;
  }

  const stamped: Record<string, OAuthModelAliasEntry[]> = {};
  let changed = false;

  for (const [provider, entries] of Object.entries(aliases)) {
    stamped[provider] = entries.map((entry) => {
      if (entry._id) {
        return entry;
      }

      changed = true;
      return { ...entry, _id: nextStableId() };
    });
  }

  return changed ? { ...cfg, "oauth-model-alias": stamped } : cfg;
}

function stripOAuthIds(cfg: Config): Config {
  const aliases = cfg["oauth-model-alias"];
  if (!aliases || Object.keys(aliases).length === 0) {
    return cfg;
  }

  const cleaned: Record<string, OAuthModelAliasEntry[]> = {};
  for (const [provider, entries] of Object.entries(aliases)) {
    cleaned[provider] = entries.map((entry) => {
      const { _id, ...rest } = entry;
      void _id;
      return rest;
    });
  }

  return { ...cfg, "oauth-model-alias": cleaned };
}

export default function ProxyConfigPage() {
  const [config, setConfig] = useState<Config | null>(null);
  const [originalConfig, setOriginalConfig] = useState<Config | null>(null);
  const [rawJson, setRawJson] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [expandedProviders, setExpandedProviders] = useState<Record<string, boolean>>({});
  const [showProxyWarning, setShowProxyWarning] = useState(false);
  const [resettingProxy, setResettingProxy] = useState(false);
  const { showToast } = useToast();

  const hasUnsavedChanges = !!config && !!originalConfig && !sameConfig(config, originalConfig);

  const getErrorMessage = (error: unknown): string => {
    if (error instanceof Error && error.message.trim()) {
      return error.message;
    }
    return "Unknown error";
  };

  const fetchConfig = useCallback(async (retries = 3, delayMs = 1500) => {
    setLoading(true);

    for (let attempt = 1; attempt <= retries; attempt += 1) {
      try {
        const response = await fetch(API_ENDPOINTS.MANAGEMENT.CONFIG);
        if (!response.ok) {
          if (attempt < retries) {
            await new Promise((resolve) => setTimeout(resolve, delayMs * attempt));
            continue;
          }

          setConfig(null);
          setOriginalConfig(null);
          setRawJson("");
          showToast("Failed to load proxy settings", "error");
          setLoading(false);
          return;
        }

        const data = (await response.json()) as Record<string, unknown>;
        const nextConfig = stampOAuthIds(toConfig(data));
        setConfig(nextConfig);
        setOriginalConfig(nextConfig);
        setRawJson(JSON.stringify(stripOAuthIds(nextConfig), null, 2));
        setLoading(false);
        return;
      } catch {
        if (attempt < retries) {
          await new Promise((resolve) => setTimeout(resolve, delayMs * attempt));
          continue;
        }

        setConfig(null);
        setOriginalConfig(null);
        setRawJson("");
        showToast("Network error while loading proxy settings", "error");
        setLoading(false);
      }
    }
  }, [showToast]);

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      void fetchConfig();
    }, 0);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [fetchConfig]);

  const validateProxyUrl = (value: string): string | null => {
    const trimmed = value.trim();
    if (!trimmed) {
      return null;
    }

    const validSchemes = ["socks5://", "socks5h://", "http://", "https://"];
    const validKeywords = ["direct", "none"];

    if (validKeywords.includes(trimmed)) {
      return null;
    }

    if (!validSchemes.some((scheme) => trimmed.startsWith(scheme))) {
      return 'Proxy URL must start with socks5://, http://, or https:// (or use "direct"/"none" to bypass)';
    }

    try {
      new URL(trimmed);
    } catch {
      return "Invalid proxy URL format. Example: socks5://user:pass@host:port";
    }

    return null;
  };

  const FIELD_ENDPOINTS: Record<
    keyof Pick<
      Config,
      | "proxy-url"
      | "debug"
      | "logging-to-file"
      | "logs-max-total-size-mb"
      | "error-logs-max-files"
      | "usage-statistics-enabled"
      | "request-retry"
      | "max-retry-interval"
      | "request-log"
      | "ws-auth"
      | "force-model-prefix"
    >,
    string
  > = {
    "proxy-url": API_ENDPOINTS.MANAGEMENT.PROXY_URL,
    debug: API_ENDPOINTS.MANAGEMENT.DEBUG,
    "logging-to-file": API_ENDPOINTS.MANAGEMENT.LOGGING_TO_FILE,
    "logs-max-total-size-mb": API_ENDPOINTS.MANAGEMENT.LOGS_MAX_TOTAL_SIZE_MB,
    "error-logs-max-files": API_ENDPOINTS.MANAGEMENT.ERROR_LOGS_MAX_FILES,
    "usage-statistics-enabled": API_ENDPOINTS.MANAGEMENT.USAGE_STATISTICS_ENABLED,
    "request-retry": API_ENDPOINTS.MANAGEMENT.REQUEST_RETRY,
    "max-retry-interval": API_ENDPOINTS.MANAGEMENT.MAX_RETRY_INTERVAL,
    "request-log": API_ENDPOINTS.MANAGEMENT.REQUEST_LOG,
    "ws-auth": API_ENDPOINTS.MANAGEMENT.WS_AUTH,
    "force-model-prefix": API_ENDPOINTS.MANAGEMENT.FORCE_MODEL_PREFIX,
  };

  const NESTED_FIELD_ENDPOINTS = {
    "quota-exceeded": {
      "switch-project": API_ENDPOINTS.MANAGEMENT.QUOTA_EXCEEDED_SWITCH_PROJECT,
      "switch-preview-model": API_ENDPOINTS.MANAGEMENT.QUOTA_EXCEEDED_SWITCH_PREVIEW_MODEL,
    },
    routing: {
      strategy: API_ENDPOINTS.MANAGEMENT.ROUTING_STRATEGY,
    },
  } as const;

  const executeSave = useCallback(async () => {
    if (!config || !originalConfig) {
      return;
    }

    setSaving(true);
    let shouldRefresh = false;

    try {
      const errors: string[] = [];
      let successCount = 0;

      const updateField = async (endpoint: string, value: unknown): Promise<boolean> => {
        try {
          const response = await fetch(endpoint, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ value }),
          });

          if (!response.ok) {
            const data = (await response.json().catch(() => ({}))) as { error?: string };
            errors.push(`${endpoint}: ${data.error ?? response.statusText}`);
            return false;
          }

          return true;
        } catch (error) {
          errors.push(`${endpoint}: ${getErrorMessage(error)}`);
          return false;
        }
      };

      for (const key of Object.keys(FIELD_ENDPOINTS) as Array<keyof typeof FIELD_ENDPOINTS>) {
        if (!sameConfig(originalConfig[key], config[key])) {
          const success = await updateField(FIELD_ENDPOINTS[key], config[key]);
          if (success) {
            successCount += 1;
          }
        }
      }

      for (const [parentKey, subFields] of Object.entries(NESTED_FIELD_ENDPOINTS)) {
        const oldParent =
          originalConfig[parentKey as keyof typeof NESTED_FIELD_ENDPOINTS] as unknown as Record<string, unknown>;
        const newParent =
          config[parentKey as keyof typeof NESTED_FIELD_ENDPOINTS] as unknown as Record<string, unknown>;

        for (const [subKey, endpoint] of Object.entries(subFields)) {
          if (!sameConfig(oldParent[subKey], newParent[subKey])) {
            const success = await updateField(endpoint, newParent[subKey]);
            if (success) {
              successCount += 1;
            }
          }
        }
      }

      const fieldsWithoutEndpoints = [
        "auth-dir",
        "streaming",
        "commercial-mode",
        "disable-cooling",
        "max-retry-credentials",
        "passthrough-headers",
        "incognito-browser",
        "kiro-preferred-endpoint",
        "kiro",
        "tls",
        "pprof",
        "claude-header-defaults",
        "ampcode",
        "payload",
        "oauth-model-alias",
      ] as const satisfies ReadonlyArray<keyof Config>;

      const yamlChanges: Record<string, unknown> = {};
      for (const key of fieldsWithoutEndpoints) {
        if (!sameConfig(originalConfig[key], config[key])) {
          yamlChanges[key] =
            key === "oauth-model-alias"
              ? stripOAuthIds(config)["oauth-model-alias"]
              : config[key];
        }
      }

      let liveConfig: Record<string, unknown> | null = null;
      try {
        const currentResponse = await fetch(API_ENDPOINTS.MANAGEMENT.CONFIG);
        if (currentResponse.ok) {
          liveConfig = (await currentResponse.json()) as Record<string, unknown>;
        } else {
          await currentResponse.body?.cancel();
        }
      } catch {
        liveConfig = null;
      }

      if (liveConfig && !("auth-dir" in liveConfig) && !("auth-dir" in yamlChanges)) {
        yamlChanges["auth-dir"] = config["auth-dir"] || DEFAULT_CONFIG["auth-dir"];
      }

      if (Object.keys(yamlChanges).length > 0) {
        try {
          const rawYamlResponse = await fetch(API_ENDPOINTS.MANAGEMENT.CONFIG_YAML);
          if (!rawYamlResponse.ok) {
            errors.push("Failed to fetch current config.yaml for YAML update");
          } else {
            const rawYaml = await rawYamlResponse.text();
            const mergedYaml = mergeConfigYaml(rawYaml, yamlChanges);
            const yamlResponse = await fetch(API_ENDPOINTS.MANAGEMENT.CONFIG_YAML, {
              method: "PUT",
              headers: { "Content-Type": "text/yaml" },
              body: mergedYaml,
            });

            if (!yamlResponse.ok) {
              errors.push("Failed to save config.yaml");
            } else {
              successCount += Object.keys(yamlChanges).length;
            }
          }
        } catch (error) {
          errors.push(`Failed to update config.yaml: ${getErrorMessage(error)}`);
        }
      }

      if (errors.length > 0) {
        showToast(`Some settings failed to save: ${errors.join(", ")}`, "error");
      } else if (successCount === 0) {
        showToast("No changes to save", "info");
      } else {
        showToast(`Proxy settings saved (${successCount} field${successCount > 1 ? "s" : ""} updated)`, "success");
        setOriginalConfig(config);
        setRawJson(JSON.stringify(stripOAuthIds(config), null, 2));
        shouldRefresh = true;
      }
    } catch (error) {
      showToast(`Failed to save proxy settings: ${getErrorMessage(error)}`, "error");
    } finally {
      setSaving(false);
      if (shouldRefresh) {
        window.setTimeout(() => {
          void fetchConfig(3, 1000);
        }, 1500);
      }
    }
  }, [config, fetchConfig, originalConfig, showToast]);

  const handleSave = async () => {
    if (!config) {
      return;
    }

    const proxyError = validateProxyUrl(config["proxy-url"]);
    if (proxyError) {
      showToast(proxyError, "error");
      return;
    }

    if (config["proxy-url"].trim() && config["proxy-url"] !== originalConfig?.["proxy-url"]) {
      setShowProxyWarning(true);
      return;
    }

    await executeSave();
  };

  const handleDiscard = () => {
    if (!originalConfig) {
      return;
    }

    setConfig(originalConfig);
    setRawJson(JSON.stringify(stripOAuthIds(originalConfig), null, 2));
    showToast("Changes discarded", "info");
  };

  const handleEmergencyProxyReset = async () => {
    setResettingProxy(true);
    try {
      const response = await fetch(API_ENDPOINTS.MANAGEMENT.CONFIG_YAML, {
        method: "PUT",
        headers: { "Content-Type": "text/yaml" },
        body: yaml.dump({ "proxy-url": "" }, { lineWidth: -1, noRefs: true, quotingType: '"', forceQuotes: true }),
      });

      if (response.ok) {
        showToast("Proxy URL cleared. Reloading settings...", "success");
        window.setTimeout(() => {
          void fetchConfig();
        }, 2000);
      } else {
        showToast("Failed to clear proxy URL", "error");
      }
    } catch {
      showToast("Network error while resetting proxy URL", "error");
    } finally {
      setResettingProxy(false);
    }
  };

  const updateConfig = <K extends keyof Config>(key: K, value: Config[K]) => {
    if (!config) {
      return;
    }
    setConfig({ ...config, [key]: value });
  };

  const updateStreamingConfig = (key: keyof StreamingConfig, value: number) => {
    if (!config) {
      return;
    }
    setConfig({
      ...config,
      streaming: {
        ...config.streaming,
        [key]: value,
      },
    });
  };

  const updateQuotaConfig = (key: keyof QuotaExceededConfig, value: boolean) => {
    if (!config) {
      return;
    }
    setConfig({
      ...config,
      "quota-exceeded": {
        ...config["quota-exceeded"],
        [key]: value,
      },
    });
  };

  const updateRoutingConfig = (key: keyof RoutingConfig, value: RoutingConfig[keyof RoutingConfig]) => {
    if (!config) {
      return;
    }
    setConfig({
      ...config,
      routing: {
        ...config.routing,
        [key]: value,
      },
    });
  };

  const updateTlsConfig = (key: keyof TlsConfig, value: string | boolean) => {
    if (!config) {
      return;
    }
    setConfig({
      ...config,
      tls: {
        ...config.tls,
        [key]: value,
      },
    });
  };

  const updatePprofConfig = (key: keyof PprofConfig, value: string | boolean) => {
    if (!config) {
      return;
    }
    setConfig({
      ...config,
      pprof: {
        ...config.pprof,
        [key]: value,
      },
    });
  };

  const updateClaudeHeaderDefaults = (key: keyof ClaudeHeaderDefaults, value: string) => {
    if (!config) {
      return;
    }
    setConfig({
      ...config,
      "claude-header-defaults": {
        ...config["claude-header-defaults"],
        [key]: value,
      },
    });
  };

  const updateAmpcodeConfig = (key: keyof AmpcodeConfig, value: string | boolean | unknown) => {
    if (!config) {
      return;
    }
    setConfig({
      ...config,
      ampcode: {
        ...config.ampcode,
        [key]: value,
      },
    });
  };

  const updatePayloadConfig = (key: keyof PayloadConfig, value: unknown) => {
    if (!config) {
      return;
    }
    setConfig({
      ...config,
      payload: {
        ...config.payload,
        [key]: value,
      },
    });
  };

  const toggleProviderExpanded = (provider: string) => {
    setExpandedProviders((current) => ({
      ...current,
      [provider]: !current[provider],
    }));
  };

  const updateOAuthAliasEntry = (
    provider: string,
    index: number,
    field: keyof OAuthModelAliasEntry,
    value: string | boolean
  ) => {
    if (!config) {
      return;
    }

    const aliases = config["oauth-model-alias"];
    const entries = [...(aliases[provider] ?? [])];
    entries[index] = { ...entries[index], [field]: value };
    setConfig({
      ...config,
      "oauth-model-alias": {
        ...aliases,
        [provider]: entries,
      },
    });
  };

  const addOAuthAliasEntry = (provider: string) => {
    if (!config) {
      return;
    }

    const aliases = config["oauth-model-alias"];
    const entries = [
      ...(aliases[provider] ?? []),
      { name: "", alias: "", _id: nextStableId() },
    ];
    setConfig({
      ...config,
      "oauth-model-alias": {
        ...aliases,
        [provider]: entries,
      },
    });
  };

  const removeOAuthAliasEntry = (provider: string, index: number) => {
    if (!config) {
      return;
    }

    const aliases = config["oauth-model-alias"];
    const entries = (aliases[provider] ?? []).filter((_, currentIndex) => currentIndex !== index);
    setConfig({
      ...config,
      "oauth-model-alias": {
        ...aliases,
        [provider]: entries,
      },
    });
  };

  if (loading) {
    return (
      <div className="space-y-4">
        <section className="rounded-lg border border-[var(--surface-border)] bg-[var(--surface-base)] p-4">
          <h1 className="text-xl font-semibold tracking-tight text-[var(--text-primary)]">Proxy Settings</h1>
        </section>
        <div className="rounded-lg border border-[var(--surface-border)] bg-[var(--surface-base)] p-6">
          <div className="flex items-center justify-center">
            <div className="flex flex-col items-center gap-4">
              <div className="size-8 animate-spin rounded-full border-4 border-[var(--surface-border)] border-t-blue-500" />
              <p className="text-[var(--text-muted)]">Loading proxy settings...</p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (!config) {
    return (
      <div className="space-y-4">
        <section className="rounded-lg border border-[var(--surface-border)] bg-[var(--surface-base)] p-4">
          <h1 className="text-xl font-semibold tracking-tight text-[var(--text-primary)]">Proxy Settings</h1>
        </section>
        <div className="space-y-4 rounded-lg border border-[var(--surface-border)] bg-[var(--surface-base)] p-6 text-center">
          <div>
            <p className="text-[var(--text-secondary)]">Failed to load proxy settings</p>
            <p className="mt-1 text-xs text-[var(--text-muted)]">
              This can happen if an invalid proxy URL was configured, preventing the management API
              from responding.
            </p>
          </div>
          <div className="flex flex-col items-center gap-2 sm:flex-row sm:justify-center">
            <Button onClick={() => void fetchConfig()} className="px-2.5 py-1 text-xs">
              Retry
            </Button>
            <Button
              variant="danger"
              onClick={handleEmergencyProxyReset}
              disabled={resettingProxy}
              className="px-2.5 py-1 text-xs"
            >
              {resettingProxy ? "Resetting..." : "Clear Proxy URL"}
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <section className="rounded-lg border border-[var(--surface-border)] bg-[var(--surface-base)] p-4">
        <div className="flex flex-col items-start justify-between gap-3 sm:flex-row">
          <div>
            <h1 className="text-xl font-semibold tracking-tight text-[var(--text-primary)]">Proxy Settings</h1>
            <p className="mt-1 text-sm text-[var(--text-muted)]">
              Configure runtime settings, streaming behavior, retry handling, and advanced proxy
              features.
            </p>
          </div>
          <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:flex-wrap">
            {hasUnsavedChanges ? (
              <>
                <span
                  className="flex items-center gap-2 rounded-md border px-3 py-1 text-xs font-medium"
                  style={{
                    borderColor: "var(--state-warning-border)",
                    backgroundColor: "var(--state-warning-bg)",
                    color: "var(--state-warning-text)",
                  }}
                >
                  <span
                    className="size-1.5 rounded-full"
                    style={{ backgroundColor: "var(--state-warning-accent)" }}
                  />
                  Unsaved changes
                </span>
                <Button variant="ghost" onClick={handleDiscard} disabled={saving} className="px-2.5 py-1 text-xs">
                  Discard Changes
                </Button>
              </>
            ) : null}
            <Button onClick={() => void handleSave()} disabled={saving || !hasUnsavedChanges} className="px-2.5 py-1 text-xs">
              {saving ? "Saving..." : "Save Changes"}
            </Button>
          </div>
        </div>
      </section>

      <div
        className="rounded-md border p-3 text-sm"
        style={{
          borderColor: "var(--state-warning-border)",
          backgroundColor: "var(--state-warning-bg)",
          color: "var(--state-warning-text)",
        }}
      >
        <strong>Warning:</strong>{" "}
        <span>
          Invalid configuration may prevent the proxy from starting or make the management API
          unreachable. Review changes carefully before saving.
        </span>
      </div>

      <AgentConfigEditor
        config={config}
        expandedProviders={expandedProviders}
        updateConfig={updateConfig}
        updateStreamingConfig={updateStreamingConfig}
        updateQuotaConfig={updateQuotaConfig}
        updateRoutingConfig={updateRoutingConfig}
        updateTlsConfig={updateTlsConfig}
        updatePprofConfig={updatePprofConfig}
        updateClaudeHeaderDefaults={updateClaudeHeaderDefaults}
        updateAmpcodeConfig={updateAmpcodeConfig}
        updatePayloadConfig={updatePayloadConfig}
        toggleProviderExpanded={toggleProviderExpanded}
        updateOAuthAliasEntry={updateOAuthAliasEntry}
        addOAuthAliasEntry={addOAuthAliasEntry}
        removeOAuthAliasEntry={removeOAuthAliasEntry}
      />

      <ConfigPreview rawJson={rawJson} />

      <div className="rounded-lg border border-[var(--surface-border)] bg-[var(--surface-base)] p-4 text-xs text-[var(--text-muted)]">
        Save changes here affects proxy runtime settings. Some fields are applied through dedicated
        management endpoints, while advanced fields are merged into `config.yaml`.
      </div>

      <ConfirmDialog
        isOpen={showProxyWarning}
        onClose={() => setShowProxyWarning(false)}
        onConfirm={() => {
          void executeSave();
        }}
        title="Proxy URL Changed"
        message={`Setting a proxy URL will route outbound traffic through "${config["proxy-url"]}". If it is unreachable, this settings page may stop loading until the proxy URL is cleared.`}
        confirmLabel="Save Anyway"
        cancelLabel="Cancel"
        variant="warning"
      />
    </div>
  );
}
