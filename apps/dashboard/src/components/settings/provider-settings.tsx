"use client";

import Markdown from "react-markdown";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

interface ProxyUpdateInfo {
  currentVersion: string;
  currentDigest: string;
  latestVersion: string;
  latestDigest: string;
  updateAvailable: boolean;
  availableVersions: string[];
}

interface DashboardUpdateInfo {
  currentVersion: string;
  latestVersion: string;
  updateAvailable: boolean;
  releaseUrl: string | null;
  releaseNotes: string | null;
}

interface ProviderSettingsProps {
  proxyUpdateInfo: ProxyUpdateInfo | null;
  proxyUpdateLoading: boolean;
  proxyUpdating: boolean;
  dashboardUpdateInfo: DashboardUpdateInfo | null;
  dashboardUpdateLoading: boolean;
  dashboardUpdating: boolean;
  onConfirmProxyUpdate: (version?: string) => void;
  onConfirmDashboardUpdate: () => void;
  onRefreshProxyUpdate: () => void;
  onRefreshDashboardUpdate: () => void;
}

export function ProviderSettings({
  proxyUpdateInfo,
  proxyUpdateLoading,
  proxyUpdating,
  dashboardUpdateInfo,
  dashboardUpdateLoading,
  dashboardUpdating,
  onConfirmProxyUpdate,
  onConfirmDashboardUpdate,
  onRefreshProxyUpdate,
  onRefreshDashboardUpdate,
}: ProviderSettingsProps) {
  return (
    <div className="space-y-3">
      <div>
        <h2 className="text-sm font-semibold text-[var(--text-primary)]">Software Updates</h2>
        <p className="text-xs text-[var(--text-muted)]">Manage CLIProxyAPI and Dashboard versions</p>
      </div>

        <h3 className="flex items-center gap-2 text-sm font-semibold text-[var(--text-primary)]">
          CLIProxyAPI Updates
          {proxyUpdateInfo?.updateAvailable && (
            <Badge tone="success" className="rounded-sm">
              Update Available
            </Badge>
          )}
        </h3>
      <div className="space-y-4">
        {proxyUpdateLoading ? (
          <div className="text-[var(--text-muted)]">Checking for updates...</div>
        ) : proxyUpdateInfo ? (
          <>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="rounded-sm border border-[var(--surface-border)] bg-[var(--surface-base)] p-4">
                <div className="text-sm font-medium text-[var(--text-muted)]">Current Version</div>
                <div className="mt-1 break-all text-lg font-semibold text-[var(--text-primary)]">
                  {proxyUpdateInfo.currentVersion}
                </div>
                <div className="mt-1 break-all text-xs text-[var(--text-muted)]">
                  Digest: <span className="font-mono text-[var(--text-primary)]">{proxyUpdateInfo.currentDigest}</span>
                </div>
              </div>
              <div className="rounded-sm border border-[var(--surface-border)] bg-[var(--surface-base)] p-4">
                <div className="text-sm font-medium text-[var(--text-muted)]">Latest Version</div>
                <div className="mt-1 break-all text-lg font-semibold text-[var(--text-primary)]">
                  {proxyUpdateInfo.latestVersion}
                </div>
                <div className="mt-1 break-all text-xs text-[var(--text-muted)]">
                  Digest: <span className="font-mono text-[var(--text-primary)]">{proxyUpdateInfo.latestDigest}</span>
                </div>
              </div>
            </div>

            <div className="flex flex-col sm:flex-row flex-wrap gap-2">
              <Button
                onClick={() => onConfirmProxyUpdate("latest")}
                disabled={proxyUpdating || !proxyUpdateInfo.updateAvailable}
              >
                {proxyUpdating ? "Updating..." : proxyUpdateInfo.updateAvailable ? "Update to Latest" : "Up to Date"}
              </Button>
              <Button variant="secondary" onClick={onRefreshProxyUpdate} disabled={proxyUpdateLoading}>
                Refresh
              </Button>
            </div>

            {proxyUpdateInfo.availableVersions.length > 0 && (
              <div className="border-t border-[var(--surface-border)] pt-4">
                <div className="mb-2 text-sm font-medium text-[var(--text-muted)]">Available Versions</div>
                <div className="flex flex-wrap gap-2">
                  {proxyUpdateInfo.availableVersions.slice(0, 5).map((v) => (
                    <button
                      key={v}
                      type="button"
                      onClick={() => onConfirmProxyUpdate(v)}
                      disabled={proxyUpdating}
                      className="rounded-sm border border-[var(--surface-border)] bg-[var(--surface-muted)] px-2 py-1 text-xs text-[var(--text-secondary)] transition-colors hover:bg-[var(--surface-muted)] disabled:opacity-50"
                    >
                      {v}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </>
        ) : (
          <div className="text-[var(--text-muted)]">Failed to check for updates</div>
        )}
      </div>

      <div className="border-t border-[var(--surface-border)] pt-4">
        <h3 className="flex items-center gap-2 text-sm font-semibold text-[var(--text-primary)]">
          Dashboard Updates
          {dashboardUpdateInfo?.updateAvailable && (
            <Badge tone="success" className="rounded-sm">
              Update Available
            </Badge>
          )}
        </h3>
        <div className="mt-3 space-y-4">
          {dashboardUpdateLoading ? (
            <div className="text-[var(--text-muted)]">Checking for updates...</div>
          ) : dashboardUpdateInfo ? (
            <>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="rounded-sm border border-[var(--surface-border)] bg-[var(--surface-base)] p-4">
                  <div className="text-sm font-medium text-[var(--text-muted)]">Current Version</div>
                  <div className="mt-1 break-all text-lg font-semibold text-[var(--text-primary)]">
                    {dashboardUpdateInfo.currentVersion}
                  </div>
                </div>
                <div className="rounded-sm border border-[var(--surface-border)] bg-[var(--surface-base)] p-4">
                  <div className="text-sm font-medium text-[var(--text-muted)]">Latest Version</div>
                  <div className="mt-1 break-all text-lg font-semibold text-[var(--text-primary)]">
                    {dashboardUpdateInfo.latestVersion}
                  </div>
                  {dashboardUpdateInfo.releaseNotes && (
                    <details className="mt-2">
                      <summary className="cursor-pointer text-xs text-[var(--state-info-accent)] transition-opacity hover:opacity-80">
                        View release notes
                      </summary>
                      <div className="mt-2 max-h-60 overflow-auto rounded-sm border border-[var(--surface-border)] bg-[var(--surface-base)] p-3 text-xs text-[var(--text-secondary)] prose prose-xs max-w-none [&_h1]:text-sm [&_h1]:font-semibold [&_h1]:text-[var(--text-primary)] [&_h2]:text-xs [&_h2]:font-semibold [&_h2]:text-[var(--text-primary)] [&_h3]:text-xs [&_h3]:font-semibold [&_h3]:text-[var(--text-secondary)] [&_ul]:list-disc [&_ul]:pl-4 [&_ol]:list-decimal [&_ol]:pl-4 [&_li]:my-0.5 [&_code]:bg-[var(--surface-muted)] [&_code]:px-1 [&_code]:rounded [&_a]:text-[var(--state-info-accent)] [&_a]:underline [&_p]:my-1">
                        <Markdown>{dashboardUpdateInfo.releaseNotes}</Markdown>
                      </div>
                    </details>
                  )}
                </div>
              </div>

              <div className="flex flex-col sm:flex-row flex-wrap gap-2">
                <Button
                  onClick={onConfirmDashboardUpdate}
                  disabled={dashboardUpdating || !dashboardUpdateInfo.updateAvailable}
                >
                  {dashboardUpdating ? "Updating..." : dashboardUpdateInfo.updateAvailable ? "Update to Latest" : "Up to Date"}
                </Button>
                <Button variant="secondary" onClick={onRefreshDashboardUpdate} disabled={dashboardUpdateLoading}>
                  Refresh
                </Button>
              </div>
            </>
          ) : (
            <div className="text-[var(--text-muted)]">Failed to check for updates</div>
          )}
        </div>
      </div>
    </div>
  );
}
