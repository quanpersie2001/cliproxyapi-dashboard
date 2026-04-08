"use client";

import { useCallback, useEffect, useState } from "react";
import type { ReactNode } from "react";
import yaml from "js-yaml";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { useToast } from "@/components/ui/toast";
import { API_ENDPOINTS } from "@/lib/api-endpoints";
import {
  DEFAULT_ROUTING_STRATEGY,
  isRoutingStrategy,
  ROUTING_STRATEGIES,
  type RoutingStrategy,
} from "@/lib/routing-strategy";

type ProxyConfig = {
  "proxy-url": string;
  debug: boolean;
  "logging-to-file": boolean;
  "logs-max-total-size-mb": number;
  "error-logs-max-files": number;
  "usage-statistics-enabled": boolean;
  "request-retry": number;
  "max-retry-interval": number;
  "request-log": boolean;
  "ws-auth": boolean;
  "force-model-prefix": boolean;
  "quota-exceeded": {
    "switch-project": boolean;
    "switch-preview-model": boolean;
  };
  routing: {
    strategy: RoutingStrategy;
  };
};

type ConfigKey = keyof ProxyConfig;

const DEFAULT_CONFIG: ProxyConfig = {
  "proxy-url": "",
  debug: false,
  "logging-to-file": false,
  "logs-max-total-size-mb": 0,
  "error-logs-max-files": 10,
  "usage-statistics-enabled": true,
  "request-retry": 3,
  "max-retry-interval": 30,
  "request-log": false,
  "ws-auth": true,
  "force-model-prefix": false,
  "quota-exceeded": {
    "switch-project": true,
    "switch-preview-model": true,
  },
  routing: {
    strategy: DEFAULT_ROUTING_STRATEGY,
  },
};

