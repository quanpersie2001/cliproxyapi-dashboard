"use client";

import { useState, useEffect, useCallback } from "react";
import { Badge } from "@/components/ui/badge";
import { AlertSurface } from "@/components/ui/alert-surface";
import { Card } from "@/components/ui/card";
import { StepIndicator } from "@/components/setup/step-indicator";
import { Step1Content, Step2Content } from "@/components/setup/step-contents";
import { SuccessBanner } from "@/components/setup/success-banner";
import { RevealBox } from "@/components/setup/reveal-box";
import { API_ENDPOINTS } from "@/lib/api-endpoints";

interface SetupStatus {
  providers: number;
  apiKeys: number;
}

interface CreatedKey {
  id: string;
  key: string;
  name: string;
}

export default function SetupWizardPage() {
  const [status, setStatus] = useState<SetupStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [justCreatedKey, setJustCreatedKey] = useState<CreatedKey | null>(null);

  const fetchStatus = useCallback(async () => {
    try {
      const res = await fetch(API_ENDPOINTS.SETUP.STATUS);
      if (!res.ok) {
        const data = (await res.json()) as { error?: string };
        setError(data.error ?? "Failed to load setup status");
        return;
      }
      const data = (await res.json()) as SetupStatus;
      setStatus(data);
      setError(null);
    } catch {
      setError("Network error -- retrying...");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchStatus();
    const interval = setInterval(() => {
      void fetchStatus();
    }, 5000);
    return () => clearInterval(interval);
  }, [fetchStatus]);

  const step1Done = status ? status.providers > 0 : false;
  const step2Done = status ? status.apiKeys > 0 : false;
  const stepDone = [step1Done, step2Done];
  const completedCount = stepDone.filter(Boolean).length;
  const allDone = completedCount === 2;

  const firstIncomplete = stepDone.findIndex((d) => !d);

  const STEPS = [
    { id: 1, title: "Connect a Provider", doneLabel: "Provider connected" },
    { id: 2, title: "Create an API Key", doneLabel: "API key created" },
  ] as const;

  const stepDescriptions = [
    "Add an OAuth account or configure an API key provider. Providers are the upstream services that power the proxy.",
    "Generate a personal API key. This key is what your clients use to authenticate with the proxy.",
  ] as const;

  return (
    <div className="w-full space-y-4">
      <section className="rounded-lg border border-[var(--surface-border)] bg-[var(--surface-base)] p-4">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-xl font-semibold tracking-tight text-[var(--text-primary)]">
              Setup Wizard
            </h1>
            <p className="mt-1 text-sm text-[var(--text-muted)]">
              Complete these steps to get CLIProxyAPI up and running.
            </p>
          </div>
          {status && (
            <div className="flex-shrink-0 rounded-md border border-[var(--surface-border)] bg-[var(--surface-muted)] px-3 py-1.5 text-xs font-semibold tabular-nums text-[var(--text-secondary)]">
              {completedCount}&nbsp;/&nbsp;{STEPS.length}
            </div>
          )}
        </div>

        <div className="mt-3 h-1 w-full overflow-hidden rounded-full bg-[var(--surface-muted)]">
          <div
            className="h-full rounded-full transition-[width] duration-700"
            style={{
              width: `${(completedCount / STEPS.length) * 100}%`,
              backgroundImage: "linear-gradient(90deg, var(--state-info-accent), var(--state-success-accent))",
            }}
          />
        </div>
      </section>

      {error && !loading && (
        <AlertSurface tone="danger" className="rounded-lg text-sm">
          {error}
        </AlertSurface>
      )}

      <Card>
        {loading && !status ? (
          <div className="flex items-center justify-center py-10">
            <div className="h-5 w-5 animate-spin rounded-full border-2 border-[var(--surface-border)] border-t-[var(--state-info-accent)]" />
          </div>
        ) : (
          <div className="space-y-1">
            {STEPS.map((step, index) => {
              const done = stepDone[index] ?? false;
              const active = !done && index === firstIncomplete;
              const isLast = index === STEPS.length - 1;

              return (
                <div key={step.id}>
                  <div
                    className={["flex gap-4 rounded-lg p-4", !done && !active ? "opacity-60" : ""].join(" ")}
                    style={
                      done
                        ? { backgroundColor: "var(--state-success-bg)" }
                        : active
                          ? {
                              backgroundColor: "var(--state-info-bg)",
                              boxShadow: "inset 0 0 0 1px var(--state-info-border)",
                            }
                          : undefined
                    }
                  >
                    <div className="flex flex-col items-center">
                      <StepIndicator step={step.id} done={done} active={active} />
                      {!isLast && (
                        <div
                          className="mt-2 w-px flex-1"
                          style={{
                            backgroundColor: done ? "var(--state-success-border)" : "var(--surface-muted)",
                            minHeight: "1.5rem",
                          }}
                        />
                      )}
                    </div>

                    <div className="flex-1 pb-2">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <h2
                          className="text-sm font-semibold"
                          style={{
                            color: done
                              ? "var(--state-success-text)"
                              : active
                                ? "var(--text-primary)"
                                : "var(--text-muted)",
                          }}
                        >
                          {step.title}
                        </h2>
                        {done && (
                          <Badge tone="success" className="px-2 py-0.5 text-[11px]">
                            {step.doneLabel}
                          </Badge>
                        )}
                      </div>

                      <p className="mt-1 text-sm leading-relaxed text-[var(--text-muted)]">
                        {stepDescriptions[index]}
                      </p>

                      {index === 0 && (
                        <Step1Content done={done} />
                      )}

                      {index === 1 && (
                        <Step2Content
                          done={done}
                          locked={!step1Done}
                          onCreated={setJustCreatedKey}
                        />
                      )}

                      {index === 1 && done && justCreatedKey && (
                        <RevealBox createdKey={justCreatedKey} />
                      )}
                    </div>
                  </div>

                  {!isLast && (
                    <div className="mx-4 border-b border-[var(--surface-border)]/40" />
                  )}
                </div>
              );
            })}
          </div>
        )}
      </Card>

      {allDone && <SuccessBanner />}

      {!allDone && (
        <p className="text-center text-xs text-[var(--text-muted)]">
          This page auto-refreshes every 5 seconds. Complete steps in any tab
          and they will appear here automatically.
        </p>
      )}
    </div>
  );
}
