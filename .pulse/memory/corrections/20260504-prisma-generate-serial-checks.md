---
date: 2026-05-04
feature: oauth-config-ui-ux
severity: standard
tags: [prisma, tooling, verification]
applies_when: running multiple dashboard verification commands that each trigger prisma generate
scope: [dashboard/package.json, dashboard/src/generated/prisma]
signals: [EEXIST during prisma generate, mkdir src/generated/prisma/internal, test and build started in parallel]
---

# Correction: Run Prisma-Generating Verification Commands Sequentially

**Why this exists:** Parallel finishing checks in `dashboard/` can fail with a tooling race that looks unrelated to the feature under review.

## Wrong move

Starting `npm test`, `npm run build`, or `npm run typecheck` in parallel caused both processes to enter `prisma generate` at the same time. In this repo, that can collide on `dashboard/src/generated/prisma/internal` and surface as `EEXIST`, which pollutes review evidence with a false blocker.

## Correct move

Run dashboard verification commands sequentially whenever more than one of them triggers `prisma generate`. If a parallel run already failed with `EEXIST`, rerun the affected commands one by one before treating the result as a product regression.

## Evidence

- Feature: `oauth-config-ui-ux`
- Files / commands / artifacts:
  - `dashboard/package.json`
  - `cd dashboard && npm test`
  - `cd dashboard && npm run build`
  - `history/oauth-config-ui-ux/lifecycle-summary.md`

## Propagation

**Propagation:** correction
**Planner action:** attach this file in bead `learning_refs` when the verify plan includes multiple dashboard commands that transitively run `prisma generate`.
