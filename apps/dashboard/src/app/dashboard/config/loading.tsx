function SectionSkeleton({
  titleWidth,
  rows,
}: {
  titleWidth: string;
  rows: number;
}) {
  return (
    <section className="space-y-3 rounded-lg border border-[var(--surface-border)]/70 bg-[var(--surface-base)] p-4">
      <div className={`mb-3 h-3 animate-pulse rounded bg-[var(--surface-muted)] ${titleWidth}`} />
      <div className="grid gap-4 sm:grid-cols-2">
        {Array.from({ length: rows }).map((_, index) => (
          <div key={index} className="space-y-2">
            <div className="h-3.5 w-40 animate-pulse rounded bg-[var(--surface-muted)]" />
            <div className="h-3 w-56 animate-pulse rounded bg-[var(--surface-muted)]" />
            <div className="h-10 animate-pulse rounded-md bg-[var(--surface-muted)]" />
          </div>
        ))}
      </div>
    </section>
  );
}

export default function ConfigLoading() {
  return (
    <div className="space-y-4">
      <section className="rounded-lg border border-[var(--surface-border)]/70 bg-[var(--surface-base)] p-4">
        <div className="flex flex-col items-start justify-between gap-3 sm:flex-row">
          <div className="space-y-2">
            <div className="h-7 w-36 animate-pulse rounded-md bg-[var(--surface-muted)]" />
            <div className="h-4 w-80 animate-pulse rounded-md bg-[var(--surface-muted)]" />
          </div>
          <div className="flex gap-2">
            <div className="h-8 w-28 animate-pulse rounded-full bg-[var(--surface-muted)]" />
            <div className="h-8 w-28 animate-pulse rounded-full bg-[var(--surface-muted)]" />
          </div>
        </div>
      </section>

      <div className="h-10 animate-pulse rounded-md border border-[var(--surface-border)]/70 bg-[var(--surface-muted)]" />

      <SectionSkeleton titleWidth="w-36" rows={6} />
      <SectionSkeleton titleWidth="w-24" rows={3} />
      <SectionSkeleton titleWidth="w-40" rows={6} />
      <SectionSkeleton titleWidth="w-20" rows={4} />
      <SectionSkeleton titleWidth="w-28" rows={3} />
      <SectionSkeleton titleWidth="w-20" rows={1} />
      <SectionSkeleton titleWidth="w-40" rows={4} />
      <SectionSkeleton titleWidth="w-24" rows={4} />
      <SectionSkeleton titleWidth="w-28" rows={2} />
      <SectionSkeleton titleWidth="w-36" rows={3} />

      <section className="space-y-3 rounded-lg border border-[var(--surface-border)]/70 bg-[var(--surface-base)] p-4">
        <div className="flex items-center justify-between">
          <div className="h-3 w-48 animate-pulse rounded bg-[var(--surface-muted)]" />
          <div className="h-7 w-28 animate-pulse rounded-full bg-[var(--surface-muted)]" />
        </div>
      </section>
    </div>
  );
}
