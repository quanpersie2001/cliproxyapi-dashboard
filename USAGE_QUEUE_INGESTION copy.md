<!-- Updated: 2026-05-05 -->
# Usage Queue Ingestion Implementation

Canonical docs hub: [docs/README.md](README.md)

## Goal

Embed the CPA-style usage queue collector inside the existing `dashboard` service so the project:

- stops depending on the removed CLIProxyAPI `/usage` endpoint
- does not require a separate `cpa-usage-keeper` container
- keeps the current `/dashboard/usage` UI backed by local PostgreSQL

## Why This Change Is Needed

The current collector is coupled to the legacy management API contract:

- it calls `${CLIPROXYAPI_MANAGEMENT_URL}/usage`: `dashboard/src/app/api/usage/collect/route.ts:15-18`, `dashboard/src/app/api/usage/collect/route.ts:274-279`
- it expects the old aggregated payload shape under `RawUsageResponse`: `dashboard/src/app/api/usage/collect/route.ts:85-95`
- it also expects the old `auth-files` response shape: `dashboard/src/app/api/usage/collect/route.ts:299-317`

The bundled install currently triggers that route from a host cron every 5 minutes:

- `install.sh:758-779`
- `docs/OPERATIONS.md:135-150`
- `docs/ENV.md:15-18`

That design breaks against current upstream CLIProxyAPI because the old `/usage` route is gone.

At the same time, the dashboard UI itself is already built the right way: it reads usage from local PostgreSQL through `GET /api/usage/history`, not directly from CLIProxyAPI:

- `dashboard/src/lib/usage/history.ts:1201-1437`

So the real gap is only the ingestion layer.

## What CPA Actually Does Today

CPA Usage Keeper no longer depends on the removed `/usage` route as its primary path.

### 1. CLIProxyAPI still emits per-request usage events

CLIProxyAPI registers a queue plugin and publishes one JSON payload per request into an internal usage queue:

- `references/CLIProxyAPI/internal/redisqueue/plugin.go:13-87`

The emitted payload includes:

- `timestamp`
- `latency_ms`
- `source`
- `auth_index`
- `tokens`
- `failed`
- `provider`
- `model`
- `endpoint`
- `auth_type`
- `api_key`
- `request_id`

The equivalent schema on the CPA side is decoded in:

- `references/cpa-usage-keeper/internal/service/redis_usage.go:71-115`

### 2. CPA reads the queue over RESP, not REST

CPA connects to the CLIProxyAPI management port using Redis-compatible RESP commands:

- `AUTH <management-key>`
- `LPOP <queue-key> <batch-size>`

See:

- `references/cpa-usage-keeper/internal/cpa/redis_queue_client.go:36-109`
- `references/cpa-usage-keeper/internal/cpa/endpoints.go:15-20`

### 3. CPA runs a continuous background worker

On startup, CPA probes the queue and resolves `auto` mode to `redis` when available:

- `references/cpa-usage-keeper/internal/app/app.go:178-206`

In `redis` mode it runs a background drain loop, not a coarse 5-minute cron:

- `references/cpa-usage-keeper/internal/app/app.go:198-206`
- `references/cpa-usage-keeper/internal/app/app.go:258-283`

### 4. CPA splits pulling from processing

This is the important reliability pattern to port.

Pull step:

- pop raw queue messages
- store them unchanged into a local inbox table
- do not decode or aggregate during the pull step

Reference:

- `references/cpa-usage-keeper/internal/service/sync.go:211-243`

Process step:

- read local inbox rows in FIFO order
- decode one row at a time
- mark malformed rows as `decode_failed`
- insert valid events into the final event table
- mark retryable persistence problems as `process_failed`

Reference:

- `references/cpa-usage-keeper/internal/service/sync.go:245-367`

### 5. CPA stores normalized events in its own database

Relevant CPA tables:

- final fact table: `UsageEvent` in `references/cpa-usage-keeper/internal/models/models.go:27-44`
- raw inbox table: `RedisUsageInbox` in `references/cpa-usage-keeper/internal/models/models.go:46-60`

## What We Should Port — and What We Should Not

### Port from CPA

