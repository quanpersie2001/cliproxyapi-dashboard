"use client";

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
      bg: "rgba(217, 119, 87, 0.12)",
      border: "rgba(192, 86, 33, 0.18)",
      text: "#c05621",
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
      bg: "rgba(49, 134, 255, 0.12)",
      border: "rgba(30, 79, 163, 0.18)",
      text: "#1e4fa3",
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
      bg: "rgba(99, 102, 241, 0.12)",
      border: "rgba(67, 56, 202, 0.18)",
      text: "#4338ca",
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
      bg: "rgba(0, 96, 100, 0.12)",
      border: "rgba(0, 96, 100, 0.18)",
      text: "#006064",
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
      bg: "rgba(144, 37, 200, 0.12)",
      border: "rgba(144, 37, 200, 0.18)",
      text: "#9025c8",
    },
  },
  {
    id: "kimi",
    name: "Kimi",
    description: "Moonshot AI Kimi (device OAuth)",
    authEndpoint: "/api/management/kimi-auth-url?is_webui=true",
    requiresCallback: false,
    asset: {
      light: "/provider-icons/kimi-light.svg",
      dark: "/provider-icons/kimi-dark.svg",
    },
    fallback: "KM",
    theme: {
      bg: "rgba(2, 122, 255, 0.12)",
      border: "rgba(2, 122, 255, 0.18)",
      text: "#0560cf",
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
      bg: "rgba(99, 54, 231, 0.12)",
      border: "rgba(85, 48, 199, 0.18)",
      text: "#5530c7",
    },
  },
  {
    id: "copilot",
    name: "GitHub Copilot",
    description: "GitHub Copilot (via GitHub device OAuth)",
    authEndpoint: "/api/management/github-auth-url?is_webui=true",
    requiresCallback: false,
    asset: {
      light: "/provider-icons/github-copilot.svg",
      dark: "/provider-icons/github-copilot-dark.svg",
    },
    fallback: "GH",
    theme: {
      bg: "rgba(17, 24, 39, 0.08)",
      border: "rgba(17, 24, 39, 0.12)",
      text: "var(--text-primary)",
    },
  },
  {
    id: "kiro",
    name: "Kiro",
    description: "AWS CodeWhisperer / Kiro (device OAuth)",
    authEndpoint: "/api/management/kiro-auth-url?is_webui=true",
    requiresCallback: false,
    fallback: "KR",
    theme: {
      bg: "rgba(180, 83, 9, 0.12)",
      border: "rgba(180, 83, 9, 0.18)",
      text: "var(--text-primary)",
    },
  },
  {
    id: "cursor",
    name: "Cursor",
    description: "Cursor IDE (via PKCE OAuth)",
    authEndpoint: "/api/management/cursor-auth-url?is_webui=true",
    requiresCallback: false,
    asset: "/provider-icons/cursor-ai.svg",
    fallback: "CU",
    theme: {
      bg: "rgba(8, 145, 178, 0.12)",
      border: "rgba(8, 145, 178, 0.18)",
      text: "var(--text-primary)",
    },
  },
  {
    id: "codebuddy",
    name: "CodeBuddy",
    description: "Tencent CodeBuddy (via browser OAuth)",
    authEndpoint: "/api/management/codebuddy-auth-url?is_webui=true",
    requiresCallback: false,
    asset: "/provider-icons/code-buddy.svg",
    fallback: "CB",
    theme: {
      bg: "rgba(220, 38, 38, 0.1)",
      border: "rgba(220, 38, 38, 0.16)",
      text: "var(--text-primary)",
    },
  },
] as const;

export type OAuthProviderEntry = (typeof OAUTH_PROVIDERS)[number];
export type OAuthProviderId = OAuthProviderEntry["id"];

const DEFAULT_PROVIDER_THEME: ProviderTheme = {
  bg: "rgba(115, 113, 105, 0.08)",
  border: "rgba(115, 113, 105, 0.16)",
  text: "var(--text-secondary)",
};

const OAUTH_PROVIDER_BY_ID = new Map<OAuthProviderId, OAuthProviderEntry>(
  OAUTH_PROVIDERS.map((provider) => [provider.id, provider])
);

const OAUTH_PROVIDER_ALIASES: Record<string, OAuthProviderId> = {
  antigravity: "antigravity",
  claude: "claude",
  "claude-code": "claude",
  codebuddy: "codebuddy",
  codex: "codex",
  copilot: "copilot",
  cursor: "cursor",
  gemini: "gemini-cli",
  "gemini-cli": "gemini-cli",
  github: "copilot",
  "github-copilot": "copilot",
  iflow: "iflow",
  kiro: "kiro",
  kimi: "kimi",
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
  const presentation = getOAuthProviderPresentation(provider);
  const asset = "asset" in presentation ? presentation.asset : undefined;
  const src =
    typeof asset === "string"
      ? asset
      : asset
        ? resolvedTheme === "dark"
          ? asset.dark
          : asset.light
        : null;

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
      {src ? (
        <img
          src={src}
          alt=""
          className={cn(size === "sm" ? "h-4 w-4" : "h-5 w-5", "object-contain")}
        />
      ) : (
        <span className="text-[10px] font-semibold uppercase tracking-[0.08em]">
          {presentation.fallback}
        </span>
      )}
    </span>
  );
}
