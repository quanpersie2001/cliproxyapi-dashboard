# Phase Plan: Usage Queue Ingestion

**Date**: 2026-05-05
**Feature**: usage-queue-ingestion
**Based on**:
- `history/usage-queue-ingestion/CONTEXT.md`
- `history/usage-queue-ingestion/discovery.md`
- `history/usage-queue-ingestion/approach.md`

## 1. Feature Summary
The dashboard will stop relying on the removed CLIProxyAPI `/usage` management endpoint and host cron. Instead, the existing dashboard service will run an embedded collector that drains CLIProxyAPI per-request usage events from the RESP queue, persists raw messages into PostgreSQL, processes them into `usage_records`, and keeps `/dashboard/usage` working through the current history read model.

The feature intentionally changes ingestion only. The final analytics source remains `usage_records`, the existing `/api/usage/history` response stays stable, and the manual `POST /api/usage/collect` route becomes a fast admin/bearer trigger rather than the steady-state collector.

## 2. Whole-Feature Architecture Baseline
### Enduring Foundations
- Embedded collector is enabled by default and runs inside the existing dashboard container.
- RESP queue is the first source adapter; collector core stays transport-neutral.
- Raw messages are written unchanged into `usage_queue_inbox` before decode or aggregation.
- `usage_records` remains the final analytics table and the source for existing usage UI/API reads.
- Event identity uses `request_id` when present, otherwise a normalized CPA-style hash fallback.
- Multi-replica safety is assumed: advisory leadership before upstream drain and row-claiming for inbox processing.
- RESP/source outages degrade collector health and retry with backoff; they do not block the dashboard server.
- Root design content is folded into canonical docs and `USAGE_QUEUE_INGESTION.md` is removed before the feature ships.

### Ownership Boundaries
| Area / Module | Owner | Responsibilities In Scope | Explicitly Out Of Scope |
|---|---|---|---|
| Prisma schema | `apps/dashboard/prisma/schema.prisma` and migration | Add `usage_queue_inbox`, nullable unique `eventKey`, optional event metadata, and keep existing dedupe safety net. | Removing `usage_dedup_key` in this first migration. |
| Collector core | `apps/dashboard/src/usage-collector/core/*` | Pull/process orchestration, status transitions, event normalization, ownership resolution, cache invalidation hooks. | RESP wire protocol details. |
| Source adapter | `apps/dashboard/src/usage-collector/sources/resp-queue-source.ts` | RESP connection, auth, probe, and `LPOP` batch behavior. | Redis Streams/RabbitMQ adapters. |
| Decoder | `apps/dashboard/src/usage-collector/decoders/cliproxy-v1-decoder.ts` | Decode CLIProxyAPI queued payloads and preserve malformed raw rows as failures. | Legacy `/usage` aggregate payload parsing. |
| Repositories | `apps/dashboard/src/usage-collector/repositories/*` | Batch inbox insert/claim/update and batch fact persistence into `usage_records`. | Per-event audit logging. |
| Runtime coordinator | `apps/dashboard/entrypoint.sh`, `collector-bootstrap.js`, build scripts, Dockerfile | Compile/copy worker output and start server plus worker with shutdown handling. | Separate Compose service or external supervisor. |
| Manual route | `apps/dashboard/src/app/api/usage/collect/route.ts` | Preserve dual auth/origin validation and trigger/kick collector quickly. | Full synchronous HTTP drain of the source queue. |
| Docs/install | `install.sh`, canonical docs | Remove default cron install and document embedded worker/env/manual trigger. | New analytics UI or CPA UI/API layer. |

### Interfaces and Contracts
| Interface / Contract | Producer | Consumer | Contract Shape | Stability Expectation |
|---|---|---|---|---|
| `UsageMessageSource` | Source adapter | Collector orchestrator | Probe plus batch receive of raw envelopes, with ack/release hooks for future transports. | Stable across RESP and future transports. |
| `UsagePayloadDecoder` | Decoder | Process service | Raw envelope -> normalized event or decode error. | Stable event shape; decoder-specific payload handling can change. |
| `CollectorOrchestrator` | Collector core | Worker runner and manual route | `pullOnce()`, `processOnce()`, `drainNow()` with bounded metrics/status result. | Stable route/worker integration point. |
| `usage_queue_inbox` | Pull service | Process service | Raw string rows with statuses `pending`, `processed`, `decode_failed`, `process_failed`, `discarded`. | Stable local spool/audit boundary. |
| `usage_records.eventKey` | Process service | Database conflict protection and future diagnostics | Nullable unique event identity on new rows. | Additive first; old composite dedupe remains. |
| `/api/usage/history` | Existing history service | Usage UI, dashboard overview, API callers | Existing snapshot shape backed by `usage_records`. | Must remain stable. |
| `POST /api/usage/collect` | Manual route | Admin UI refresh and bearer automation | Authenticated fast trigger returning success/accepted metrics/status. | Auth contract stable; synchronous full drain removed. |

