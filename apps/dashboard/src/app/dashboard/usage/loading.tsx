export default function UsageLoading() {
  return (
    <div className="space-y-6" role="status" aria-busy="true" aria-label="Loading usage analytics">
      <section className="dashboard-hero-surface p-4">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
          <div className="space-y-2">
            <div className="h-3 w-48 animate-pulse rounded bg-[var(--surface-muted)]" />
            <div className="h-8 w-56 animate-pulse rounded-md bg-[var(--surface-muted)]" />
            <div className="h-4 w-96 animate-pulse rounded bg-[var(--surface-muted)]" />
          </div>
          <div className="flex flex-wrap gap-2">
            {Array.from({ length: 4 }).map((_, idx) => (
              <div key={`pill-${idx}`} className="h-9 w-20 animate-pulse rounded-full bg-[var(--surface-muted)]" />
            ))}
          </div>
        </div>
      </section>

      <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-6">
        {Array.from({ length: 6 }).map((_, idx) => (
          <div key={`stat-${idx}`} className="dashboard-stat-surface p-4">
            <div className="h-3 w-20 animate-pulse rounded bg-[var(--surface-muted)]" />
            <div className="mt-4 h-8 w-24 animate-pulse rounded bg-[var(--surface-muted)]" />
            <div className="mt-3 h-4 w-full animate-pulse rounded bg-[var(--surface-muted)]" />
          </div>
        ))}
      </section>

      <section className="grid gap-4 xl:grid-cols-[minmax(0,0.95fr)_minmax(0,1.05fr)]">
        {Array.from({ length: 2 }).map((_, idx) => (
          <div key={`panel-${idx}`} className="dashboard-panel-surface p-4">
            <div className="space-y-2">
              <div className="h-3 w-24 animate-pulse rounded bg-[var(--surface-muted)]" />
              <div className="h-4 w-56 animate-pulse rounded bg-[var(--surface-muted)]" />
            </div>
            <div className="mt-4 h-40 animate-pulse rounded-md bg-[var(--surface-muted)]" />
          </div>
        ))}
      </section>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {Array.from({ length: 4 }).map((_, idx) => (
          <div key={`chart-${idx}`} className="dashboard-card-surface p-4">
            <div className="h-3 w-24 animate-pulse rounded bg-[var(--surface-muted)]" />
            <div className="mt-4 h-[260px] animate-pulse rounded-md bg-[var(--surface-muted)]" />
          </div>
        ))}
      </div>

      <section className="dashboard-panel-surface p-4">
        <div className="h-3 w-32 animate-pulse rounded bg-[var(--surface-muted)]" />
        <div className="mt-4 overflow-hidden rounded-md border border-[var(--surface-border)]">
          <div className="dashboard-table-header flex items-center gap-4 border-b border-[var(--surface-border)] px-3 py-2">
            <div className="h-2.5 w-8 animate-pulse rounded bg-[var(--surface-muted)]" />
            <div className="h-2.5 w-24 animate-pulse rounded bg-[var(--surface-muted)]" />
            <div className="ml-auto flex gap-6">
              {Array.from({ length: 4 }).map((_, idx) => (
                <div key={`th-${idx}`} className="h-2.5 w-12 animate-pulse rounded bg-[var(--surface-muted)]" />
              ))}
            </div>
          </div>
          {Array.from({ length: 6 }).map((_, idx) => (
            <div key={`row-${idx}`} className="flex items-center gap-4 border-b border-[var(--surface-border)] px-3 py-2 last:border-b-0">
              <div className="h-3 w-4 animate-pulse rounded bg-[var(--surface-muted)]" />
              <div className="h-3 w-36 animate-pulse rounded bg-[var(--surface-muted)]" />
              <div className="ml-auto flex gap-6">
                {Array.from({ length: 4 }).map((_, jdx) => (
                  <div key={`cell-${idx}-${jdx}`} className="h-3 w-12 animate-pulse rounded bg-[var(--surface-muted)]" />
                ))}
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
