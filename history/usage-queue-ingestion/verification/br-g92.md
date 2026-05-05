# Verification — br-g92

- Feature: `usage-queue-ingestion`
- Bead: `br-g92`
- Testing mode: `standard`
- Timestamp (UTC): `2026-05-05T20:12:27Z`

## Summary

Added a socket-level RESP integration harness to exercise the real TCP runtime boundary and malformed-frame behavior. Runtime parser flow now fail-closes malformed frame errors into the client read path instead of throwing uncaught exceptions from socket callbacks.

## Verify Commands

1. `cd dashboard && npm test -- src/usage-collector/__tests__/resp-queue-source.test.ts`
   - Exit code: `0`
   - Result: Passed (`4/4` tests).
2. `cd dashboard && npm run typecheck`
   - Exit code: `0`
   - Result: Passed.

## Observed Proof

- New integration test: `surfaces malformed RESP frames over the real TCP runtime boundary`.
- Test boots a fake local RESP TCP server, performs real `AUTH` + `LPOP` through runtime client factory, and returns malformed bulk framing.
- The runtime boundary now surfaces `resp_protocol_error: malformed bulk string` through promise rejection without unhandled process-level exceptions.

## Files Changed

- `dashboard/src/usage-collector/runtime-main.ts`
- `dashboard/src/usage-collector/__tests__/resp-queue-source.test.ts`
- `history/usage-queue-ingestion/verification/br-g92.md`
