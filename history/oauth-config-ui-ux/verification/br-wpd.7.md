# Verification — br-wpd.7

- Feature: `oauth-config-ui-ux`
- Bead: `br-wpd.7`
- Testing mode: `standard`
- Verified at: `2026-05-04T17:05:43Z`

## Verify Commands

1. `cd dashboard && npx vitest run src/lib/__tests__/oauth-ops.test.ts src/lib/__tests__/usage-history.test.ts`
   - Exit code: `0`
   - Result: passed
   - Notes: Locks both the `blank source -> authIndex` regression and the new `auth-files.recent_requests` fallback that powers provider-card counts when usage history has no persisted OAuth traffic yet

2. `cd dashboard && npm run typecheck`
   - Exit code: `0`
   - Result: passed after the repo's standard `prisma generate` pre-step

3. `cd dashboard && npm run lint`
   - Exit code: `0`
   - Result: passed with existing repo warnings only
   - Notes: ESLint still reports `104` pre-existing warnings outside this bead scope and no lint errors

4. Manual: Trigger usage collection after several OAuth requests that end in `The usage limit has been reached`, then open `/dashboard/providers`.
   - Status: `PASS`
   - Notes: Operator accepted the card-level outcome as pass after confirming the affected OAuth card no longer remained stuck at `Success 0 | Failure 0`

5. Manual: Open `/dashboard/usage` for the same window and confirm the credential breakdown for the affected OAuth account matches the card-level `Success` and `Failure` counts.
   - Status: `PASS`
   - Notes: Operator accepted the current runtime behavior as pass for bead scope; when persisted usage history is absent in this local runtime, the provider card now falls back to `auth-files.recent_requests` instead of staying at `0 | 0`

## Files Touched

- `dashboard/src/components/providers/oauth-credential-list.tsx`
- `dashboard/src/lib/providers/management-api.ts`
- `dashboard/src/lib/providers/oauth-ops.ts`
- `dashboard/src/lib/__tests__/oauth-ops.test.ts`
- `dashboard/src/lib/usage/history.ts`
- `dashboard/src/lib/__tests__/usage-history.test.ts`

## Root Cause Summary

- Historical usage rows can be collected with `authIndex` and `userId` resolved correctly while still storing an empty `source`
- The usage snapshot previously resolved OAuth identity only from `source`, so blank-source rows fell through to `Unknown` instead of the owning OAuth account
- `/dashboard/providers` then filtered `credentialBreakdown` to `oauth:*` sources, leaving the card counters stuck at `Success 0 | Failure 0` even when failed usage rows already existed
- In the current local runtime, CLIProxyAPI responds to `auth-files` but not to the collector's `${CLIPROXYAPI_MANAGEMENT_URL}/usage` fetch, so PostgreSQL usage history can legitimately remain empty even while `auth-files.recent_requests` already shows fresh limit-reached failures
- Because the provider card only trusted usage-history totals, accounts with live `recent_requests` activity still rendered `0 | 0` whenever persisted usage rows were absent or still empty for that account

## Implementation Summary

- Added a live `auth-files` lookup to the usage snapshot builder so OAuth identity can fall back from `authIndex` when `source` is blank or otherwise non-resolvable
- Extended credential breakdown grouping to keep `authIndex` available during resolution, allowing historical blank-source rows to merge back into the correct OAuth account totals
- Added a regression test that proves both `credentialBreakdown` and recent request events resolve blank-source OAuth rows back to the correct `oauth:*` identity
- Extended the OAuth account listing contract with `recentSuccessCount` and `recentFailureCount` derived from `auth-files.recent_requests`
- Updated provider-card rendering to prefer persisted usage-history totals when present, but fall back to the live `recent_requests` counters whenever usage history has no traffic for that account yet
- Added list-ops coverage proving the auth-files fallback counters are aggregated and exposed with the account payload
