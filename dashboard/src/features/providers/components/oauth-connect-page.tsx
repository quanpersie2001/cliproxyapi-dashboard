"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { OAuthSection } from "@/components/providers/oauth-section";
import { useToast } from "@/components/ui/toast";
import { Breadcrumbs } from "@/components/ui/breadcrumbs";
import { API_ENDPOINTS } from "@/lib/api-endpoints";

export function OAuthConnectPage() {
  const { showToast } = useToast();
  const [incognitoBrowserEnabled, setIncognitoBrowserEnabled] = useState(false);
  const [loading, setLoading] = useState(true);
  const refreshProviders = useCallback(() => Promise.resolve(), []);
  const handleAccountCountChange = useCallback((count: number) => {
    void count;
  }, []);

  const loadIncognitoSetting = useCallback(async (signal?: AbortSignal) => {
    try {
      const res = await fetch(API_ENDPOINTS.PROXY.OAUTH_SETTINGS, { signal });
      if (res.ok) {
        const data = await res.json();
        setIncognitoBrowserEnabled(Boolean(data.incognitoBrowser));
      }
    } catch {
      if (!signal?.aborted) {
        setIncognitoBrowserEnabled(false);
      }
    } finally {
      if (!signal?.aborted) {
        setLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    const timeoutId = window.setTimeout(() => {
      void loadIncognitoSetting(controller.signal);
    }, 0);

    return () => {
      window.clearTimeout(timeoutId);
      controller.abort();
    };
  }, [loadIncognitoSetting]);

  return (
    <div className="space-y-4">
      <Breadcrumbs
        items={[
          { label: "Dashboard", href: "/dashboard" },
          { label: "Providers", href: "/dashboard/providers" },
          { label: "Connect OAuth" },
        ]}
      />

      <section className="rounded-lg border border-[var(--surface-border)] bg-[var(--surface-base)] p-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="max-w-2xl">
            <h1 className="text-xl font-semibold tracking-tight text-[var(--text-primary)]">Connect OAuth</h1>
            <p className="mt-1 text-sm text-[var(--text-muted)]">
              Start a new browser authorization flow or import an auth JSON file for the proxy.
            </p>
          </div>

          <Link href="/dashboard/providers" className="dashboard-pill-link px-3 py-1.5 text-xs">
            Back to Providers
          </Link>
        </div>
      </section>

      <section className="rounded-lg border border-[var(--surface-border)] bg-[var(--surface-base)] p-4">
        {loading ? (
          <div className="rounded-lg border border-[var(--surface-border)] bg-[var(--surface-base)] p-6 text-center text-sm text-[var(--text-muted)]">
            Loading OAuth settings...
          </div>
        ) : (
          <OAuthSection
            showToast={showToast}
            currentUser={null}
            refreshProviders={refreshProviders}
            onAccountCountChange={handleAccountCountChange}
            incognitoBrowserEnabled={incognitoBrowserEnabled}
            showHeader={false}
            showAccountList={false}
            showConnectActions
            connectActionsCollapsible={false}
            connectActionsIntroOutside
          />
        )}
      </section>
    </div>
  );
}
