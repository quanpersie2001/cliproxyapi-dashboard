# Verification — br-wy1.6

- Feature: `usage-queue-ingestion`
- Bead: `br-wy1.6`
- Testing mode: `tdd-required`
- Verified at (UTC): `2026-05-05T13:02:54Z`

## Scope Implemented

- Added ownership resolver:
  - `dashboard/src/usage-collector/core/ownership-resolver.ts`
- Added usage record persistence repository:
  - `dashboard/src/usage-collector/repositories/usage-record-repository.ts`
- Added focused TDD suites:
  - `dashboard/src/usage-collector/__tests__/ownership-resolver.test.ts`
  - `dashboard/src/usage-collector/__tests__/usage-record-repository.test.ts`
- Added compatibility assertion update for usage-history read path:
  - `dashboard/src/lib/__tests__/usage-history.test.ts`

## TDD Evidence

### Red step

1. `cd dashboard && npm test -- src/usage-collector/__tests__/ownership-resolver.test.ts src/usage-collector/__tests__/usage-record-repository.test.ts src/lib/__tests__/usage-history.test.ts`
   - Exit: `1`
   - Expected failure signal observed:
     - missing modules: `@/usage-collector/core/ownership-resolver`
     - missing modules: `@/usage-collector/repositories/usage-record-repository`

### Green step

1. `cd dashboard && npm test -- src/usage-collector/__tests__/ownership-resolver.test.ts src/usage-collector/__tests__/usage-record-repository.test.ts src/lib/__tests__/usage-history.test.ts`
   - Exit: `0`
   - Result: pass (`3 files, 6 tests`)
2. `cd dashboard && npm run typecheck`
   - Exit: `0`
   - Result: TypeScript no-emit check passed

## Verify Commands (as declared in bead)

1. `cd dashboard && npm test -- src/usage-collector/__tests__/ownership-resolver.test.ts src/usage-collector/__tests__/usage-record-repository.test.ts src/lib/__tests__/usage-history.test.ts`
   - Attempt 1 exit: `0`
   - Attempt 1 note: false green because only existing `usage-history` suite ran; missing new suites were not yet present
   - Attempt 2 exit: `1`
   - Attempt 2 note: RED baseline after adding new tests (expected missing-module failures)
   - Attempt 3 exit: `1`
   - Attempt 3 note: mock-hoist failure in `usage-record-repository.test.ts` (`Cannot access 'invalidateUsageCaches' before initialization`)
   - Attempt 4 exit: `0`
   - Attempt 4 result: pass (`6 passed`)
2. `cd dashboard && npm run typecheck`
   - Exit: `0`
   - Result: pass

## Behavior Covered

- Ownership resolution preserves priority order: API-key grouping -> auth-file filename/email -> source identity -> auth-index prefix fallback.
- Valid events can remain persistable with partial ownership (`userId`/`apiKeyId` nullable output).
- Usage-record persistence writes normalized event-backed rows with `skipDuplicates: true`, deduplicates repeated `eventKey` values before persistence, and invalidates usage caches after successful write.
- Existing usage-history snapshot test still passes with `eventKey` on usage rows, confirming read-model compatibility.

## Changed Files

- `dashboard/src/usage-collector/core/ownership-resolver.ts`
- `dashboard/src/usage-collector/repositories/usage-record-repository.ts`
- `dashboard/src/usage-collector/__tests__/ownership-resolver.test.ts`
- `dashboard/src/usage-collector/__tests__/usage-record-repository.test.ts`
- `dashboard/src/lib/__tests__/usage-history.test.ts`
