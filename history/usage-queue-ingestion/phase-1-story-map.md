# Story Map: Phase 1 - Schema and Collector Contracts

**Date**: 2026-05-05
**Phase Plan**: `history/usage-queue-ingestion/phase-plan.md`
**Phase Contract**: `history/usage-queue-ingestion/phase-1-contract.md`

## 1. Phase Outcome
Phase 1 makes the queue-ingestion data and code contracts real while keeping runtime behavior unchanged. By the end, execution workers can safely build Phase 2 against additive Prisma schema, transport-neutral collector interfaces, and tested event identity utilities.

## 2. Story Sequence
| Story | What Happens | Why Now | Serial / Parallel Safety | Shared-Collision Risk | Done Criteria | Testing Discipline Hint |
|---|---|---|---|---|---|---|
| Story 1: Add additive usage schema | Add `UsageQueueInbox`, `UsageRecord.eventKey`, and queued-event metadata with a migration; keep existing `usage_dedup_key`. | Schema is the irreversible foundation and blocks generated types for contract code. | Must run before or in tight coordination with Story 2 because generated Prisma types affect imports/tests. | High: `apps/dashboard/prisma/schema.prisma`, migrations, generated Prisma assumptions. | Migration is additive, Prisma generation succeeds, old usage history code still typechecks. | `tdd-required` or validation spike for schema/generate compatibility; at minimum run `npm run prisma:generate` and `npm run typecheck` from `apps/dashboard/`. |
| Story 2: Define collector contracts | Add `apps/dashboard/src/usage-collector/` contract/types for source, decoder, orchestrator, normalized event, inbox statuses, and result metrics. | Phase 2 needs stable ports that do not leak RESP details into core processing. | Can start after Story 1 schema shape is clear; avoid implementing RESP/process internals here. | Medium: new directory/module names become foundation for later phases. | Contracts compile, statuses match D13, and core types model D7/D8/D14/D15 without source-specific fields. | Standard typecheck plus focused compile/import coverage. |
| Story 3: Prove event identity | Implement event-key utility and tests: `request_id` precedence and normalized hash fallback. | Event identity drives dedupe and should be proven before usage persistence uses it. | Can run parallel with Story 2 after normalized event type exists; depends on Story 1 only if metadata types are imported from Prisma. | Medium: event-key semantics will be reused by persistence in Phase 2. | Tests cover request ID, blank request ID fallback, token total normalization, timestamp UTC normalization, and stable hash input tuple. | `tdd-required`; write failing event-key tests before implementation. |

## 3. Causal Flow
1. **Schema first**: create the tables/columns so all later code has the real persistence contract.
2. **Contracts second**: define the collector ports using the approved schema/event vocabulary, but keep them implementation-neutral.
3. **Event identity third**: prove the most important pure logic before it is used in persistence and dedupe.

## 4. Parallelization Guidance
- Story 1 should be treated as the sequencing anchor because it touches shared Prisma schema and migration state.
- Story 2 and Story 3 may be parallelized only after the normalized event field list is agreed; otherwise keep them serial to avoid churn in `contracts.ts`/`event-key.ts`.
- Do not let Phase 1 workers modify `POST /api/usage/collect`, `entrypoint.sh`, `Dockerfile`, or `install.sh`; those are later-phase collision zones.

## 5. Shared Files and Collision Risks
| File / Area | Risk | Coordination Rule |
|---|---|---|
| `apps/dashboard/prisma/schema.prisma` | High | Only Story 1 owns schema edits in Phase 1. |
| `apps/dashboard/prisma/migrations/*` | High | Story 1 creates exactly one migration for Phase 1 schema additions. |
| `apps/dashboard/src/usage-collector/contracts.ts` | Medium | Story 2 owns public contract names; Story 3 imports from them instead of redefining types. |
| `apps/dashboard/src/usage-collector/core/event-key.ts` | Medium | Story 3 owns event-key implementation and tests. |
| `apps/dashboard/src/app/api/usage/collect/route.ts` | Blocked | Do not edit in Phase 1. |
| `apps/dashboard/src/lib/usage/history.ts` | Blocked except compile fixes | Do not redesign; only additive type compatibility if generated Prisma changes require it. |

## 6. Testing Discipline
- Story 1: run `npm run prisma:generate` and `npm run typecheck` from `apps/dashboard/`; include migration SQL review evidence proving `usage_dedup_key` remains and `eventKey` stays nullable/unique.
- Story 2: run `npm run typecheck`; include a direct contract-boundary review proving no RESP adapter imports or runtime queue-drain code entered the Phase 1 contract layer.
- Story 3: use TDD for event-key utility with focused unit tests, then run relevant Vitest file and `npm run typecheck`.
- Phase validation must consume the recorded HIGH-risk spike findings under `.spikes/usage-queue-ingestion/` and verify that no runtime queue-draining path was introduced in Phase 1.

## 7. Story-To-Bead Mapping
| Story | Bead | Notes |
|---|---|---|
| Story 1: Add additive usage schema | `br-wy1.1` | P0, `tdd-required`; owns Prisma schema/migration and schema contract proof. |
| Story 2: Define collector contracts | `br-wy1.2` | Depends on `br-wy1.1`; owns transport-neutral contract/types only. |
| Story 3: Prove event identity | `br-wy1.3` | Depends on `br-wy1.2`, `tdd-required`; owns event-key utility and tests. |

## 8. Done For Phase 1
- Additive schema/migration is present and generated Prisma client works.
- Collector contracts exist and compile.
- Event-key tests pass and demonstrate D15.
- No runtime worker, route rewrite, cron retirement, or docs cleanup has been implemented early.
- Beads are executable with explicit files, verify commands, evidence paths, testing modes, decision refs, and relevant learning refs.
