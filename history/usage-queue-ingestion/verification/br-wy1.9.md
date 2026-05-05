# Verification — br-wy1.9

- Feature: `usage-queue-ingestion`
- Bead: `br-wy1.9`
- Testing mode: `tdd-required`
- Verified at (UTC): `2026-05-05T14:35:38Z`

## Scope Implemented

- Added resident worker loop orchestration with leadership gate, wake awareness, and error backoff handling:
  - `dashboard/src/usage-collector/runner.ts`
- Added PostgreSQL advisory leadership lock adapter:
  - `dashboard/src/usage-collector/infra/leader-lock.ts`
- Added bounded collector-state repository for standby/running/success/error + wake metadata updates:
  - `dashboard/src/usage-collector/repositories/collector-state-repository.ts`
- Added worker runtime TDD coverage:
  - `dashboard/src/usage-collector/__tests__/worker-runner.test.ts`
- Added runtime env contract knobs for resident worker behavior:
  - `dashboard/src/lib/env.ts`
- Extended `CollectorState` schema with bounded wake/heartbeat/run metadata:
  - `dashboard/prisma/schema.prisma`

## TDD Evidence

### Red step

1. `cd dashboard && npm test -- src/usage-collector/__tests__/worker-runner.test.ts`
   - Exit: `1`
   - Expected failure signal observed (before test existed):
     - `No test files found`
2. `cd dashboard && npm test -- src/usage-collector/__tests__/worker-runner.test.ts`
   - Exit: `1`
   - Expected failure signal observed (test created, implementation missing):
     - `Cannot find package '@/usage-collector/runner'`

### Green step

1. `cd dashboard && npm test -- src/usage-collector/__tests__/worker-runner.test.ts`
   - Exit: `0`
   - Result: pass (`1 file, 4 tests`)
2. `cd dashboard && npm run typecheck`
   - Exit: `0`
   - Result: TypeScript no-emit check passed

## Verify Commands (as declared in bead)

1. `cd dashboard && npm test -- src/usage-collector/__tests__/worker-runner.test.ts`
   - Attempt 1 exit: `1` (red baseline)
   - Attempt 2 exit: `1` (implementation module intentionally missing during red)
   - Attempt 3 exit: `0` (green)
2. `cd dashboard && npm run typecheck`
   - Exit: `0`
   - Result: pass

## Behavior Covered

- Leader-only execution path:
  - If advisory leadership is not acquired, worker remains `standby` and does not drain the queue.
- Replica-visible wake handling:
  - Worker reads `wakeSequence`, short-circuits wait time on fresh wake, and records wake handling metadata.
- Bounded collector state surface:
  - State updates are summary-level (`standby`, `running`, `success`, `error`) with bounded wake/heartbeat/run fields.
- Source failure backoff:
  - Worker run errors map to `error` state updates and return configured backoff delay instead of crashing the server process.

## Decision Alignment (D1/D7/D8/D10/D11/D12)

- D1: Resident worker loop is now represented as a first-class runtime component.
- D7/D8: Worker composes existing pull/process one-shot core without leaking transport details into runner control flow.
- D10: Runner is designed for long-lived in-container execution and cooperative shutdown signaling.
- D11: Leadership gate is backed by PostgreSQL advisory lock semantics.
- D12: Runtime failures become collector-state errors with backoff, not startup blockers.

## Changed Files

- `dashboard/prisma/schema.prisma`
- `dashboard/src/lib/env.ts`
- `dashboard/src/usage-collector/runner.ts`
- `dashboard/src/usage-collector/infra/leader-lock.ts`
- `dashboard/src/usage-collector/repositories/collector-state-repository.ts`
- `dashboard/src/usage-collector/__tests__/worker-runner.test.ts`
- `history/usage-queue-ingestion/verification/br-wy1.9.md`
