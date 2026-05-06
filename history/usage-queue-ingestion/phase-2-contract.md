# Phase Contract: Phase 2 - One-Shot RESP Ingestion

**Date**: 2026-05-05
**Feature**: usage-queue-ingestion
**Phase Plan Reference**: `history/usage-queue-ingestion/phase-plan.md`

## 1. What This Phase Changes
Phase 2 turns the Phase 1 schema and contracts into a real bounded ingestion path. The dashboard gains a one-shot collector flow that can pull raw RESP queue messages, store them unchanged in `usage_queue_inbox`, decode them into normalized events, persist final facts into `usage_records`, and leave malformed or failed rows visible for debugging.

After this phase, the repo can prove end-to-end queue ingestion correctness without yet running a resident worker or rewriting the manual trigger route. The future worker and route handoff in Phase 3 must reuse the one-shot core built here.

## 2. Why This Phase Exists Now
- It validates the new ingestion model while debugging is still narrow and deterministic.
- It proves D7-D16 in a bounded path before container lifecycle, signal handling, and manual-trigger semantics add more moving pieces.
- It keeps the HIGH-blast-radius usage history read path stable by writing complete `usage_records` facts instead of redesigning the read model.
- It converts the current route's ownership and cache-invalidation semantics into reusable collector-core code that later runtime paths can call.

## 3. Entry State
- Phase 1 additive schema, collector contracts, and event-key utility exist and have review-backed evidence.
- `dashboard/src/usage-collector/` has no RESP adapter, decoder, repositories, ownership resolver, or executable one-shot implementation yet.
- `POST /api/usage/collect` still performs legacy `/usage` collection directly in the route.
- `/api/usage/history` and `/dashboard/usage` still read existing `usage_records` facts unchanged.
- No queue messages are persisted into `usage_queue_inbox`.

## 4. Exit State
- RESP adapter can pull bounded batches of raw queue messages into transport-neutral envelopes.
- CLIProxyAPI queue decoder converts raw payloads into normalized queued events or explicit decode failures.
- Decoder-derived invalid timestamps or other invalid identity inputs fail closed into collector-controlled failure states instead of crashing event-key generation.
- Inbox repository stores raw messages unchanged, claims `pending` or retryable rows safely, and records `processed`, `decode_failed`, `process_failed`, or `discarded` lifecycle transitions with reasons/timestamps.
- Ownership resolution is ported out of the legacy route so valid events still persist when ownership is partial.
- Usage-record persistence writes event-backed facts into `usage_records`, preserves idempotency through `eventKey` plus the legacy dedupe safety net, and invalidates usage caches after successful persistence.
- `pullOnce()`, `processOnce()`, and `drainNow()` execute as one-shot orchestration with metrics summarizing pulled, stored, claimed, processed, decode-failed, process-failed, and discarded work.
- Cleanup rules exist for processed vs failed/discarded inbox rows in the one-shot path, but there is still no resident worker loop, entrypoint/runtime packaging change, or `POST /api/usage/collect` rewrite yet.

## 5. Unlocks Next
- Phase 3 can start a resident worker and fast manual trigger by reusing the proven one-shot collector core.
- Validation can judge worker/runtime risks separately from decode, persistence, and row-claim correctness.

## 6. Locked Assumptions vs Phase Boundary
### Locked Assumptions
- D7/D13/D14: pull stores raw queue messages unchanged before decode, and malformed payloads must survive as `decode_failed` inbox rows.
- D8: RESP details stay in the source adapter and decoder edges; core repositories/orchestrator stay transport-neutral.
- D9: `usage_records` remains the final analytics source for `/api/usage/history` and `/dashboard/usage`.
- D11: destructive upstream drain must be compatible with multi-replica safety, and inbox processing must use row-claim semantics safe for concurrent processors.
- D14: valid events are persisted even when ownership resolution is partial.
- D15: `request_id` wins when present; fallback event identity must not crash on invalid decoder-derived inputs.
- D16: processed rows are short-lived while failed/discarded rows remain available for debugging retention.
- The Phase 1 learning in `.pulse/memory/learnings/20260505-ingestion-identity-hardening.md` is now active: invalid normalized timestamps and additive dedupe assumptions must be proven through behavior-level tests, not only type-surface checks.

