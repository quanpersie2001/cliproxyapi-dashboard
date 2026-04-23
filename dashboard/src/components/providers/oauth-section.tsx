"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { AlertSurface } from "@/components/ui/alert-surface";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Modal, ModalContent, ModalFooter, ModalHeader, ModalTitle } from "@/components/ui/modal";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { useToast } from "@/components/ui/toast";
import { extractApiError } from "@/lib/utils";
import { API_ENDPOINTS } from "@/lib/api-endpoints";
import type { CurrentUserLike } from "@/components/providers/api-key-section";
import {
  OAuthCredentialList,
  type OAuthAccountUsageStats,
  type OAuthAccountWithOwnership,
} from "@/components/providers/oauth-credential-list";
import { OAuthImportForm } from "@/components/providers/oauth-import-form";
import { OAuthActions } from "@/components/providers/oauth-actions";
import {
  OAuthAccountModelsModal,
  type OAuthAccountModel,
} from "@/components/providers/oauth-account-models-modal";
import { OAuthAccountSettingsModal } from "@/components/providers/oauth-account-settings-modal";
import {
  getOAuthProviderById,
  OAUTH_PROVIDERS,
  type OAuthProviderId,
} from "@/components/providers/oauth-provider-meta";
import { getStateToneStyle } from "@/components/ui/state-styles";
import {
  buildOAuthAuthFileSettingsPayload,
  createOAuthAuthFileSettingsEditor,
  formatOAuthAuthFileSettingsPreview,
  isOAuthAuthFileSettingsDirty,
  OAUTH_AUTH_FILE_MAX_BYTES,
  type DisableCoolingMode,
  type OAuthAuthFileSettingsEditor,
} from "@/lib/providers/oauth-auth-file-settings";

type ShowToast = ReturnType<typeof useToast>["showToast"];

interface OAuthSectionProps {
  showToast: ShowToast;
  currentUser: CurrentUserLike | null;
  refreshProviders: () => Promise<void>;
  onAccountCountChange: (count: number) => void;
  incognitoBrowserEnabled?: boolean;
  showHeader?: boolean;
  showAccountList?: boolean;
  showConnectActions?: boolean;
  connectEntryHref?: string;
  modelAliasHref?: string;
  connectActionsCollapsible?: boolean;
  connectActionsIntroOutside?: boolean;
}

const OAUTH_STATUS_POLL_INTERVAL_MS = 5000;
const OAUTH_STATUS_POLL_INTERVAL_HIDDEN_MS = 10000;
const OAUTH_ACCOUNT_PAGE_SIZE = 12;
const OAUTH_MODAL_PANEL_CLASSNAME = "rounded-xl px-5 py-4 text-sm leading-relaxed shadow-[var(--shadow-edge)]";
const OAUTH_MODAL_INLINE_MESSAGE_CLASSNAME = "rounded-lg px-3 py-2 text-xs leading-relaxed shadow-[var(--shadow-edge)]";

const MODAL_STATUS = {
  IDLE: "idle",
  LOADING: "loading",
  WAITING: "waiting",
  SUBMITTING: "submitting",
  POLLING: "polling",
  SUCCESS: "success",
  ERROR: "error",
} as const;

type ModalStatus = (typeof MODAL_STATUS)[keyof typeof MODAL_STATUS];

const CALLBACK_VALIDATION = {
  EMPTY: "empty",
  INVALID: "invalid",
  VALID: "valid",
} as const;

type CallbackValidation =
  (typeof CALLBACK_VALIDATION)[keyof typeof CALLBACK_VALIDATION];

interface AuthUrlResponse {
  status?: string;
  url?: string;
  state?: string;
  user_code?: string;
  method?: string;
  verification_uri?: string;
}
interface AuthStatusResponse {
  status?: string;
  error?: string;
  verification_url?: string;
  user_code?: string;
  url?: string;
}

interface OAuthCallbackResponse {
  status?: number;
  error?: string;
}

interface UsageHistoryResponse {
  data?: {
    credentialBreakdown?: Array<{
      sourceId?: string;
      sourceDisplay?: string;
      successCount?: number;
      failureCount?: number;
    }>;
  };
}

function isTabVisible(): boolean {
  if (typeof document === "undefined") return true;
  return document.visibilityState === "visible";
}

const validateCallbackUrl = (value: string) => {
  if (!value.trim()) {
    return { status: CALLBACK_VALIDATION.EMPTY, message: "Paste the full URL." };
  }

  let parsedUrl: URL;
  try {
    parsedUrl = new URL(value.trim());
  } catch {
    return {
      status: CALLBACK_VALIDATION.INVALID,
      message: "That doesn't look like a valid URL.",
    };
  }

  const code = parsedUrl.searchParams.get("code");
  const state = parsedUrl.searchParams.get("state");

  if (!code || !state) {
    return {
      status: CALLBACK_VALIDATION.INVALID,
      message: "URL must include both code and state parameters.",
    };
  }

  return {
    status: CALLBACK_VALIDATION.VALID,
    message: "Callback URL looks good. Ready to submit.",
  };
};

