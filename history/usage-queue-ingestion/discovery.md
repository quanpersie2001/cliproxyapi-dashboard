# Discovery Report: Usage Queue Ingestion

**Date**: 2026-05-05
**Feature**: usage-queue-ingestion
**Discovery output**: `history/usage-queue-ingestion/discovery.md`
**CONTEXT.md reference**: `history/usage-queue-ingestion/CONTEXT.md`

## Institutional Learnings

### Critical Patterns
- `.pulse/memory/critical-patterns.md`: no direct full-file editor risk in this feature, but docs/config cleanup must avoid silently dropping hidden runtime information when folding `USAGE_QUEUE_INGESTION.md` into canonical docs.
- `.pulse/memory/corrections/20260505-fail-closed-masked-url-display.md`: not directly triggered unless implementation adds UI-visible displays for RESP/password-bearing source settings; if it does, ambiguous masking must fail closed.
- `.pulse/memory/learnings/20260504-oauth-full-file-preservation.md`: not directly triggered for collector internals; relevant only if an execution bead edits full backing config documents.

### Domain-Specific Learnings
| File | Module | Key Insight | Severity |
|------|--------|-------------|----------|
| `history/usage-queue-ingestion/CONTEXT.md` | feature decisions | D1-D16 lock the target shape: embedded worker, RESP source adapter, PostgreSQL inbox, preserved read model, and no first-pass extra service or relay queue. | high |
| `USAGE_QUEUE_INGESTION.md` | design brief | Durable content must be merged into canonical docs and the root design file removed after implementation per D5. | medium |
| `references/cpa-usage-keeper/internal/service/sync.go` | CPA reference | CPA's reliable path splits destructive queue pull from local inbox processing; malformed payloads become `decode_failed`, persistence failures become `process_failed`. | high |
| `references/cpa-usage-keeper/internal/service/redis_usage.go` | CPA reference | Queue payloads use `request_id` as event identity when present, otherwise a normalized hash fallback. | high |

## Architecture Snapshot
| Area | Purpose | Key Paths |
|------|---------|-----------|
| Current collector write path | `POST /api/usage/collect` authenticates admin/bearer callers, calls legacy CLIProxyAPI `/usage`, resolves ownership, writes `usage_records`, updates `collector_state`, and invalidates usage caches. | `apps/dashboard/src/app/api/usage/collect/route.ts:218-591` |
| Usage read model | `/dashboard/usage`, `/api/usage/history`, and dashboard overview read from PostgreSQL `usage_records` through `getUsageHistorySnapshot`; this is the contract to preserve. | `apps/dashboard/src/app/api/usage/history/route.ts:11-58`, `apps/dashboard/src/lib/usage/history.ts:1294-1531`, `apps/dashboard/src/server/usage/services/get-usage-history-snapshot.ts:16-35` |
| Data model | Current final fact table is `UsageRecord`; current collector health is `CollectorState`; no inbox table or `eventKey` exists yet. | `apps/dashboard/prisma/schema.prisma:214-257` |
| UI refresh trigger | Admin refresh on `/dashboard/usage` calls `POST /api/usage/collect`, then reloads the history snapshot; the UI does not require synchronous full ingestion if the route returns accepted/success quickly. | `apps/dashboard/src/features/usage/components/usage-analytics.tsx:410-439` |
| Route constants | Usage route literals are centralized; route users should keep using `API_ENDPOINTS.USAGE.COLLECT` and `.HISTORY`. | `apps/dashboard/src/lib/api-endpoints.ts:30-33` |
| Runtime packaging | Production uses Next standalone output and only copies specific runtime artifacts; arbitrary new TypeScript files will not exist in the runner unless compiled/copied. | `apps/dashboard/Dockerfile:51-58`, `apps/dashboard/entrypoint.sh:11-16`, `apps/dashboard/package.json:5-18` |
| Installer/docs cron contract | Current bundled install and operator docs describe a 5-minute host cron calling `POST /api/usage/collect`; that must be retired as default behavior. | `install.sh:758-779`, `docs/OPERATIONS.md:133-150`, `docs/ENV.md:15-18` |
| Upstream event source | CLIProxyAPI emits one JSON payload per request into its internal usage queue with `timestamp`, `latency_ms`, `source`, `auth_index`, `tokens`, `failed`, `provider`, `model`, `endpoint`, `auth_type`, `api_key`, `request_id`. | `references/CLIProxyAPI/internal/redisqueue/plugin.go:19-88` |
| RESP queue adapter reference | CPA opens a Redis-compatible connection, `AUTH`s with the management key, then `LPOP`s the queue with a batch size. | `references/cpa-usage-keeper/internal/cpa/redis_queue_client.go:36-109` |

