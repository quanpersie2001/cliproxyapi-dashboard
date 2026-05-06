# Verification — br-lf2

- Feature: `usage-queue-ingestion`
- Bead: `br-lf2`
- Testing mode: `tdd-required`
- Timestamp (UTC): `2026-05-05T19:04:18Z`

## Summary

Bounded follower standby after wake advancement is now enforced in `UsageCollectorWorkerRunner.runOnce()`: non-leader workers consume the observed wake watermark locally and always return `idleMs` on standby, preventing zero-delay spin while preserving leader-only wake handling persistence.

## TDD Evidence

### Red

- Command: `cd dashboard && npm test -- src/usage-collector/__tests__/worker-runner.test.ts`
- Exit code: `1`
- Expected failure observed: New test `keeps follower standby bounded after wake sequence advances` failed because received standby `waitMs: 0` instead of expected `waitMs: 1000`.

### Green

- Command: `cd dashboard && npm test -- src/usage-collector/__tests__/worker-runner.test.ts`
- Exit code: `0`
- Result: `5 passed, 0 failed`.

- Command: `cd dashboard && npm run typecheck`
- Exit code: `0`
- Result: TypeScript typecheck completed without diagnostics.

## Verify Commands

1. `cd dashboard && npm test -- src/usage-collector/__tests__/worker-runner.test.ts`
   - Exit code: `0`
   - Result: Passed (`5/5` tests).
2. `cd dashboard && npm run typecheck`
   - Exit code: `0`
   - Result: Passed.

## Files Changed

- `apps/dashboard/src/usage-collector/runner.ts`
- `apps/dashboard/src/usage-collector/__tests__/worker-runner.test.ts`
- `history/usage-queue-ingestion/verification/br-lf2.md`
