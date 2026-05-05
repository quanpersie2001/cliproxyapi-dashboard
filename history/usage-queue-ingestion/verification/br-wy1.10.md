# Verification — br-wy1.10

- Feature: `usage-queue-ingestion`
- Bead: `br-wy1.10`
- Testing mode: `tdd-required`
- Verified at (UTC): `2026-05-05T14:40:28Z`

## Scope Implemented

- Rewrote usage collect API route into a fast authenticated wake trigger:
  - `dashboard/src/app/api/usage/collect/route.ts`
- Added route-boundary tests for dual auth, quick `200/202` behavior, and no legacy in-request fetch path:
  - `dashboard/src/app/api/usage/collect/route.test.ts`

## TDD Evidence

### Red step

1. `cd dashboard && npm test -- src/app/api/usage/collect/route.test.ts`
   - Exit: `1`
   - Expected failure signal observed:
     - mock factory hoist failure (`Cannot access 'validateOriginMock' before initialization`)
2. `cd dashboard && npm test -- src/app/api/usage/collect/route.test.ts`
   - Exit: `1`
   - Expected failure signal observed:
     - bearer-auth assertions failed (`expected 200/202, received 401`) due env-capture timing in static module import

### Green step

1. `cd dashboard && npm test -- src/app/api/usage/collect/route.test.ts`
   - Exit: `0`
   - Result: pass (`1 file, 6 tests`)
2. `cd dashboard && npm run typecheck`
   - Exit: `0`
   - Result: TypeScript no-emit check passed

## Verify Commands (as declared in bead)

1. `cd dashboard && npm test -- src/app/api/usage/collect/route.test.ts`
   - Attempt 1 exit: `1` (red baseline)
   - Attempt 2 exit: `1` (red baseline)
   - Attempt 3 exit: `0` (green)
2. `cd dashboard && npm run typecheck`
   - Exit: `0`
   - Result: pass

## Behavior Covered

- Dual auth preserved:
  - bearer `COLLECTOR_API_KEY` trigger path
  - admin-session + origin-validation path
- Route no longer performs legacy synchronous usage collection logic inside the HTTP request.
- Route requests wake via `collector_state` metadata (`wakeSequence`, `wakeRequestedAt`, `wakeReason`) and returns immediately.
- Route returns quick success envelope:
  - `200` when queued
  - `202` when collector already running
- Route tests assert no legacy `fetch` usage in request path.

## Decision Alignment (D2/D3/D10/D12)

- D2: `POST /api/usage/collect` is now a thin fast trigger, not a synchronous drain path.
- D3: Admin-session + origin and bearer auth paths are both preserved.
- D10: Trigger controls resident in-container worker state, rather than running collector work in-request.
- D12: Route-level triggering fails safely with internal error handling and does not force source connectivity during request handling.

## Changed Files

- `dashboard/src/app/api/usage/collect/route.ts`
- `dashboard/src/app/api/usage/collect/route.test.ts`
- `history/usage-queue-ingestion/verification/br-wy1.10.md`