export function OAuthSection({
  showToast,
  currentUser,
  refreshProviders,
  onAccountCountChange,
  incognitoBrowserEnabled = false,
  showHeader = true,
  showAccountList = true,
  showConnectActions = true,
  connectEntryHref = "/dashboard/providers/oauth/connect",
  modelAliasHref = "/dashboard/providers/oauth/model-alias",
  connectActionsCollapsible = true,
  connectActionsIntroOutside = false,
}: OAuthSectionProps) {
  const [isOAuthModalOpen, setIsOAuthModalOpen] = useState(false);
  const [oauthModalStatus, setOauthModalStatus] = useState<ModalStatus>(MODAL_STATUS.IDLE);
  const [selectedOAuthProviderId, setSelectedOAuthProviderId] = useState<OAuthProviderId | null>(null);
  const [callbackUrl, setCallbackUrl] = useState("");
  const [callbackValidation, setCallbackValidation] = useState<CallbackValidation>(CALLBACK_VALIDATION.EMPTY);
  const [callbackMessage, setCallbackMessage] = useState("Paste the full URL.");
  const [oauthErrorMessage, setOauthErrorMessage] = useState<string | null>(null);
  const [authLaunchUrl, setAuthLaunchUrl] = useState<string | null>(null);
  const pollingIntervalRef = useRef<number | null>(null);
  const pollingAttemptsRef = useRef(0);
  const noCallbackClaimTimeoutRef = useRef<number | null>(null);
  const noCallbackClaimAttemptsRef = useRef(0);
  const authStateRef = useRef<string | null>(null);
  const selectedOAuthProviderIdRef = useRef<OAuthProviderId | null>(null);
  const [deviceCodeInfo, setDeviceCodeInfo] = useState<{ verificationUrl: string; userCode: string } | null>(null);
  const deviceCodePopupOpenedRef = useRef(false);
  const incognitoRef = useRef(incognitoBrowserEnabled);
  incognitoRef.current = incognitoBrowserEnabled;
  const [accounts, setAccounts] = useState<OAuthAccountWithOwnership[]>([]);
  const [oauthAccountsLoading, setOauthAccountsLoading] = useState(true);
  const [showConfirmOAuthDelete, setShowConfirmOAuthDelete] = useState(false);
  const [pendingOAuthDelete, setPendingOAuthDelete] = useState<{ accountId: string; accountName: string } | null>(null);
  const [togglingAccountId, setTogglingAccountId] = useState<string | null>(null);
  const [claimingAccountName, setClaimingAccountName] = useState<string | null>(null);
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const [importProviderId, setImportProviderId] = useState<OAuthProviderId | null>(null);
  const [importJsonContent, setImportJsonContent] = useState("");
  const [importFileName, setImportFileName] = useState("");
  const [importStatus, setImportStatus] = useState<"idle" | "validating" | "uploading" | "success" | "error">("idle");
  const [importErrorMessage, setImportErrorMessage] = useState<string | null>(null);
  const [isConnectActionsExpanded, setIsConnectActionsExpanded] = useState(true);
  const connectActionsInitializedRef = useRef(false);
  const [accountStats, setAccountStats] = useState<Record<string, OAuthAccountUsageStats>>({});
  const [accountStatsLoading, setAccountStatsLoading] = useState(true);
  const [accountPage, setAccountPage] = useState(1);
  const [modelsModalAccount, setModelsModalAccount] = useState<OAuthAccountWithOwnership | null>(null);
  const [modelsLoading, setModelsLoading] = useState(false);
  const [modelsErrorMessage, setModelsErrorMessage] = useState<string | null>(null);
  const [models, setModels] = useState<OAuthAccountModel[]>([]);
  const [downloadingAccountName, setDownloadingAccountName] = useState<string | null>(null);
  const [settingsAccount, setSettingsAccount] = useState<OAuthAccountWithOwnership | null>(null);
  const [settingsLoading, setSettingsLoading] = useState(false);
  const [settingsSaving, setSettingsSaving] = useState(false);
  const [settingsErrorMessage, setSettingsErrorMessage] = useState<string | null>(null);
  const [settingsEditor, setSettingsEditor] = useState<OAuthAuthFileSettingsEditor | null>(null);

  const selectedOAuthProvider = getOAuthProviderById(selectedOAuthProviderId);
  const selectedOAuthProviderRequiresCallback = selectedOAuthProvider?.requiresCallback ?? true;
  const totalAccountPages = Math.max(1, Math.ceil(accounts.length / OAUTH_ACCOUNT_PAGE_SIZE));
  const normalizedAccountPage = Math.min(accountPage, totalAccountPages);
  const connectActionsNote = incognitoBrowserEnabled
    ? "Incognito mode is enabled. Browsers do not let the dashboard force-open a private window, so you will open the authorization URL manually."
    : "OAuth flows open in a popup window. Make sure pop-ups are allowed in your browser.";
  const paginatedAccounts = accounts.slice(
    (normalizedAccountPage - 1) * OAUTH_ACCOUNT_PAGE_SIZE,
    normalizedAccountPage * OAUTH_ACCOUNT_PAGE_SIZE
  );

  const stopPolling = useCallback(() => {
    if (pollingIntervalRef.current !== null) {
      window.clearInterval(pollingIntervalRef.current);
      pollingIntervalRef.current = null;
    }
    pollingAttemptsRef.current = 0;
  }, []);

  const stopNoCallbackClaimPolling = useCallback(() => {
    if (noCallbackClaimTimeoutRef.current !== null) {
      window.clearTimeout(noCallbackClaimTimeoutRef.current);
      noCallbackClaimTimeoutRef.current = null;
    }
    noCallbackClaimAttemptsRef.current = 0;
  }, []);

  const loadAccounts = useCallback(async () => {
    if (!showAccountList) {
      setAccounts([]);
      setOauthAccountsLoading(false);
      return;
    }

    setOauthAccountsLoading(true);
    try {
      const res = await fetch(API_ENDPOINTS.PROVIDERS.OAUTH);
      if (!res.ok) {
        showToast("Failed to load OAuth accounts", "error");
        setOauthAccountsLoading(false);
        return;
      }

      const data = await res.json();
      const nextAccounts = Array.isArray(data.accounts) ? data.accounts : [];
      setAccounts(nextAccounts);
      onAccountCountChange(nextAccounts.length);
      setOauthAccountsLoading(false);
    } catch {
      setOauthAccountsLoading(false);
      showToast("Network error", "error");
      setOauthErrorMessage("Network error while loading accounts.");
    }
  }, [onAccountCountChange, showAccountList, showToast]);

  const loadAccountStats = useCallback(async () => {
    if (!showAccountList) {
      setAccountStats({});
      setAccountStatsLoading(false);
      return;
    }

    setAccountStatsLoading(true);
    try {
      const res = await fetch(`${API_ENDPOINTS.USAGE.HISTORY}?window=7d`);
      if (!res.ok) {
        setAccountStats({});
        setAccountStatsLoading(false);
        return;
      }

      const data: UsageHistoryResponse = await res.json();
      const breakdown = Array.isArray(data.data?.credentialBreakdown)
        ? data.data.credentialBreakdown
        : [];

      const nextStats: Record<string, OAuthAccountUsageStats> = {};
      for (const entry of breakdown) {
        const sourceId = typeof entry.sourceId === "string" ? entry.sourceId : "";
        const sourceDisplay = typeof entry.sourceDisplay === "string" ? entry.sourceDisplay : "";
        if (!sourceId.startsWith("oauth:") || !sourceDisplay) {
          continue;
        }

        nextStats[sourceDisplay] = {
          successCount: typeof entry.successCount === "number" ? entry.successCount : 0,
          failureCount: typeof entry.failureCount === "number" ? entry.failureCount : 0,
        };
      }

      setAccountStats(nextStats);
    } catch {
      setAccountStats({});
    } finally {
      setAccountStatsLoading(false);
    }
  }, [showAccountList]);

  const toggleOAuthAccount = async (accountId: string, currentlyDisabled: boolean) => {
    setTogglingAccountId(accountId);
    const nextDisabled = !currentlyDisabled;
    try {
      const res = await fetch(`${API_ENDPOINTS.PROVIDERS.OAUTH}/${accountId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ disabled: nextDisabled }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        showToast(extractApiError(data, "Failed to update account"), "error");
      } else {
        setAccounts((current) =>
          current.map((account) =>
            account.id === accountId
              ? {
                  ...account,
                  status: nextDisabled ? "disabled" : "active",
                  statusMessage: null,
                  unavailable: false,
                }
              : account
          )
        );
        showToast(`OAuth account ${nextDisabled ? "disabled" : "enabled"}`, "success");
      }
    } catch {
      showToast("Network error", "error");
    } finally {
      setTogglingAccountId(null);
    }
  };

  const claimOAuthAccount = async (accountName: string) => {
    setClaimingAccountName(accountName);
    try {
      const res = await fetch(API_ENDPOINTS.PROVIDERS.OAUTH_CLAIM, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accountName }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        showToast(extractApiError(data, "Failed to claim account"), "error");
      } else {
        showToast("Account claimed successfully", "success");
        await loadAccounts();
        void loadAccountStats();
      }
    } catch {
      showToast("Network error", "error");
    } finally {
      setClaimingAccountName(null);
    }
  };

  const openModelsModal = async (account: OAuthAccountWithOwnership) => {
    setModelsModalAccount(account);
    setModelsLoading(true);
    setModelsErrorMessage(null);
    setModels([]);

    try {
      const res = await fetch(API_ENDPOINTS.PROVIDERS.OAUTH_ACCOUNT_MODELS(account.accountName));
      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        setModelsErrorMessage(extractApiError(data, "Failed to load models for this auth file."));
        return;
      }

      setModels(Array.isArray(data.models) ? data.models : []);
    } catch {
      setModelsErrorMessage("Network error while loading models.");
    } finally {
      setModelsLoading(false);
    }
  };

  const closeModelsModal = () => {
    setModelsModalAccount(null);
    setModelsLoading(false);
    setModelsErrorMessage(null);
    setModels([]);
  };

  const downloadOAuthAccount = async (account: OAuthAccountWithOwnership) => {
    setDownloadingAccountName(account.accountName);
    try {
      const res = await fetch(API_ENDPOINTS.PROVIDERS.OAUTH_ACCOUNT_DOWNLOAD(account.accountName));
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        showToast(extractApiError(data, "Failed to download auth file"), "error");
        return;
      }

      const blob = await res.blob();
      const objectUrl = window.URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = objectUrl;
      anchor.download = account.accountName;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      window.URL.revokeObjectURL(objectUrl);
      showToast("Auth file downloaded", "success");
    } catch {
      showToast("Network error", "error");
    } finally {
      setDownloadingAccountName(null);
    }
  };

  const openSettingsModal = async (account: OAuthAccountWithOwnership) => {
    setSettingsAccount(account);
    setSettingsLoading(true);
    setSettingsSaving(false);
    setSettingsErrorMessage(null);
    setSettingsEditor(null);

    try {
      const res = await fetch(API_ENDPOINTS.PROVIDERS.OAUTH_ACCOUNT_SETTINGS(account.accountName));
      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        setSettingsErrorMessage(extractApiError(data, "Failed to load auth file settings."));
        return;
      }

      if (typeof data.rawText !== "string") {
        setSettingsErrorMessage("Auth file payload is missing.");
        return;
      }

      const editor = createOAuthAuthFileSettingsEditor(data.rawText, account.provider);
      setSettingsEditor(editor);
    } catch (error) {
      setSettingsErrorMessage(
        error instanceof Error ? error.message : "Network error while loading auth file settings."
      );
    } finally {
      setSettingsLoading(false);
    }
  };

  const closeSettingsModal = () => {
    setSettingsAccount(null);
    setSettingsLoading(false);
    setSettingsSaving(false);
    setSettingsErrorMessage(null);
    setSettingsEditor(null);
  };

  const updateSettingsField = (
    field: "prefix" | "proxyUrl" | "priority" | "excludedModelsText" | "note",
    value: string
  ) => {
    setSettingsEditor((current) => {
      if (!current) {
        return current;
      }

      if (field === "note") {
        return {
          ...current,
          note: value,
          noteTouched: true,
        };
      }

      return {
        ...current,
        [field]: value,
      };
    });
  };

  const updateSettingsDisableCooling = (value: DisableCoolingMode) => {
    setSettingsEditor((current) => (current ? { ...current, disableCooling: value } : current));
  };

  const updateSettingsWebsockets = (value: boolean) => {
    setSettingsEditor((current) => (current ? { ...current, websockets: value } : current));
  };

  const copySettingsPreview = async () => {
    if (!settingsEditor) {
      return;
    }

    try {
      await navigator.clipboard.writeText(formatOAuthAuthFileSettingsPreview(settingsEditor));
      showToast("Auth file preview copied", "success");
    } catch {
      showToast("Failed to copy auth file preview", "error");
    }
  };

  const saveSettings = async () => {
    if (!settingsAccount || !settingsEditor) {
      return;
    }

    const payload = buildOAuthAuthFileSettingsPayload(settingsEditor);
    if (new Blob([payload]).size > OAUTH_AUTH_FILE_MAX_BYTES) {
      setSettingsErrorMessage("Auth file content exceeds the 1MB limit.");
      return;
    }

    setSettingsSaving(true);
    setSettingsErrorMessage(null);

    try {
      const res = await fetch(API_ENDPOINTS.PROVIDERS.OAUTH_ACCOUNT_SETTINGS(settingsAccount.accountName), {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fileContent: payload }),
      });
      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        setSettingsErrorMessage(extractApiError(data, "Failed to save auth file settings."));
        return;
      }

      setSettingsEditor(createOAuthAuthFileSettingsEditor(payload, settingsAccount.provider));
      showToast("Auth file settings saved", "success");
      await loadAccounts();
      await refreshProviders();
      void loadAccountStats();
    } catch {
      setSettingsErrorMessage("Network error while saving auth file settings.");
    } finally {
      setSettingsSaving(false);
    }
  };

  const openAuthPopup = (url: string) => {
    const popup = window.open(url, "oauth", "width=600,height=800");
    return popup !== null;
  };

  const pollAuthStatus = (state: string) => {
    if (pollingIntervalRef.current !== null) {
      return;
    }

    pollingIntervalRef.current = window.setInterval(async () => {
      if (!isTabVisible()) {
        return;
      }

      pollingAttemptsRef.current += 1;
      if (pollingAttemptsRef.current > 60) {
        stopPolling();
        setOauthModalStatus(MODAL_STATUS.ERROR);
        setOauthErrorMessage("Timed out waiting for authorization.");
        return;
      }

      try {
        const res = await fetch(
          `/api/management/get-auth-status?state=${encodeURIComponent(state)}`
        );
        if (!res.ok) {
          stopPolling();
          setOauthModalStatus(MODAL_STATUS.ERROR);
          setOauthErrorMessage("Failed to check authorization status.");
          return;
        }

        const data: AuthStatusResponse = await res.json();
        if (data.status === "wait") {
          return;
        }

        if (data.status === "device_code" && data.verification_url && data.user_code) {
          setDeviceCodeInfo({
            verificationUrl: data.verification_url,
            userCode: data.user_code,
          });
          setAuthLaunchUrl(data.verification_url);
          if (!deviceCodePopupOpenedRef.current && !incognitoRef.current) {
            deviceCodePopupOpenedRef.current = true;
            window.open(data.verification_url, "oauth", "width=600,height=800");
          }
          return;
        }

        if (data.status === "ok") {
          stopPolling();
          setOauthModalStatus(MODAL_STATUS.SUCCESS);
          showToast("OAuth account connected", "success");
          await refreshProviders();
          void loadAccounts();
          void loadAccountStats();
          return;
        }

        if (data.status === "error") {
          stopPolling();
          setOauthModalStatus(MODAL_STATUS.ERROR);
          setOauthErrorMessage(extractApiError(data, "OAuth authorization failed."));
          return;
        }
      } catch {
        stopPolling();
        setOauthModalStatus(MODAL_STATUS.ERROR);
        setOauthErrorMessage("Network error while polling authorization.");
      }
    }, isTabVisible() ? OAUTH_STATUS_POLL_INTERVAL_MS : OAUTH_STATUS_POLL_INTERVAL_HIDDEN_MS);
  };

  const resetOAuthModalState = () => {
    stopPolling();
    stopNoCallbackClaimPolling();
    setOauthModalStatus(MODAL_STATUS.IDLE);
    selectedOAuthProviderIdRef.current = null;
    setSelectedOAuthProviderId(null);
    authStateRef.current = null;
    setCallbackUrl("");
    setCallbackValidation(CALLBACK_VALIDATION.EMPTY);
    setCallbackMessage("Paste the full URL.");
    setOauthErrorMessage(null);
    setAuthLaunchUrl(null);
    setDeviceCodeInfo(null);
    deviceCodePopupOpenedRef.current = false;
  };

  const handleOAuthModalClose = () => {
    setIsOAuthModalOpen(false);
    resetOAuthModalState();
  };

  async function claimOAuthWithoutCallback(providerId: OAuthProviderId, state: string) {
    try {
      const res = await fetch(API_ENDPOINTS.MANAGEMENT.OAUTH_CALLBACK, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ provider: providerId, state }),
      });

      const data: OAuthCallbackResponse = await res.json().catch(() => ({}));

      if (res.status === 202 || data.status === 202) {
        if (noCallbackClaimAttemptsRef.current >= 25) {
          stopNoCallbackClaimPolling();
          return;
        }

        noCallbackClaimAttemptsRef.current += 1;
        if (noCallbackClaimTimeoutRef.current !== null) {
          window.clearTimeout(noCallbackClaimTimeoutRef.current);
        }
        noCallbackClaimTimeoutRef.current = window.setTimeout(() => {
          void claimOAuthWithoutCallback(providerId, state);
        }, 3000);
        return;
      }

      if (!res.ok) {
        stopNoCallbackClaimPolling();
        stopPolling();
        setOauthModalStatus(MODAL_STATUS.ERROR);
        setOauthErrorMessage(extractApiError(data, "Failed to complete OAuth ownership claim."));
        return;
      }

      stopNoCallbackClaimPolling();
      void loadAccounts();
      void loadAccountStats();
    } catch {
      if (noCallbackClaimAttemptsRef.current >= 25) {
        stopNoCallbackClaimPolling();
        return;
      }
      noCallbackClaimAttemptsRef.current += 1;
      if (noCallbackClaimTimeoutRef.current !== null) {
        window.clearTimeout(noCallbackClaimTimeoutRef.current);
      }
      noCallbackClaimTimeoutRef.current = window.setTimeout(() => {
        void claimOAuthWithoutCallback(providerId, state);
      }, 3000);
    }
  }

  const handleOAuthConnect = async (providerId: OAuthProviderId) => {
    const provider = getOAuthProviderById(providerId);
    if (!provider) return;

    selectedOAuthProviderIdRef.current = providerId;
    setSelectedOAuthProviderId(providerId);
    setIsOAuthModalOpen(true);
    setOauthModalStatus(MODAL_STATUS.LOADING);
    setOauthErrorMessage(null);
    setCallbackUrl("");
    setCallbackValidation(CALLBACK_VALIDATION.EMPTY);
    setCallbackMessage("Paste the full URL.");
    setAuthLaunchUrl(null);

    try {
      const res = await fetch(provider.authEndpoint);
      if (!res.ok) {
        const errorData: unknown = await res.json().catch(() => null);
        setOauthModalStatus(MODAL_STATUS.ERROR);
        setOauthErrorMessage(
          extractApiError(errorData, `Failed to start OAuth flow (HTTP ${res.status}).`)
        );
        return;
      }

      const data: AuthUrlResponse = await res.json();
      if (!data.state) {
        setOauthModalStatus(MODAL_STATUS.ERROR);
        setOauthErrorMessage("OAuth response missing state.");
        return;
      }

      if (!data.url && data.method === "device_code") {
        authStateRef.current = data.state;
        setOauthModalStatus(MODAL_STATUS.POLLING);
        setCallbackValidation(CALLBACK_VALIDATION.VALID);
        setCallbackMessage("Waiting for device authorization details...");
        showToast("Initializing device authorization flow...", "info");
        pollAuthStatus(data.state);
        stopNoCallbackClaimPolling();
        void claimOAuthWithoutCallback(provider.id, data.state);
        return;
      }

      if (!data.url) {
        setOauthModalStatus(MODAL_STATUS.ERROR);
        setOauthErrorMessage("OAuth response missing URL.");
        return;
      }
      setAuthLaunchUrl(data.url);

      const shouldOpenPopup = !incognitoBrowserEnabled;
      if (shouldOpenPopup) {
        const popupOpened = openAuthPopup(data.url);
        if (!popupOpened) {
          setOauthModalStatus(MODAL_STATUS.ERROR);
          setOauthErrorMessage("Popup blocked. Allow pop-ups and try again.");
          return;
        }
      }
      authStateRef.current = data.state;
      if (provider.requiresCallback) {
        setOauthModalStatus(MODAL_STATUS.WAITING);
        setCallbackValidation(CALLBACK_VALIDATION.EMPTY);
        setCallbackMessage("Paste the full URL.");
        showToast(
          incognitoBrowserEnabled
            ? "Open the authorization URL below in a private/incognito window, then follow the steps."
            : "OAuth window opened. Follow the steps below.",
          "info"
        );
      } else {
        setOauthModalStatus(MODAL_STATUS.POLLING);
        setCallbackValidation(CALLBACK_VALIDATION.VALID);
        setCallbackMessage(
          incognitoBrowserEnabled
            ? "No callback URL needed. Open the authorization URL below in a private/incognito window."
            : "No callback URL needed. Complete sign-in in the popup window."
        );
        showToast(
          incognitoBrowserEnabled
            ? "Open the authorization URL below in a private/incognito window."
            : "OAuth window opened. Complete sign-in in the popup.",
          "info"
        );
        if (data.user_code && data.url) {
          setDeviceCodeInfo({
            verificationUrl: data.url,
            userCode: data.user_code,
          });
          deviceCodePopupOpenedRef.current = shouldOpenPopup;
        }
        stopNoCallbackClaimPolling();
        void claimOAuthWithoutCallback(providerId, data.state);
      }

      pollAuthStatus(data.state);
    } catch {
      setOauthModalStatus(MODAL_STATUS.ERROR);
      setOauthErrorMessage("Network error while starting OAuth flow.");
    }
  };

  const handleCallbackChange = (value: string) => {
    setCallbackUrl(value);
    const validation = validateCallbackUrl(value);
    setCallbackValidation(validation.status);
    setCallbackMessage(validation.message);
  };

  const handleSubmitCallback = async () => {
    const currentProvider = selectedOAuthProviderIdRef.current;
    const currentState = authStateRef.current;
    if (!currentProvider || !currentState) {
      console.warn("[OAuth] Submit failed - missing provider or state");
      setOauthModalStatus(MODAL_STATUS.ERROR);
      setOauthErrorMessage("Missing provider or state. Please restart the flow.");
      return;
    }

    const validation = validateCallbackUrl(callbackUrl);
    if (validation.status !== CALLBACK_VALIDATION.VALID) {
      setCallbackValidation(validation.status);
      setCallbackMessage(validation.message);
      return;
    }

    setOauthModalStatus(MODAL_STATUS.SUBMITTING);
    setOauthErrorMessage(null);

    try {
      const res = await fetch(API_ENDPOINTS.MANAGEMENT.OAUTH_CALLBACK, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          provider: currentProvider,
          callbackUrl: callbackUrl.trim(),
        }),
      });

      const data: OAuthCallbackResponse = await res.json().catch(() => ({}));
      if (!res.ok) {
        setOauthModalStatus(MODAL_STATUS.ERROR);
        setOauthErrorMessage(
          extractApiError(data, "Failed to relay the OAuth callback URL.")
        );
        return;
      }

      stopPolling();
      setOauthModalStatus(MODAL_STATUS.POLLING);
      pollAuthStatus(currentState);
    } catch {
      setOauthModalStatus(MODAL_STATUS.ERROR);
      setOauthErrorMessage("Network error while submitting callback URL.");
    }
  };

  const confirmDeleteOAuth = (accountId: string) => {
    const account = accounts.find((a) => a.id === accountId);
    if (!account) return;
    setPendingOAuthDelete({ accountId, accountName: account.accountName });
    setShowConfirmOAuthDelete(true);
  };

  const handleOAuthDelete = async () => {
    if (!pendingOAuthDelete) return;
    const { accountId } = pendingOAuthDelete;

    try {
      const res = await fetch(`${API_ENDPOINTS.PROVIDERS.OAUTH}/${accountId}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        const data = await res.json();
        showToast(extractApiError(data, "Failed to remove OAuth account"), "error");
        return;
      }
      showToast("OAuth account removed", "success");
      await refreshProviders();
      void loadAccounts();
      void loadAccountStats();
    } catch {
      showToast("Network error", "error");
    }
  };

  const openImportModal = (providerId: OAuthProviderId) => {
    setImportProviderId(providerId);
    setImportJsonContent("");
    setImportFileName("");
    setImportStatus("idle");
    setImportErrorMessage(null);
    setIsImportModalOpen(true);
  };

  const closeImportModal = () => {
    setIsImportModalOpen(false);
    setImportProviderId(null);
    setImportJsonContent("");
    setImportFileName("");
    setImportStatus("idle");
    setImportErrorMessage(null);
  };

  const handleImportFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.name.endsWith(".json")) {
      setImportFileName("");
      setImportJsonContent("");
      setImportErrorMessage("Please select a JSON file.");
      setImportStatus("error");
      return;
    }

    if (file.size > 1024 * 1024) {
      setImportFileName("");
      setImportJsonContent("");
      setImportErrorMessage("File is too large (max 1MB).");
      setImportStatus("error");
      return;
    }

    setImportFileName(file.name);
    const reader = new FileReader();
    reader.onload = (event) => {
      const content = event.target?.result;
      if (typeof content === "string") {
        setImportJsonContent(content);
        validateImportJson(content);
      }
    };
    reader.onerror = () => {
      setImportErrorMessage("Failed to read file.");
      setImportStatus("error");
    };
    reader.readAsText(file);
  };

  const validateImportJson = (content: string) => {
    try {
      const parsed = JSON.parse(content);
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
        setImportErrorMessage("File must contain a JSON object, not an array.");
        setImportStatus("error");
        return false;
      }
      setImportErrorMessage(null);
      setImportStatus("idle");
      return true;
    } catch {
      setImportErrorMessage("Invalid JSON content.");
      setImportStatus("error");
      return false;
    }
  };

  const handleImportJsonChange = (value: string) => {
    setImportJsonContent(value);
    if (value.trim()) {
      validateImportJson(value);
    } else {
      setImportErrorMessage(null);
      setImportStatus("idle");
    }
  };

  const handleImportSubmit = async () => {
    if (!importProviderId || !importJsonContent.trim()) return;

    if (!validateImportJson(importJsonContent)) return;

    const fileName = importFileName || `${importProviderId}-credential.json`;

    setImportStatus("uploading");
    setImportErrorMessage(null);

    try {
      const res = await fetch(API_ENDPOINTS.PROVIDERS.OAUTH_IMPORT, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          provider: importProviderId,
          fileName,
          fileContent: importJsonContent.trim(),
        }),
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        setImportStatus("error");
        setImportErrorMessage(extractApiError(data, "Failed to import credential."));
        return;
      }

      setImportStatus("success");
      showToast("OAuth credential imported successfully", "success");
      await refreshProviders();
      void loadAccounts();
      void loadAccountStats();
    } catch {
      setImportStatus("error");
      setImportErrorMessage("Network error while importing credential.");
    }
  };

  useEffect(() => {
    if (!showAccountList) {
      setAccounts([]);
      setOauthAccountsLoading(false);
      return () => {
        stopPolling();
        stopNoCallbackClaimPolling();
      };
    }

    const timeoutId = window.setTimeout(() => {
      void loadAccounts();
    }, 0);

    return () => {
      window.clearTimeout(timeoutId);
      stopPolling();
      stopNoCallbackClaimPolling();
    };
  }, [loadAccounts, showAccountList, stopNoCallbackClaimPolling, stopPolling]);

  useEffect(() => {
    if (!showAccountList) {
      setAccountStats({});
      setAccountStatsLoading(false);
      return;
    }

    const timeoutId = window.setTimeout(() => {
      void loadAccountStats();
    }, 0);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [loadAccountStats, showAccountList]);

  useEffect(() => {
    if (!showConnectActions || oauthAccountsLoading || connectActionsInitializedRef.current) {
      return;
    }

    setIsConnectActionsExpanded(accounts.length === 0);
    connectActionsInitializedRef.current = true;
  }, [accounts.length, oauthAccountsLoading, showConnectActions]);

  useEffect(() => {
    if (!showAccountList) {
      setAccountPage(1);
      return;
    }

    setAccountPage((current) => Math.min(current, totalAccountPages));
  }, [showAccountList, totalAccountPages]);

  const isOAuthSubmitDisabled =
    oauthModalStatus === MODAL_STATUS.LOADING ||
    oauthModalStatus === MODAL_STATUS.SUBMITTING ||
    oauthModalStatus === MODAL_STATUS.POLLING ||
    oauthModalStatus === MODAL_STATUS.SUCCESS ||
    callbackValidation !== CALLBACK_VALIDATION.VALID;

  const importProviderName = importProviderId
    ? getOAuthProviderById(importProviderId)?.name || importProviderId
    : "";
  const settingsPreviewText = settingsEditor
    ? formatOAuthAuthFileSettingsPreview(settingsEditor)
    : "";
  const settingsDirty = settingsEditor
    ? isOAuthAuthFileSettingsDirty(settingsEditor)
    : false;

  return (
    <>
      <div id="provider-oauth" className="space-y-3">
        {showHeader ? (
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-sm font-semibold text-[var(--text-primary)]">OAuth</h2>
              <p className="text-xs text-[var(--text-muted)]">OAuth auth files managed by the proxy</p>
            </div>
            {showAccountList ? (
              <div className="flex flex-wrap items-center gap-2">
                <Link
                  href={connectEntryHref}
                  className="inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-medium transition-[background-color,border-color,color,transform] duration-200 active:translate-y-px"
                  style={{
                    borderColor: "var(--badge-info-border)",
                    backgroundColor: "var(--badge-info-bg)",
                    color: "var(--badge-info-text)",
                  }}
                >
                  Connect new account
                </Link>
                {currentUser?.isAdmin ? (
                  <Link
                    href={modelAliasHref}
                    className="inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-medium transition-[background-color,border-color,color,transform] duration-200 active:translate-y-px"
                    style={{
                      borderColor: "var(--badge-warning-border)",
                      backgroundColor: "var(--badge-warning-bg)",
                      color: "var(--badge-warning-text)",
                    }}
                  >
                    Model Alias
                  </Link>
                ) : null}
              </div>
            ) : null}
          </div>
        ) : null}

        <div className="space-y-3">
          {showAccountList ? (
            <>
              <div>
                <OAuthCredentialList
                  accounts={paginatedAccounts}
                  loading={oauthAccountsLoading}
                  statsLoading={accountStatsLoading}
                  accountStats={accountStats}
                  currentUser={currentUser}
                  togglingAccountId={togglingAccountId}
                  claimingAccountName={claimingAccountName}
                  downloadingAccountName={downloadingAccountName}
                  inspectingModelsAccountName={modelsLoading ? modelsModalAccount?.accountName ?? null : null}
                  inspectingSettingsAccountName={settingsLoading ? settingsAccount?.accountName ?? null : null}
                  onToggle={toggleOAuthAccount}
                  onDelete={confirmDeleteOAuth}
                  onClaim={claimOAuthAccount}
                  onOpenModels={openModelsModal}
                  onDownload={downloadOAuthAccount}
                  onOpenSettings={openSettingsModal}
                />
              </div>

              {!oauthAccountsLoading && accounts.length > 0 ? (
                <div className="flex items-center justify-between border-t border-[var(--surface-border)] px-3 py-2">
                  <Button
                    variant="ghost"
                    onClick={() => setAccountPage((current) => Math.max(1, current - 1))}
                    disabled={normalizedAccountPage === 1}
                    className="px-2.5 py-1 text-xs"
                  >
                    Previous
                  </Button>
                  <span className="text-xs text-[var(--text-muted)]">
                    Page {normalizedAccountPage} of {totalAccountPages}
                  </span>
                  <Button
                    variant="ghost"
                    onClick={() => setAccountPage((current) => Math.min(totalAccountPages, current + 1))}
                    disabled={normalizedAccountPage === totalAccountPages}
                    className="px-2.5 py-1 text-xs"
                  >
                    Next
                  </Button>
                </div>
              ) : null}
            </>
          ) : null}

          {showConnectActions ? (
            <div className="space-y-3">
              {connectActionsIntroOutside ? (
                <>
                  <div className="flex items-center justify-between gap-3 px-1">
                    <div>
                      <h3 className="text-xs font-semibold uppercase tracking-[0.08em] text-[var(--text-muted)]">
                        Connect New Account
                      </h3>
                      <p className="mt-1 text-xs text-[var(--text-muted)]">
                        {OAUTH_PROVIDERS.length} OAuth providers available
                      </p>
                    </div>

                    <span className="rounded-full border border-[var(--surface-border)] bg-[var(--surface-muted)] px-2 py-0.5 text-[11px] font-medium text-[var(--text-secondary)]">
                      {OAUTH_PROVIDERS.length}
                    </span>
                  </div>

                  <div
                    className="rounded-md border p-3 text-sm"
                    style={getStateToneStyle("warning")}
                  >
                    <strong className="text-[var(--text-primary)]">Note:</strong> {connectActionsNote}
                  </div>
                </>
              ) : null}

              <OAuthActions
                providers={OAUTH_PROVIDERS}
                expanded={isConnectActionsExpanded}
                collapsible={connectActionsCollapsible}
                note={connectActionsNote}
                showHeader={!connectActionsIntroOutside}
                showNote={!connectActionsIntroOutside}
                onToggleExpand={() => setIsConnectActionsExpanded((current) => !current)}
                onConnect={handleOAuthConnect}
                onImport={openImportModal}
              />
            </div>
          ) : null}
        </div>
      </div>

      <Modal isOpen={isOAuthModalOpen} onClose={handleOAuthModalClose}>
        <ModalHeader>
          <ModalTitle>
            {selectedOAuthProvider ? `Connect ${selectedOAuthProvider.name}` : "Connect"}
          </ModalTitle>
        </ModalHeader>
        <ModalContent className="space-y-4">
          {oauthModalStatus === MODAL_STATUS.LOADING && (
            <AlertSurface
              tone="info"
              role="status"
              aria-live="polite"
              className={OAUTH_MODAL_PANEL_CLASSNAME}
            >
              Fetching authorization link...
            </AlertSurface>
          )}

          {authLaunchUrl && (oauthModalStatus === MODAL_STATUS.WAITING || oauthModalStatus === MODAL_STATUS.POLLING || oauthModalStatus === MODAL_STATUS.ERROR) && (
            <AlertSurface
              tone={incognitoBrowserEnabled ? "warning" : "info"}
              className={OAUTH_MODAL_PANEL_CLASSNAME}
            >
              <div className="font-medium tracking-tight text-[var(--text-primary)]">
                {incognitoBrowserEnabled ? "Open This URL In A Private Window" : "Authorization URL"}
              </div>
              <p className="mt-2 max-w-[62ch] text-[var(--text-secondary)]">
                {incognitoBrowserEnabled
                  ? "Open this link manually in a new Firefox Private Window or browser incognito window, then continue the flow."
                  : "If the popup did not appear, open this link manually."}
              </p>
              <div className="mt-3 rounded-lg border border-[var(--surface-border)] bg-[var(--surface-muted)] p-3 shadow-[var(--shadow-edge)]">
                <input
                  readOnly
                  value={authLaunchUrl}
                  className="w-full bg-transparent font-mono text-xs leading-relaxed text-[var(--text-primary)] outline-none"
                />
              </div>
              <div className="mt-3 flex flex-wrap gap-2.5">
                <Button
                  variant="ghost"
                  onClick={async () => {
                    try {
                      await navigator.clipboard.writeText(authLaunchUrl);
                      showToast("Authorization URL copied", "success");
                    } catch {
                      showToast("Failed to copy authorization URL", "error");
                    }
                  }}
                >
                  Copy URL
                </Button>
                {!incognitoBrowserEnabled && (
                  <Button
                    variant="ghost"
                    onClick={() => {
                      const popupOpened = openAuthPopup(authLaunchUrl);
                      if (!popupOpened) {
                        showToast("Popup blocked. Allow pop-ups and try again.", "error");
                      }
                    }}
                  >
                    Open Again
                  </Button>
                )}
              </div>
            </AlertSurface>
          )}

          {(oauthModalStatus === MODAL_STATUS.WAITING ||
            oauthModalStatus === MODAL_STATUS.SUBMITTING ||
            oauthModalStatus === MODAL_STATUS.POLLING ||
            oauthModalStatus === MODAL_STATUS.ERROR) &&
            selectedOAuthProviderRequiresCallback && (
            <div className="space-y-4">
              <AlertSurface
                tone="info"
                className={OAUTH_MODAL_PANEL_CLASSNAME}
              >
                <div className="font-medium tracking-tight text-[var(--text-primary)]">
                  Step-by-step
                </div>
                <ol className="mt-3 list-decimal space-y-2.5 pl-5 text-[var(--text-primary)] marker:text-[var(--text-secondary)]">
                  <li>{incognitoBrowserEnabled ? "Open the authorization URL above in a private/incognito window and sign in there." : "Log in and authorize in the popup window."}</li>
                  <li>
                    After authorizing, the page will fail to load (this is
                    expected).
                  </li>
                  <li>
                    Our server runs remotely, so the OAuth redirect can&apos;t reach
                    it directly. Copy the FULL URL from the address bar.
                  </li>
                  <li>Paste the URL below and submit.</li>
                </ol>
              </AlertSurface>

              <div>
                <div className="mb-2.5 text-xs font-semibold uppercase tracking-[0.08em] text-[var(--text-muted)]">
                  Paste callback URL
                </div>
                <Input
                  type="text"
                  name="callbackUrl"
                  value={callbackUrl}
                  onChange={handleCallbackChange}
                  placeholder="https://localhost/callback?code=...&state=..."
                  disabled={
                    oauthModalStatus === MODAL_STATUS.SUBMITTING ||
                    oauthModalStatus === MODAL_STATUS.POLLING
                  }
                  className="font-mono"
                />
                <AlertSurface
                  tone={
                    callbackValidation === CALLBACK_VALIDATION.VALID
                      ? "success"
                      : callbackValidation === CALLBACK_VALIDATION.INVALID
                        ? "danger"
                        : "info"
                  }
                  className={`mt-2 ${OAUTH_MODAL_INLINE_MESSAGE_CLASSNAME}`}
                >
                  {callbackMessage}
                </AlertSurface>
              </div>
            </div>
          )}

          {(oauthModalStatus === MODAL_STATUS.WAITING ||
            oauthModalStatus === MODAL_STATUS.POLLING ||
            oauthModalStatus === MODAL_STATUS.ERROR) &&
            !selectedOAuthProviderRequiresCallback && (
            <AlertSurface
              tone="info"
              className={OAUTH_MODAL_PANEL_CLASSNAME}
            >
              <div className="font-medium tracking-tight text-[var(--text-primary)]">
                Device Authorization
              </div>
              <ol className="mt-3 list-decimal space-y-2.5 pl-5 text-[var(--text-primary)] marker:text-[var(--text-secondary)]">
                <li>{incognitoBrowserEnabled ? "Open the authorization URL above in a private/incognito window." : "A browser window has opened with the authorization page."}</li>
                <li>Log in and approve the access request.</li>
                <li>Once approved, this dialog will update automatically.</li>
              </ol>
              {deviceCodeInfo && (
                <div className="mt-4 space-y-3">
                  <div className="rounded-lg border border-[var(--surface-border)] bg-[var(--surface-muted)] p-3 shadow-[var(--shadow-edge)]">
                    <p className="text-xs font-medium text-[var(--text-muted)]">Your authorization code:</p>
                    <p className="mt-1 select-all font-mono text-lg font-bold tracking-wider text-[var(--text-primary)]">{deviceCodeInfo.userCode}</p>
                  </div>
                  <p className="text-xs text-[var(--text-muted)]">
                    Enter this code at{" "}
                    <a
                      href={deviceCodeInfo.verificationUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="underline"
                      style={{ color: "var(--state-info-accent)" }}
                    >
                      {deviceCodeInfo.verificationUrl}
                    </a>
                  </p>
                </div>
              )}
            </AlertSurface>
          )}

          {oauthModalStatus === MODAL_STATUS.POLLING && (
            <AlertSurface
              tone="info"
              role="status"
              aria-live="polite"
              className={OAUTH_MODAL_PANEL_CLASSNAME}
            >
              {selectedOAuthProviderRequiresCallback
                ? "Callback submitted. Waiting for CLIProxyAPI to finish token exchange..."
                : "Waiting for CLIProxyAPI to finish OAuth authorization..."}
            </AlertSurface>
          )}

          {oauthModalStatus === MODAL_STATUS.SUCCESS && (
            <AlertSurface
              tone="success"
              role="status"
              aria-live="polite"
              className={OAUTH_MODAL_PANEL_CLASSNAME}
            >
              OAuth account connected successfully.
            </AlertSurface>
          )}

          {oauthModalStatus === MODAL_STATUS.ERROR && oauthErrorMessage && (
            <AlertSurface
              tone="danger"
              role="alert"
              className={OAUTH_MODAL_PANEL_CLASSNAME}
            >
              {oauthErrorMessage}
            </AlertSurface>
          )}
        </ModalContent>
        <ModalFooter>
          <Button variant="ghost" onClick={handleOAuthModalClose}>
            Close
          </Button>
          {oauthModalStatus !== MODAL_STATUS.SUCCESS && selectedOAuthProviderRequiresCallback && (
            <Button
              variant="pill"
              onClick={handleSubmitCallback}
              disabled={isOAuthSubmitDisabled}
            >
              {oauthModalStatus === MODAL_STATUS.SUBMITTING
                ? "Submitting..."
                : oauthModalStatus === MODAL_STATUS.POLLING
                  ? "Waiting..."
                  : "Submit URL"}
            </Button>
          )}
          {oauthModalStatus === MODAL_STATUS.SUCCESS && (
            <Button variant="pill" onClick={handleOAuthModalClose}>
              Done
            </Button>
          )}
        </ModalFooter>
      </Modal>

      <ConfirmDialog
        isOpen={showConfirmOAuthDelete}
        onClose={() => {
          setShowConfirmOAuthDelete(false);
          setPendingOAuthDelete(null);
        }}
        onConfirm={handleOAuthDelete}
        title="Remove OAuth Account"
        message={`Remove OAuth account ${pendingOAuthDelete?.accountName}?`}
        confirmLabel="Remove"
        cancelLabel="Cancel"
        variant="danger"
      />

      <OAuthImportForm
        isOpen={isImportModalOpen}
        providerName={importProviderName}
        jsonContent={importJsonContent}
        fileName={importFileName}
        status={importStatus}
        errorMessage={importErrorMessage}
        onClose={closeImportModal}
        onFileSelect={handleImportFileSelect}
        onJsonChange={handleImportJsonChange}
        onSubmit={handleImportSubmit}
      />

      <OAuthAccountModelsModal
        isOpen={Boolean(modelsModalAccount)}
        account={modelsModalAccount}
        loading={modelsLoading}
        errorMessage={modelsErrorMessage}
        models={models}
        onClose={closeModelsModal}
        onCopyModelId={async (modelId) => {
          try {
            await navigator.clipboard.writeText(modelId);
            showToast("Model id copied", "success");
          } catch {
            showToast("Failed to copy model id", "error");
          }
        }}
      />

      <OAuthAccountSettingsModal
        isOpen={Boolean(settingsAccount)}
        account={settingsAccount}
        editor={settingsEditor}
        loading={settingsLoading}
        saving={settingsSaving}
        errorMessage={settingsErrorMessage}
        previewText={settingsPreviewText}
        dirty={settingsDirty}
        onClose={closeSettingsModal}
        onCopyPreview={copySettingsPreview}
        onSave={saveSettings}
        onStringFieldChange={updateSettingsField}
        onDisableCoolingChange={updateSettingsDisableCooling}
        onWebsocketsChange={updateSettingsWebsockets}
      />
    </>
  );
}