const FIELD_ENDPOINTS: Record<Exclude<ConfigKey, "quota-exceeded" | "routing">, string> = {
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

const NESTED_ENDPOINTS = {
  "quota-exceeded": {
    "switch-project": API_ENDPOINTS.MANAGEMENT.QUOTA_EXCEEDED_SWITCH_PROJECT,
    "switch-preview-model": API_ENDPOINTS.MANAGEMENT.QUOTA_EXCEEDED_SWITCH_PREVIEW_MODEL,
  },
  routing: {
    strategy: API_ENDPOINTS.MANAGEMENT.ROUTING_STRATEGY,
  },
} as const;

function readBoolean(value: unknown, fallback: boolean): boolean {
  return typeof value === "boolean" ? value : fallback;
}

function readNumber(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function readString(value: unknown, fallback: string): string {
  return typeof value === "string" ? value : fallback;
}

function readRoutingStrategy(value: unknown, fallback: RoutingStrategy): RoutingStrategy {
  return isRoutingStrategy(value) ? value : fallback;
}

function toConfig(data: Record<string, unknown>): ProxyConfig {
  const quotaExceeded = (data["quota-exceeded"] as Record<string, unknown> | undefined) ?? {};
  const routing = (data.routing as Record<string, unknown> | undefined) ?? {};

  return {
    "proxy-url": readString(data["proxy-url"], DEFAULT_CONFIG["proxy-url"]),
    debug: readBoolean(data.debug, DEFAULT_CONFIG.debug),
    "logging-to-file": readBoolean(data["logging-to-file"], DEFAULT_CONFIG["logging-to-file"]),
    "logs-max-total-size-mb": readNumber(data["logs-max-total-size-mb"], DEFAULT_CONFIG["logs-max-total-size-mb"]),
    "error-logs-max-files": readNumber(data["error-logs-max-files"], DEFAULT_CONFIG["error-logs-max-files"]),
    "usage-statistics-enabled": readBoolean(data["usage-statistics-enabled"], DEFAULT_CONFIG["usage-statistics-enabled"]),
    "request-retry": readNumber(data["request-retry"], DEFAULT_CONFIG["request-retry"]),
    "max-retry-interval": readNumber(data["max-retry-interval"], DEFAULT_CONFIG["max-retry-interval"]),
    "request-log": readBoolean(data["request-log"], DEFAULT_CONFIG["request-log"]),
    "ws-auth": readBoolean(data["ws-auth"], DEFAULT_CONFIG["ws-auth"]),
    "force-model-prefix": readBoolean(data["force-model-prefix"], DEFAULT_CONFIG["force-model-prefix"]),
    "quota-exceeded": {
      "switch-project": readBoolean(quotaExceeded["switch-project"], DEFAULT_CONFIG["quota-exceeded"]["switch-project"]),
      "switch-preview-model": readBoolean(quotaExceeded["switch-preview-model"], DEFAULT_CONFIG["quota-exceeded"]["switch-preview-model"]),
    },
    routing: {
      strategy: readRoutingStrategy(routing.strategy, DEFAULT_CONFIG.routing.strategy),
    },
  };
}

function sameConfig(a: ProxyConfig, b: ProxyConfig): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

function FieldRow({
  label,
  description,
  children,
}: {
  label: string;
  description: string;
  children: ReactNode;
}) {
  return (
    <div className="rounded-lg border border-[#e5e5e5] bg-white p-4">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div className="space-y-1">
          <div className="text-sm font-semibold text-black">{label}</div>
          <p className="text-xs text-[#777169]">{description}</p>
        </div>
        <div className="md:w-[320px]">{children}</div>
      </div>
    </div>
  );
}

function Toggle({
  checked,
  onChange,
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className={[
        "relative inline-flex h-7 w-12 shrink-0 items-center rounded-full border-2 border-transparent transition-colors",
        checked ? "bg-emerald-500" : "bg-[#d7d7d7]",
      ].join(" ")}
    >
      <span
        className={[
          "inline-block h-6 w-6 rounded-full bg-white shadow transition-transform",
          checked ? "translate-x-5" : "translate-x-0",
        ].join(" ")}
      />
    </button>
  );
}

export default function ProxyConfigPage() {
  const [config, setConfig] = useState<ProxyConfig | null>(null);
  const [originalConfig, setOriginalConfig] = useState<ProxyConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [resettingProxy, setResettingProxy] = useState(false);
  const [showProxyWarning, setShowProxyWarning] = useState(false);
  const { showToast } = useToast();

  const fetchConfig = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(API_ENDPOINTS.MANAGEMENT.CONFIG);
      if (!res.ok) {
        setConfig(null);
        setOriginalConfig(null);
        showToast("Failed to load proxy settings", "error");
        return;
      }

      const data = (await res.json()) as Record<string, unknown>;
      const nextConfig = toConfig(data);
      setConfig(nextConfig);
      setOriginalConfig(nextConfig);
    } catch {
      setConfig(null);
      setOriginalConfig(null);
      showToast("Network error while loading proxy settings", "error");
    } finally {
      setLoading(false);
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

  const hasUnsavedChanges = !!config && !!originalConfig && !sameConfig(config, originalConfig);

  const updateField = <K extends keyof ProxyConfig>(key: K, value: ProxyConfig[K]) => {
    if (!config) return;
    setConfig({ ...config, [key]: value });
  };

  const updateQuotaField = (key: keyof ProxyConfig["quota-exceeded"], value: boolean) => {
    if (!config) return;
    setConfig({
      ...config,
      "quota-exceeded": {
        ...config["quota-exceeded"],
        [key]: value,
      },
    });
  };

  const updateRoutingStrategy = (strategy: RoutingStrategy) => {
    if (!config) return;
    setConfig({
      ...config,
      routing: {
        ...config.routing,
        strategy,
      },
    });
  };

  const executeSave = useCallback(async () => {
    if (!config || !originalConfig) return;

    setSaving(true);
    try {
      const errors: string[] = [];
      let updates = 0;

      const putJson = async (endpoint: string, value: unknown) => {
        const response = await fetch(endpoint, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ value }),
        });
        if (!response.ok) {
          const data = (await response.json().catch(() => ({}))) as { error?: string };
          errors.push(data.error ?? response.statusText);
          return false;
        }
        return true;
      };

      for (const key of Object.keys(FIELD_ENDPOINTS) as Array<keyof typeof FIELD_ENDPOINTS>) {
        if (!sameConfig({ [key]: originalConfig[key] } as ProxyConfig, { [key]: config[key] } as ProxyConfig)) {
          const ok = await putJson(FIELD_ENDPOINTS[key], config[key]);
          if (ok) updates += 1;
        }
      }

      for (const [key, endpoint] of Object.entries(NESTED_ENDPOINTS)) {
        const nestedKey = key as keyof typeof NESTED_ENDPOINTS;
        if (!sameConfig(originalConfig[nestedKey] as ProxyConfig[typeof nestedKey], config[nestedKey] as ProxyConfig[typeof nestedKey])) {
          const nested = config[nestedKey] as Record<string, unknown>;
          for (const [subKey, subEndpoint] of Object.entries(endpoint)) {
            const ok = await putJson(subEndpoint, nested[subKey]);
            if (ok) updates += 1;
          }
        }
      }

      if (errors.length > 0) {
        showToast(`Some settings failed to save: ${errors.join(", ")}`, "error");
      } else if (updates > 0) {
        showToast("Proxy settings saved", "success");
        setOriginalConfig(config);
      } else {
        showToast("No changes to save", "info");
      }
    } catch {
      showToast("Failed to save proxy settings", "error");
    } finally {
      setSaving(false);
    }
  }, [config, originalConfig, showToast]);

  const handleSave = async () => {
    if (!config) return;

    if (config["proxy-url"].trim() && config["proxy-url"] !== originalConfig?.["proxy-url"]) {
      setShowProxyWarning(true);
      return;
    }

    await executeSave();
  };

  const handleDiscard = () => {
    if (!originalConfig) return;
    setConfig(originalConfig);
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
        await fetchConfig();
      } else {
        showToast("Failed to clear proxy URL", "error");
      }
    } catch {
      showToast("Network error while resetting proxy URL", "error");
    } finally {
      setResettingProxy(false);
    }
  };

  if (loading) {
    return (
      <div className="space-y-4">
        <section className="rounded-lg border border-[#e5e5e5] bg-white p-4">
          <h1 className="text-xl font-semibold tracking-tight text-black">Proxy Settings</h1>
        </section>
        <div className="rounded-lg border border-[#e5e5e5] bg-white p-6">
          <div className="flex items-center justify-center">
            <div className="h-8 w-8 animate-spin rounded-full border-4 border-[#ddd] border-t-blue-500" />
          </div>
        </div>
      </div>
    );
  }

  if (!config) {
    return (
      <div className="space-y-4">
        <section className="rounded-lg border border-[#e5e5e5] bg-white p-4">
          <h1 className="text-xl font-semibold tracking-tight text-black">Proxy Settings</h1>
        </section>
        <div className="rounded-lg border border-[#e5e5e5] bg-white p-6 text-center space-y-4">
          <div>
            <p className="text-[#4e4e4e]">Failed to load proxy settings</p>
            <p className="mt-1 text-xs text-[#777169]">
              This usually means the proxy URL is wrong and the management API is unreachable through the current route.
            </p>
          </div>
          <div className="flex flex-col items-center justify-center gap-2 sm:flex-row">
            <Button onClick={() => void fetchConfig()} className="px-3 py-1.5 text-xs">
              Retry
            </Button>
            <Button variant="danger" onClick={handleEmergencyProxyReset} disabled={resettingProxy} className="px-3 py-1.5 text-xs">
              {resettingProxy ? "Resetting..." : "Clear Proxy URL"}
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <section className="rounded-lg border border-[#e5e5e5] bg-white p-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h1 className="text-xl font-semibold tracking-tight text-black">Proxy Settings</h1>
            <p className="mt-1 text-sm text-[#777169]">
              Runtime settings for CLIProxyAPI proxy behavior and request handling.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {hasUnsavedChanges && (
              <span className="flex items-center gap-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-1.5 text-xs font-medium text-amber-700">
                Unsaved changes
              </span>
            )}
            <Button variant="ghost" onClick={handleDiscard} disabled={saving || !hasUnsavedChanges} className="px-3 py-1.5 text-xs">
              Discard
            </Button>
            <Button onClick={handleSave} disabled={saving || !hasUnsavedChanges} className="px-3 py-1.5 text-xs">
              {saving ? "Saving..." : "Save Settings"}
            </Button>
          </div>
        </div>
      </section>

      <section className="space-y-3">
        <FieldRow
          label="Proxy URL"
          description="Outbound HTTP proxy used by CLIProxyAPI."
        >
          <Input
            type="text"
            name="proxy-url"
            value={config["proxy-url"]}
            onChange={(value) => updateField("proxy-url", value)}
            placeholder="socks5://user:pass@host:port"
          />
        </FieldRow>

        <FieldRow
          label="Request Retry"
          description="How many times to retry transient upstream failures."
        >
          <Input
            type="number"
            name="request-retry"
            value={config["request-retry"].toString()}
            onChange={(value) => updateField("request-retry", Math.max(0, parseInt(value, 10) || 0))}
          />
        </FieldRow>

        <FieldRow
          label="Max Retry Interval"
          description="Maximum retry delay in seconds."
        >
          <Input
            type="number"
            name="max-retry-interval"
            value={config["max-retry-interval"].toString()}
            onChange={(value) => updateField("max-retry-interval", Math.max(0, parseInt(value, 10) || 0))}
          />
        </FieldRow>

        <FieldRow
          label="Logs Max Total Size"
          description="Maximum total log size in MB before rotation/cleanup."
        >
          <Input
            type="number"
            name="logs-max-total-size-mb"
            value={config["logs-max-total-size-mb"].toString()}
            onChange={(value) => updateField("logs-max-total-size-mb", Math.max(0, parseInt(value, 10) || 0))}
          />
        </FieldRow>
      </section>

      <section className="grid gap-3 lg:grid-cols-2">
        <FieldRow label="Debug Logging" description="Increase backend verbosity for troubleshooting.">
          <Toggle checked={config.debug} onChange={(next) => updateField("debug", next)} />
        </FieldRow>
        <FieldRow label="Log to File" description="Write logs to rotating files instead of stdout.">
          <Toggle checked={config["logging-to-file"]} onChange={(next) => updateField("logging-to-file", next)} />
        </FieldRow>
        <FieldRow label="Usage Statistics" description="Keep in-memory usage aggregation enabled.">
          <Toggle checked={config["usage-statistics-enabled"]} onChange={(next) => updateField("usage-statistics-enabled", next)} />
        </FieldRow>
        <FieldRow label="Request Log" description="Record per-request logging metadata.">
          <Toggle checked={config["request-log"]} onChange={(next) => updateField("request-log", next)} />
        </FieldRow>
        <FieldRow label="WebSocket Auth" description="Require API key auth for the WebSocket API.">
          <Toggle checked={config["ws-auth"]} onChange={(next) => updateField("ws-auth", next)} />
        </FieldRow>
        <FieldRow label="Force Model Prefix" description="Require prefixed model routing.">
          <Toggle checked={config["force-model-prefix"]} onChange={(next) => updateField("force-model-prefix", next)} />
        </FieldRow>
      </section>

      <section className="grid gap-3 lg:grid-cols-2">
        <FieldRow
          label="Quota Exceeded: Switch Project"
          description="Auto-switch projects when quota is exhausted."
        >
          <Toggle
            checked={config["quota-exceeded"]["switch-project"]}
            onChange={(next) => updateQuotaField("switch-project", next)}
          />
        </FieldRow>
        <FieldRow
          label="Quota Exceeded: Switch Preview Model"
          description="Auto-switch to a preview model when quota is exhausted."
        >
          <Toggle
            checked={config["quota-exceeded"]["switch-preview-model"]}
            onChange={(next) => updateQuotaField("switch-preview-model", next)}
          />
        </FieldRow>
        <FieldRow
          label="Routing Strategy"
          description="Select the provider selection strategy."
        >
          <select
            value={config.routing.strategy}
            onChange={(event) => {
              const nextStrategy = event.target.value;
              if (isRoutingStrategy(nextStrategy)) {
                updateRoutingStrategy(nextStrategy);
              }
            }}
            className="w-full rounded-sm border border-[#e5e5e5] bg-[#f5f5f5] px-3 py-2 text-sm text-black focus:border-blue-400/50 focus:outline-none focus:ring-1 focus:ring-blue-400/30"
          >
            {ROUTING_STRATEGIES.map((strategy) => (
              <option key={strategy} value={strategy}>
                {strategy === "round-robin" ? "Round Robin" : "Fill First"}
              </option>
            ))}
          </select>
        </FieldRow>
        <FieldRow
          label="Error Log Files"
          description="Maximum retained error log files."
        >
          <Input
            type="number"
            name="error-logs-max-files"
            value={config["error-logs-max-files"].toString()}
            onChange={(value) => updateField("error-logs-max-files", Math.max(0, parseInt(value, 10) || 0))}
          />
        </FieldRow>
      </section>

      <div className="rounded-lg border border-[#e5e5e5] bg-white p-4 text-xs text-[#777169]">
        Save changes here only affect proxy runtime settings. Authentication, provider management, usage history, and container control live in the other sections.
      </div>

      <ConfirmDialog
        isOpen={showProxyWarning}
        onClose={() => setShowProxyWarning(false)}
        onConfirm={() => {
          setShowProxyWarning(false);
          void executeSave();
        }}
        title="Proxy URL Changed"
        message={`Setting a proxy URL will route outbound traffic through "${config["proxy-url"]}". If it is unreachable, the settings page may stop loading until you clear it.`}
        confirmLabel="Save Anyway"
        cancelLabel="Cancel"
        variant="warning"
      />
    </div>
  );
}
