# Approach: Usage Queue Ingestion

**Date**: 2026-05-05
**Feature**: usage-queue-ingestion
**Based on**:
- `history/usage-queue-ingestion/discovery.md`
- `history/usage-queue-ingestion/CONTEXT.md`

## 1. Gap Analysis
| Component | Have | Need | Gap Size |
|---|---|---|---|
| Event source | Legacy `GET ${CLIPROXYAPI_MANAGEMENT_URL}/usage` inside `POST /api/usage/collect`. | RESP queue adapter using `AUTH` + `LPOP`, with source failure treated as worker health error. | large |
| Durability boundary | No raw inbox; route decodes/aggregates before final writes. | `usage_queue_inbox` stores raw strings before decode/process. | large |
| Final fact identity | Composite `usage_dedup_key` on `UsageRecord`. | Nullable unique `eventKey` plus old composite safety net. | medium |
| Worker lifecycle | Host cron triggers an HTTP route every 5 minutes. | Resident worker enabled by default inside dashboard container, with manual route as fast kick. | large |
| Runtime packaging | Next standalone image copies only app artifacts and entrypoint. | Collector build output copied into runner and started with server under signal-safe coordination. | large |
| Read model | Stable PostgreSQL history aggregation and UI. | Preserve behavior while accepting new event-backed rows. | small if untouched, large if rewritten |
| Concurrency | `collector_state` lease serializes route runs in one app path. | PostgreSQL advisory leadership for destructive upstream drain and `FOR UPDATE SKIP LOCKED` row claims for local processing. | medium |
| Docs/install | Canonical docs and installer describe cron-driven collection. | Embedded worker docs/env/install defaults; root design file removed. | medium |

## 2. Recommended Approach
Implement the feature foundation-first: land schema and collector contracts before any runtime draining, then add the RESP source and bounded one-shot orchestration, then add resident lifecycle, and only after that retire cron/docs. Keep `usage_records` and `GET /api/usage/history` as the analytics source of truth. Treat the new collector as a small transport-adapter system: RESP-specific behavior lives at the edge, while pull/process orchestration, inbox persistence, event key generation, ownership resolution, and cache invalidation stay transport-neutral.

### Why This Approach
- It directly honors D6-D9: no extra service or relay queue, raw inbox before decode, transport-aware edges, and preserved read model.
- It contains the highest risks early: Prisma schema/event identity and production packaging are foundational and can be verified before route replacement.
- It avoids changing the HIGH-blast-radius `getUsageHistorySnapshot` path; new ingestion writes facts that existing aggregation already knows how to read.
- It keeps D2/D3 safe by making `POST /api/usage/collect` a thin authenticated trigger rather than a long synchronous drain.

### Architecture Baseline for Phase Slicing
#### Enduring Foundations
- `usage_records` remains the final analytics table for dashboard usage history.
- `usage_queue_inbox` is the first durable boundary controlled by this repo.
- Raw queue messages are stored unchanged before decode.
- Source adapters are transport-specific; core orchestrator/process logic is transport-neutral.
- `POST /api/usage/collect` is an authenticated kick/manual trigger, not the steady-state collector.
- The embedded worker must not block dashboard server startup when RESP is unavailable.

#### Ownership and Contracts
| Boundary | Owner | Contract / Interface | Constraint to Preserve |
|---|---|---|---|
| RESP source | `src/usage-collector/sources/resp-queue-source.ts` | `receiveBatch(maxMessages)` returns raw string envelopes from `AUTH` + `LPOP`; acknowledge/release are no-ops for destructive LPOP. | Source errors retry with backoff and do not kill dashboard server. |
| Collector core | `src/usage-collector/core/*` | `pullOnce()`, `processOnce()`, `drainNow()` over source/decoder/repository ports. | Core does not know RESP details. |
| Inbox repository | `src/usage-collector/repositories/inbox-repository.ts` | Bulk insert raw messages; claim pending/process_failed rows; update statuses. | Claim processing uses row locks to prevent double-processing. |
| Usage record repository | `src/usage-collector/repositories/usage-record-repository.ts` | Batch persist normalized events into `usage_records` with `eventKey` conflict protection. | Keep `usage_dedup_key` as safety net in first migration. |
| Ownership resolver | `src/usage-collector/core/ownership-resolver.ts` | Resolve `userId`/`apiKeyId` using current API key, auth-file, source, username, and prefix rules. | Valid events persist even if ownership remains partial. |
| Worker runner | `src/usage-collector/runner.ts` plus entrypoint/coordinator | Long-lived loops for pull, process, metadata/cleanup. | Advisory leadership before draining upstream queue. |
| Manual trigger route | `apps/dashboard/src/app/api/usage/collect/route.ts` | Preserve dual auth, origin validation, and return quickly after kick/bounded drain. | No legacy `/usage` fetch. |

