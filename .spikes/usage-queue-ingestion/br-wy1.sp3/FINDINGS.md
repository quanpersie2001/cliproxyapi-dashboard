# Spike Findings — br-wy1.sp3

**Feature:** usage-queue-ingestion  
**Question:** Can two concurrent processors claim disjoint pending/process_failed inbox rows under PostgreSQL using `FOR UPDATE SKIP LOCKED`?  
**Decision:** YES

## Why this is YES
- The repo targets PostgreSQL 16 and Prisma 7 per planning/discovery, so the database supports `FOR UPDATE SKIP LOCKED`.
- Phase 1 keeps claim SQL out of implementation, which lets Phase 2 use a dedicated raw SQL transaction boundary instead of trying to emulate row-claiming with `findMany` + update.
- The queue model is local and transport-neutral, so the claim logic can operate entirely on `usage_queue_inbox` rows without touching the upstream RESP queue.

## Locked constraints propagated into later phases
- Phase 2 repository code must use a single transaction that claims eligible rows (`pending` and retryable `process_failed`) with `FOR UPDATE SKIP LOCKED` semantics.
- Manual trigger and resident worker paths must share the same claim query so overlap cannot double-process rows.
- The claim query must update attempt/lifecycle state in the same transaction that returns claimed rows.
- Phase 2 validation must include a real local database proof, not only unit mocks.

## Required execution proof in Phase 2
- Real Postgres-backed verification demonstrating two concurrent claimers receive disjoint row sets.
- Explicit retry eligibility and ordering rules recorded in the repository verification artifact.
