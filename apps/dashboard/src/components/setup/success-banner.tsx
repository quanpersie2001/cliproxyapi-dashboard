"use client";

import Link from "next/link";

export function SuccessBanner() {
  return (
    <div
      className="relative overflow-hidden rounded-xl px-6 py-5 shadow-[var(--shadow-warm)]"
      style={{
        border: "1px solid var(--state-success-border)",
        backgroundColor: "var(--state-success-bg)",
      }}
    >
      <div
        className="absolute inset-0"
        style={{
          background:
            "radial-gradient(ellipse at top right, color-mix(in srgb, var(--state-success-accent) 22%, transparent), transparent 60%)",
        }}
      />
      <div className="relative flex flex-col items-center gap-3 text-center sm:flex-row sm:text-left">
        <div
          className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-full"
          style={{
            backgroundColor: "color-mix(in srgb, var(--state-success-bg) 72%, var(--surface-base))",
            color: "var(--state-success-accent)",
            boxShadow: "inset 0 0 0 1px var(--state-success-border)",
          }}
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            className="h-6 w-6"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
            aria-hidden="true"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
            />
          </svg>
        </div>
        <div className="flex-1">
          <p className="text-base font-semibold" style={{ color: "var(--state-success-text)" }}>
            All steps complete
          </p>
          <p className="mt-0.5 text-sm text-[var(--text-muted)]">
            Your CLIProxyAPI instance is fully configured and ready to use.
          </p>
        </div>
        <Link
          href="/dashboard"
          className="flex-shrink-0 whitespace-nowrap px-3.5 py-1.5 text-sm font-medium transition-colors duration-200 rounded-md border glass-button-primary"
        >
          Go to Dashboard
        </Link>
      </div>
    </div>
  );
}
