# Story Map: Phase 2 - One-Shot RESP Ingestion

**Date**: 2026-05-05
**Phase Plan**: `history/usage-queue-ingestion/phase-plan.md`
**Phase Contract**: `history/usage-queue-ingestion/phase-2-contract.md`

## 1. Phase Outcome
Phase 2 makes queue ingestion real but still bounded. By the end, the repo can pull CLIProxyAPI RESP usage messages, spool them into `usage_queue_inbox`, process them into `usage_records`, and preserve malformed or failed rows for debugging without yet introducing a resident worker or route rewrite.

## 2. Story Sequence
| Story | What Happens | Why Now | Serial / Parallel Safety | Shared-Collision Risk | Done Criteria | Testing Discipline Hint |
|---|---|---|---|---|---|---|
| Story 1: Implement RESP source and decoder | Add RESP `AUTH` + bounded pull behavior and decode CLIProxyAPI queued payloads into normalized events or explicit decode failures. | The phase needs a real source contract and event boundary before storage and processing semantics can be proven. | Can start immediately after Phase 1; decoder and source may share fixtures but should stay in the same bead to avoid payload-shape drift. | Medium: new queue payload contract becomes the ingestion edge for all later work. | Source returns transport-neutral envelopes, decoder covers valid/malformed payloads, and invalid timestamps fail closed instead of throwing from event identity. | `tdd-required`; write fixture-driven tests for empty queue, auth/error paths, valid payloads, malformed JSON, and invalid normalized timestamps. |
| Story 2: Build inbox repository lifecycle | Store raw messages unchanged, claim processable rows safely, and mark lifecycle transitions with timestamps/reasons. | The inbox is the first durable boundary and the concurrency safety anchor for one-shot processing. | Should follow Story 1 so stored envelopes and decoded fields are stable; can expose repository helpers used later by orchestration. | High: `usage_queue_inbox` concurrency and retry semantics can double-process rows if claim logic is wrong. | Repository proofs cover raw insert, `pending`/retryable claim behavior, and transitions to `processed`, `decode_failed`, `process_failed`, and `discarded`. | `tdd-required`; prefer a real Postgres-backed test harness for `FOR UPDATE SKIP LOCKED` behavior, otherwise validating must promote a spike. |
| Story 3: Port ownership resolution and fact persistence | Move the current route's ownership joins into collector core and persist complete `usage_records` facts with cache invalidation and duplicate safety. | Existing usage history must stay stable while the write path changes underneath it. | Can begin once normalized event shape is stable; avoid touching the legacy route body except to extract reusable helpers. | High: `usage_records` compatibility and dual dedupe behavior affect `/api/usage/history` consumers. | Valid events persist even with partial ownership, duplicates are skipped safely, and event-backed rows remain readable through the existing history snapshot. | `tdd-required`; include behavior-level duplicate/idempotency proof plus a focused history-compatibility assertion. |
| Story 4: Wire one-shot orchestration and cleanup | Compose source, decoder, repositories, persistence, and cleanup into `pullOnce()`, `processOnce()`, and `drainNow()` with bounded metrics. | Future worker and manual trigger should reuse one proven bounded core instead of re-implementing ingestion behavior. | Must land after Stories 1-3 because it composes them; do not add worker loops or route response changes here. | High: orchestration is where mixed valid/invalid/duplicate/retryable batches can leak incorrect status transitions. | End-to-end one-shot tests prove pull/store/process flows, duplicate skipping, retry/discard paths, and cleanup semantics. | `tdd-required`; use mixed-batch fixtures and assert metrics plus final inbox/fact state. |

## 3. Causal Flow
1. **Source and decoder first**: define what a real queue message looks like at the collector boundary and how malformed input is contained.
2. **Inbox repository second**: make the durable spool and row-claim semantics real before final fact writes depend on them.
3. **Persistence and ownership third**: preserve the existing read model and route-proven identity joins while moving them into reusable collector code.
4. **One-shot orchestration last**: prove the whole bounded ingestion path before runtime lifecycle or HTTP trigger changes arrive.

