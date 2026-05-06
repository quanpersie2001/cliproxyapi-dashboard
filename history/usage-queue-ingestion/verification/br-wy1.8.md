# Verification — br-wy1.8

- Feature: `usage-queue-ingestion`
- Bead: `br-wy1.8`
- Testing mode: `standard`
- Verified at (UTC): `2026-05-05T14:26:07Z`

## Scope Implemented

- Added collector runtime build target and wiring:
  - `apps/dashboard/package.json`
  - `apps/dashboard/tsconfig.collector.json`
- Added signal-aware bootstrap coordinator with collector placeholder process:
  - `apps/dashboard/collector-bootstrap.js`
- Wired runtime startup to coordinator:
  - `apps/dashboard/entrypoint.sh`
- Copied collector runtime artifacts into the production runner image:
  - `apps/dashboard/Dockerfile`

## Verify Commands (as declared in bead)

1. `cd dashboard && npm run build`
   - Exit: `0`
   - Result: pass
   - Observed proof:
     - `dist-collector/collector-bootstrap.js` generated
     - `dist-collector/usage-collector/*`, `dist-collector/lib/*`, and `dist-collector/generated/*` emitted from `tsconfig.collector.json`
     - Next.js production build completed successfully

2. `cd dashboard && npm run typecheck`
   - Attempt 1 exit: `1`
   - Attempt 1 note: failed when run in parallel with the build command due Prisma generate race (`EEXIST ... src/generated/prisma/internal`)
   - Attempt 2 exit: `0`
   - Attempt 2 result: pass (fresh standalone run)

## Coordinator Startup/Shutdown Proof

- Smoke command (temporary sandbox runner):
  - Created temp runtime directory with:
    - copied `dist-collector/collector-bootstrap.js`
    - temporary `server.js` that stays alive and exits on signals
  - Started coordinator, sent `SIGTERM`, waited for clean shutdown.
- Exit: `0`
- Observed logs:
  - `[server] started`
  - `[usage-collector] placeholder started`
  - `[bootstrap] stopping children (SIGTERM)`
  - `[usage-collector] placeholder stopping (SIGTERM)`

## Decision Alignment (D1/D6/D10/D12)

- D1: Runtime now has an always-on collector process boundary via coordinator startup path.
- D6: No new external service or relay queue was introduced.
- D10: Collector runs inside the same dashboard container process group as the Next server.
- D12: Coordinator shutdown behavior is explicit and signal-safe; source failures are deferred to worker logic in follow-up bead `br-wy1.9`.

## Changed Files

- `apps/dashboard/package.json`
- `apps/dashboard/tsconfig.collector.json`
- `apps/dashboard/collector-bootstrap.js`
- `apps/dashboard/entrypoint.sh`
- `apps/dashboard/Dockerfile`
- `history/usage-queue-ingestion/verification/br-wy1.8.md`
