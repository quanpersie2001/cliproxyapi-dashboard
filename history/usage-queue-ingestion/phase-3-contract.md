# Phase Contract: Phase 3 - Embedded Worker and Manual Trigger

**Date**: 2026-05-05
**Feature**: usage-queue-ingestion
**Phase Plan Reference**: `history/usage-queue-ingestion/phase-plan.md`

## 1. What This Phase Changes
Phase 3 turns the bounded Phase 2 ingestion core into the real runtime path. The dashboard container starts a resident collector alongside the Next standalone server, the collector continuously reuses the approved one-shot orchestrator, and `POST /api/usage/collect` becomes a fast authenticated wake/kick endpoint instead of performing the legacy synchronous `/usage` scrape inside the request.

After this phase, cron is no longer the primary collection mechanism even though the installer and canonical docs still describe it until Phase 4. The production runtime owns steady-state queue ingestion, while the existing usage UI keeps reading the same `usage_records`-backed snapshot.

## 2. Why This Phase Exists Now
- Phase 2 already proved RESP pull, inbox durability, processing, and read-model compatibility in a bounded path.
- Replacing cron safely now depends on runtime packaging, supervision, wake semantics, and source-failure degradation rather than on new ingestion-core logic.
- The admin usage refresh path already accepts either `200` or `202` from `POST /api/usage/collect`, so the route can become a fast trigger without forcing a UI contract rewrite.
- Locking the worker/runtime contract before doc cleanup prevents Phase 4 from documenting speculative behavior.

## 3. Entry State
- Phase 2 one-shot collector seams exist in `apps/dashboard/src/usage-collector/core/orchestrator.ts` and `apps/dashboard/src/usage-collector/core/one-shot-orchestrator.ts`.
- `apps/dashboard/entrypoint.sh` only runs Prisma migrations and then `exec node server.js`.
- `apps/dashboard/Dockerfile` copies Next standalone output, Prisma assets, and `entrypoint.sh`, but no dedicated collector runtime artifact.
- `apps/dashboard/src/app/api/usage/collect/route.ts` still acquires a lease and synchronously fetches CLIProxyAPI `/usage` plus `/auth-files` inside the request.
- `apps/dashboard/src/features/usage/components/usage-analytics.tsx` treats either `200` or `202` from `POST /api/usage/collect` as a successful refresh trigger.
- `install.sh` still installs a five-minute cron trigger and canonical docs still describe cron-driven collection; that cleanup is deferred to Phase 4.

## 4. Exit State
- A dedicated compiled collector runtime artifact exists in the production image and is started with the Next standalone server under a signal-safe coordinator.
- Dashboard startup still succeeds when RESP is unavailable; worker/source failures enter retry/backoff and update collector health/state without preventing `/api/health` from serving.
- Advisory leadership is enforced before destructive upstream RESP pulls, and any processing overlap continues to rely on the Phase 2 row-claim semantics rather than on process-local assumptions.
- The worker wake path is database-visible instead of process-local only, so a manual trigger can signal the active collector even when HTTP traffic and the current leader land on different replicas.
- `collector_state` becomes the bounded runtime control surface for standby/running/success/error and wake/heartbeat metadata; it must not become a per-event audit log.
- The physical `collector_state` table schema matches every Phase 3 runtime field that wake, heartbeat, backoff, and worker-status writes depend on.
- The production bootstrap launches the real resident worker stack rather than a placeholder collector loop.
- `POST /api/usage/collect` preserves both admin-session-plus-origin auth and bearer `COLLECTOR_API_KEY` auth, returns quickly with `200` or `202`, and no longer performs the legacy synchronous `/usage` fetch.
- Existing `/api/usage/history` and `/dashboard/usage` consumers remain behavior-compatible because they still read `usage_records`, queue-ingested rows preserve resolved ownership when known, and the route is only a refresh trigger.
- No installer cron removal, canonical doc rewrite, or `USAGE_QUEUE_INGESTION.md` deletion lands in this phase.

## 5. Unlocks Next
- Phase 4 can retire the default cron installation and update canonical docs around shipped worker behavior instead of planned behavior.
- Validating and reviewing can focus on operator-facing runtime proof rather than on unfinished packaging or trigger semantics.

## 6. Locked Assumptions vs Phase Boundary
### Locked Assumptions
- D1/D10: the embedded collector is enabled by default and runs inside the existing dashboard container, not as a separate service.
- D2/D3: `POST /api/usage/collect` remains dual-authenticated and becomes a fast wake/kick seam rather than a synchronous full drain.
- D6: no extra Redis/RabbitMQ relay or separate `cpa-usage-keeper` deployment is introduced.
- D7/D8/D9: the Phase 2 one-shot core remains the transport-neutral ingestion core; Phase 3 reuses it rather than rebuilding persistence or read-model behavior in the route.
- D11: advisory leadership protects destructive upstream pull, and inbox-processing safety continues to rely on database-backed claim semantics.
- D12: source outages are worker-health problems with retry/backoff, not app-start blockers.
- The Phase 2 learnings are active guardrails here: fail closed on destructive pull-store loss windows, keep persisted-fact success separate from post-persist bookkeeping failure, and treat claim semantics as a real-Postgres proof obligation whenever the scheduling model changes.