## 3. Why This Breakdown
- Phase 1 is first because schema, event identity, and contracts are the least reversible foundation; later code should compile against stable boundaries instead of inventing them during route replacement.
- Phase 2 proves the hard ingestion semantics without background lifecycle complexity: RESP pull, raw inbox, decode, ownership, event persistence, and idempotency.
- Phase 3 adds always-on behavior only after one-shot ingestion works, so entrypoint/signal/leadership issues are isolated from decode/persistence correctness.
- Phase 4 is last because docs/install cleanup should describe shipped behavior, and the root design file should only disappear once canonical docs carry the durable operator contract.

## 4. Phase Overview
| Phase | What Changes In Real Life | Why This Phase Exists Now | Demo Walkthrough | Unlocks Next |
|-------|----------------------------|---------------------------|------------------|--------------|
| Phase 1: Schema and Collector Contracts | Database can store raw queue inbox rows and new event keys; collector modules have stable ports but no live queue drain yet. | Establishes irreversible data and code contracts before transport/runtime work. | Run migration/tests, show Prisma client exposes `UsageQueueInbox` and `UsageRecord.eventKey`, and unit tests prove event-key fallback behavior. | RESP adapter and one-shot orchestration can write against real schema/contracts. |
| Phase 2: One-Shot RESP Ingestion | A bounded collector path can pull RESP messages, store raw inbox rows, process them into `usage_records`, and leave bad rows debuggable. | Proves the new ingestion model while still outside resident process supervision. | Seed/mock RESP payloads, run `drainNow()` or focused test, show valid events in `usage_records`, malformed messages in `decode_failed`, duplicate event keys skipped. | Worker lifecycle and route replacement can reuse proven orchestrator. |
| Phase 3: Embedded Worker and Manual Trigger | Dashboard container starts the Next server plus resident collector; `/api/usage/collect` wakes/kicks the collector and returns quickly. | Replaces unreliable cron with always-on ingestion and preserves admin/bearer manual refresh. | Start app/container, observe server health remains up when source is unavailable, observe worker standby/active status, call manual trigger and see accepted/success response. | Operational docs/install can be updated to match real runtime behavior. |
| Phase 4: Operator Contract and Cron Retirement | Installer stops adding usage cron by default; canonical docs explain worker envs, health, retention, and manual trigger; root design file is removed. | Prevents stale operator guidance and completes D5 after implementation is real. | Read docs from README/docs hub, verify no default cron wording remains, verify `USAGE_QUEUE_INGESTION.md` is gone and its durable content appears in canonical docs. | Feature is review-ready. |

## 5. Phase Details

### Phase 1: Schema and Collector Contracts
- **What Changes In Real Life**: The database has a durable inbox table and stronger event identity columns ready for new writes, while existing usage history continues to read current rows normally.
- **Why This Phase Exists Now**: It locks the data contract before any destructive queue consumption exists.
- **Architecture Decisions Applied**: D4, D7, D8, D9, D13, D15.
- **Boundary Integrity Check**: No route behavior or resident worker should change in this phase; `/api/usage/history` remains untouched except for type compatibility if needed.
- **Stories Inside This Phase**:
  - Add migration/model fields for inbox and event identity.
  - Add collector contracts and normalized event/event-key utilities.
  - Add focused tests for event-key generation and schema-facing repository assumptions where practical.
- **Demo Walkthrough**: Run Prisma generation/typecheck/tests and inspect that old usage history still compiles while new contracts can represent queued events and failed raw messages.
- **Unlocks Next**: RESP source and one-shot processing can persist against real tables.

### Phase 2: One-Shot RESP Ingestion
- **What Changes In Real Life**: The dashboard has a testable ingestion path from RESP-style raw payloads into local facts, but it is not yet the always-on production path.
- **Why This Phase Exists Now**: It validates data correctness before worker supervision and route replacement complicate debugging.
- **Architecture Decisions Applied**: D7, D8, D9, D11, D13, D14, D15, D16.
- **Boundary Integrity Check**: Process valid events even with partial ownership; malformed payloads must persist and become `decode_failed`; duplicate event keys must not duplicate facts.
- **Stories Inside This Phase**:
  - Implement RESP source adapter and CLIProxyAPI payload decoder.
  - Implement inbox repository with batch insert and safe row claiming.
  - Implement usage record persistence with event-key conflict handling and cache invalidation.
  - Port ownership resolution from current collector route.
  - Implement cleanup rules for processed/failed inbox rows.
- **Demo Walkthrough**: Run focused tests or local DB proof showing raw inbox insertion, successful processing, decode failure, process retry/discard behavior, and preserved `/api/usage/history` snapshot shape.
- **Unlocks Next**: Resident worker and manual route can call the same orchestrator.

### Phase 3: Embedded Worker and Manual Trigger
- **What Changes In Real Life**: In production, the dashboard service continuously drains usage in the background; the manual trigger route returns quickly and no longer calls legacy `/usage`.
- **Why This Phase Exists Now**: It turns the proven one-shot path into the actual replacement for cron-driven collection.
- **Architecture Decisions Applied**: D1, D2, D3, D6, D8, D10, D11, D12.
- **Boundary Integrity Check**: Dashboard startup must still succeed if RESP probe fails; only the advisory-lock leader drains upstream queue; non-leaders stay standby.
- **Stories Inside This Phase**:
  - Add collector build target and Docker runtime copy path.
  - Update entrypoint/coordinator to start server and worker with signal handling.
  - Add worker loop scheduling, backoff, leadership, heartbeat/status updates.
  - Rewrite `POST /api/usage/collect` as authenticated kick/bounded orchestrator trigger.
  - Close the final P1 review-blocker remediation bundle before Phase 3 can return to independent review.
