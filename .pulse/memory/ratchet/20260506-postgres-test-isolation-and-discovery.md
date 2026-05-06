---
date: 2026-05-06
feature: usage-queue-ingestion
severity: critical
tags: [postgres, testing, vitest, isolation]
applies_when: adding or validating Postgres integration tests in a repo that also emits compiled output trees such as dist or dist-collector
scope: [dashboard/vitest.config.ts, dashboard/src/app/api/usage/collect/route.postgres.test.ts, dashboard/src/usage-collector/__tests__/collector-state-repository.postgres.test.ts]
signals: [Postgres tests fail due to leftover schema state, full-suite reruns pick up non-source-of-truth tests, compiled output includes copied runtime files]
---

# Ratchet: Isolate Postgres Suites And Exclude Generated Test Mirrors

**Rule:** When Postgres integration tests coexist with generated runtime output, each suite must run in its own schema/search_path and full-suite discovery must exclude build-output trees.

## Why this became a ratchet

Feature closeout had to spend extra time stabilizing verification because Postgres-backed suites still depended on ambient schema state and the repo now contained compiled `dist-collector/` output. `br-yt4` first exposed schema-shape dependence in `collector-state-repository.postgres.test.ts`, and the final stabilization pass had to move both Postgres suites to per-run schemas while tightening `dashboard/vitest.config.ts` so final reruns executed only source-of-truth tests.

## Required checks

- Give every Postgres integration suite a unique schema/search_path and drop that schema on teardown.
- Bootstrap only the tables or columns the suite needs, using hermetic/idempotent setup where shared migrations are not guaranteed.
- Keep DB-sensitive Vitest runs serialized when shared runner state could collide.
- Exclude `.next`, `dist`, `dist-collector`, and similar generated output directories from Vitest discovery before using full-suite reruns as review proof.

## Evidence

- Feature: `usage-queue-ingestion`
- Files / commands / artifacts:
  - `dashboard/src/usage-collector/__tests__/collector-state-repository.postgres.test.ts`
  - `dashboard/src/app/api/usage/collect/route.postgres.test.ts`
  - `dashboard/vitest.config.ts`
  - `history/usage-queue-ingestion/verification/br-yt4.md`
  - `history/usage-queue-ingestion/verification/br-g23.md`
  - `history/usage-queue-ingestion/verification/epic.md`

## Propagation

**Propagation:** ratchet
**Planner action:** attach this file in bead `learning_refs` when the trigger clearly matches.
**Validator action:** treat this as a must-check when the trigger clearly matches.
