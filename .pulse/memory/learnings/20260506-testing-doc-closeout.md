---
date: 2026-05-06
feature: usage-queue-ingestion
categories: [pattern, decision, failure]
severity: critical
tags: [usage, queue, postgres, testing, docs, operator-contract]
applies_when: implementing or reviewing DB-backed worker wake contracts, Postgres integration suites, or canonical docs that replace a temporary feature brief
scope: [dashboard/src/app/api/usage/collect/route.postgres.test.ts, dashboard/src/usage-collector/__tests__/collector-state-repository.postgres.test.ts, dashboard/vitest.config.ts, install.sh, README.md, docs/ARCHITECTURE.md, docs/ENV.md, docs/OPERATIONS.md, docs/FEATURES.md]
signals: [route and worker are only proven in isolation, Postgres tests share state across runs, generated build output can contain copied tests, canonical docs still describe a superseded runtime contract]
---

# Learning: DB-Backed Wake Contracts Need Route-To-Worker Continuity Proof

**Category:** pattern
**Severity:** standard
**Tags:** [queue, postgres, testing]
**Applicable-when:** An HTTP or manual trigger wakes a background worker by persisting state in a shared database row that the worker later consumes.

## What Happened

Follow-up bead `br-g23` added a non-mocked proof in `dashboard/src/app/api/usage/collect/route.postgres.test.ts` that exercises bearer-auth `POST /api/usage/collect` against real Postgres `collector_state`, then observes a real `UsageCollectorWorkerRunner` consume that wake by updating `lastWakeHandledAt` and `workerId`. Earlier route-only and worker-only tests could each pass without proving that the persisted wake contract still joined up end to end.

## Root Cause / Key Insight

When the route and worker meet only through persisted control-plane state, isolated unit or seam tests are not enough. A changed wake field, sequence update, or repository write path can silently break continuity even when each side still looks correct on its own.

## Recommendation for Future Work

When a route wakes a background worker through shared database state, add at least one real-database continuity test that writes through the route surface and verifies the real runner consumes the persisted signal.

## Propagation Guidance

**Propagation:** bead-local
**Embed-in-bead-when:** A bead adds or changes route-to-worker signaling through `collector_state`, a lease row, or another persisted wake contract.
**Bead hint:** Do not stop at separate route and worker tests. Prove the real persisted wake written by the route is later consumed by the real runner.

---

# Learning: Postgres Integration Suites Must Own Their Schema And Exclude Build Mirrors

**Category:** failure
**Severity:** critical
**Tags:** [postgres, testing, isolation]
**Applicable-when:** A repo runs Postgres-backed integration tests while also emitting compiled output directories such as `dist` or `dist-collector`.

## What Happened

Final review closeout needed extra stabilization before the verification rerun was trustworthy. `history/usage-queue-ingestion/verification/br-yt4.md` shows `dashboard/src/usage-collector/__tests__/collector-state-repository.postgres.test.ts` first failed because required runtime columns were missing in the active schema, which exposed dependence on shared local DB state; the eventual fix made setup hermetic/idempotent. The final stabilization pass then pushed both Postgres suites onto per-run schemas and hardened `dashboard/vitest.config.ts` with `fileParallelism: false` plus excludes for `.next`, `dist`, and `dist-collector`, which the lifecycle summary and epic verification cite as necessary for the final source-of-truth rerun.

## Root Cause / Key Insight

The tests treated shared database state and generated runtime output as harmless ambient context. Once the feature added multiple Postgres suites and a compiled `dist-collector/` tree, reruns could inherit schema residue or discover the wrong files, so review closeout drifted from product verification into environment debugging.

## Recommendation for Future Work

When adding Postgres integration coverage in a repo with generated runtime output, isolate each suite with its own schema/search_path and teardown, serialize DB-sensitive execution where needed, and explicitly exclude build-output directories from Vitest discovery before relying on a full-suite rerun.

## Propagation Guidance

**Propagation:** ratchet
**Embed-in-bead-when:** A bead adds Postgres integration tests, compiled runtime output trees, or new full-suite verification requirements.
**Bead hint:** Give each Postgres suite its own schema and keep Vitest pointed only at source-of-truth tests; otherwise review reruns can fail for environment reasons instead of product regressions.

---

# Learning: Retire Temporary Operator Briefs Only After Canonical Docs Match Shipped Runtime

**Category:** decision
**Severity:** standard
**Tags:** [docs, operator-contract, planning]
**Applicable-when:** A feature uses a temporary design brief or root doc that should be removed after implementation lands.

## What Happened

Phase 4 waited until runtime review was complete, then retired the installer cron path, rewrote canonical docs around the embedded worker/manual trigger/history read model, and removed `USAGE_QUEUE_INGESTION.md` only after `README.md`, `docs/ARCHITECTURE.md`, `docs/ENV.md`, `docs/OPERATIONS.md`, and `docs/FEATURES.md` all carried the durable story (`br-wy1.14`, `br-wy1.15`, `br-wy1.16`). That sequencing let the docs describe shipped behavior instead of speculative design and avoided leaving the removed brief as a second authority.

## Root Cause / Key Insight

Temporary design briefs are useful during exploration, but they become risky once runtime behavior starts moving underneath them. The safe cleanup boundary is: runtime proved, canonical docs aligned, then delete the temporary brief.

## Recommendation for Future Work

When a feature has a temporary brief slated for removal, schedule a dedicated closeout phase after runtime review. First align installer and canonical docs on the shipped contract, then remove the brief, and leave scratch copies alone unless the user explicitly approves cleanup.

## Propagation Guidance

**Propagation:** planner-only
**Embed-in-bead-when:** A planner prepares final docs/install cleanup or removal of a temporary root design brief.
**Bead hint:** Treat docs closeout as a post-runtime step. Canonicalize the shipped operator story first, then delete the temporary brief and sweep references.
