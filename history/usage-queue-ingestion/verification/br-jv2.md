# Verification Evidence — br-jv2

- Bead: `br-jv2`
- Feature: `usage-queue-ingestion`
- Testing mode: `tdd-required`
- Verified at (UTC): `2026-05-05T17:50:37Z`

## TDD Evidence

### Red
- Command:
  `cd dashboard && npm test -- src/usage-collector/__tests__/ownership-resolver.test.ts src/usage-collector/__tests__/usage-record-repository.test.ts src/lib/__tests__/usage-history.test.ts`
- Exit code: `1`
- Expected failure signal observed:
  `usage-record-repository.test.ts` failed because persisted rows did not include resolved ownership (`userId`/`apiKeyId`) in `createMany` payload.

### Green
- Command:
  `cd dashboard && npm test -- src/usage-collector/__tests__/ownership-resolver.test.ts src/usage-collector/__tests__/usage-record-repository.test.ts src/lib/__tests__/usage-history.test.ts`
- Exit code: `0`
- Observed result:
  All targeted tests passed (`7 passed / 0 failed`).

## Verify Commands

1. `cd dashboard && npm test -- src/usage-collector/__tests__/ownership-resolver.test.ts src/usage-collector/__tests__/usage-record-repository.test.ts src/lib/__tests__/usage-history.test.ts`
   - Exit code: `0`
   - Result: pass; ownership persistence regression covered and passing.

2. `cd dashboard && npm run typecheck`
   - Exit code: `0`
   - Result: pass; TypeScript checks clean after ownership persistence wiring.

## Changed Files (bead scope)
- `apps/dashboard/src/usage-collector/repositories/usage-record-repository.ts`
- `apps/dashboard/src/usage-collector/__tests__/usage-record-repository.test.ts`
- `history/usage-queue-ingestion/verification/br-jv2.md`

## Notes
- `gitnexus_detect_changes()` MCP tool was not available in this Codex session namespace, so pre-commit scope was verified via targeted staging + direct file audit.
