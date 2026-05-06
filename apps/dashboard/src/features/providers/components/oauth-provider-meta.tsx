"use client";

import { useEffect, useState } from "react";
import { useTheme } from "@/components/theme-provider";
import { cn } from "@/lib/utils";

type ProviderAsset = string | { light: string; dark: string };

type ProviderTheme = {
  bg: string;
  border: string;
  text: string;
};

export const OAUTH_PROVIDERS = [
  {
    id: "claude",
    name: "Claude Code",
    description: "Anthropic Claude (Pro/Max subscription)",
    authEndpoint: "/api/management/anthropic-auth-url?is_webui=true",
    requiresCallback: true,
    asset: "/provider-icons/claude.svg",
    fallback: "CC",
    theme: {
      bg: "var(--oauth-provider-claude-bg)",
      border: "var(--oauth-provider-claude-border)",
      text: "var(--oauth-provider-claude-text)",
    },
  },
  {
    id: "gemini-cli",
    name: "Gemini CLI",
    description: "Google Gemini (via Google OAuth)",
    authEndpoint: "/api/management/gemini-cli-auth-url?project_id=ALL&is_webui=true",
    requiresCallback: true,
    asset: "/provider-icons/gemini.svg",
    fallback: "GC",
    theme: {
      bg: "var(--oauth-provider-gemini-bg)",
      border: "var(--oauth-provider-gemini-border)",
      text: "var(--oauth-provider-gemini-text)",
    },
  },
  {
    id: "codex",
    name: "Codex",
    description: "OpenAI Codex",
    authEndpoint: "/api/management/codex-auth-url?is_webui=true",
    requiresCallback: true,
    asset: "/provider-icons/codex.svg",
    fallback: "CX",
    theme: {
      bg: "var(--oauth-provider-codex-bg)",
      border: "var(--oauth-provider-codex-border)",
      text: "var(--oauth-provider-codex-text)",
    },
  },
  {
    id: "antigravity",
    name: "Antigravity",
    description: "Google Antigravity (via Google OAuth)",
    authEndpoint: "/api/management/antigravity-auth-url?is_webui=true",
    requiresCallback: true,
    asset: "/provider-icons/antigravity.svg",
    fallback: "AG",
    theme: {
      bg: "var(--oauth-provider-antigravity-bg)",
      border: "var(--oauth-provider-antigravity-border)",
      text: "var(--oauth-provider-antigravity-text)",
    },
  },
  {
    id: "iflow",
    name: "iFlow",
    description: "iFlytek iFlow (via OAuth)",
    authEndpoint: "/api/management/iflow-auth-url?is_webui=true",
    requiresCallback: true,
    asset: "/provider-icons/iflow.svg",
    fallback: "IF",
    theme: {
      bg: "var(--oauth-provider-iflow-bg)",
      border: "var(--oauth-provider-iflow-border)",
      text: "var(--oauth-provider-iflow-text)",
    },
  },
  {
    id: "qwen",
    name: "Qwen Code",
    description: "Alibaba Qwen Code (device OAuth)",
    authEndpoint: "/api/management/qwen-auth-url?is_webui=true",
    requiresCallback: false,
    asset: "/provider-icons/qwen.svg",
    fallback: "QW",
    theme: {
      bg: "var(--oauth-provider-qwen-bg)",
      border: "var(--oauth-provider-qwen-border)",
      text: "var(--oauth-provider-qwen-text)",
    },
  },
] as const;

export type OAuthProviderEntry = (typeof OAUTH_PROVIDERS)[number];
export type OAuthProviderId = OAuthProviderEntry["id"];

const DEFAULT_PROVIDER_THEME: ProviderTheme = {
  bg: "var(--oauth-provider-default-bg)",
  border: "var(--oauth-provider-default-border)",
  text: "var(--oauth-provider-default-text)",
};

const OAUTH_PROVIDER_BY_ID = new Map<OAuthProviderId, OAuthProviderEntry>(
  OAUTH_PROVIDERS.map((provider) => [provider.id, provider])
);

const OAUTH_PROVIDER_ALIASES: Record<string, OAuthProviderId> = {
  antigravity: "antigravity",
  claude: "claude",
  "claude-code": "claude",
  codex: "codex",
  gemini: "gemini-cli",
  "gemini-cli": "gemini-cli",
  iflow: "iflow",
  qwen: "qwen",
};

function toFallbackLabel(value: string): string {
  const compact = value.replace(/[^a-z0-9]+/gi, "").toUpperCase();
  return compact.slice(0, 2) || "??";
}

function toDisplayLabel(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return "Unknown Provider";
  if (trimmed.toLowerCase() === "iflow") return "iFlow";
  return trimmed
    .split(/[-_\s]+/)
    .filter(Boolean)
    .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
    .join(" ");
}

export function normalizeOAuthProviderKey(value: string): OAuthProviderId | null {
  const normalized = value.trim().toLowerCase();
  return normalized ? OAUTH_PROVIDER_ALIASES[normalized] ?? null : null;
}

export function getOAuthProviderById(id: OAuthProviderId | null) {
  if (!id) return null;
  return OAUTH_PROVIDER_BY_ID.get(id) ?? null;
}

export function getOAuthProviderPresentation(value: string) {
  const normalizedId = normalizeOAuthProviderKey(value);
  const provider = normalizedId ? getOAuthProviderById(normalizedId) : null;

  if (provider) {
    return provider;
  }

  return {
    id: null,
    name: toDisplayLabel(value),
    description: "",
    authEndpoint: "",
    requiresCallback: false,
    fallback: toFallbackLabel(value),
    theme: DEFAULT_PROVIDER_THEME,
  };
}

export function OAuthProviderIcon({
  provider,
  size = "md",
  className,
}: {
  provider: string;
  size?: "sm" | "md";
  className?: string;
}) {
  const { resolvedTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  const presentation = getOAuthProviderPresentation(provider);
  const asset = ("asset" in presentation ? presentation.asset : undefined) as ProviderAsset | undefined;

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- hydration flag only
    setMounted(true);
  }, []);

  const lightSrc =
    typeof asset === "string" ? asset : asset ? asset.light : null;
  const darkSrc = typeof asset === "object" ? asset.dark : null;
  const iconSizeClass = size === "sm" ? "h-4 w-4" : "h-5 w-5";

  return (
    <span
      className={cn(
        "flex shrink-0 items-center justify-center rounded-lg border shadow-[var(--shadow-edge)]",
        size === "sm" ? "size-9" : "size-10",
        className
      )}
      style={{
        background: presentation.theme.bg,
        borderColor: presentation.theme.border,
        color: presentation.theme.text,
      }}
      aria-hidden="true"
    >
      {lightSrc ? (
        <span className="relative flex items-center justify-center">
          <img
            src={lightSrc}
            alt=""
            className={cn(
              iconSizeClass,
              "object-contain transition-opacity duration-200",
              darkSrc && mounted && resolvedTheme === "dark" ? "opacity-0" : "opacity-100"
            )}
          />
          {darkSrc ? (
            <img
              src={darkSrc}
              alt=""
              className={cn(
                iconSizeClass,
                "absolute inset-0 object-contain transition-opacity duration-200",
                mounted && resolvedTheme === "dark" ? "opacity-100" : "opacity-0"
              )}
            />
          ) : null}
        </span>
      ) : (
        <span className="text-[10px] font-semibold uppercase tracking-[0.08em]">
          {presentation.fallback}
        </span>
      )}
    </span>
  );
}
