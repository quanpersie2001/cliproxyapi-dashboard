# Verification — br-hk7

- Feature: `usage-queue-ingestion`
- Bead: `br-hk7`
- Testing mode: `tdd-required`
- Timestamp (UTC): `2026-05-05T17:20:32Z`

## Implemented Changes

- Replaced placeholder collector mode in production bootstrap with real runtime loading:
  - `dashboard/collector-bootstrap.js`
- Added real worker runtime composition (source + pull/process/orchestrator + runner):
  - `dashboard/src/usage-collector/runtime-main.ts`
- Added runtime smoke test that proves `--collector` mode starts the worker path (not placeholder):
  - `dashboard/src/usage-collector/__tests__/collector-bootstrap.runtime.test.ts`
- Hardened collector build output for production runtime execution:
  - `dashboard/tsconfig.collector.json`
  - `dashboard/package.json`
  - `dashboard/scripts/postbuild-collector.cjs`

## TDD Evidence

### Red

Command:

```bash
cd dashboard && npm test -- src/usage-collector/__tests__/collector-bootstrap.runtime.test.ts
```

Exit code: `1`

Observed failure signal:

- Test timed out at 5s:
  - `Error: Test timed out in 5000ms.`
- This confirmed runtime-smoke coverage needed deterministic startup/timeout behavior before closure.

### Green

Command:

```bash
cd dashboard && npm test -- src/usage-collector/__tests__/collector-bootstrap.runtime.test.ts
```

Exit code: `0`

Observed result:

- `collector-bootstrap.runtime.test.ts` passed (`1 passed`)
- Output includes worker runtime start signal and excludes placeholder start signal.

## Verify Commands (Bead Contract)

1. `cd dashboard && npm run build`  
   Exit code: `0`  
   Result: collector build + Next production build passed; collector artifact emitted and postbuild Prisma runtime patch applied.

2. `cd dashboard && npm test -- src/usage-collector/__tests__/worker-runner.test.ts src/app/api/usage/collect/route.test.ts`  
   Exit code: `0`  
   Result: worker-runner and usage-collect route regression pack passed.

3. `cd dashboard && DATABASE_URL="$DATABASE_URL" npm test -- src/usage-collector/__tests__/collector-bootstrap.runtime.test.ts`  
   Exit code: `0`  
   Result: runtime smoke passed; `--collector` mode starts/stops real worker runtime and does not hit placeholder branch.

## Decision Alignment (D1/D2/D10/D12)

- D1: collector runtime is now a real resident worker path in production bootstrap.
- D2: wake route now targets a running worker runtime instead of a placeholder loop.
- D10: worker remains in-container, coordinated with server lifecycle through bootstrap.
- D12: runtime wiring keeps source failures inside worker loop/backoff semantics; app startup path remains separate.

## Dependency Note (br-gs1 Linkage)

- `br-gs1` previously proved migrated `collector_state` runtime columns on a fresh database:
  - `history/usage-queue-ingestion/verification/br-gs1.md`
- `br-hk7` runtime smoke was executed after that schema-alignment proof, so bootstrap closure is evaluated against the aligned runtime control surface.

## Generated Proof Artifacts

- Runtime entry: `dashboard/src/usage-collector/runtime-main.ts`
- Runtime smoke test: `dashboard/src/usage-collector/__tests__/collector-bootstrap.runtime.test.ts`
- Collector postbuild patch helper: `dashboard/scripts/postbuild-collector.cjs`
- This verification record: `history/usage-queue-ingestion/verification/br-hk7.md`
