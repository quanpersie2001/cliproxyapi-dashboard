# Verification — br-vq4

- Feature: `usage-queue-ingestion`
- Bead: `br-vq4`
- Testing mode: `standard`
- Timestamp (UTC): `2026-05-05T19:11:01Z`

## Summary

Added a focused real-Postgres advisory-lock proof at `apps/dashboard/src/usage-collector/__tests__/leader-lock.postgres.test.ts` to validate two required behaviors:
- exclusivity under contention (second contender cannot acquire while first holds leadership)
- release handoff (later contender can acquire after release)

## Verify Commands

1. `cd dashboard && npm test -- src/usage-collector/__tests__/leader-lock.postgres.test.ts`
   - Exit code: `0`
   - Result: Passed (`1/1` test) on real Postgres-backed execution.
2. `cd dashboard && npm run typecheck`
   - Exit code: `0`
   - Result: Passed.

## Coverage Notes

- The new test intentionally holds contender A inside `withLeadership(...)` while contender B attempts acquisition against the same advisory lock key.
- While A holds the lock, B gets `acquired:false`.
- After A releases, B acquires successfully, proving release behavior.

## Files Changed

- `apps/dashboard/src/usage-collector/__tests__/leader-lock.postgres.test.ts`
- `history/usage-queue-ingestion/verification/br-vq4.md`