We should port these ideas:

1. queue-based ingestion over RESP
2. continuous background drain loop
3. split `pull` and `process` phases
4. raw inbox persistence before decoding
5. canonical event key generation and dedupe
6. retryable processing with explicit inbox statuses
7. periodic cleanup of processed and failed inbox rows

### Do not port from CPA

We do not need to port these parts:

1. `legacy_export` fallback and `/v0/management/usage/export`
2. `snapshot_runs` and raw export archival
3. CPA's separate web UI and API layer
4. SQLite-specific operational pieces
5. a separate Compose service

For this repo, the final source of truth should remain the existing `usage_records` table that already powers `GET /api/usage/history`.

## Recommended Target Architecture for This Repo

```mermaid
flowchart LR
    proxy[CLIProxyAPI runtime]
    queue[Internal usage queue\nRESP AUTH + LPOP]
    worker[Embedded dashboard worker]
    inbox[(usage_queue_inbox)]
    records[(usage_records)]
    history[GET /api/usage/history]
    ui[/dashboard/usage]

    proxy --> queue
    queue --> worker
    worker --> inbox
    worker --> records
    records --> history
    history --> ui
```

### Core decision

Keep one `dashboard` service, but run a long-lived collector worker inside that same container.

This is different from running an extra `cpa-usage-keeper` service, but it is also different from the current cron-driven `POST /api/usage/collect` model.

### Architecture refinement after review

Based on the current upstream contract, the collector should be designed around these additional constraints:

1. CLIProxyAPI cannot be changed right now
2. CLIProxyAPI publishes usage only into its own in-memory queue and exposes that queue over RESP
3. the first durable boundary we control is local PostgreSQL, not Redis or RabbitMQ
4. we still want the dashboard collector internals to stay adaptable if a future CLIProxyAPI release moves to Redis, RabbitMQ, or another broker

Therefore the best architecture for this repo is:

- use the current RESP queue as the source transport only
- persist raw messages into PostgreSQL immediately after pull
- treat `usage_queue_inbox` as the dashboard's durable local queue/spool
- keep the collector workflow generic enough that only the source adapter and decoder need to change if upstream transport changes later

This means we should not add Redis or RabbitMQ as a second queue layer right now. Doing so would only create an extra hop:

- CLIProxyAPI in-memory queue
- dashboard puller
- Redis/RabbitMQ relay
- dashboard consumer

That extra hop does not solve the real durability problem, because the volatile source queue remains unchanged. The shortest safe path is still:

- RESP queue
- PostgreSQL inbox
- local processing

## Why the Existing 5-Minute Cron Is Not Enough

CLIProxyAPI queue retention is intentionally short. The upstream config example documents `redis-usage-queue-retention-seconds` with default `60` and max `3600`.

That means a host cron every 5 minutes is not reliable as the primary ingestion mechanism:

- if queue retention is 60 seconds, a 5-minute poll will definitely miss events
- even with a larger retention window, restarts or delayed cron execution still create gaps
- CPA avoids this by draining the queue continuously

Therefore:

- `POST /api/usage/collect` should become a manual/administrative sync entrypoint
- the real ingestion path must be a resident background worker

## Current Repo Constraints That Matter

### The UI already expects local facts, not live proxy stats

The current history pipeline is already correct and should be preserved:

- `dashboard/src/lib/usage/history.ts:1201-1437`

That file aggregates from `usage_records` into:

- totals
- model breakdown
- API breakdown
- credential breakdown
- request events
- latency series and summary
- recent rate
- service health
- cost breakdown

The migration should therefore replace only the ingest path, not the read path.

### Production uses Next standalone output

Production build uses standalone mode:

- `dashboard/next.config.ts:33-35`

The runner image copies:

- `.next/standalone`
- `.next/static`
- `src/generated`
- `prisma`
- `entrypoint.sh`

Reference:

- `dashboard/Dockerfile:51-58`

This matters because a new worker cannot be left as an unbundled TypeScript file under `src/` and assumed to exist at runtime. The runtime image will not automatically contain arbitrary source files unless they are explicitly built and copied.

## Data Model Recommendation