## Pattern Search
| Implementation | Location | Pattern Used | Reusable? |
|----------------|----------|--------------|-----------|
| Current collector route auth | `apps/dashboard/src/app/api/usage/collect/route.ts:218-248` | Dual bearer `COLLECTOR_API_KEY` or admin session + origin validation. | Yes, preserve wrapper exactly while changing route body. |
| Current ownership resolution | `apps/dashboard/src/app/api/usage/collect/route.ts:356-465` | API-key grouping, auth-file metadata, source/user matching, auth-index prefix fallback. | Yes, port into collector core/repository boundary. |
| Current bulk persistence | `apps/dashboard/src/app/api/usage/collect/route.ts:470-499` | `createMany({ skipDuplicates: true })` in batches and endpoint compatibility fallback. | Partial; keep batch-first discipline but move to `eventKey` conflict protection. |
| Usage cache invalidation | `apps/dashboard/src/app/api/usage/collect/route.ts:548` | Invalidate usage caches after successful writes. | Yes, must be retained after event persistence. |
| CPA split queue processing | `references/cpa-usage-keeper/internal/service/sync.go:212-367` | Pull raw inbox first, then decode/process local rows with status transitions. | Yes, core reliability pattern. |
| CPA event key generation | `references/cpa-usage-keeper/internal/service/redis_usage.go:86-115`, `references/cpa-usage-keeper/internal/service/flatten.go:62-89` | `request_id` or normalized SHA-256 fallback. | Yes, align with D15. |

## GitNexus Findings
- GitNexus is configured, but the `cliproxyapi-dashboard` index is 11 commits behind HEAD; graph results were used only as discovery acceleration and confirmed by direct file reads.
- `api_impact` for `/api/usage/collect` reports LOW route consumer risk with no direct consumers and two affected execution flows. Direct UI code still calls the route through `API_ENDPOINTS.USAGE.COLLECT`, so boundary tests should cover the manual trigger behavior.
- `api_impact` for `/api/usage/history` reports LOW route consumer risk, but `impact` on `getUsageHistorySnapshot` is HIGH: direct callers include `loadUsageHistorySnapshot`, `loadRecentUsageHistorySnapshot`, and `DashboardOverviewPage`; affected flows include `UsagePage`, `GET /api/usage/history`, and `DashboardOverviewPage`. Planning should not rewrite the read model.

## Constraints
- Runtime/toolchain: Next.js 16 standalone output, TypeScript strict, Prisma 7, PostgreSQL 16, Node 20 Alpine runner.
- Build/runtime constraint: add a collector build/copy/boot path; do not assume `src/usage-collector/**` exists in the production image without explicit build output.
- Database constraint: add nullable `eventKey` first and keep `usage_dedup_key` as a safety net per D4.
- Reliability constraint: use PostgreSQL advisory leadership before draining the destructive RESP queue and row-claiming semantics for local inbox processing per D11.
- Product constraint: keep `/dashboard/usage` and `GET /api/usage/history` response behavior intact per D9.
- Security constraint: preserve route auth/origin validation on `POST /api/usage/collect` per D3.
- Documentation constraint: fold root design content into canonical docs and remove `USAGE_QUEUE_INGESTION.md` per D5.

## External / Adjacent Research
| Source | Version/Date | Key Reference |
|--------|--------------|---------------|
| CLIProxyAPI reference | checked into `references/` | Queue payload shape and enqueue behavior in `references/CLIProxyAPI/internal/redisqueue/plugin.go:19-88`. |
| CPA Usage Keeper reference | checked into `references/` | RESP `AUTH` + `LPOP`, split inbox pull/process, event key, and failure statuses. |
| Project docs | 2026-05-05 reads | Current docs still describe cron-driven usage collection and must be revised. |

## Open Questions
- [ ] Which exact collector build target (`tsconfig.collector.json`, bundler-free `tsc`, or small bootstrap coordinator) is safest with Next standalone and path aliases?
- [ ] Which Prisma/PostgreSQL SQL pattern should implementation use for `FOR UPDATE SKIP LOCKED` row claims and event-key conflict handling under Prisma 7?
- [ ] Should `POST /api/usage/collect` kick the resident worker via an in-process signal when available, or simply run a bounded orchestrator `drainNow()` path with the same row-claiming safeguards?
- [ ] Which minimal `collector_state` fields/statuses are enough for active/standby/error health without expanding it into per-event audit logging?

## Summary for Synthesis
**What we have**: a working PostgreSQL-backed usage read model and a route-driven collector coupled to the removed CLIProxyAPI `/usage` endpoint.
**What we need**: a resident embedded collector that drains the upstream RESP queue into a local raw inbox, processes rows into `usage_records`, and keeps the current UI/API read contracts stable.
**Key constraints**:
- Do not rewrite `getUsageHistorySnapshot`; GitNexus marks that symbol HIGH risk.
- Do not make HTTP cron the steady-state ingestion path.
- Do not decode before raw inbox persistence.
- Do not add a separate keeper service or relay broker in the first implementation.
**Institutional warnings**:
- Treat docs/config folding as a preservation task, not a chance to drop operator-relevant details.
- If any secret-bearing source settings become visible in UI later, fail closed on ambiguous masking.
