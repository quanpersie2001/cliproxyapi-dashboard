# Verification — br-mn8

- Feature: `usage-queue-ingestion`
- Bead: `br-mn8`
- Testing mode: `standard`
- Timestamp (UTC): `2026-05-05T19:08:34Z`

## Summary

Wake handling is now monotonic across overlap windows:
- `UsageCollectorWorkerRunner` re-reads the latest wake sequence before marking handled and carries forward the max value.
- `PrismaCollectorStateRepository.markWakeHandled()` now performs a monotonic write that cannot decrease the authoritative `wakeSequence`.

## Verify Commands

1. `cd dashboard && npm test -- src/usage-collector/__tests__/worker-runner.test.ts`
   - Exit code: `0`
   - Result: Passed (`6/6` tests), including overlap regression coverage that keeps a later wake visible.
2. `cd dashboard && npm run typecheck`
   - Exit code: `0`
   - Result: Passed.

## Coverage Notes

- New worker-runner regression proves that when wake sequence advances during a successful run, the handled sequence remains monotonic and the next loop does not lose that newer wake.
- Repository-level monotonic write strategy avoids overwriting a newer persisted wake with an older handled value.

## Files Changed

- `apps/dashboard/src/usage-collector/runner.ts`
- `apps/dashboard/src/usage-collector/repositories/collector-state-repository.ts`
- `apps/dashboard/src/usage-collector/__tests__/worker-runner.test.ts`
- `history/usage-queue-ingestion/verification/br-mn8.md`
