# Phase Contract: Phase 1 - Schema and Collector Contracts

**Date**: 2026-05-05
**Feature**: usage-queue-ingestion
**Phase Plan Reference**: `history/usage-queue-ingestion/phase-plan.md`

## 1. What This Phase Changes
Phase 1 creates the durable foundation for queue-based usage ingestion without turning on the resident collector or changing the manual route behavior. The database gains the raw inbox and event identity shape required by the future worker, and the codebase gains stable collector interfaces plus normalized event-key utilities that later phases can implement against.

After this phase, the repo can represent CLIProxyAPI queued usage events, malformed raw messages, inbox statuses, and event-key dedupe contracts, but no production path should drain the upstream queue yet.

## 2. Why This Phase Exists Now
- The schema is the least reversible part of the feature, so it must be established before any destructive RESP `LPOP` behavior exists.
- Stable interfaces prevent later phases from mixing RESP wire details into core processing.
- Event identity and raw inbox semantics are foundational to D4, D7, D13, D14, and D15.
- The HIGH-risk read model must remain stable; Phase 1 proves additive compatibility before ingestion behavior changes.

## 3. Entry State
- `UsageRecord` has no `eventKey`, request metadata, provider metadata, or `UsageQueueInbox` relation/table.
- `CollectorState` exists and is used by the legacy route as a run-state/lease surface.
- `POST /api/usage/collect` still performs legacy `/usage` collection.
- `/api/usage/history` and `/dashboard/usage` read from existing `usage_records` facts.
- There is no `apps/dashboard/src/usage-collector/` contract layer.

## 4. Exit State
- Prisma schema and migration add transport-neutral `UsageQueueInbox` with raw string messages and statuses `pending`, `processed`, `decode_failed`, `process_failed`, and `discarded`.
- `UsageRecord` has nullable unique `eventKey` and additive metadata fields needed by queued events while retaining the existing `usage_dedup_key` unique constraint.
- Prisma generation succeeds and existing usage history code compiles against the additive schema.
- Collector contracts/types define source, decoder, orchestrator, normalized queued event, inbox status, and one-shot result boundaries.
- Event-key utility behavior is tested: non-empty `request_id` wins; otherwise the normalized CPA-style hash fallback is stable.
- No route, entrypoint, Docker runtime, installer, or docs behavior is changed in this phase except where tests or imports require additive references.

## 5. Unlocks Next
- Phase 2 can implement the RESP source adapter and one-shot orchestration against stable tables and interfaces.
- Validation can inspect schema and event-key compatibility before approving any queue-draining code.

## 6. Locked Assumptions vs Phase Boundary
### Locked Assumptions
- D4: `eventKey` is nullable and unique, and the existing composite `usage_dedup_key` remains.
- D7/D13: raw inbox rows are persisted before decoding in later phases, so Phase 1 must store raw messages as `String` rather than `Json`.
- D8: collector contracts must keep transport details at the edge.
- D9: `usage_records` remains the final analytics table.
- D15: event identity uses `request_id` first, hash fallback second.
- Exact additive `UsageRecord` fields for Phase 1 are `eventKey`, `requestId`, `provider`, and `authType`; the existing `endpoint` column remains the queued API-group field, so Phase 1 does not add a parallel `apiGroupKey` column.
- Exact `UsageQueueInbox` contract for Phase 1 is a transport-neutral raw spool with `rawMessage`, status, retry/lifecycle timestamps, attempt count, and optional failure/discard reason fields. Repository claim SQL and worker scheduling stay out of Phase 1 code.
- Phase 1 verification must include migration SQL review proving `usage_dedup_key` remains, plus explicit `prisma generate`, `typecheck`, and focused contract-test evidence.

### Phase Boundary
- Repository-level claim SQL is locked to Phase 2 implementation and later validating evidence; Phase 1 may reference the contract only.
- Worker packaging, entrypoint coordination, and manual-trigger response semantics are locked to later phases and must not leak into Phase 1 implementation.
- There are no remaining schema-scope ambiguities for Phase 1 execution.

## 7. Demo Walkthrough
A reviewer applies the Phase 1 migration, runs Prisma generation, and sees that the existing usage history build remains compatible. They inspect the new collector contract files and tests: queued events can be represented without RESP-specific types, inbox rows can represent raw malformed messages, and event keys are deterministic with `request_id` precedence.

## 8. Story Sequence At A Glance
| Story | What Happens | Why Now | Unlocks Next | Done Looks Like |
|-------|--------------|---------|--------------|-----------------|
| Story 1: Add additive usage schema | Add `UsageQueueInbox`, `UsageRecord.eventKey`, and metadata columns with migration while retaining existing dedupe. | Database contract must exist before ingestion code can write raw inbox or event-backed facts. | Collector contracts can target real generated Prisma types. | Prisma schema/migration exists, old dedupe remains, Prisma generation/typecheck pass. |
| Story 2: Define collector contracts | Add transport-neutral source, decoder, orchestrator, normalized event, and result/status types. | Later source/process work needs stable boundaries before implementation. | RESP adapter and processor can be implemented without leaking transport details into core. | Contract files compile and encode D7/D8/D13-D15 semantics. |
| Story 3: Prove event identity | Implement/test event-key utility using request ID first and normalized hash fallback. | Event identity drives new dedupe and must be proven before persistence uses it. | Phase 2 can rely on event keys during usage-record persistence. | Tests cover request ID precedence, token normalization, timestamp/source/auth/model fields, and stable fallback hash. |

## 9. Out Of Scope
- No RESP socket client.
- No queue drain loop.
- No resident worker process.
- No rewrite of `POST /api/usage/collect`.
- No installer cron change.
- No canonical docs cleanup or root design file removal.
- No read-model redesign of `getUsageHistorySnapshot`.

## 10. Success Contract
### Execution Success
- [ ] Stories reach done criteria.
- [ ] Additive migration preserves existing `usage_records` constraints.
- [ ] New collector contracts compile without depending on RESP implementation details.
- [ ] Event-key tests prove D15.
- [ ] No implementation route starts consuming the upstream queue.

### Validation Success
- [ ] Validating confirms the migration is additive and safe for existing usage history reads.
- [ ] Validating confirms the event-key behavior matches CPA reference semantics.
- [ ] Validating confirms Phase 2 can implement RESP/process code without reworking Phase 1 contracts.
- [ ] Evidence path is recorded in Phase 1 bead verification artifacts.

### Gate Decision Rule
- Advance only when execution and validation both pass, with no HIGH-risk schema or event-key ambiguity left unresolved.

## 11. Failure / Pivot Signals
- Prisma cannot represent the nullable unique `eventKey` safely alongside existing data.
- Generated Prisma client or typecheck breaks existing usage history code.
- Event-key utility cannot exactly express D15 and CPA fallback semantics.
- Collector contracts require RESP-specific fields in the core event/process types.
- Phase 1 implementation begins changing runtime behavior before schema/contracts are validated.
