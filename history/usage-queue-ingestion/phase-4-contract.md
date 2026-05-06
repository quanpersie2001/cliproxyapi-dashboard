# Phase Contract: Phase 4 - Operator Contract and Cron Retirement

**Date**: 2026-05-06
**Feature**: usage-queue-ingestion
**Phase Plan Reference**: `history/usage-queue-ingestion/phase-plan.md`

## 1. What This Phase Changes
Phase 4 makes the shipped operator contract match the runtime that Phase 3 already proved. The bundled installer stops adding the old usage-collector cron by default, canonical docs describe the resident embedded worker as the steady-state ingestion path, and the temporary root design brief is removed once its durable content lives in canonical docs.

After this phase, operators should learn one consistent model everywhere: the dashboard container runs the collector continuously, `POST /api/usage/collect` is an authenticated fast wake/trigger seam, and `GET /api/usage/history` remains the durable usage read surface.

## 2. Why This Phase Exists Now
- Phase 3 already verified the resident worker, quick trigger route, and preserved read model.
- `install.sh`, `README.md`, `docs/ARCHITECTURE.md`, `docs/ENV.md`, `docs/OPERATIONS.md`, and `docs/FEATURES.md` still teach parts of the old cron-driven collection contract.
- Decision D5 explicitly says `USAGE_QUEUE_INGESTION.md` must not remain the long-term root document after durable content is folded into canonical docs.
- Doing doc/install cleanup only after runtime review prevents the canonical docs from describing speculative behavior.

## 3. Entry State
- Phase 3 review is complete and the next lifecycle handoff currently points to `pulse:compounding` for the finished runtime review cycle.
- `install.sh:758-779` still installs a five-minute cron job that POSTs to `/api/usage/collect`.
- `README.md:158-165` still says the bundled installer optionally configures a usage collector cron.
- `docs/ARCHITECTURE.md:22`, `docs/ARCHITECTURE.md:160-196` still describe a collector centered on `POST /api/usage/collect` and `CollectorState` as serialized route run state.
- `docs/ENV.md:17` still frames `COLLECTOR_API_KEY` as a cron-based collection secret.
- `docs/OPERATIONS.md:133-149` and `docs/OPERATIONS.md:353-356` still describe manual host cron collection and crontab inspection as part of the usage collector story.
- `docs/FEATURES.md:140` still lists `/api/usage/collect` in the usage/quota area without clarifying it is a fast trigger rather than the steady-state collector.
- Root `CONTEXT.md` does not currently contain stale cron wording, so it should only change if Phase 4 finds a genuine canonical consistency gap.
- At phase entry, `USAGE_QUEUE_INGESTION.md` still existed at the repo root as a temporary planning brief.

## 4. Exit State
- A fresh bundled install no longer provisions a default cron entry for `/api/usage/collect`.
- Canonical docs consistently describe the embedded collector worker as the default bundled ingestion path.
- `POST /api/usage/collect` is documented as an authenticated fast wake/trigger seam for admins and bearer automation, not as the steady-state collector.
- `COLLECTOR_API_KEY` is documented as the credential for authenticated manual triggering where needed, not as a cron-only implementation detail.
- `GET /api/usage/history` remains documented as the durable usage read surface, and deprecated `/api/usage` guidance is not revived.
- `USAGE_QUEUE_INGESTION.md` is removed only after canonical docs carry the durable runtime/operator story.
- Any extra root scratch copy such as `USAGE_QUEUE_INGESTION copy.md` remains untouched unless the user explicitly asks to clean it up.

## 5. Unlocks Next
- The whole feature can move from runtime review closeout into final compounding with the shipped operator contract fully aligned.
- Future readers can rely on canonical docs plus `history/usage-queue-ingestion/*` without a duplicate root brief.

## 6. Locked Assumptions vs Phase Boundary
### Locked Assumptions
- D1/D10: the embedded collector remains the default bundled runtime path inside the dashboard container.
- D2/D3: `POST /api/usage/collect` stays dual-authenticated and remains a fast trigger, not a synchronous full drain route.
- D5: the temporary root design brief must be folded into canonical docs and removed.
- D9: `usage_records` and `GET /api/usage/history` remain the durable usage read model.
- D12/D16: docs may describe degraded worker behavior and retention at the operator level, but they must reflect the shipped Phase 3 behavior rather than inventing new runtime semantics.

