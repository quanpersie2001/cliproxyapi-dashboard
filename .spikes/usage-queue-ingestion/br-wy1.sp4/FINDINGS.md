# Spike Findings — br-wy1.sp4

**Feature:** usage-queue-ingestion  
**Question:** Can new events populate existing `usage_records` fields so `/api/usage/history` snapshots remain shape-compatible without rewriting aggregation?  
**Decision:** YES

## Why this is YES
- The snapshot builder in `dashboard/src/lib/usage/history.ts:1294-1532` reads from `usage_records` and `collector_state`; it does not care whether the facts came from legacy `/usage` polling or queue ingestion.
- The current collector route already writes the exact fields the snapshot consumes in `dashboard/src/app/api/usage/collect/route.ts:450-548`: `authIndex`, `apiKeyId`, `userId`, `endpoint`, `model`, `source`, `timestamp`, latency, token totals, and `failed`.
- Current `UsageRecord` fields in `dashboard/prisma/schema.prisma:214-246` already line up with the queue payload shape described in discovery. Queue ingestion only needs to continue writing complete facts into this table.

## Locked constraints propagated into later phases
- Preserve `usage_records` as the final analytics table.
- Keep using the existing `endpoint` field for API-group persistence so the snapshot remains compatible.
- Queue processing must still resolve and persist `authIndex`, `source`, user/API-key ownership, token totals, latency, and `failed` exactly as the current read model expects.
- Cache invalidation after successful writes remains required.
- `getUsageHistorySnapshot` is out of scope except for additive compile fixes.

## Required execution proof in Phase 2
- Fixture or focused integration proof that queue-backed rows appear in `/api/usage/history` without shape changes.
- Verification artifact must show cache invalidation and collector-state updates still occur after successful persistence.
