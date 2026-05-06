# Verification — br-wy1.7

- Feature: `usage-queue-ingestion`
- Bead: `br-wy1.7`
- Testing mode: `tdd-required`
- Verified at (UTC): `2026-05-05T13:06:28Z`

## Scope Implemented

- Added one-shot pull service:
  - `apps/dashboard/src/usage-collector/core/pull-service.ts`
- Added one-shot process service:
  - `apps/dashboard/src/usage-collector/core/process-service.ts`
- Added one-shot orchestrator composer:
  - `apps/dashboard/src/usage-collector/core/one-shot-orchestrator.ts`
- Added mixed-batch orchestration TDD suite:
  - `apps/dashboard/src/usage-collector/__tests__/one-shot-orchestrator.test.ts`

## TDD Evidence

### Red step

1. `cd dashboard && npm test -- src/usage-collector/__tests__/one-shot-orchestrator.test.ts`
   - Exit: `1`
   - Expected failure signal observed:
     - `No test files found` (target test file did not exist yet)

### Green step

1. `cd dashboard && npm test -- src/usage-collector/__tests__/one-shot-orchestrator.test.ts`
   - Exit: `0`
   - Result: pass (`1 file, 4 tests`)
2. `cd dashboard && npm run typecheck`
   - Exit: `0`
   - Result: TypeScript no-emit check passed

## Verify Commands (as declared in bead)

1. `cd dashboard && npm test -- src/usage-collector/__tests__/one-shot-orchestrator.test.ts`
   - Attempt 1 exit: `1`
   - Attempt 1 note: RED baseline before implementation (`No test files found`)
   - Attempt 2 exit: `0`
   - Attempt 2 result: pass (`4 passed`)
2. `cd dashboard && npm run typecheck`
   - Exit: `0`
   - Result: pass

## Behavior Covered

- `pullOnce()` reports bounded pull metrics (`pulled`, `stored`, `dropped`, `durationMs`).
- `processOnce()` handles mixed batches and records `processed`, `decode_failed`, `process_failed`, and `discarded` outcomes with explicit counters.
- Persistence failure path marks high-attempt rows `discarded` and retryable rows `process_failed`.
- `drainNow()` composes pull + process into a single summary payload without introducing worker-loop/runtime route changes.

## Changed Files

- `apps/dashboard/src/usage-collector/core/pull-service.ts`
- `apps/dashboard/src/usage-collector/core/process-service.ts`
- `apps/dashboard/src/usage-collector/core/one-shot-orchestrator.ts`
- `apps/dashboard/src/usage-collector/__tests__/one-shot-orchestrator.test.ts`