### Keep `usage_records` as the final analytics table

Current model:

- `dashboard/prisma/schema.prisma:214-246`

Keep this table as the final fact table used by the UI, but add a stronger canonical identifier.

### Add `eventKey` to `UsageRecord`

Recommended new fields on `UsageRecord`:

- `eventKey String? @unique`
- `provider String?`
- `authType String?`
- `requestId String?`
- `apiGroupKey String?`

Reasoning:

- `eventKey` should become the durable dedupe key, derived from `request_id` when present or CPA-style hash fallback otherwise
- `provider`, `authType`, `requestId`, and `apiGroupKey` are already available in the queue payload and are useful for debugging and future analysis
- current composite dedupe (`authIndex + model + timestamp + source + totalTokens`) is weaker than CPA's event identity and can collide on busy systems

Migration strategy:

1. add nullable columns first
2. write new events with both old and new dedupe logic active
3. backfill `eventKey` for existing rows where possible
4. switch insertion conflict handling to `eventKey`
5. optionally remove the old composite unique constraint later

### Add a raw inbox table

Recommended new Prisma model:

```prisma
model UsageQueueInbox {
  id           String   @id @default(cuid())
  sourceKind   String
  sourceName   String
  messageId    String?
  messageHash  String
  rawMessage   String
  status       String
  attemptCount Int      @default(0)
  lastError    String?
  eventKey     String?
  receivedAt   DateTime
  processedAt  DateTime?
  createdAt    DateTime @default(now())
  updatedAt    DateTime @updatedAt

  @@index([status, id])
  @@index([sourceKind, sourceName])
  @@index([messageId])
  @@index([receivedAt])
  @@index([processedAt])
  @@map("usage_queue_inbox")
}
```

Notes:

- keep `rawMessage` as `String`, not `Json`, so malformed payloads can still be persisted and inspected
- do not make `messageHash` unique; exact duplicate payloads can happen, while dedupe belongs at the event layer
- keep the schema transport-agnostic rather than RESP-specific:
  - current RESP queue maps to `sourceKind=resp_queue`, `sourceName=queue`, `messageId=null`
  - a future Redis Streams source could map to `sourceKind=redis_stream`, `sourceName=<stream>`, `messageId=<stream id>`
  - a future RabbitMQ source could map to `sourceKind=rabbitmq`, `sourceName=<queue>`, `messageId=<delivery or app id>`
- `status` values should mirror CPA's semantics:
  - `pending`
  - `processed`
  - `decode_failed`
  - `process_failed`
  - `discarded`

Using a transport-neutral inbox schema now avoids a future migration whose only purpose would be renaming RESP-specific fields.

### Reuse `collector_state`

Current model:

- `dashboard/prisma/schema.prisma:248-256`

We can reuse it, but the semantics should be defined around batch-level collector health rather than per-event updates.

Recommended semantics after migration:

- `lastCollectedAt`: last successful event persistence time into `usage_records`
- `lastStatus`: `idle`, `running`, `success`, `error`, `completed_with_warnings`, `standby`
- `recordsStored`: latest successful inserted-event count for the most recent batch
- `updatedAt`: worker heartbeat, updated once per batch/cycle rather than once per event

Recommended tracked fields if we decide to extend the schema later:

- `lastPulledAt`
- `lastProcessedAt`
- `lastMetadataSyncAt`
- `inboxBacklog`
- `lastErrorAt`
- `leaderInstanceId`

The collector state should be cheap to update. It is a health surface, not a per-event audit log.

## Ownership Resolution Strategy

The current collector already contains useful ownership resolution rules:

- exact API key match
- auth-file lookup by `auth_index`
- fallback by `source`
- fallback by auth index prefix

Reference:

- `dashboard/src/app/api/usage/collect/route.ts:356-465`

Port that logic into a reusable ingestion module and adapt it to the queue payload.

Recommended resolution order for each event:

1. if `api_key` exactly matches `user_api_keys.key`, resolve `apiKeyId` and `userId`
2. if not resolved, use fresh `auth-files` metadata to map `auth_index -> file_name/email`
3. map that auth-file metadata to local `provider_oauth_ownerships` or `users.username`
4. if still unresolved, try `source` against:
   - `users.username`
   - `provider_oauth_ownerships.accountName`
   - `provider_oauth_ownerships.accountEmail`
