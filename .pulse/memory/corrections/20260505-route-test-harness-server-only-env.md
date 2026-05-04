---
date: 2026-05-05
feature: oauth-config-ui-ux
severity: standard
tags: [testing, nextjs, route]
applies_when: adding or updating Next.js route tests that import server-only modules in dashboard/src/app/api/**
scope: [dashboard/src/app/api/providers/oauth/route.test.ts, dashboard/src/lib/env.ts, dashboard/src/lib/logger.ts]
signals: [test fails before assertions, server-only import error, env validation error for DATABASE_URL or JWT_SECRET]
---

# Correction: Bootstrap Route Tests With Server-Only And Env Mocks

**Why this exists:** Route boundary tests can fail before assertions due to server bootstrap coupling, obscuring the actual contract under test.

## Wrong move

Importing route handlers directly in Node test environment without mocking `server-only`, env, and auth middleware dependencies causes bootstrap failures unrelated to behavior under review.

## Correct move

Before importing a route handler in tests, mock `server-only`, `@/lib/env`, `@/lib/logger`, and route guard modules (`@/lib/auth/session`, `@/lib/auth/origin`, `@/lib/auth/rate-limit`) so tests exercise the route contract rather than framework/bootstrap plumbing.

## Evidence

- Feature: `oauth-config-ui-ux`
- Files / commands / artifacts:
  - `dashboard/src/app/api/providers/oauth/route.test.ts`
  - `cd dashboard && npx vitest run src/app/api/providers/oauth/route.test.ts`
  - `history/oauth-config-ui-ux/verification/br-pp5.md`

## Propagation

**Propagation:** correction
**Planner action:** attach this correction in bead `learning_refs` when adding route tests under `dashboard/src/app/api/**` that touch auth or env-coupled modules.