### Phase Boundary
- No installer changes in `install.sh` yet.
- No canonical docs cleanup in `README.md`, `docs/ARCHITECTURE.md`, `docs/ENV.md`, `docs/OPERATIONS.md`, or `docs/FEATURES.md` yet.
- No redesign of `GET /api/usage/history`, `/dashboard/usage`, or the usage analytics UI beyond preserving the existing refresh contract.
- Review-discovered defects inside already-approved Phase 2/3 seams may be repaired in this phase when they block the promised Phase 3 runtime or read-model contract.
- No second deployment unit, no external supervisor, and no new queueing layer.
- No per-event operational audit log; runtime state remains bounded and summary-oriented.

## 7. Demo Walkthrough
A reviewer starts the dashboard runtime with the collector enabled, confirms the app becomes healthy even if the RESP source is temporarily unavailable, then inspects logs or collector state to see standby/backoff behavior. Next, the reviewer calls `POST /api/usage/collect` as either an admin session or bearer client, observes a quick `200`/`202` response, and verifies that the resident worker — not the HTTP request — performs the actual drain before the refreshed usage snapshot shows new rows.

## 8. Story Sequence At A Glance
| Story | What Happens | Why Now | Unlocks Next | Done Looks Like |
|-------|--------------|---------|--------------|-----------------|
| Story 1: Package a runnable collector runtime | Add a dedicated collector build target, runtime entrypoint/coordinator, and Docker copy path so production can execute collector code without relying on source files or dev tooling. | The worker cannot become the real path until the image contains a first-class runnable artifact. | Resident loop and wake semantics can run in the real runtime boundary. | Production image contains the collector runtime, startup launches server plus worker, and shutdown behavior is explicit and testable. |
| Story 2: Add resident worker leadership, wake, and health control | Implement the long-lived worker loop, database-visible wake signaling, advisory leadership before pull, retry/backoff on source failure, and bounded `collector_state` heartbeat/status metadata. | Once the artifact exists, the next risk is operational correctness under source failure and multi-replica topology. | Manual trigger can become a thin wake endpoint instead of an ingestion engine. | Only the leader drains upstream, wake requests are visible across replicas, source outages degrade health instead of startup, and state updates stay summary-level. |
| Story 3: Rewrite the manual trigger route around the wake seam | Preserve auth/origin validation, stop the route from scraping legacy `/usage`, and make it return quickly while still fitting the existing admin refresh contract. | The route should only change after the worker can actually receive and honor the wake request. | Phase 4 can document the shipped operator contract. | Route no longer performs a synchronous full drain, returns `200`/`202` promptly, and admin refresh still succeeds without UI contract churn. |

## 9. Out Of Scope
- Cron retirement in `install.sh`.
- Canonical docs cleanup and root design-file removal.
- New analytics UI or usage-history redesign.
- New transport adapters beyond RESP.
- Separate worker deployment or external queue relay.

## 10. Success Contract
### Execution Success
- [ ] Production/runtime build contains a runnable collector artifact and starts it alongside the server.
- [ ] Worker startup does not block the dashboard when the RESP source is down.
- [ ] Leadership and wake semantics are database-visible and safe for multi-replica topology.
- [ ] `POST /api/usage/collect` becomes a fast trigger and no longer performs the legacy synchronous collector flow.
- [ ] Existing usage refresh behavior remains compatible with `200`/`202` trigger responses.
- [ ] No Phase 4 installer/docs cleanup leaks in early.

### Validation Success
- [ ] Validating confirms the chosen build output and Docker copy path produce runnable collector code in the image.
- [ ] Validating confirms signal handling shuts down both server and worker cleanly.
- [ ] Validating confirms source failure/backoff leaves app startup and health behavior intact.
- [ ] Validating confirms a freshly migrated database includes the `collector_state` columns used by the Phase 3 runtime control surface.
- [ ] Validating confirms the production bootstrap reaches a real worker/orchestrator path rather than a placeholder collector loop.
- [ ] Validating confirms the manual trigger contract is quick and no longer depends on synchronous `/usage` fetch.
- [ ] Validating confirms wake/leadership behavior is replica-safe and does not reopen the Phase 2 row-claim proof gap.
- [ ] Validating confirms queue-ingested rows with resolved ownership remain visible to the same non-admin history readers as the legacy `usage_records` path.

### Gate Decision Rule
- Advance only when the resident runtime path, quick trigger contract, and degraded-startup behavior are all proven without unresolved HIGH-risk ambiguity around packaging, shutdown, leadership, or cross-replica wake semantics.

## 11. Failure / Pivot Signals
- The chosen build/runtime shape still depends on TypeScript source files or dev-only tooling in production.
- Worker startup can crash or block the Next server when the source probe fails.
- Wake signaling only works inside the local process and cannot reach the active collector in a multi-replica deployment.
- Manual trigger changes still perform real ingestion work inside the HTTP request or require UI contract changes outside the approved `200`/`202` envelope.
- Runtime-state updates start behaving like a noisy event log instead of a bounded operator summary.
