# Lifecycle Summary: Usage Queue Ingestion

- Feature: `usage-queue-ingestion`
- Execution scope: `Phase 4 - Operator Contract and Cron Retirement`
- Review completed at: `2026-05-06T09:34:11Z`
- Current handoff: `pulse:compounding` (`manual_invoke`)

## Approved inputs

- `history/usage-queue-ingestion/CONTEXT.md`
- `history/usage-queue-ingestion/approach.md`
- `history/usage-queue-ingestion/phase-plan.md`
- `history/usage-queue-ingestion/phase-4-contract.md`
- `history/usage-queue-ingestion/phase-4-story-map.md`
- `history/usage-queue-ingestion/verification/br-wy1.14.md`
- `history/usage-queue-ingestion/verification/br-wy1.15.md`
- `history/usage-queue-ingestion/verification/br-wy1.16.md`

## Delivered outcome

- The bundled installer no longer provisions the legacy usage-collector cron path by default.
- Canonical docs now describe the embedded resident worker as the steady-state ingestion path, preserve `POST /api/usage/collect` as a fast authenticated trigger, and keep `GET /api/usage/history` as the durable read surface.
- The temporary root design brief was removed after its durable operator/runtime content was folded into canonical docs.
- Review closeout now reflects the final verification rerun after stabilizing Postgres integration test isolation and test discovery boundaries.

## Gate outcomes

- Validation gate: approved for the Phase 4 operator-contract/docs closeout.
- Reviewing gate: complete with no open P1 blockers.
- Human UAT status: `Skip` — the deliverable is install/docs plus backend verification evidence, so non-interactive proof was sufficient.
- Next lifecycle step: `pulse:compounding`.

## Canonical verification evidence

- `history/usage-queue-ingestion/verification/br-wy1.14.md`
- `history/usage-queue-ingestion/verification/br-wy1.15.md`
- `history/usage-queue-ingestion/verification/br-wy1.16.md`
- `history/usage-queue-ingestion/verification/epic.md`

## Final review verification snapshot

- `npm --prefix "/Users/quannv.dev/Workspace/Personal/cliproxyapi-dashboard/dashboard" test` => Pass (`40` files, `171` tests).
- `npm --prefix "/Users/quannv.dev/Workspace/Personal/cliproxyapi-dashboard/dashboard" run typecheck` => Pass.
- `npm --prefix "/Users/quannv.dev/Workspace/Personal/cliproxyapi-dashboard/dashboard" run build` => Pass.

## Remaining non-blocking review debt

- `P2` Leadership lock lifetime is still tied to a 120s transaction timeout, which can self-abort long backlog drains under load (`dashboard/src/usage-collector/infra/leader-lock.ts`).
- `P2` Inbox finalization still does not assert affected-row count before reporting processed success (`dashboard/src/usage-collector/repositories/inbox-repository.ts`).
- `P2` Worker sleep shutdown path lacks direct abort-after-start proof (`dashboard/src/usage-collector/runner.ts`, `dashboard/src/usage-collector/__tests__/worker-runner.test.ts`).
- `P3` The async trigger contract remains semantically ambiguous between `200 queued` and `202 accepted` (`dashboard/src/app/api/usage/collect/route.ts`).
- `P3` There is still no real-Postgres proof for the `process_failed` reclaim eligibility boundary around the max-attempt cap.
