# Verification — br-vd8

- Bead ID: `br-vd8`
- Feature: `usage-queue-ingestion`
- Testing mode: `standard`
- Verification timestamp (UTC): `2026-05-05T21:39:10Z`

## Commands

1. `npm --prefix "/Users/quannv.dev/Workspace/Personal/cliproxyapi-dashboard/dashboard" test -- src/usage-collector/__tests__/inbox-repository.test.ts src/usage-collector/__tests__/usage-record-repository.test.ts`
- Exit code: `0`
- Observed result: targeted collector repository tests passed; includes new retention cleanup behavior proof for processed vs failed/discarded windows.

2. `npm --prefix "/Users/quannv.dev/Workspace/Personal/cliproxyapi-dashboard/dashboard" run typecheck`
- Exit code: `0`
- Observed result: TypeScript no-emit check passed.

## Files changed for this bead

- `dashboard/src/usage-collector/contracts.ts`
- `dashboard/src/usage-collector/repositories/inbox-repository.ts`
- `dashboard/src/usage-collector/core/process-service.ts`
- `dashboard/src/usage-collector/__tests__/inbox-repository.test.ts`

## Notes

- Processed rows are now pruned on short retention; failed/process_failed/discarded rows are retained longer before prune.
- Cleanup runs as best-effort from the ingestion processing flow and does not break event processing on cleanup errors.
