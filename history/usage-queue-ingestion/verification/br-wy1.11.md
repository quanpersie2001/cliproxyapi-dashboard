# Verification — br-wy1.11

- Feature: `usage-queue-ingestion`
- Bead: `br-wy1.11`
- Testing mode: `tdd-required`
- Timestamp (UTC): `2026-05-05T19:59:57Z`

## Summary

Coordinator mode now isolates collector-child failure from dashboard-server lifetime. If collector exits first, bootstrap records degraded collector state and keeps the server child running.

## TDD Evidence

### Red

- Command: `cd dashboard && npm test -- src/usage-collector/__tests__/collector-bootstrap.runtime.test.ts`
- Exit code: `1`
- Expected failure observed: New coordinator test failed with `expected 1 to be +0` on `serverKillCalls`, proving current behavior still kills server when collector exits first.

### Green

- Command: `cd dashboard && npm test -- src/usage-collector/__tests__/collector-bootstrap.runtime.test.ts`
- Exit code: `0`
- Result: `2 passed, 0 failed`.

- Command: `cd dashboard && npm run typecheck`
- Exit code: `0`
- Result: TypeScript typecheck completed without diagnostics.

## Verify Commands

1. `cd dashboard && npm test -- src/usage-collector/__tests__/collector-bootstrap.runtime.test.ts`
   - Exit code: `0`
   - Result: Passed (`2/2` tests).
2. `cd dashboard && npm run typecheck`
   - Exit code: `0`
   - Result: Passed.

## Files Changed

- `apps/dashboard/collector-bootstrap.js`
- `apps/dashboard/src/usage-collector/__tests__/collector-bootstrap.runtime.test.ts`
- `history/usage-queue-ingestion/verification/br-wy1.11.md`
