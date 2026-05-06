---
date: 2026-05-05
feature: usage-queue-ingestion
severity: critical
tags: [usage, queue, concurrency, postgres]
applies_when: implementing or reviewing inbox row-claim logic that depends on PostgreSQL lock semantics such as FOR UPDATE SKIP LOCKED
scope: [dashboard/src/usage-collector/repositories/inbox-repository.ts, dashboard/src/usage-collector/__tests__/inbox-repository.postgres.test.ts]
signals: [claim safety inferred from mocks, concurrent claimers may overlap, attempt metadata updates depend on the claim transaction]
---

# Ratchet: Prove Claim Semantics On Real Postgres

**Rule:** When row-claim correctness depends on PostgreSQL lock behavior, add at least one real-Postgres concurrent proof that asserts disjoint claims and related attempt metadata updates.

## Why this became a ratchet

Phase 2 review had to reopen claim semantics because repository-shape tests and non-database assumptions did not prove that concurrent claimers would actually get disjoint rows under live lock semantics. The final fix required `dashboard/src/usage-collector/__tests__/inbox-repository.postgres.test.ts` to run two claimers concurrently and verify both row separation and attempt metadata updates.

## Required checks

- Run a real Postgres-backed concurrent claim test with at least two claimers in parallel.
- Assert claimed row IDs are disjoint.
- Assert attempt metadata such as `attemptCount` and `lastAttemptAt` updates as part of the claim path.

## Evidence

- Feature: `usage-queue-ingestion`
- Files / commands / artifacts:
  - `dashboard/src/usage-collector/__tests__/inbox-repository.postgres.test.ts`
  - `history/usage-queue-ingestion/verification/br-dy3.md`
  - `cd dashboard && npm test -- src/usage-collector/__tests__/inbox-repository.test.ts src/usage-collector/__tests__/inbox-repository.postgres.test.ts`

## Propagation

**Propagation:** ratchet
**Planner action:** attach this file in bead `learning_refs` when the trigger clearly matches.
**Validator action:** treat this as a must-check when the trigger clearly matches.
