# Verification — br-1eo

- Feature: `usage-queue-ingestion`
- Bead: `br-1eo`
- Testing mode: `standard`
- Timestamp (UTC): `2026-05-05T20:06:49Z`

## Summary

`UsageCollectorWorkerRunner` now bridges `CollectorRunSignal` into a live `AbortSignal` during `runOnce()`. In-flight `drainNow()` pull/process operations receive an abortable signal and terminate promptly when shutdown is requested.

## Verify Commands

1. `cd dashboard && npm test -- src/usage-collector/__tests__/worker-runner.test.ts`
   - Exit code: `0`
   - Result: Passed (`7/7` tests).
2. `cd dashboard && npm run typecheck`
   - Exit code: `0`
   - Result: Passed.

## Observed Proof

- Regression test `propagates a live abort signal into in-flight drain operations` confirms:
  - `drainNow()` receives defined `pull.signal` and `process.signal`.
  - Signal is initially not aborted.
  - Triggering run-signal abort causes in-flight drain to abort and runner returns bounded error/backoff result.

## Files Changed

- `dashboard/src/usage-collector/runner.ts`
- `dashboard/src/usage-collector/__tests__/worker-runner.test.ts`
- `history/usage-queue-ingestion/verification/br-1eo.md`
