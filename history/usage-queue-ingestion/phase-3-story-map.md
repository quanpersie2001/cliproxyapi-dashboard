# Story Map: Phase 3 - Embedded Worker and Manual Trigger

**Date**: 2026-05-05
**Phase Plan**: `history/usage-queue-ingestion/phase-plan.md`
**Phase Contract**: `history/usage-queue-ingestion/phase-3-contract.md`

## 1. Phase Outcome
Phase 3 makes queue ingestion the real runtime behavior. By the end, the dashboard image contains a runnable collector artifact, the container starts a resident worker that reuses the approved Phase 2 one-shot core, `POST /api/usage/collect` becomes a fast authenticated wake/kick endpoint instead of a synchronous legacy collector path, and the final review-blocker remediation bundle closes any remaining runtime or read-model mismatches before review resumes.

## 2. Story Sequence
| Story | What Happens | Why Now | Serial / Parallel Safety | Shared-Collision Risk | Done Criteria | Testing Discipline Hint |
|---|---|---|---|---|---|---|
| Story 1: Package a runnable collector runtime | Add a dedicated collector build target, runtime bootstrap/coordinator, and Docker copy/start path so the production image can execute collector code without depending on the source tree or dev-only tools. | The resident worker cannot be the production path until the image contains a first-class runtime artifact and startup choreography. | Must start first because later worker behavior depends on a real runtime entrypoint and process layout. | High: `apps/dashboard/package.json`, `apps/dashboard/Dockerfile`, `apps/dashboard/entrypoint.sh`, and any new bootstrap files are shared runtime seams. | Image/runtime layout is explicit, startup launches server plus collector, and shutdown semantics are deterministic. | `standard`; require build smoke plus a focused startup/shutdown proof at the coordinator boundary. |
| Story 2: Add worker leadership, wake, and health control | Implement the resident worker loop, advisory leadership before pull, database-visible wake signaling, bounded `collector_state` heartbeat/status metadata, and retry/backoff for source outages. | Once packaging exists, the core runtime risk is whether the worker behaves safely under source failure and multi-replica topology. | Follows Story 1; can expose control/repository seams that Story 3 reuses, but should keep leadership/wake semantics in one ownership zone. | High: scheduling, wake signaling, and status metadata can silently drift into process-local assumptions or noisy audit logging. | Only the leader drains upstream, wake requests are replica-visible, source failures do not block startup, and state updates stay bounded/operator-facing. | `tdd-required`; include focused worker-state tests plus at least one proof that the wake/leadership design does not weaken Phase 2 concurrency guarantees. |
| Story 3: Rewrite the manual trigger route around the wake seam | Replace the legacy synchronous `/usage` collection route body with a quick authenticated wake/kick path that preserves dual auth, origin validation, and the existing `200`/`202` refresh contract. | The route should only change after the worker can actually receive and honor wake requests. | Must follow Story 2 because the route becomes a thin client of the runtime control surface. | High: `apps/dashboard/src/app/api/usage/collect/route.ts` is an auth-sensitive, user-visible operational seam. | Route returns quickly, no longer fetches legacy `/usage`, and admin refresh still works without UI churn. | `tdd-required`; add boundary tests for admin-session auth, bearer auth, quick-return success/accepted behavior, and “no synchronous drain in request” semantics. |
| Story 4: Close review-blocker runtime and read-model gaps | Repair the review-discovered gaps that still block the promised Phase 3 outcome: migrate the `collector_state` control-surface fields, replace the placeholder collector bootstrap with the real worker runtime, and persist resolved ownership into event-backed `usage_records`. | The first Phase 3 execution pass proved the intended seams but review found three blocking mismatches between the approved contract and shipped behavior. Final review cannot resume until these are closed. | Runs after Stories 1-3 establish the intended design. `br-gs1` and `br-hk7` may execute in parallel as runtime repairs; `br-jv2` may execute in parallel as the read-model preservation repair. | High: this bundle touches migration/runtime wiring, worker bootstrap, and user-scoped history visibility across `usage_records`. | A fresh deploy can write/read the runtime control fields, the production bootstrap reaches a real worker path, and queue-ingested rows remain visible to non-admin users when ownership resolves. | `tdd-required`; require migrated-db proof, runtime smoke proving no placeholder worker path, and user-scoped history coverage for resolved ownership persistence. |

