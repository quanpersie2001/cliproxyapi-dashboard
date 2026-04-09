export default function DashboardLoading() {
  return (
    <div className="space-y-6" role="status" aria-busy="true" aria-label="Loading dashboard">
      <span className="sr-only">Loading dashboard content…</span>
      <section className="dashboard-panel-surface p-4">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="space-y-2">
            <div className="h-7 w-40 animate-pulse rounded-md bg-[var(--surface-muted)]" />
            <div className="h-4 w-96 animate-pulse rounded-md bg-[var(--surface-muted)]" />
            <div className="h-4 w-72 animate-pulse rounded-md bg-[var(--surface-muted)]" />
          </div>
          <div className="flex flex-wrap gap-2">
            <div className="h-8 w-24 animate-pulse rounded-full bg-[var(--surface-muted)]" />
            <div className="h-8 w-24 animate-pulse rounded-full bg-[var(--surface-muted)]" />
            <div className="h-8 w-28 animate-pulse rounded-full bg-[var(--surface-muted)]" />
          </div>
        </div>

        <div className="mt-4 grid gap-2 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, idx) => (
            <div key={`status-${idx}`} className="dashboard-stat-surface px-3 py-3">
              <div className="h-3 w-20 animate-pulse rounded bg-[var(--surface-muted)]" />
              <div className="mt-3 h-8 w-24 animate-pulse rounded bg-[var(--surface-muted)]" />
              <div className="mt-2 h-4 w-full animate-pulse rounded bg-[var(--surface-muted)]" />
            </div>
          ))}
        </div>

        <div className="mt-4 grid gap-3 xl:grid-cols-2">
          {Array.from({ length: 2 }).map((_, panelIdx) => (
            <div key={`panel-${panelIdx}`} className="dashboard-card-surface dashboard-card-surface--muted p-3">
              <div className="space-y-2">
                <div className="h-3 w-24 animate-pulse rounded bg-[var(--surface-border)]" />
                <div className="h-5 w-40 animate-pulse rounded bg-[var(--surface-border)]" />
                <div className="h-4 w-full animate-pulse rounded bg-[var(--surface-border)]" />
              </div>
              <div className="mt-4 grid grid-cols-2 gap-2">
                {Array.from({ length: 4 }).map((_, idx) => (
                  <div key={`row-${panelIdx}-${idx}`} className="dashboard-card-surface px-2.5 py-2">
                    <div className="h-3 w-14 animate-pulse rounded bg-[var(--surface-muted)]" />
                    <div className="mt-2 h-4 w-16 animate-pulse rounded bg-[var(--surface-muted)]" />
                    <div className="mt-2 h-3 w-full animate-pulse rounded bg-[var(--surface-muted)]" />
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="dashboard-panel-surface p-4">
        <div className="flex items-center justify-between gap-3">
          <div className="space-y-2">
            <div className="h-6 w-40 animate-pulse rounded bg-[var(--surface-muted)]" />
            <div className="h-4 w-80 animate-pulse rounded bg-[var(--surface-muted)]" />
          </div>
          <div className="h-10 w-40 animate-pulse rounded-full bg-[var(--surface-muted)]" />
        </div>
        <div className="mt-5 grid gap-4 xl:grid-cols-[minmax(0,0.95fr)_minmax(0,1.05fr)]">
          {Array.from({ length: 2 }).map((_, idx) => (
            <div key={`usage-panel-${idx}`} className="dashboard-panel-surface p-4">
              <div className="space-y-2">
                <div className="h-3 w-24 animate-pulse rounded bg-[var(--surface-muted)]" />
                <div className="h-4 w-56 animate-pulse rounded bg-[var(--surface-muted)]" />
              </div>
              <div className="mt-4 h-40 animate-pulse rounded-md bg-[var(--surface-muted)]" />
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