5. if still unresolved, keep the current `authIndex` prefix fallback for dashboard-issued keys
6. if the user resolves but no local dashboard key resolves, keep `apiKeyId = null` and persist the event anyway

Important behavior:

- ingestion must not drop valid events only because ownership resolution is partial
- unresolved events should still be stored and visible to admins
- non-admin views can continue to rely on `userId`, `source`, and the existing scope rules in `dashboard/src/lib/usage/history.ts:534-588`

## Event Key Strategy

Use the CPA rule directly:

1. if `request_id` is present and non-empty, use it as the canonical event key
2. otherwise hash the normalized tuple:
   - `apiGroupKey`
   - `model`
   - `timestamp`
   - `source`
   - `authIndex`
   - `failed`
   - `inputTokens`
   - `outputTokens`
   - `reasoningTokens`
   - `cachedTokens`
   - `totalTokens`

Reference implementation:

- `references/cpa-usage-keeper/internal/service/flatten.go:62-89`
- `references/cpa-usage-keeper/internal/service/redis_usage.go:86-115`

This is stronger than the current dedupe key and aligns this repo with the upstream-compatible ingestion model.

## Runtime Design Inside the Existing Dashboard Service

### Recommended build and boot shape

Because the app uses Next standalone output, the cleanest implementation is:

1. add a separate collector TypeScript build target
2. emit runnable JavaScript into a dedicated output folder
3. copy that folder into the runtime image
4. start both the Next standalone server and the collector process from `entrypoint.sh`

Recommended file layout:

```text
dashboard/
├── src/usage-collector/
│   ├── contracts.ts
│   ├── runner.ts
│   ├── core/
│   │   ├── orchestrator.ts
│   │   ├── pull-service.ts
│   │   ├── process-service.ts
│   │   ├── ownership-resolver.ts
│   │   ├── event-key.ts
│   │   └── types.ts
│   ├── sources/
│   │   └── resp-queue-source.ts
│   ├── decoders/
│   │   └── cliproxy-v1-decoder.ts
│   ├── repositories/
│   │   ├── inbox-repository.ts
│   │   ├── usage-record-repository.ts
│   │   └── collector-state-repository.ts
│   └── infra/
│       ├── env.ts
│       └── leader-lock.ts
├── tsconfig.collector.json
├── collector-bootstrap.js
├── entrypoint.sh
├── Dockerfile
└── prisma/schema.prisma
```

This layout matters because we want stable interfaces and replaceable implementations:

- `core/*` should not know whether the upstream transport is RESP, Redis Streams, RabbitMQ, or something else
- `sources/*` owns transport-specific pull/ack behavior
- `decoders/*` owns upstream payload-shape differences
- `repositories/*` owns database persistence details
- `runner.ts` and the manual route should call the same orchestrator API

### Why this shape is better than route-driven polling

It avoids:

- pushing high-frequency queue draining through HTTP
- dependence on host cron timing
- event loss during normal operation
- tying collector liveness to user traffic

### Concrete boot approach

Recommended build steps:

- add `npm run build:collector`
- compile `src/usage-collector/**/*` to `dist-collector/`
- copy `dist-collector/` and `collector-bootstrap.js` in `dashboard/Dockerfile`
- update `entrypoint.sh` to start both processes and forward signals cleanly

Suggested responsibility split:

- `server.js`: serves Next UI/API
- `dist-collector/runner.js`: runs queue drain loop
- `collector-bootstrap.js`: optional small coordinator if a single parent process is preferred

### Stable internal interfaces

The collector should be written around stable ports so a future upstream move to Redis or RabbitMQ changes implementation, not workflow.

Recommended interfaces:

1. `UsageMessageSource`
   - `receiveBatch(maxMessages)` returns raw envelopes
   - `acknowledgeStored()` confirms the batch after local inbox persistence
   - `releaseOnStoreFailure(error)` lets future brokers requeue or abandon a leased batch