## 3. Causal Flow
1. **Runtime artifact first**: create something the production image can actually start and supervise.
2. **Leadership/wake semantics second**: make the resident worker safe before exposing it through the route.
3. **Manual trigger third**: switch the user-visible seam only after the runtime control surface is proven.
4. **Review-blocker closeout last**: repair any contract-breaking runtime or read-model gaps revealed by review before Phase 3 returns to independent review.

## 4. Parallelization Guidance
- Story 1 should remain a single ownership zone because Docker, entrypoint, and build output shape must agree exactly.
- Story 2 owns worker scheduling, wake semantics, and `collector_state` control-surface updates; no other bead should invent competing leadership or wake state.
- Story 3 may reuse Story 2 control seams but must not redefine worker scheduling logic inside the route.
- Story 4 may split into parallel remediation lanes, but keep them narrow: `br-gs1` owns runtime-schema alignment, `br-hk7` owns bootstrap-to-worker integration, and `br-jv2` owns read-model ownership persistence.
- `br-hk7` may prepare bootstrap wiring in parallel, but it cannot claim runtime-smoke closure until `br-gs1` proves a freshly migrated database contains the `collector_state` fields the worker and wake route touch.
- Do not let any Phase 3 bead edit `install.sh`, `README.md`, `docs/ARCHITECTURE.md`, `docs/ENV.md`, `docs/OPERATIONS.md`, `docs/FEATURES.md`, or remove `USAGE_QUEUE_INGESTION.md`; those are Phase 4 collision zones.

## 5. Shared Files and Collision Risks
| File / Area | Risk | Coordination Rule |
|---|---|---|
| `apps/dashboard/package.json`, `apps/dashboard/Dockerfile`, `apps/dashboard/entrypoint.sh` | High | Story 1 owns the runtime packaging shape; later stories may consume it but not redesign it. |
| `apps/dashboard/src/usage-collector/core/orchestrator.ts` and `core/one-shot-orchestrator.ts` | Medium | Preserve the approved one-shot contract; Story 2 may compose it into a worker but should not reopen Phase 2 ingestion semantics without explicit need. |
| `apps/dashboard/src/usage-collector/repositories/*` and any new worker control repository | High | Story 2 owns wake/heartbeat/leadership state; keep DB-visible control logic centralized. |
| `apps/dashboard/src/app/api/usage/collect/route.ts` | High | Story 3 owns the route rewrite and must preserve auth/origin validation plus the `200`/`202` refresh contract. |
| `apps/dashboard/src/usage-collector/repositories/usage-record-repository.ts`, `apps/dashboard/src/usage-collector/core/process-service.ts`, `apps/dashboard/src/lib/__tests__/usage-history.test.ts` | High | Story 4 ownership-persistence repair must preserve the approved `usage_records` read model and non-admin visibility semantics. |
| `apps/dashboard/src/lib/env.ts` | Medium | Story 1 or Story 2 may add runtime envs, but keep validation additive and aligned with the final packaging shape. |
| `install.sh` and canonical docs | Blocked | Phase 3 must not retire cron or rewrite operator docs early. |

## 6. Testing Discipline
- Story 1: prove the runtime artifact exists and startup/shutdown choreography is stable; at minimum run build/typecheck plus a focused coordinator smoke path.
- Story 2: prove source failure/backoff, replica-visible wake requests, and bounded status updates; carry forward the real-Postgres claim-safety expectation when scheduling changes interact with row claims.
- Story 3: add route-boundary tests proving dual auth, quick return, and absence of synchronous legacy drain behavior.
- Story 4: add migrated-database proof for `collector_state`, a runtime smoke proving the collector bootstrap instantiates the real worker stack, and user-scoped history coverage proving resolved ownership survives into persisted queue-backed rows.
- This phase is runtime-heavy rather than UI-heavy, but validating/reviewing should still perform a light operator UAT: hit `POST /api/usage/collect`, confirm a quick response, and refresh `/dashboard/usage` after the worker processes new data.

