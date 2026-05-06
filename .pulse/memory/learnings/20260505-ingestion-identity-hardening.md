---
date: 2026-05-05
feature: usage-queue-ingestion
categories: [pattern, decision, failure]
severity: critical
tags: [usage, queue, ingestion, identity, durability, concurrency, testing]
applies_when: implementing or reviewing destructive queue ingestion, row-claim concurrency, or event-backed persistence in this repo
scope: [dashboard/src/usage-collector/core, dashboard/src/usage-collector/repositories, dashboard/src/usage-collector/__tests__]
signals: [destructive source pop happens before local durability, claim safety depends on database locking, status updates happen after fact persistence]
---

# Learning: Canonical Identity Paths Must Fail Closed On Invalid Decoder-Derived Inputs

**Category:** failure
**Severity:** standard
**Tags:** [identity, ingestion, resilience]
**Applicable-when:** A collector or ingestion path computes canonical event identity from decoder-derived fields such as timestamps, request IDs, or normalized token counts.

## What Happened

Phase 1 isolated event identity into `dashboard/src/usage-collector/core/event-key.ts`, which was the right shape for reuse, but Gate 4 review found that the fallback tuple canonicalization still calls `new Date(event.timestamp).toISOString()` directly. That means an invalid `Date` reaching the utility from a future decoder or repository path can throw instead of degrading through the collector's controlled failure states. The gap did not block Phase 1 because no runtime queue drain exists yet, but it will matter as soon as Phase 2 wires decoders into processing.

## Root Cause / Key Insight

The implementation assumed that a typed `Date` was equivalent to a valid timestamp. In ingestion code, decoder-derived values should be treated as data-boundary inputs even after type normalization. Identity utilities are on the hot path for dedupe and should fail closed into explicit status handling rather than raising unexpected exceptions.

## Recommendation for Future Work

When canonical identity depends on parsed timestamps or similar decoder-derived fields, guard invalid values explicitly and route them into `decode_failed` or `process_failed` behavior instead of letting the identity helper throw. Add one regression that proves malformed timestamp input does not crash the processing path.

## Propagation Guidance

**Propagation:** bead-local
**Embed-in-bead-when:** A bead adds or edits usage-event decoding, event-key generation, inbox processing, or persistence that consumes normalized event timestamps.
**Bead hint:** Event identity is part of the failure boundary. Fail closed on invalid normalized fields and prove malformed timestamps do not crash processing.

---

# Learning: Additive Dedupe Migrations Need Behavior-Level Proof, Not Only Generated-Surface Proof

**Category:** decision
**Severity:** standard
**Tags:** [schema, dedupe, testing]
**Applicable-when:** A phase adds a new identity key or queue-ingestion schema while keeping a legacy dedupe contract alive during migration.

## What Happened

Phase 1 correctly kept the legacy `usage_dedup_key` while adding nullable unique `UsageRecord.eventKey`, and the focused verification artifacts proved Prisma generation, typecheck, and basic contract visibility. Review still found that the strongest automated proof stayed at the generated-surface layer: `schema-contract.test.ts` checks exported fields and statuses, and `event-key.test.ts` covers the positive fallback path, but no behavior-level proof exercises coexistence between the old and new dedupe boundaries or sensitivity across fallback tuple dimensions.

## Root Cause / Key Insight

Additive migrations are easy to over-credit once generated types and build checks pass. But coexistence between a legacy dedupe contract and a new identity key is a behavior claim, not just a shape claim. If the tests only assert the generated API surface, later persistence work inherits uncertainty about collision edges and dual-key safety.

## Recommendation for Future Work

When keeping both a legacy dedupe contract and a new identity key, add at least one behavior-level verification path that proves coexistence and one negative-sensitivity test that changes a single fallback tuple dimension and expects a different key. Treat exported-field checks as necessary but insufficient.

## Propagation Guidance

**Propagation:** planner-only
**Embed-in-bead-when:** A planner prepares work that changes dedupe contracts, additive migrations, or queue-ingestion identity semantics.
**Bead hint:** Generated-field visibility is not enough. Require at least one behavior-level coexistence proof and one collision-sensitive negative test before review.

---

