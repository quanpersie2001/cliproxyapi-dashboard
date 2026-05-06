export default function QuotaLoading() {
  return (
    <div className="space-y-4">
      {/* Header with provider filter tabs + refresh */}
      <section className="rounded-lg border border-[var(--surface-border)] bg-[var(--surface-base)] p-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="space-y-2">
            <div className="h-7 w-20 animate-pulse rounded-md bg-[var(--surface-muted)]" />
            <div className="h-4 w-72 animate-pulse rounded-md bg-[var(--surface-muted)]" />
          </div>
          <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
            <div className="flex flex-wrap gap-1">
              {Array.from({ length: 6 }).map((_, idx) => (
                <div key={`tab-${idx}`} className="h-7 w-20 animate-pulse rounded-md bg-[var(--surface-muted)]" />
              ))}
            </div>
            <div className="h-7 w-20 animate-pulse rounded-md bg-[var(--surface-muted)]" />
          </div>
        </div>
      </section>

      {/* 4 stat cards */}
      <section className="grid grid-cols-2 gap-2 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, idx) => (
          <div key={`stat-${idx}`} className="rounded-lg border border-[var(--surface-border)] bg-[var(--surface-base)] px-2.5 py-2">
            <div className="h-2.5 w-24 animate-pulse rounded bg-[var(--surface-muted)]" />
            <div className="mt-1.5 h-4 w-12 animate-pulse rounded bg-[var(--surface-muted)]" />
          </div>
        ))}
      </section>

      {/* Charts: RadialBar gauge + Bar chart side by side */}
      <section className="grid grid-cols-1 gap-3 lg:grid-cols-2">
        {/* Gauge */}
        <div className="rounded-lg border border-[var(--surface-border)] bg-[var(--surface-base)] p-4">
          <div className="mb-1 h-4 w-36 animate-pulse rounded bg-[var(--surface-muted)]" />
          <div className="mb-3 h-3 w-52 animate-pulse rounded bg-[var(--surface-muted)]" />
          <div className="flex h-48 items-center justify-center">
            <div className="size-36 animate-pulse rounded-full bg-[var(--surface-muted)]" />
          </div>
        </div>
        {/* Bar chart */}
        <div className="rounded-lg border border-[var(--surface-border)] bg-[var(--surface-base)] p-4">
          <div className="mb-1 h-4 w-36 animate-pulse rounded bg-[var(--surface-muted)]" />
          <div className="mb-3 h-3 w-56 animate-pulse rounded bg-[var(--surface-muted)]" />
          <div className="h-48 animate-pulse rounded-md bg-[var(--surface-muted)]" />
        </div>
      </section>

      {/* Provider Capacity summary table */}
      <section className="space-y-2">
        <div className="h-3 w-32 animate-pulse rounded bg-[var(--surface-muted)]" />
        <div className="overflow-hidden rounded-lg border border-[var(--surface-border)] bg-[var(--surface-base)]">
          <div className="flex items-center gap-3 border-b border-[var(--surface-border)] bg-[var(--surface-base)]/60 px-3 py-2">
            {Array.from({ length: 5 }).map((_, idx) => (
              <div key={`ph-${idx}`} className="h-2.5 w-20 animate-pulse rounded bg-[var(--surface-muted)]" />
            ))}
          </div>
          {Array.from({ length: 4 }).map((_, idx) => (
            <div key={`prow-${idx}`} className="flex items-center gap-3 border-b border-[var(--surface-border)] px-3 py-2.5 last:border-b-0">
              <div className="h-3 w-24 animate-pulse rounded bg-[var(--surface-muted)]" />
              <div className="space-y-1">
                <div className="h-2.5 w-10 animate-pulse rounded bg-[var(--surface-muted)]" />
                <div className="h-1.5 w-32 animate-pulse rounded-full bg-[var(--surface-muted)]" />
              </div>
              <div className="space-y-1">
                <div className="h-2.5 w-10 animate-pulse rounded bg-[var(--surface-muted)]" />
                <div className="h-1.5 w-32 animate-pulse rounded-full bg-[var(--surface-muted)]" />
              </div>
              <div className="h-3 w-10 animate-pulse rounded bg-[var(--surface-muted)]" />
              <div className="h-3 w-6 animate-pulse rounded bg-[var(--surface-muted)]" />
            </div>
          ))}
        </div>
      </section>

      {/* Accounts card grid */}
      <section className="space-y-2">
        <div className="rounded-xl border border-[var(--surface-border)] bg-[var(--surface-base)] p-4">
          <div className="mb-4 flex items-start justify-between gap-3">
            <div className="space-y-2">
              <div className="h-3 w-20 animate-pulse rounded bg-[var(--surface-muted)]" />
              <div className="h-3 w-48 animate-pulse rounded bg-[var(--surface-muted)]" />
            </div>
            <div className="h-5 w-16 animate-pulse rounded-full bg-[var(--surface-muted)]" />
          </div>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
            {Array.from({ length: 4 }).map((_, idx) => (
              <div
                key={`acard-${idx}`}
                className="overflow-hidden rounded-xl border border-[var(--surface-border)] bg-[var(--surface-base)] p-4 shadow-[var(--shadow-edge)]"
              >
                <div className="space-y-4">
                  <div className="flex items-start gap-3.5">
                    <div className="size-14 animate-pulse rounded-[1.125rem] bg-[var(--surface-muted)]" />
                    <div className="min-w-0 flex-1 space-y-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <div className="h-4 w-28 animate-pulse rounded bg-[var(--surface-muted)]" />
                        <div className="h-5 w-16 animate-pulse rounded-full bg-[var(--surface-muted)]" />
                      </div>
                      <div className="h-3 w-40 animate-pulse rounded bg-[var(--surface-muted)]" />
                      <div className="flex flex-wrap gap-2">
                        {Array.from({ length: 3 }).map((__, metricIdx) => (
                          <div
                            key={`metric-${idx}-${metricIdx}`}
                            className="h-3 w-16 animate-pulse rounded bg-[var(--surface-muted)]"
                          />
                        ))}
                      </div>
                    </div>
                  </div>

                  <div className="border-t border-[var(--surface-border)] pt-3">
                    <div className="space-y-2">
                      <div className="h-3 w-24 animate-pulse rounded bg-[var(--surface-muted)]" />
                      <div className="h-3 w-44 animate-pulse rounded bg-[var(--surface-muted)]" />
                    </div>
                  </div>

                  <div className="space-y-2">
                    {Array.from({ length: 2 }).map((__, tileIdx) => (
                      <div
                        key={`tile-${idx}-${tileIdx}`}
                        className="rounded-lg border border-[var(--surface-border)] bg-[var(--surface-base)]/70 p-3"
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="space-y-2">
                            <div className="h-3 w-24 animate-pulse rounded bg-[var(--surface-muted)]" />
                            <div className="h-3 w-20 animate-pulse rounded bg-[var(--surface-muted)]" />
                          </div>
                        <div className="flex gap-2">
                          <div className="h-5 w-20 animate-pulse rounded-full bg-[var(--surface-muted)]" />
                          <div className="h-5 w-14 animate-pulse rounded-full bg-[var(--surface-muted)]" />
                        </div>
                      </div>
                      <div className="mt-3 h-1.5 w-full animate-pulse rounded-full bg-[var(--surface-muted)]" />
                    </div>
                  ))}
                </div>
              </div>
              </div>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}