## 4. Parallelization Guidance
- Story 1 should remain a single ownership zone because source and decoder share the queue payload contract.
- Story 2 must own `usage_queue_inbox` claim/status semantics alone; no other Phase 2 bead should issue competing row-claim SQL.
- Story 3 may extract helper logic from `dashboard/src/app/api/usage/collect/route.ts`, but it must not rewrite the route's public behavior.
- Story 4 is the composition step and should remain serial after Stories 1-3 close.
- Do not let any Phase 2 bead edit `dashboard/entrypoint.sh`, `dashboard/Dockerfile`, `dashboard/collector-bootstrap.js`, `install.sh`, or canonical docs; those are Phase 3/4 collision zones.

## 5. Shared Files and Collision Risks
| File / Area | Risk | Coordination Rule |
|---|---|---|
| `dashboard/src/usage-collector/contracts.ts` and `dashboard/src/usage-collector/core/types.ts` | Medium | Reuse Phase 1 contracts; only Story 1 may add strictly necessary transport-neutral refinements. |
| `dashboard/src/usage-collector/core/event-key.ts` | Medium | Story 1 and Story 4 may rely on it, but only touch it if fail-closed hardening is required by tests. |
| `dashboard/src/usage-collector/repositories/*` | High | Story 2 owns inbox repository files; Story 3 owns usage-record persistence; keep repository responsibilities split. |
| `dashboard/src/app/api/usage/collect/route.ts` | Medium | Story 3 may extract reusable ownership logic, but Phase 2 must not ship the route rewrite. |
| `dashboard/src/lib/usage/history.ts` | High | Story 3 may add test coverage or additive compatibility proofs only; no redesign. |
| `dashboard/prisma/schema.prisma` and existing migration files | Blocked except additive fixes | Phase 2 should not reopen Phase 1 schema unless execution finds a validation-approved additive correction. |

## 6. Testing Discipline
- Story 1: fixture-driven source/decoder tests plus `npm run typecheck` from `dashboard/`.
- Story 2: repository tests must prove real claim/update semantics; prefer local Postgres-backed evidence because this is a HIGH-risk concurrency seam.
- Story 3: prove duplicate/idempotency behavior at runtime level, not only by generated Prisma surface, and add a focused usage-history compatibility check.
- Story 4: mixed-batch one-shot tests must cover valid rows, malformed payloads, process retries, discard behavior, and cleanup outcomes.
- Human UAT is not the primary proof for this phase; validating and review should rely mostly on automated evidence plus database/artifact inspection.

## 7. Story-To-Bead Mapping
| Story | Bead | Notes |
|---|---|---|
| Story 1: Implement RESP source and decoder | `br-wy1.4` | P0, `tdd-required`; owns RESP adapter, payload decoder, and fail-closed decoder/input handling. |
| Story 2: Build inbox repository lifecycle | `br-wy1.5` | P0, `tdd-required`; depends on `br-wy1.4`, owns raw inbox storage, row claims, and status transitions. |
| Story 3: Port ownership resolution and fact persistence | `br-wy1.6` | P1, `tdd-required`; depends on `br-wy1.5`, owns ownership joins, `usage_records` persistence, cache invalidation, and history-compatibility proof. |
| Story 4: Wire one-shot orchestration and cleanup | `br-wy1.7` | P0, `tdd-required`; depends on `br-wy1.6`, owns bounded `pullOnce`/`processOnce`/`drainNow` composition and cleanup semantics. |

## 8. Done For Phase 2
- RESP payloads can be pulled and decoded into normalized events without leaking transport details into the core.
- Raw queue messages are durably stored and lifecycle-tracked in `usage_queue_inbox`.
- Valid normalized events become `usage_records` rows that the existing usage history snapshot can read.
- Mixed valid/invalid/duplicate/retryable batches are handled by one-shot orchestration with explicit metrics.
- No resident worker, route rewrite, runtime packaging, or docs/install cleanup has been implemented early.
- Beads are executable with explicit files, verify commands, evidence paths, testing modes, decision refs, and carried-forward learning refs.
