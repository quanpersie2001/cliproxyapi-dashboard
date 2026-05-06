# Story Map: Phase 4 - Operator Contract and Cron Retirement

**Date**: 2026-05-06
**Phase Plan**: `history/usage-queue-ingestion/phase-plan.md`
**Phase Contract**: `history/usage-queue-ingestion/phase-4-contract.md`

## 1. Phase Outcome
Phase 4 finishes the feature-facing operator surface. By the end, the bundled installer no longer provisions the old usage-collector cron path, canonical docs describe the embedded resident worker as the steady-state ingestion model, and the temporary root design brief is gone because its durable content now lives in canonical docs.

## 2. Story Sequence
| Story | What Happens | Why Now | Serial / Parallel Safety | Shared-Collision Risk | Done Criteria | Testing Discipline Hint |
|---|---|---|---|---|---|---|
| Story 1: Retire the default cron installer path | Remove the usage collector cron setup from `install.sh` and align nearby installer text so fresh installs stop teaching the old collection model. | The shipped operator contract cannot change while the bundled installer still provisions the legacy path. | Starts first because it defines the default operator behavior the docs should describe, but it can finish in parallel with Story 2 once the replacement wording is clear. | Medium: `install.sh`, `README.md`, and `docs/OPERATIONS.md` can drift if install behavior changes without matching prose. | Fresh installs no longer add a `/api/usage/collect` cron entry, and installer wording no longer frames usage collection as a scheduled host job. | `standard`; use shell syntax check plus grep-based proof of removed cron wording. |
| Story 2: Rewrite the canonical operator docs | Update canonical docs to describe the embedded worker, the fast authenticated trigger route, and the preserved `GET /api/usage/history` read model. | Once install defaults are aligned, the docs can tell one consistent runtime story. | May run alongside Story 1 after the installer direction is locked, but keep one owner for usage-ingestion doc language to avoid mixed semantics. | High: `README.md`, `docs/ARCHITECTURE.md`, `docs/ENV.md`, `docs/OPERATIONS.md`, and `docs/FEATURES.md` all expose user-visible contract language. | Canonical docs no longer describe `/api/usage/collect` as the steady-state collector and instead explain the shipped resident-worker behavior. | `standard`; use targeted text sweeps and one build pass to ensure doc-only edits do not accidentally break nearby code fences or examples. |
| Story 3: Remove the temporary root design brief | Delete `USAGE_QUEUE_INGESTION.md` and sweep references so canonical docs plus feature history remain the only durable surfaces. | The brief should disappear only after Stories 1 and 2 have moved its durable content into the canonical set. | Must run last because it depends on installer/docs alignment being complete first. | Medium: root docs, feature history, and stray references can point at a deleted file if the sweep is incomplete. | `USAGE_QUEUE_INGESTION.md` is gone, references remain coherent, and unrelated scratch copies are left alone. | `standard`; verify file removal and run a reference sweep across canonical docs and feature history. |

## 3. Causal Flow
1. **Installer contract first**: stop fresh installs from recreating the old cron-based behavior.
2. **Canonical docs second**: document the runtime that actually ships after the installer contract is aligned.
3. **Root brief removal last**: delete the temporary design brief only after the durable story is represented canonically.

## 4. Parallelization Guidance
- Story 1 and Story 2 can execute in parallel after both workers agree on the final operator wording, but Story 1 owns install-default behavior and Story 2 owns canonical prose.
- Story 3 is strictly blocked on Stories 1 and 2 because it removes the temporary brief only after canonical coverage is complete.
- Treat root `CONTEXT.md` as a low-risk consistency check only; do not force an edit there unless Story 2 finds a real mismatch.
- Do not touch `USAGE_QUEUE_INGESTION copy.md` unless the user explicitly asks for that cleanup.

## 5. Shared Files and Collision Risks
| File / Area | Risk | Coordination Rule |
|---|---|---|
| `install.sh` | High | Story 1 owns installer behavior; other stories may describe it but should not reopen runtime behavior there. |
| `README.md` and `docs/OPERATIONS.md` | High | Story 1 and Story 2 must keep install/runtime wording aligned; do not let one claim cron removal while the other still teaches cron usage. |
| `docs/ARCHITECTURE.md`, `docs/ENV.md`, `docs/FEATURES.md` | High | Story 2 owns the canonical runtime/API story for usage ingestion and the manual trigger contract. |
| `CONTEXT.md` | Low | Edit only if a real canonical inconsistency remains after the main docs are updated. |
| `USAGE_QUEUE_INGESTION.md` and feature-history references | Medium | Story 3 owns root-brief removal and the reference sweep; earlier stories should not delete the file prematurely. |

## 6. Testing Discipline
- Story 1: run `bash -n install.sh` and capture text proof that the installer no longer advertises or installs a usage collector cron by default.
- Story 2: run targeted `rg` sweeps over `README.md`, `docs/ARCHITECTURE.md`, `docs/ENV.md`, `docs/OPERATIONS.md`, `docs/FEATURES.md`, and `CONTEXT.md` to prove the new operator wording is internally consistent; run one `dashboard` build pass to ensure nearby doc/example edits did not break anything unexpected.
- Story 3: prove `USAGE_QUEUE_INGESTION.md` is removed and that remaining references in canonical docs and `history/usage-queue-ingestion/*` still point readers somewhere sensible.
- This is a docs/install phase, so no UI UAT is required; validation should focus on operator-contract consistency and scope discipline.

## 7. Story-To-Bead Mapping
| Story | Bead | Notes |
|---|---|---|
| Story 1: Retire the default cron installer path | `br-wy1.14` | P1, `standard`; owns `install.sh` cron retirement plus nearby installer-facing wording alignment. |
| Story 2: Rewrite the canonical operator docs | `br-wy1.15` | P1, `standard`; owns README/docs updates for the embedded worker, manual trigger route, and preserved usage-history read path. |
| Story 3: Remove the temporary root design brief | `br-wy1.16` | P1, `standard`; depends on `br-wy1.14` and `br-wy1.15`, owns `USAGE_QUEUE_INGESTION.md` removal and the final reference sweep. |

## 8. Done For Phase 4
- Fresh bundled installs no longer add a usage collector cron by default.
- Canonical docs consistently describe the resident worker as the steady-state ingestion path.
- `POST /api/usage/collect` is documented as a fast authenticated trigger, not the collector itself.
- `COLLECTOR_API_KEY` is documented in the manual-trigger context instead of a cron-only context.
- `GET /api/usage/history` remains the documented durable usage read surface.
- `USAGE_QUEUE_INGESTION.md` is removed only after the durable story is represented canonically.
- No unrelated scratch root copies are deleted.
- Beads are executable with explicit files, verify commands, evidence paths, testing modes, decision refs, and learning refs.