## 3. Alternatives Considered
- Keep 5-minute cron and call RESP from `POST /api/usage/collect` — rejected because upstream queue retention can be shorter than cron cadence and D1/D2 require resident worker plus fast route.
- Add separate `cpa-usage-keeper` service — rejected by D6 and because the first durable boundary should be dashboard PostgreSQL, not another deployment component.
- Add Redis/RabbitMQ relay between CLIProxyAPI and dashboard — rejected by D6; it adds a second queue without fixing the volatile upstream queue.
- Rewrite `/dashboard/usage` around a new analytics API — rejected by D9 and GitNexus HIGH impact on `getUsageHistorySnapshot`.
- Decode queue payloads before local persistence — rejected by D7/D13/D14; malformed messages must survive for debugging.

## 4. Risk Map
| Component | Risk Level | Reason | Validation Owner | Spike Question | Affected Beads |
|---|---|---|---|---|---|
| Prisma migration and event identity | HIGH | Adds new table and unique nullable `eventKey` while preserving old dedupe behavior and Prisma 7 compatibility. | validating | YES/NO: Can the migration add `UsageQueueInbox` and nullable unique `UsageRecord.eventKey` without breaking existing `usage_records` reads/writes? | Phase 1 schema bead |
| Collector runtime packaging | HIGH | Next standalone runner will not include arbitrary TS source; entrypoint must start server and worker with safe signal handling. | validating | YES/NO: Does the built Docker image contain runnable collector JS and does container shutdown terminate both server and collector cleanly? | Phase 3 runtime bead |
| Local inbox row claiming | HIGH | Incorrect SQL can double-process rows or deadlock manual/background processing. | validating | YES/NO: Can two concurrent processors claim disjoint pending/process_failed inbox rows under PostgreSQL using `FOR UPDATE SKIP LOCKED`? | Phase 2/3 processor bead |
| Read model preservation | HIGH | GitNexus marks `getUsageHistorySnapshot` upstream impact HIGH across UsagePage, API route, and dashboard overview. | validating | YES/NO: Can new events populate existing `usage_records` fields so `/api/usage/history` snapshots remain shape-compatible without rewriting aggregation? | Phase 2 persistence bead |
| Manual trigger route semantics | MEDIUM | Route changes from full synchronous collection to fast kick/bounded drain while UI accepts `200` or `202`. | validating | YES/NO: Does admin refresh still call the route, receive success/accepted, and reload the snapshot without depending on full synchronous drain? | Phase 3 route bead |
| RESP source adapter | MEDIUM | Needs robust RESP parsing/auth/pop behavior and error backoff. | validating | YES/NO: Does adapter correctly handle auth failure, empty queue, one message, and batch messages? | Phase 2 source bead |
| Ownership resolution | MEDIUM | Porting route logic incorrectly can hide events from non-admin users or drop unresolved events. | validating | YES/NO: Are valid events persisted when owner resolution is partial, and resolved events still scoped to the right user? | Phase 2 ownership bead |
| Docs/install cleanup | MEDIUM | Existing docs and installer still describe cron as default; stale docs would mislead operators. | reviewing | YES/NO: Do canonical docs explain embedded worker, envs, manual trigger, and cron removal while `USAGE_QUEUE_INGESTION.md` is gone? | Phase 4 docs bead |

### HIGH Risk Details

#### Prisma migration and event identity
- Options:
  1. Add only `eventKey` and no inbox first — too weak because D13 requires durable raw inbox.
  2. Add inbox and nullable `eventKey` in one migration while preserving `usage_dedup_key` — recommended.
  3. Replace old composite unique immediately — rejected by D4.
- Recommended option: option 2.
- User-visible decision to lock: first migration keeps old dedupe safety net and adds new event identity in parallel.
- Testing mode expectation: `tdd-required` for schema/repository tests around event key duplicate handling.

#### Collector runtime packaging
- Options:
  1. Run collector through `tsx` in production — rejected because dev dependency/runtime source availability is not guaranteed.
  2. Compile a dedicated `dist-collector/` output and copy it into the runner — recommended.
  3. Fold collector into Next instrumentation/server lifecycle — rejected because it blurs server request lifecycle and worker supervision.
- Recommended option: option 2, with entrypoint/coordinator proving signal behavior.
- User-visible decision to lock: production container runs both Next standalone server and compiled collector worker inside the existing dashboard service.
- Testing mode expectation: `standard` plus Docker build smoke and entrypoint/coordinator unit/smoke proof; escalate if validating finds signal handling ambiguous.

#### Local inbox row claiming
- Options:
  1. Process rows with plain `findMany` then update — rejected because concurrent processors can double-process.
  2. Use PostgreSQL `FOR UPDATE SKIP LOCKED` in a transaction — recommended.
  3. Depend only on single worker process — rejected by D11.
