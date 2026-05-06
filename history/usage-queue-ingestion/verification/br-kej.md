# Verification — br-kej

- Feature: `usage-queue-ingestion`
- Bead: `br-kej`
- Testing mode: `standard`
- Timestamp (UTC): `2026-05-05T20:08:35Z`

## Summary

Runtime coverage now includes the default coordinator mode used by `entrypoint.sh`. The coordinator proof validates that default bootstrap spawns both server and collector children, propagates shutdown on `SIGTERM`, and exits cleanly when both children stop.

## Verify Commands

1. `cd dashboard && npm test -- src/usage-collector/__tests__/collector-bootstrap.runtime.test.ts`
   - Exit code: `0`
   - Result: Passed (`4/4` tests).
2. `cd dashboard && npm run typecheck`
   - Exit code: `0`
   - Result: Passed.

## Observed Proof

- Added coordinator-mode regression: `proves default coordinator mode spawns both children and shuts down cleanly on SIGTERM`.
- Proof asserts:
  - Default bootstrap path spawns `server.js` and collector `--collector` child.
  - Coordinator sends shutdown signals to both children.
  - Parent process reaches clean exit with expected exit code.

## Files Changed

- `apps/dashboard/src/usage-collector/__tests__/collector-bootstrap.runtime.test.ts`
- `history/usage-queue-ingestion/verification/br-kej.md`
