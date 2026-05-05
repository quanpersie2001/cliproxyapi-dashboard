# Verification — br-nx4

- Feature: `usage-queue-ingestion`
- Bead: `br-nx4`
- Testing mode: `tdd-required`
- Timestamp (UTC): `2026-05-05T20:55:53Z`

## Summary

`PostgresCollectorLeaderLock.withLeadership()` now pins advisory lock acquire/run/release inside one interactive transaction session and fails closed when `pg_advisory_unlock` does not release from the owning session. Postgres integration coverage now includes a wrong-session unlock path that must reject with a release failure.

## TDD Evidence

### Red

- Command: `cd dashboard && npm test -- src/usage-collector/__tests__/leader-lock.postgres.test.ts`
- Exit code: `1`
- Expected failure observed: New test `fails when lock release is attempted from a different session` failed because `withLeadership` resolved `{ acquired: true, value: "leader-a" }` instead of rejecting.

### Green

- Command: `cd dashboard && npm test -- src/usage-collector/__tests__/leader-lock.postgres.test.ts`
- Exit code: `0`
- Result: `2 passed, 0 failed`.

- Command: `cd dashboard && npm run typecheck`
- Exit code: `0`
- Result: TypeScript typecheck completed without diagnostics.

## Verify Commands

1. `cd dashboard && npm test -- src/usage-collector/__tests__/leader-lock.postgres.test.ts`
   - Exit code: `0`
   - Result: Passed (`2/2` tests).
2. `cd dashboard && npm run typecheck`
   - Exit code: `0`
   - Result: Passed.

## Files Changed

- `dashboard/src/usage-collector/infra/leader-lock.ts`
- `dashboard/src/usage-collector/__tests__/leader-lock.postgres.test.ts`
- `history/usage-queue-ingestion/verification/br-nx4.md`
