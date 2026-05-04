# Verification — br-wpd.5

- Feature: `oauth-config-ui-ux`
- Bead: `br-wpd.5`
- Testing mode: `standard`
- Verified at: `2026-05-04T16:18:06Z`

## Verify Commands

1. `cd dashboard && npm run typecheck`
   - Exit code: `0`
   - Result: passed after the repo's standard `prisma generate` pre-step

2. `cd dashboard && npm run lint`
   - Exit code: `0`
   - Result: passed with existing repo warnings only
   - Notes: ESLint still reports `104` pre-existing warnings outside this bead scope and no lint errors

3. Manual: Open `/dashboard/providers` and confirm a usage-limited OAuth account shows `Limit Reached` in the badge row while the detailed message remains below the stats area without the old accent treatment.
   - Status: `PASSED`
   - Notes: Operator confirmed the usage-limited card renders `Limit Reached` with the detail panel preserved below the stats area

4. Manual: Confirm a custom-proxy OAuth account shows a masked proxy badge, while an account without a per-account `proxy_url` shows no proxy badge.
   - Status: `PASSED`
   - Notes: Operator confirmed the proxy badge only appears for custom per-account overrides and remains masked

5. Manual: Confirm the action row order is `Models` → `Config` → `Download` → `Delete`, and clicking `Config` opens the Phase 1 split modal.
   - Status: `PASSED`
   - Notes: Operator confirmed the action order and the `Config` button handoff into the Phase 1 modal

## Files Touched

- `dashboard/src/components/providers/oauth-credential-list.tsx`
- `dashboard/src/components/providers/oauth-section.tsx`

## Implementation Summary

- Normalized the card scan surface so only `Active`, `Disabled`, and usage-limit `Limit Reached` badges appear in the top row
- Moved non-active detail messaging into a softer non-accent alert surface below the stats area
- Reordered actions to `Models` → `Config` → `Download` → `Delete`, made `Config` icon+text, and wired current-page `maskedProxyFor` fetches so custom proxy badges can render from the bounded server contract
- All status detail panels now render with `danger` tone, while the top badge row still keeps `Limit Reached` reserved for usage-limit cases
