# Usage Queue Ingestion — Context

**Feature slug:** usage-queue-ingestion
**Date:** 2026-05-05
**Exploring session:** complete
**Scope:** Deep
**Project docs consumed:** `.pulse/project-docs.json` -> `CONTEXT.md`, `README.md`, `docs/ARCHITECTURE.md`, `docs/FEATURES.md`; plus `.pulse/memory/critical-patterns.md`, `.pulse/STATE.md`, `USAGE_QUEUE_INGESTION.md`

---

## Feature Boundary

Deliver an embedded dashboard usage-ingestion pipeline that consumes CLIProxyAPI per-request usage events from the RESP queue into local PostgreSQL and removes the old `/usage` cron-based collector path, while keeping the existing `/dashboard/usage` read model and UI intact.

**Domain type(s):** RUN, CALL, ORGANIZE, READ

---

## Locked Decisions

These are fixed. Planning must implement them exactly. No creative reinterpretation.

### Terminology & Domain Model
- **D1** The resident collector worker is enabled by default after migration.
  *Rationale: the worker replaces the unreliable 5-minute cron as the primary ingestion path; operators can still disable it with `USAGE_COLLECTOR_ENABLED=false`.*

- **D2** `POST /api/usage/collect` becomes a fast manual trigger that kicks or wakes the collector worker and returns quickly; it must not run a full synchronous drain inside the HTTP request.
  *Rationale: the route remains useful for admin refresh and automation, but steady-state ingestion belongs to the background worker.*

- **D3** The manual trigger route keeps both admin-session auth with origin validation and bearer `COLLECTOR_API_KEY` auth.
  *Rationale: dashboard admins can trigger it from the UI, and existing host/internal curl automation can still call it manually even though cron is no longer installed by default.*

- **D4** The first migration adds nullable unique `eventKey` support for `UsageRecord` but keeps the existing composite `usage_dedup_key` constraint as a safety net.
  *Rationale: new queue events use stronger event identity while historical dedupe behavior remains protected during the first migration.*

- **D5** `USAGE_QUEUE_INGESTION.md` is not a long-term root doc. Implementation should fold the durable information into the canonical docs and then remove this design file.
  *Rationale: avoid duplicate docs after the feature ships.*

### Collector Architecture
- **D6** Do not add a separate `cpa-usage-keeper` service or an extra Redis/RabbitMQ relay in the first implementation.
  *Rationale: the volatile upstream CLIProxyAPI queue remains the first source, so the first durable boundary should be PostgreSQL inbox storage in the dashboard service.*

- **D7** The collector workflow is split into pull and process phases. Pull stores raw messages unchanged in a local inbox table before any decoding or aggregation; process reads inbox rows and writes final usage facts.

- **D8** The source/decoder/orchestrator interfaces must be transport-aware at the edges and transport-neutral in the core workflow: RESP is the first source adapter, but core processing should not depend on RESP specifics.

- **D9** The final analytics source of truth remains `usage_records`; the existing `GET /api/usage/history` aggregation and `/dashboard/usage` UI are preserved rather than replaced.

### Runtime and Reliability
- **D10** The collector runs as a long-lived process inside the existing dashboard container, alongside the Next standalone server, with signal handling/shutdown behavior handled by the container entrypoint or coordinator.

- **D11** Multi-replica safety is required even if the bundled deployment starts single-instance: use a PostgreSQL advisory leadership lock before draining the upstream queue, and use row-claiming semantics for inbox processing to avoid double-processing.

- **D12** If the RESP queue probe or pull fails, the dashboard server must stay up and the collector should retry with backoff; source outages are collector health errors, not container-start blockers.

### Data and Failure Semantics
- **D13** Add a transport-neutral `usage_queue_inbox` table with raw string messages and statuses `pending`, `processed`, `decode_failed`, `process_failed`, and `discarded`.

- **D14** Malformed queue payloads are persisted and marked `decode_failed`; valid events are stored even when ownership resolution is partial.

- **D15** Event identity uses CLIProxyAPI `request_id` when present; otherwise use the CPA-style hash fallback over normalized event fields.

- **D16** Cleanup keeps processed inbox rows only briefly and keeps failed/discarded inbox rows for debugging retention, following the design target of processed-until-next-day and failed states for about 7 days.

### Agent's Discretion
- Planning may choose the exact TypeScript build wiring, advisory lock key, SQL batching primitives, and worker wake-up mechanism, provided D1-D16 and the existing runtime constraints are honored.

---

## Specific Ideas & References

- `USAGE_QUEUE_INGESTION.md` is the feature design source for this exploring session; its durable content should be merged into canonical docs before the file is removed.
- CPA reference implementation patterns to port conceptually: RESP `AUTH` + `LPOP`, split inbox pull/process, canonical event keys, decode failure handling, retryable processing, and cleanup.
- Explicitly rejected from first implementation: CPA `legacy_export`, `snapshot_runs`, CPA UI/API layer, SQLite-specific operational pieces, a separate Compose service, and a new analytics UI.

---

## Scenario Checks

- Existing users opening `/dashboard/usage` after migration still read from PostgreSQL through `GET /api/usage/history`; no chart or route contract rewrite is part of the feature.
- A valid queue event with unknown owner still becomes a `usage_records` row with nullable ownership fields, so admins can see unresolved traffic.
- A malformed queue payload is first stored as raw inbox data and then marked `decode_failed`, rather than being dropped during source pull.
- If two dashboard replicas start, only the leader drains CLIProxyAPI's destructive RESP queue; non-leaders remain standby.

