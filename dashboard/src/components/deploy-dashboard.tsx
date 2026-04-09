"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { extractApiError } from "@/lib/utils";
import { API_ENDPOINTS } from "@/lib/api-endpoints";

interface DeployStatus {
  status: "idle" | "running" | "success" | "error" | "completed" | "failed";
  step?: string;
  message?: string;
  startedAt?: string;
  completedAt?: string;
  timestamp?: string;
  error?: string;
}

function normalizeStatus(payload: unknown): DeployStatus {
  if (payload && typeof payload === "object" && "status" in payload) {
    const candidate = payload as DeployStatus;
    if (typeof candidate.status === "string") {
      return candidate;
    }
  }
  return { status: "idle", message: "No deployment in progress" };
}

export function DeployDashboard() {
  const [status, setStatus] = useState<DeployStatus>({ status: "idle" });
  const [deploying, setDeploying] = useState(false);
  const [webhookConfigured, setWebhookConfigured] = useState<boolean | null>(null);
  const [showConfirm, setShowConfirm] = useState(false);

  const pollingRef = useRef<NodeJS.Timeout | null>(null);
  const fetchStatusRef = useRef<(shouldStartPolling?: boolean) => Promise<void>>(async () => {});
  const { showToast } = useToast();

  const fetchStatus = useCallback(async (shouldStartPolling = false) => {
    try {
      const res = await fetch(API_ENDPOINTS.ADMIN.DEPLOY);
      if (res.ok) {
        const data = await res.json();
        const normalized = normalizeStatus(data.status ?? data);
        setStatus(normalized);
        setWebhookConfigured(data.webhookConfigured ?? null);
        
        const s = normalized.status;
        if (s === "running") {
          setDeploying(true);
          if (shouldStartPolling && !pollingRef.current) {
            pollingRef.current = setInterval(() => {
              void fetchStatusRef.current(false);
            }, 2000);
          }
        } else if (s === "success" || s === "error" || s === "completed" || s === "failed") {
          setDeploying(false);
          if (pollingRef.current) {
            clearInterval(pollingRef.current);
            pollingRef.current = null;
          }
        }
      }
    } catch {}
  }, []);

  useEffect(() => {
    fetchStatusRef.current = fetchStatus;
  }, [fetchStatus]);

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      void fetchStatus(true);
    }, 0);

    return () => {
      window.clearTimeout(timeoutId);
      if (pollingRef.current) {
        clearInterval(pollingRef.current);
      }
    };
  }, [fetchStatus]);

  const startPolling = () => {
    if (pollingRef.current) {
      clearInterval(pollingRef.current);
    }
    pollingRef.current = setInterval(fetchStatus, 2000);
  };

  const handleDeploy = () => {
    setShowConfirm(true);
  };

  const executeDeploy = async () => {
    setDeploying(true);
    setStatus({ status: "running", step: "init", message: "Starting deployment..." });

    try {
      const res = await fetch(API_ENDPOINTS.ADMIN.DEPLOY, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ confirm: true }),
      });

      if (res.ok) {
        showToast("Deployment started", "success");
        startPolling();
      } else {
        const data = await res.json();
        const errorMessage = extractApiError(data, "Failed to start deployment");
        showToast(errorMessage, "error");
        setDeploying(false);
        setStatus({ status: "error", error: errorMessage });
      }
    } catch {
      showToast("Network error", "error");
      setDeploying(false);
      setStatus({ status: "error", error: "Network error" });
    }
  };

  const getStepLabel = (step?: string) => {
    switch (step) {
      case "init": return "Initializing...";
      case "pull": return "Pulling latest image...";
      case "proxy": return "Checking Docker proxy...";
      case "deploy": return "Deploying container...";
      case "health": return "Health check...";
      case "done": return "Complete!";
      default: return step || "Unknown";
    }
  };

  const getStatusColor = (s: string) => {
    switch (s) {
      case "running": return "text-blue-600";
      case "success":
      case "completed": return "text-green-600";
      case "error":
      case "failed": return "text-red-500";
      default: return "text-[var(--text-secondary)]";
    }
  };

  if (webhookConfigured === false) {
    return (
      <div className="space-y-3">
        <div>
          <h2 className="text-sm font-semibold text-[var(--text-primary)]">Dashboard Deployment</h2>
          <p className="text-xs text-[var(--text-muted)]">Pull and restart the latest published dashboard image</p>
        </div>

        <div className="space-y-4">
          <div className="rounded-sm border border-amber-200 bg-amber-50 p-3">
            <div className="text-sm font-medium text-amber-700">Webhook Not Configured</div>
            <p className="mt-1 text-xs text-[var(--text-muted)]">
              The deployment webhook is not set up. To enable dashboard deployments from the UI,
              you need to configure the webhook server on your host machine.
            </p>
          </div>

          <div className="space-y-3 text-sm text-[var(--text-secondary)]">
            <div className="font-medium text-[var(--text-primary)]">Setup Instructions:</div>
            <ol className="list-decimal list-inside space-y-2 text-[var(--text-muted)]">
              <li>Run <code className="rounded-sm bg-[var(--surface-muted)] px-1">sudo ./install.sh</code> and enable the webhook option, or follow <code className="rounded-sm bg-[var(--surface-muted)] px-1">infrastructure/WEBHOOK_SETUP.md</code></li>
              <li>Make sure <code className="rounded-sm bg-[var(--surface-muted)] px-1">WEBHOOK_HOST</code> and <code className="rounded-sm bg-[var(--surface-muted)] px-1">DEPLOY_SECRET</code> are set in <code className="rounded-sm bg-[var(--surface-muted)] px-1">infrastructure/.env</code></li>
              <li>Reload the webhook service after updating the config</li>
            </ol>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-sm font-semibold text-[var(--text-primary)]">Dashboard Deployment</h2>
          <p className="text-xs text-[var(--text-muted)]">Pull and restart the latest published dashboard image</p>
        </div>
        <div className="flex items-center gap-2">
          {status.status === "running" && (
            <Badge tone="info" className="rounded-sm animate-pulse">
              Deploying...
            </Badge>
          )}
          {(status.status === "success" || status.status === "completed") && (
            <Badge tone="success" className="rounded-sm">
              Success
            </Badge>
          )}
          {(status.status === "error" || status.status === "failed") && (
            <Badge tone="danger" className="rounded-sm">
              Failed
            </Badge>
          )}
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        <Button
          onClick={handleDeploy}
          disabled={deploying}
        >
          {deploying ? "Deploying..." : "Deploy Latest"}
        </Button>
        <Button
          variant="ghost"
          onClick={fetchStatus}
          disabled={deploying}
        >
          Refresh Status
        </Button>
      </div>

      {status.status !== "idle" && (
        <div className="space-y-3 border-t border-[var(--surface-border)] pt-3">
          <div className="flex items-center gap-2">
            <span className={`text-sm font-medium ${getStatusColor(status.status)}`}>
              {status.status === "running" && (
                <span className="mr-2 inline-block size-2 animate-pulse rounded-full bg-blue-400" />
              )}
              {getStepLabel(status.step)}
            </span>
          </div>

          {status.message && (
            <div className="text-xs text-[var(--text-muted)]">{status.message}</div>
          )}

          {status.error && (
            <div role="alert" className="rounded-sm border border-rose-200 bg-rose-50 p-3 text-xs text-rose-600">
              {status.error}
            </div>
          )}

          {status.completedAt && (
            <div className="text-xs text-[var(--text-muted)]">
              Completed: {new Date(status.completedAt).toLocaleString()}
            </div>
          )}
        </div>
      )}

      <ConfirmDialog
        isOpen={showConfirm}
        onClose={() => {
          setShowConfirm(false);
        }}
        onConfirm={executeDeploy}
        title="Deploy Latest Dashboard"
        message="Pull and restart the latest published dashboard image?"
        confirmLabel="Deploy"
        cancelLabel="Cancel"
        variant="warning"
      />
    </div>
  );
}
