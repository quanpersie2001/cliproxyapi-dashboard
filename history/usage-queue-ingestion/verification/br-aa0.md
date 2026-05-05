# Verification — br-aa0

- Bead: `br-aa0`
- Feature: `usage-queue-ingestion`
- Testing mode: `standard`
- Verification timestamp: `2026-05-05T13:43:05Z`

## Commands

1. `cd dashboard && npm test -- src/usage-collector/__tests__/one-shot-orchestrator.test.ts`
- Exit code: `0`
- Observed result: passed (`1` file, `6` tests).

2. `cd dashboard && npm run typecheck`
- Exit code: `0`
- Observed result: `tsc --noEmit` completed after Prisma client generation.

## Failure Policy Evidence

- `CollectorPullService.pullOnce()` now fails closed with explicit signal when inbox persistence fails after RESP pull.
- Error shape includes operator-visible loss-window metadata:
  - `pull_store_failed`
  - `pulled=<count>`
  - `persisted=0`
  - `loss_window_open=true`
  - root `reason=<error message>`
- Regression test proves the failure path throws explicit signal instead of being treated as normal `dropped` math.