---

## Existing Code Context

From the quick codebase scout during exploring. Downstream agents: read these files before planning to avoid reinventing existing patterns.

### Reusable Assets
- `dashboard/src/app/api/usage/collect/route.ts:218-591` — current collector route auth, lease, old `/usage` fetch, auth-file parsing, ownership resolution, createMany persistence, latency backfill, collector state updates, and cache invalidation.
- `dashboard/src/lib/usage/history.ts:1294-1531` — current usage-history aggregation pipeline reading `usage_records`, `collector_state`, ownership metadata, and cache state for `/dashboard/usage`.
- `dashboard/src/app/api/usage/history/route.ts:11-58` — authenticated read route that resolves date/window params and returns the usage snapshot.
- `dashboard/prisma/schema.prisma:214-257` — current `UsageRecord` and `CollectorState` models.
- `dashboard/src/lib/env.ts:20-69` — startup env validation surface that needs collector env additions.
- `dashboard/Dockerfile:51-58` — standalone runner copy list; arbitrary TypeScript source will not exist at runtime unless compiled/copied.
- `dashboard/entrypoint.sh:11-16` — current startup path runs Prisma migrations then `exec node server.js`.
- `dashboard/package.json:5-18` — scripts currently generate Prisma, build Next, typecheck, test, and run the app; there is no collector build target yet.

### Established Patterns
- Usage analytics already read local facts: `GET /api/usage/history` and `dashboard/src/lib/usage/history.ts` are the read path to preserve.
- Current write path uses `prisma.usageRecord.createMany({ skipDuplicates: true })` and `invalidateUsageCaches()` after collection; new persistence should keep cache invalidation semantics.
- State-changing session-authenticated routes validate origin; the manual trigger route must preserve that for admin-session callers.
- Production image uses Next standalone output; new runtime code must be part of the build/copy pipeline.

### Integration Points
- `install.sh:758-779` — currently installs the 5-minute `POST /api/usage/collect` cron; after migration, this must stop being installed by default.
- `docs/OPERATIONS.md:133-150` — documents cron-based usage collection and must be rewritten around the embedded worker plus manual trigger.
- `docs/ENV.md:7-63` — documents generated and validated env vars; collector envs must be added and cron-specific language removed.
- `docs/ARCHITECTURE.md:21-33` and `docs/ARCHITECTURE.md:158-196` — current architecture/data model docs still describe `POST /api/usage/collect` as the collector and need updating.
- `references/CLIProxyAPI/internal/redisqueue/plugin.go:19-88` — upstream per-request usage queue payload shape.
- `references/cpa-usage-keeper/internal/cpa/redis_queue_client.go:36-109` — RESP auth/probe/pop behavior.
- `references/cpa-usage-keeper/internal/service/sync.go:212-367` — CPA split pull/process inbox behavior and status transitions.

---

## Canonical References

**Downstream agents MUST read these before planning or implementing.**

- `USAGE_QUEUE_INGESTION.md` — complete design brief to implement, then fold into canonical docs and remove per D5.
- `CONTEXT.md` — repo-level proxy-only boundary and current source-of-truth map.
- `docs/ARCHITECTURE.md` — current runtime topology, data model overview, and startup notes.
- `docs/FEATURES.md` — current product surface and constraint that new consumers should use usage history, not deprecated usage routes.
- `dashboard/prisma/schema.prisma` — active Prisma data model source of truth.
- `.pulse/memory/critical-patterns.md` — critical planning baseline; current relevant pattern warns to preserve hidden/non-visible persisted data when editing full backing documents.

---

## Project Docs Follow-up

- **Target:** `docs/ARCHITECTURE.md`, `docs/ENV.md`, `docs/OPERATIONS.md`, `README.md`, and root `CONTEXT.md`
  *Why:* these docs currently describe cron-driven usage collection or omit the embedded worker; they need to reflect the new resident collector, env contract, and removal of the root design doc.

---

## Outstanding Questions

### Deferred to Planning
- [ ] Decide the exact worker build target and packaging shape (`tsconfig.collector.json`, compiled output location, optional bootstrap/coordinator) by reading current TypeScript/Next standalone build constraints.
- [ ] Decide the exact SQL/Prisma implementation for batch inbox insert, row claiming, event upsert, and status updates while preserving Prisma 7 compatibility.
- [ ] Decide the exact worker wake-up mechanism for D2 so `POST /api/usage/collect` can kick the resident worker without doing the heavy drain inside the route.
- [ ] Decide how to represent collector standby/running/error heartbeat in `collector_state` without turning it into per-event audit logging.

---

## Deferred Ideas

- Separate `cpa-usage-keeper` deployment — explicitly out of first implementation scope.
- CPA legacy export fallback and snapshot archival — explicitly out of first implementation scope.
- Extra Redis/RabbitMQ relay layer — explicitly out of first implementation scope unless upstream transport changes in a future feature.
- New analytics UI or broad `usage_history.ts` redesign — explicitly out of first implementation scope.
- Removing the old composite `usage_dedup_key` constraint — deferred until after the first eventKey-backed migration proves stable.

---

## Handoff Note

CONTEXT.md is the single source of truth for this feature.

- **planning** reads: locked decisions, code context, canonical refs, deferred-to-planning questions
- **validating** reads: locked decisions to verify plan-checker coverage
- **reviewing** reads: locked decisions for UAT verification

Decision IDs (D1, D2...) are stable. Reference them by ID in all downstream artifacts.