## 7. Story-To-Bead Mapping
| Story | Bead | Notes |
|---|---|---|
| Story 1: Package a runnable collector runtime | `br-wy1.8` | P0, `standard`; owns the dedicated collector build target, bootstrap/coordinator, image copy path, and startup/shutdown choreography. |
| Story 2: Add worker leadership, wake, and health control | `br-wy1.9` | P0, `tdd-required`; depends on `br-wy1.8`, owns resident loop scheduling, replica-visible wake state, bounded `collector_state` metadata, and source-failure backoff. |
| Story 3: Rewrite the manual trigger route around the wake seam | `br-wy1.10` | P1, `tdd-required`; depends on `br-wy1.9`, owns the route rewrite, auth-preserving quick trigger contract, and route-boundary proofs. |
| Story 4: Close review-blocker runtime and read-model gaps | `br-gs1` | P1, `tdd-required`; runtime-schema alignment bead for `collector_state` migration drift exposed by Phase 3 review. |
| Story 4: Close review-blocker runtime and read-model gaps | `br-hk7` | P1, `tdd-required`; runtime bootstrap repair bead that replaces the placeholder collector path with the real worker stack. |
| Story 4: Close review-blocker runtime and read-model gaps | `br-jv2` | P1, `tdd-required`; read-model preservation bead that persists resolved ownership into queue-backed `usage_records`. |
| Story 4: Close review-blocker runtime and read-model gaps | `br-lf2` | P1, `tdd-required`; closed follower wake-spin blocker after the resident worker wake path went multi-replica. |
| Story 4: Close review-blocker runtime and read-model gaps | `br-mn8` | P2, `standard`; closed monotonic wake-sequence follow-up under overlapping triggers. |
| Story 4: Close review-blocker runtime and read-model gaps | `br-vq4` | P2, `standard`; closed real-Postgres advisory-lock exclusivity proof follow-up. |
| Story 4: Close review-blocker runtime and read-model gaps | `br-wy1.11` | P1, `tdd-required`; current blocking review bead for isolating collector child failure from dashboard server lifetime in the production coordinator. |
| Story 4: Close review-blocker runtime and read-model gaps | `br-wy1.12` | P1, `tdd-required`; current blocking review bead for coordinator shutdown bookkeeping when the first child exits. |
| Story 4: Close review-blocker runtime and read-model gaps | `br-1eo` | P2, `standard`; non-blocking follow-up bead for propagating a live abort signal into in-flight collector operations. |
| Story 4: Close review-blocker runtime and read-model gaps | `br-kej` | P2, `standard`; non-blocking follow-up bead for proving the default coordinator mode production entrypoint wiring actually runs. |
| Story 4: Close review-blocker runtime and read-model gaps | `br-g92` | P2, `standard`; non-blocking follow-up bead for socket-level RESP runtime proof beyond mocked source behavior. |
| Story 4: Close review-blocker runtime and read-model gaps | `br-p2j` | P3, `standard`; non-blocking follow-up bead for safe IPv6 RESP address parsing. |

## 8. Done For Phase 3
- Production/runtime build contains a runnable collector artifact and launches it alongside the Next server.
- Resident worker leadership and wake semantics are safe for multi-replica topology.
- Source outages degrade collector health without blocking dashboard startup.
- `POST /api/usage/collect` is a fast wake/kick seam and no longer performs the legacy synchronous collector flow.
- The `collector_state` migration matches the runtime control-surface fields used by the worker and trigger route.
- The production bootstrap reaches the real worker stack instead of a placeholder collector loop.
- Queue-ingested rows preserve resolved ownership when known, so non-admin history visibility remains compatible with the legacy `usage_records` path.
- No installer/doc cleanup or root design-file removal has been implemented early.
- Beads are executable with explicit files, verify commands, evidence paths, testing modes, decision refs, and carried-forward learning refs.