- **Demo Walkthrough**: Start the app/container, verify `/api/health` remains available, verify collector logs/status under source success and source failure, call manual trigger as admin/bearer and observe fast response.
- **Unlocks Next**: Documentation and installer can safely retire cron as default.

#### Phase 3 review-blocker remediation bundle
- Closed remediation trio:
  - `br-gs1` aligned the physical `collector_state` migration with the already-shipped Phase 3 runtime fields so wake, heartbeat, and worker status writes survive a fresh deploy.
  - `br-hk7` replaced the placeholder collector bootstrap path with the real resident worker stack so the quick trigger contract is backed by actual ingestion behavior.
  - `br-jv2` carried resolved ownership into persisted `usage_records` so the preserved read model remains visible to non-admin users after queue-backed writes.
- Review first reopened with a follow-up bundle that stayed inside approved Phase 3 because it repaired runtime-safety gaps in the promised resident-worker contract without widening scope into Phase 4 docs/install work:
  - `br-lf2` closed the blocking P1 follower wake-spin behavior in the multi-replica worker loop.
  - `br-mn8` closed the non-blocking P2 follow-up for monotonic wake-sequence handling under overlapping triggers.
  - `br-vq4` closed the non-blocking P2 follow-up for real-Postgres proof of advisory leadership exclusivity.
- The latest independent review opened a second follow-up bundle that still belongs to approved Phase 3 because it only repairs coordinator/runtime-proof gaps inside the shipped resident-worker contract:
  - `br-wy1.11` is the current blocking P1 bead to keep the dashboard alive when the collector exits.
  - `br-wy1.12` is the current blocking P1 bead to remove stale child entries during coordinator shutdown.
  - `br-1eo` is a non-blocking P2 follow-up for propagating a live abort signal into in-flight collector operations.
  - `br-kej` is a non-blocking P2 follow-up for proving the default coordinator mode that production entrypoint wiring actually runs.
  - `br-g92` is a non-blocking P2 follow-up for real RESP runtime integration proof at the socket/parser boundary.
  - `br-p2j` is a non-blocking P3 follow-up for safe IPv6 RESP address parsing.
- Current execution/closeout rule: independent Phase 3 review cannot resume until `br-wy1.11` and `br-wy1.12` close. `br-1eo`, `br-kej`, and `br-g92` remain explicit P2 review follow-ups, while `br-p2j` stays visible as the non-blocking P3 tail in the phase record until resolved or consciously accepted.

### Phase 4: Operator Contract and Cron Retirement
- **What Changes In Real Life**: Operators no longer get or follow cron-driven usage collection guidance; docs describe the embedded worker, envs, retention, and manual trigger accurately.
- **Why This Phase Exists Now**: The canonical docs should describe real implementation, not a planned architecture.
- **Architecture Decisions Applied**: D1, D2, D3, D5, D10, D12, D16.
- **Boundary Integrity Check**: No new product/UI scope; only installer defaults and docs change.
- **Stories Inside This Phase**:
  - Stop installing usage collector cron by default and preserve only explicit/manual fallback wording if retained.
  - Update `README.md`, `CONTEXT.md`, `docs/ARCHITECTURE.md`, `docs/ENV.md`, `docs/OPERATIONS.md`, and `docs/FEATURES.md`.
  - Remove `USAGE_QUEUE_INGESTION.md` after durable content is folded into canonical docs.
- **Demo Walkthrough**: Search docs/install for stale cron and legacy `/usage` collector language; verify canonical docs explain how to operate and disable the embedded worker.
- **Unlocks Next**: Feature can enter final review and compounding.

## 6. Phase Order Check
- [x] Phase 1 is obviously first: schema/contracts are required before any source drain or worker lifecycle.
- [x] Dependencies are explicit: one-shot ingestion depends on schema/contracts; worker depends on one-shot orchestration; docs cleanup depends on shipped behavior.
- [x] No phase is a technical bucket only: each phase has an observable operator/developer outcome and demo walkthrough.

## 7. Approval Summary
- Approval status: `APPROVED`
- Approved phase to prepare next: `Phase 4 - Operator Contract and Cron Retirement`
- Approved at: `2026-05-05T13:58:46Z`
- Current phase to prepare next: `Phase 4 - Operator Contract and Cron Retirement`
- Current approved execution-prep bundle inside Phase 4: `br-wy1.14`, `br-wy1.15`, `br-wy1.16`
- Phase 3 runtime review status: complete; its remaining P2/P3 findings are non-blocking review debt and do not block the installer/docs closeout bundle.
- Phase 4 execution-prep status: contract, story map, and beads are now prepared for validating.