### Phase Boundary
- No resident worker loop, entrypoint change, Docker copy/build wiring, or advisory leader runtime belongs in this phase.
- `POST /api/usage/collect` remains a later-phase seam; Phase 2 may extract reusable logic from the route, but it must not ship the manual-trigger rewrite.
- No canonical docs/install cleanup or cron retirement belongs in this phase.
- If validating cannot prove the exact row-claim behavior against the local PostgreSQL path, validating must require an explicit spike before Phase 2 execution starts.

## 7. Demo Walkthrough
A reviewer seeds or mocks RESP queue payloads, runs a bounded one-shot ingestion path, then inspects the database and collector results. Valid payloads become `usage_records` rows visible through the existing usage history snapshot, malformed payloads remain in `usage_queue_inbox` as `decode_failed`, retryable processing failures remain visible as `process_failed`, and duplicate event keys do not duplicate facts.

## 8. Story Sequence At A Glance
| Story | What Happens | Why Now | Unlocks Next | Done Looks Like |
|-------|--------------|---------|--------------|-----------------|
| Story 1: Implement RESP source and decoder | Add bounded RESP pull plus CLIProxyAPI payload decoding into normalized events and explicit decode failures. | Phase 2 needs real message ingress before any repository or orchestration proof matters. | Raw queue messages can be stored and processed via the one-shot flow. | Adapter/decoder tests cover auth failure, empty queue, valid payload, malformed payload, and fail-closed invalid timestamp handling. |
| Story 2: Build inbox repository lifecycle | Persist raw messages, claim processable rows, and record inbox status transitions safely. | The inbox is the first durable boundary and the concurrency safety anchor. | Processor/orchestrator can work against a real spool with safe retry state. | Real or integration-backed tests prove store, claim, status updates, and retry/discard transitions. |
| Story 3: Port ownership resolution and fact persistence | Reuse the current route's identity joins and write complete `usage_records` facts with idempotency and cache invalidation. | Existing usage history must remain stable while the write path changes underneath it. | Orchestrator can finish processing without route-local logic. | Valid events persist with partial ownership allowed, duplicates are skipped safely, and history snapshot shape still works. |
| Story 4: Wire one-shot orchestration and cleanup | Compose source, decoder, repositories, and persistence into `pullOnce()`, `processOnce()`, and `drainNow()` with metrics and cleanup semantics. | Future worker and route work should consume one proven core instead of re-implementing it. | Phase 3 can focus on runtime lifecycle only. | End-to-end one-shot tests prove mixed valid/invalid/duplicate/retryable batches and cleanup behavior. |

## 9. Out Of Scope
- No resident collector worker.
- No entrypoint or Docker runtime changes.
- No `POST /api/usage/collect` response-contract rewrite.
- No installer cron change.
- No canonical docs cleanup or root design-file removal.
- No read-model redesign of `getUsageHistorySnapshot`.

## 10. Success Contract
### Execution Success
- [ ] Stories reach done criteria.
- [ ] Raw queue payloads are stored unchanged before decode.
- [ ] Decoder failures and invalid identity inputs fail closed into inbox status handling.
- [ ] Row claiming is safe for concurrent processors.
- [ ] Event-backed facts remain compatible with the existing usage history read model.
- [ ] One-shot orchestration reports bounded metrics and does not depend on the legacy route body.
- [ ] No worker/runtime or manual-route rewrite leaks in early.

### Validation Success
- [ ] Validating confirms the RESP adapter and decoder match the approved queue payload contract.
- [ ] Validating confirms row-claim behavior is safe on the local PostgreSQL path or demands a spike before execution.
- [ ] Validating confirms duplicate event handling is behavior-tested, not inferred only from generated Prisma surface.
- [ ] Validating confirms `/api/usage/history` stays shape-compatible with newly inserted event-backed rows.
- [ ] Evidence paths are recorded in Phase 2 bead verification artifacts.

### Gate Decision Rule
- Advance only when one-shot ingestion correctness is proven for valid, malformed, duplicate, and retryable payloads with no unresolved HIGH-risk ambiguity around row claims or read-model compatibility.

## 11. Failure / Pivot Signals
- RESP queue pull semantics require core contracts to know RESP-specific details.
- Decoder/event-key integration can still throw on malformed normalized inputs instead of recording a controlled failure state.
- The inbox repository cannot prove safe claim/update behavior against PostgreSQL.
- New writes produce `usage_records` rows that break usage history aggregation or cache invalidation semantics.
- Phase 2 implementation starts changing runtime packaging or the manual route before one-shot correctness is validated.