# Learning: Destructive Pull Boundaries Must Surface Loss Windows Explicitly

**Category:** failure
**Severity:** critical
**Tags:** [durability, queue, reliability]
**Applicable-when:** A source adapter destructively removes upstream messages before the collector can durably store them in a local inbox or spool.

## What Happened

After Phase 2 orchestration landed, review found that `dashboard/src/usage-collector/core/pull-service.ts` could successfully pop RESP messages and then hit inbox persistence failure while still collapsing the outcome into ordinary dropped-count math. Follow-up bead `br-aa0` changed the path to raise an explicit `pull_store_failed` signal with `pulled`, `persisted=0`, and `loss_window_open=true` so operators can see the destructive-loss window immediately.

## Root Cause / Key Insight

The first implementation treated “not persisted” as a generic counting outcome instead of a boundary violation. When the upstream pull is destructive, the first local durable write is the only recovery point; failure there is materially different from decode discard, filtering, or normal drop accounting.

## Recommendation for Future Work

When pulling from a destructive source, fail closed if the first durable local write fails. Emit explicit operator-visible loss-window metadata and never report the event as ordinary dropped work.

## Propagation Guidance

**Propagation:** global-critical
**Embed-in-bead-when:** A bead introduces or changes destructive queue/file/message pulls before the first local durable persistence step.
**Bead hint:** Treat pull-to-durable-store as a loss boundary. If local persistence fails after destructive pull, surface explicit loss-window metadata and stop instead of folding it into drop counters.

---

# Learning: Claim-Semantics Changes Need Real-Database Concurrency Proof

**Category:** pattern
**Severity:** critical
**Tags:** [concurrency, postgres, testing]
**Applicable-when:** Claim or lease semantics rely on PostgreSQL locking behavior such as `FOR UPDATE SKIP LOCKED`, advisory locks, or transaction-coupled attempt metadata.

## What Happened

Phase 2 already had repository-level tests, but review still had to open `br-dy3` and add `dashboard/src/usage-collector/__tests__/inbox-repository.postgres.test.ts` with two concurrent claimers on a real Postgres path. The final proof showed disjoint row IDs plus correct `attemptCount` and `lastAttemptAt` updates, which mock-backed coverage had not guaranteed.

## Root Cause / Key Insight

Locking semantics and row visibility are database behavior, not merely repository-shape behavior. If the proof never leaves mocks or in-memory assumptions, concurrency bugs stay invisible until runtime.

## Recommendation for Future Work

When claim safety depends on database locks or skip-locked semantics, require at least one real-database concurrent proof that asserts disjoint claims and related metadata updates.

## Propagation Guidance

**Propagation:** ratchet
**Embed-in-bead-when:** A bead edits queue/inbox claim SQL, retry claim rules, or concurrency-sensitive repository code.
**Bead hint:** Mock coverage is not enough for claim semantics. Add a real Postgres concurrent-claim proof that asserts disjoint ownership and attempt metadata behavior.

---

# Learning: Persisted Facts And Post-Persist Bookkeeping Need Separate Failure Buckets

**Category:** decision
**Severity:** standard
**Tags:** [persistence, status, reliability]
**Applicable-when:** A processing path writes final business facts and then performs inbox or workflow status bookkeeping in a separate step.

## What Happened

The original one-shot process flow could treat a later `markProcessed` failure as if the underlying persistence had failed, which risked reclassifying already-processed rows. Follow-up bead `br-qhi` split the paths so durable fact persistence success is preserved even if later inbox status updates fail.

## Root Cause / Key Insight

Business-fact durability and workflow bookkeeping do not share the same truth boundary. Once facts are written, later auxiliary status failures should be surfaced as a separate operational problem, not retroactively turned into a data-processing failure.

## Recommendation for Future Work

Keep persistence success separate from post-persist bookkeeping. Preserve already-persisted facts and emit a distinct signal when follow-up mark/update steps fail.

## Propagation Guidance

**Propagation:** bead-local
**Embed-in-bead-when:** A bead changes process-service logic that persists facts before marking inbox or workflow status.
**Bead hint:** Do not let mark/update failures reclassify already-persisted work; treat them as a separate post-persist failure path.