2. `UsagePayloadDecoder`
   - converts a raw envelope into the collector's normalized event shape
3. `CollectorOrchestrator`
   - exposes `pullOnce()`, `processOnce()`, and `drainNow()` for both background worker and manual admin trigger

For today's RESP queue:

- `receiveBatch()` performs `AUTH + LPOP`
- `acknowledgeStored()` is a no-op because `LPOP` is already destructive
- `releaseOnStoreFailure()` is also a no-op

For a future Redis Streams or RabbitMQ source:

- the same collector workflow can call a different source adapter
- `acknowledgeStored()` can map to `XACK`, broker ack, or an equivalent confirmation step
- the rest of the collector pipeline should remain unchanged

## Collector Loop Design

### Suggested environment variables

Generic collector envs:

- `USAGE_COLLECTOR_ENABLED=true`
- `USAGE_SOURCE_DRIVER=resp_queue`
- `USAGE_SOURCE_BATCH_SIZE=200`
- `USAGE_SOURCE_IDLE_INTERVAL_MS=1000`
- `USAGE_SOURCE_ERROR_BACKOFF_MS=5000`
- `USAGE_PROCESS_BATCH_SIZE=1000`
- `USAGE_METADATA_SYNC_INTERVAL_MS=300000`
- `USAGE_CLEANUP_INTERVAL_MS=86400000`
- `USAGE_MAX_PROCESS_ATTEMPTS=10`

RESP-specific envs for the current implementation:

- `USAGE_RESP_ADDR` optional; default derive from `CLIPROXYAPI_MANAGEMENT_URL` host + `8317`
- `USAGE_RESP_QUEUE=queue`
- `USAGE_RESP_PASSWORD` optional; default use `MANAGEMENT_API_KEY`

Existing envs to keep using:

- `CLIPROXYAPI_MANAGEMENT_URL`
- `MANAGEMENT_API_KEY`
- `DATABASE_URL`

Future driver-specific namespaces can be added without changing collector interfaces:

- `USAGE_REDIS_*`
- `USAGE_RABBITMQ_*`

Upstream CLIProxyAPI config recommendation:

- raise `redis-usage-queue-retention-seconds` above the current default to provide restart cushion; `300` or `600` is a safer operational baseline than `60`

### Loop behavior

Recommended runtime model:

1. probe the source transport on startup
2. acquire a PostgreSQL advisory lock so that only one active collector drains the upstream queue
3. run three independent loops:
   - pull loop
   - process loop
   - metadata/cleanup loop
4. if the source probe fails, log a hard error and keep retrying with backoff
5. update `collector_state` once per batch/cycle, not once per event

Recommended scheduling behavior:

- the pull loop should pull again immediately after a non-empty batch, because a full batch probably means backlog still exists
- the pull loop should sleep only when the source returns no messages or when transport errors occur
- the process loop should process again immediately after a full claimed batch, because a full batch probably means backlog still exists locally
- the process loop should sleep only when no local inbox rows are ready
- the metadata/cleanup loop should run on slower fixed intervals and never sit in the hot path of per-event processing

### Pull phase

Responsibilities:

- call the active `UsageMessageSource`
- in today's adapter, open RESP connection, send `AUTH`, and send `LPOP queue batchSize`
- persist every returned raw message into `usage_queue_inbox` in bulk
- call `acknowledgeStored()` only after the local inbox insert commits successfully
- call `releaseOnStoreFailure()` only if the source adapter supports lease/requeue semantics in the future
- do not decode inside the network phase

This should mirror CPA's separation of concerns while also preparing the collector for a future source transport that has explicit ack behavior.

### Process phase

Responsibilities per inbox batch:

1. claim a local inbox batch from `pending/process_failed` rows using `FOR UPDATE SKIP LOCKED`
2. decode each raw message with the active payload decoder
3. if decode fails, mark the row `decode_failed`
4. normalize tokens and timestamp
5. compute `apiGroupKey`
6. compute `eventKey`
7. resolve `userId` and `apiKeyId`
8. bulk insert or upsert into `usage_records` with conflict protection on `eventKey`
9. bulk mark successfully handled inbox rows as `processed`
10. if the DB write fails transiently, bulk mark the affected rows `process_failed` and increment `attemptCount`
11. after repeated transient failures, optionally mark the row `discarded`

