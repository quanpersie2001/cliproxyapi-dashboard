# Verification — br-g23

- Bead ID: `br-g23`
- Feature: `usage-queue-ingestion`
- Testing mode: `standard`
- Verified at: `2026-05-06T14:45:33+07:00`

## Commands

1. `npm --prefix "/Users/quannv.dev/Workspace/Personal/cliproxyapi-apps/dashboard/dashboard" run test -- src/app/api/usage/collect/route.postgres.test.ts`
   - Exit code: `0`
   - Observed result: `1` test file passed, `1` test passed.

## Evidence Summary

- Non-mocked DB path: `POST /api/usage/collect` (bearer auth) persists wake metadata into real Postgres `collector_state` and increments `wakeSequence` across calls.
- Worker-side observation: a real `UsageCollectorWorkerRunner` cycle (with `PrismaCollectorStateRepository`) consumes the persisted wake and records `lastWakeHandledAt` / `workerId`, proving route-to-worker contract continuity.

## Artifacts

- `apps/dashboard/src/app/api/usage/collect/route.postgres.test.ts`