- Recommended option: option 2.
- User-visible decision to lock: processing is safe for manual trigger and resident worker overlap.
- Testing mode expectation: `tdd-required` for repository claim behavior if integration DB test harness is available; otherwise a validating spike must define the exact proof.

#### Read model preservation
- Options:
  1. Rewrite `getUsageHistorySnapshot` for a new event table — rejected by D9 and HIGH blast radius.
  2. Continue writing complete `usage_records` facts from decoded events — recommended.
  3. Add a parallel API/UI surface — rejected as out of first implementation scope.
- Recommended option: option 2.
- User-visible decision to lock: `/dashboard/usage` remains backed by existing `usage_records` aggregation.
- Testing mode expectation: `standard` with existing usage history tests plus fixture coverage for newly inserted event-backed rows.

## 5. Proposed File Structure
```text
apps/dashboard/
├── prisma/
│   ├── schema.prisma
│   └── migrations/<timestamp>_usage_queue_ingestion/
├── src/
│   ├── app/api/usage/collect/route.ts
│   ├── lib/env.ts
│   ├── usage-collector/
│   │   ├── contracts.ts
│   │   ├── runner.ts
│   │   ├── core/
│   │   │   ├── orchestrator.ts
│   │   │   ├── pull-service.ts
│   │   │   ├── process-service.ts
│   │   │   ├── ownership-resolver.ts
│   │   │   ├── event-key.ts
│   │   │   └── types.ts
│   │   ├── decoders/
│   │   │   └── cliproxy-v1-decoder.ts
│   │   ├── sources/
│   │   │   └── resp-queue-source.ts
│   │   ├── repositories/
│   │   │   ├── collector-state-repository.ts
│   │   │   ├── inbox-repository.ts
│   │   │   └── usage-record-repository.ts
│   │   └── infra/
│   │       ├── env.ts
│   │       └── leader-lock.ts
│   └── usage-collector/__tests__/
├── tsconfig.collector.json
├── collector-bootstrap.js
├── Dockerfile
├── entrypoint.sh
└── package.json

docs/
├── ARCHITECTURE.md
├── ENV.md
├── OPERATIONS.md
└── FEATURES.md

CONTEXT.md
README.md
install.sh
```

## 6. Dependency Order
- Group A: schema and contracts — add `UsageQueueInbox`, nullable `eventKey`/metadata fields, collector interfaces, and event-key/decoder tests.
- Group B: one-shot ingestion core — implement RESP adapter, decoder, inbox repository, usage record repository, ownership resolver, and bounded orchestrator without resident worker.
- Group C: runtime integration — compile/copy collector, entrypoint/coordinator, advisory leadership, background loops, and route rewrite to kick/bounded-drain.
- Group D: operational cleanup — installer no longer installs cron by default; canonical docs updated; root design file removed.

## 7. Institutional Learnings Applied
| Learning Source | Key Insight | How Applied |
|---|---|---|
| `.pulse/memory/critical-patterns.md` | Preserve hidden/non-visible persisted details when editing backing documents. | Docs/config cleanup should fold, not silently discard, operator-relevant design/env details. |
| `.pulse/memory/corrections/20260505-fail-closed-masked-url-display.md` | Secret-bearing URL masking must fail closed. | No UI display of RESP passwords is planned; if added later, route to a separate review/test requirement. |
| `.pulse/memory/learnings/20260504-oauth-full-file-preservation.md` | Full-file save paths need round-trip preservation tests. | No full-file editor is planned; attach only to future beads if they edit config documents rather than docs/source code. |

## 8. Validation Closure Artifacts
- [x] Schema/event identity feasibility closes in `.spikes/usage-queue-ingestion/br-wy1.sp1/FINDINGS.md`.
- [x] Runtime packaging feasibility closes in `.spikes/usage-queue-ingestion/br-wy1.sp2/FINDINGS.md`.
- [x] Local inbox row-claiming feasibility closes in `.spikes/usage-queue-ingestion/br-wy1.sp3/FINDINGS.md`.
- [x] Read-model preservation closes in `.spikes/usage-queue-ingestion/br-wy1.sp4/FINDINGS.md`.

## 9. Remaining Questions By Phase
- Phase 1: none. Schema scope, verification proof, and event-identity boundary are fully locked for execution.
- Phase 2: execution must prove the exact PostgreSQL claim query and repository retry semantics against a real local database path before Phase 2 is approved.
- Phase 3: execution must prove the exact collector build command, runner copy path, and server/worker shutdown choreography before runtime changes are approved.
- Phase 3: execution must lock the final `POST /api/usage/collect` response contract (`200` vs `202`, response body shape) against the existing admin UI and bearer automation.