### Phase Boundary
- No new ingestion runtime logic, schema changes, or route behavior changes belong in this phase.
- No reopening of Phase 2/3 concurrency, worker, or trigger implementation decisions unless documentation reveals a real shipped mismatch that must be reflected accurately.
- Do not delete `USAGE_QUEUE_INGESTION copy.md` or any other unfamiliar scratch artifact without explicit user approval.
- Root `CONTEXT.md` is a consistency-check surface, not a forced-edit target.

## 7. Demo Walkthrough
A reviewer runs a fresh read-through of the installer and canonical docs, confirms that the bundled install no longer promises a usage collector cron, and sees the embedded worker documented as the default collection path. The reviewer then checks that the manual `POST /api/usage/collect` route is described as a fast authenticated wake seam, that `GET /api/usage/history` remains the durable read path, and that the temporary root design brief is gone without leaving broken references behind.

## 8. Story Sequence At A Glance
| Story | What Happens | Why Now | Unlocks Next | Done Looks Like |
|-------|--------------|---------|--------------|-----------------|
| Story 1: Retire the old installer contract | Remove the default usage collector cron from `install.sh` and align nearby installer wording. | Install defaults must stop teaching the pre-Phase-3 operating model. | Canonical docs can describe the runtime without caveats about a default cron path. | Fresh installs no longer add a usage collector cron entry, and installer wording matches the resident-worker model. |
| Story 2: Rewrite canonical operator docs | Update README and docs to describe the embedded worker, fast trigger route, and preserved history read model. | Operators need one accurate story once install defaults match runtime behavior. | The temporary root brief can be deleted safely after its durable content is represented canonically. | Canonical docs no longer frame `/api/usage/collect` as the steady-state collector and instead explain the shipped runtime contract. |
| Story 3: Remove the temporary root brief | Delete `USAGE_QUEUE_INGESTION.md` and perform a reference sweep after canonical docs are complete. | The temporary planning brief should disappear only after the durable story is canonicalized. | Feature closeout can proceed with one operator surface and one historical record. | The root brief is gone, references remain coherent, and unrelated scratch copies stay untouched. |

## 9. Out Of Scope
- Any new runtime, worker, queue, or schema behavior.
- Rewording unrelated product docs outside the usage-ingestion operator surface.
- Cleanup of `USAGE_QUEUE_INGESTION copy.md` or other unfamiliar root scratch files without explicit approval.
- New UI or API behavior changes.

## 10. Success Contract
### Execution Success
- [ ] `install.sh` no longer provisions a default cron path for usage collection.
- [ ] Canonical docs consistently describe the embedded worker as the steady-state collector.
- [ ] Manual trigger and durable usage-history read-path documentation matches shipped Phase 3 behavior.
- [ ] `USAGE_QUEUE_INGESTION.md` is removed only after canonical docs fully cover the durable operator/runtime contract.
- [ ] No unrelated scratch artifacts are deleted without explicit confirmation.

### Validation Success
- [ ] Validating confirms installer text and behavior no longer promise or install a usage collector cron by default.
- [ ] Validating confirms canonical docs align on the same runtime story for worker, trigger, and read model.
- [ ] Validating confirms root-doc removal leaves sensible references in canonical docs and feature history.
- [ ] Validating confirms no implementation files outside the Phase 4 doc/install boundary changed unexpectedly.

### Gate Decision Rule
- Advance only when installer defaults, canonical docs, and root-doc cleanup all tell the same shipped operator story without stale cron language or duplicate authoritative docs.

## 11. Failure / Pivot Signals
- `install.sh` still provisions or advertises the old cron-based collection path.
- Docs disagree on whether `/api/usage/collect` is the collector or only a trigger.
- `COLLECTOR_API_KEY` remains documented only as a cron credential.
- Root-doc removal would strand durable details that have not actually been moved into canonical docs.
- Phase 4 starts expanding into runtime changes instead of staying within install/docs cleanup.
