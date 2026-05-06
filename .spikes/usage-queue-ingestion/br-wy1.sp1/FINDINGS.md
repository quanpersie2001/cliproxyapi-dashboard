# Spike Findings — br-wy1.sp1

**Feature:** usage-queue-ingestion  
**Question:** Can the migration add `UsageQueueInbox` and nullable unique `UsageRecord.eventKey` without breaking existing `usage_records` reads/writes?  
**Decision:** YES

## Why this is YES
- The current read model in `dashboard/src/lib/usage/history.ts:1294-1532` groups and aggregates existing `usage_records` fields only; it does not require a fixed column count and does not reference any future queue-ingestion columns.
- The current write path in `dashboard/src/app/api/usage/collect/route.ts:450-548` persists existing `UsageRecord` fields with `createMany` and updates `collector_state`; additive nullable columns do not change that contract.
- The current Prisma model in `dashboard/prisma/schema.prisma:214-257` already isolates `UsageRecord` and `CollectorState`. Adding a new table plus nullable fields is additive as long as the existing `usage_dedup_key` unique remains intact.

## Locked constraints propagated into Phase 1
- Keep `@@unique([authIndex, model, timestamp, source, totalTokens], name: "usage_dedup_key")` unchanged.
- Add `UsageRecord.eventKey` as nullable unique, not required and not backfilled in Phase 1.
- Add only the additive queue-event metadata needed now: `requestId`, `provider`, and `authType`. Reuse the existing `endpoint` column as the queued API-group field instead of adding a parallel `apiGroupKey` column.
- `UsageQueueInbox` must store raw message text and retry/lifecycle state only; row-claim SQL stays out of Phase 1.

## Required execution proof
- Migration SQL review must explicitly prove `usage_dedup_key` remains.
- `cd dashboard && npm run prisma:generate`
- `cd dashboard && npm run typecheck`
- Focused schema contract test for generated `UsageQueueInbox` and nullable `eventKey` surface.