Implementation note:

- avoid per-row ORM writes in the hot path
- prefer batch SQL or `createMany`-style operations for inbox insert, inbox claim, fact insert, and inbox status updates
- the collector must optimize for "one batch -> a few SQL statements", not "one event -> many SQL statements"

### Concurrency and leadership rules

The collector should assume that multi-replica dashboard deployments are possible, even if production starts with one container.

Recommended rules:

1. acquire a PostgreSQL advisory lock before starting the active collector loops
2. if the lock cannot be acquired, keep the worker in `standby` state and do not drain the upstream queue
3. within the processor, claim inbox rows with `FOR UPDATE SKIP LOCKED` so manual `drainNow()` calls and background loops cannot double-process the same rows
4. store enough collector state to surface whether an instance is active or standby

This gives us a clean upgrade path from single-container operation to multi-replica deployments without changing collector interfaces or data flow.

## Recommended Changes to Existing Files

### `dashboard/src/app/api/usage/collect/route.ts`

Current file:

- `dashboard/src/app/api/usage/collect/route.ts:218-591`

After migration, this route should stop calling `/usage` entirely.

Recommended new meaning:

- admin/manual trigger only
- optionally keep bearer auth for host automation, but it is no longer the primary path
- call the shared `CollectorOrchestrator.drainNow()` entrypoint that:
  - pulls one source batch
  - processes current inbox backlog
  - refreshes metadata once
- return collector metrics from the local run

The route should become a thin wrapper around the same orchestrator used by the background worker.

### `dashboard/src/lib/usage/history.ts`

Keep the read model intact.

Needed changes should be minimal:

- prefer `eventKey`-backed facts once the new column exists
- keep `collectorStatus` behavior unchanged
- keep current endpoint compatibility fallback only until all new writes include `endpoint`

### `dashboard/src/lib/env.ts`

Current validation does not know about collector-specific queue settings:

- `dashboard/src/lib/env.ts:19-68`

Add the new environment variables and defaults there.

Prefer a driver-based config shape instead of hard-coding RESP throughout the collector:

- generic vars: `USAGE_COLLECTOR_ENABLED`, `USAGE_SOURCE_DRIVER`, `USAGE_SOURCE_BATCH_SIZE`, `USAGE_PROCESS_BATCH_SIZE`
- current RESP vars: `USAGE_RESP_ADDR`, `USAGE_RESP_QUEUE`, `USAGE_RESP_PASSWORD`
- reserve future namespaces such as `USAGE_REDIS_*` and `USAGE_RABBITMQ_*`

That keeps the env contract aligned with the adapter-based collector layout.

### `dashboard/Dockerfile`

Current runner copies only standalone app assets and entrypoint:

- `dashboard/Dockerfile:51-58`

Update it to also copy the compiled collector output.

### `dashboard/entrypoint.sh`

Current behavior is:

- migrate Prisma
- `exec node server.js`

Reference:

- `dashboard/entrypoint.sh:11-16`

Update it so the container starts:

- Next standalone server
- embedded collector worker

with proper shutdown handling.

### `install.sh`

Current installer always sets up a host cron for `POST /api/usage/collect`:

- `install.sh:758-779`

After the background worker exists:

- stop installing that cron by default
- keep a manual install path only if an operator explicitly wants external triggering as a fallback

## Failure Handling and Cleanup Rules

### Inbox statuses

Use these exact statuses:

- `pending`
- `processed`
- `decode_failed`
- `process_failed`
- `discarded`

### Retry rules

- `pending` and `process_failed` are processable
- `decode_failed` is terminal unless manually replayed
- repeated `process_failed` rows should increment `attemptCount`
- optional safety valve: after N failed attempts, mark `discarded`

### Cleanup rules

Recommended retention:

- `processed`: keep until the next local day boundary, then delete
- `decode_failed`, `process_failed`, `discarded`: keep for 7 days for debugging

This matches CPA's operational intent:

- `references/cpa-usage-keeper/internal/repository/redis_usage_inbox.go:114-136`

## Implementation Phases

### Phase 1 — Schema and stable contracts

1. add transport-neutral `UsageQueueInbox`
2. add `eventKey` and optional metadata columns to `UsageRecord`
3. generate Prisma client
4. add shared collector types plus `UsageMessageSource`, `UsagePayloadDecoder`, and `CollectorOrchestrator` interfaces

### Phase 2 — RESP adapter and one-shot orchestration

1. implement the RESP source adapter based on CPA's queue client behavior
2. implement the first CLIProxyAPI payload decoder
3. port event decode and event-key logic
4. port ownership resolution from the existing collector route
5. implement `drainNow()` on the shared orchestrator

### Phase 3 — Local inbox processor

1. implement inbox claim/process logic with `FOR UPDATE SKIP LOCKED`
2. implement batch persistence into `usage_records`
3. implement inbox status transitions and retry/discard rules
4. update `collector_state` on a per-batch basis

### Phase 4 — Replace the old route logic

1. rewrite `POST /api/usage/collect` to use the shared orchestrator
2. remove all `/usage` response parsing code
3. keep UI refresh behavior unchanged

### Phase 5 — Background worker in the same container

1. compile collector runtime separately
2. copy it into the Docker runner image
3. add advisory-lock leadership control
4. update `entrypoint.sh` to launch both server and worker
5. update health/observability logs around collector heartbeat

### Phase 6 — Installer and docs cleanup

1. stop installing the 5-minute collector cron by default
2. document the new env vars
3. document CLIProxyAPI retention guidance
4. update architecture and operations docs

## Validation Checklist

### Functional

- usage events appear in `usage_records` without calling `/usage`
- `/dashboard/usage` still renders all existing charts
- admin refresh still works through `POST /api/usage/collect`
- duplicate queue events do not create duplicate rows
- malformed queue payloads land in `usage_queue_inbox` as `decode_failed`
- valid events are still stored when ownership resolution is partial

### Operational

- collector resumes after container restart
- queue drain survives temporary CLIProxyAPI outages
- collector updates `collector_state` regularly
- processed inbox rows are cleaned up on schedule
- failed inbox rows remain inspectable long enough for debugging
- only one replica actively drains the upstream queue at a time
- the collector can swap source drivers in code without changing the orchestrator or database contracts

### Performance

- pull path performs bulk inbox insert rather than per-event writes
- process path persists facts and inbox status changes in batches
- a full source batch triggers immediate follow-up pull instead of unnecessary sleep
- a full local process batch triggers immediate follow-up processing instead of unnecessary sleep

### Security

- RESP auth uses the existing `MANAGEMENT_API_KEY`
- no new public HTTP endpoint is required for the steady-state collector path
- manual route auth remains admin session or explicit bearer token only

## Recommended Scope Boundaries

### In scope for the first implementation

- transport-neutral inbox table
- event key migration
- RESP source adapter
- CLIProxyAPI v1 payload decoder
- embedded background worker
- advisory-lock leadership
- route rewrite away from `/usage`
- installer/doc updates

### Explicitly out of scope for the first implementation

- separate `cpa-usage-keeper` deployment
- CPA `legacy_export`
- `snapshot_runs`
- adding Redis or RabbitMQ as an extra relay hop
- a new analytics UI
- broad refactors of `usage_history.ts`

## Final Recommendation

The right move is not to transplant all of CPA Usage Keeper. The right move is to transplant only the upstream-compatible ingestion architecture, while shaping the dashboard collector so future transport changes stay behind adapters.

Implement this repo around these stable rules:

- consume CLIProxyAPI usage from the internal queue over RESP today
- persist raw messages into a transport-neutral local inbox table immediately after pull
- normalize them into `usage_records`
- keep the existing dashboard read model and UI intact
- run the collector continuously inside the same dashboard container
- expose stable collector interfaces so a future move to Redis or RabbitMQ changes source/decoder implementations, not workflow, route, or UI contracts

That gives this repo the CPA reliability model without introducing another service into the stack, while also preserving a clean future upgrade path if the upstream transport contract ever changes.
