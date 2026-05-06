# Verification — br-wy1.12

- Feature: `usage-queue-ingestion`
- Bead: `br-wy1.12`
- Testing mode: `tdd-required`
- Timestamp (UTC): `2026-05-05T20:02:09Z`

## Summary

Coordinator shutdown bookkeeping now removes the exiting child entry before shutdown branching, so the first-child-exit path no longer leaves stale map state that can block final process exit.

## TDD Evidence

### Red

- Command: `cd dashboard && npm test -- src/usage-collector/__tests__/collector-bootstrap.runtime.test.ts`
- Exit code: `1`
- Expected failure observed: New shutdown test failed with `expected +0 to be 1` for `exitCalls.length`, proving coordinator did not complete shutdown after server-first exit.

### Green

- Command: `cd dashboard && npm test -- src/usage-collector/__tests__/collector-bootstrap.runtime.test.ts`
- Exit code: `0`
- Result: `3 passed, 0 failed`.

- Command: `cd dashboard && npm run typecheck`
- Exit code: `0`
- Result: TypeScript typecheck completed without diagnostics.

## Verify Commands

1. `cd dashboard && npm test -- src/usage-collector/__tests__/collector-bootstrap.runtime.test.ts`
   - Exit code: `0`
   - Result: Passed (`3/3` tests).
2. `cd dashboard && npm run typecheck`
   - Exit code: `0`
   - Result: Passed.

## Files Changed

- `apps/dashboard/collector-bootstrap.js`
- `apps/dashboard/src/usage-collector/__tests__/collector-bootstrap.runtime.test.ts`
- `history/usage-queue-ingestion/verification/br-wy1.12.md`
