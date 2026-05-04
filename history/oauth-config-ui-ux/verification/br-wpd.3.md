# Verification — br-wpd.3

- Feature: `oauth-config-ui-ux`
- Bead: `br-wpd.3`
- Testing mode: `tdd-required`
- Verified at: `2026-05-04T13:41:14Z`

## TDD Evidence

1. Red: `cd dashboard && npm run test -- src/lib/__tests__/oauth-auth-file-settings.test.ts`
   - Exit code: `1`
   - Result: failed as expected before the production fix
   - Expected failure signal: the new regression test showed that `buildOAuthAuthFileSettingsPayload()` dropped pre-existing `disable_cooling`, `excluded_models`, and `websocket`/`websockets` fields after editing only `note` or `headers`

2. Green: `cd dashboard && npm run test -- src/lib/__tests__/oauth-auth-file-settings.test.ts`
   - Exit code: `0`
   - Result: passed after preserving hidden advanced keys in the backing JSON normalization path

## Verify Commands

1. `cd dashboard && npm run test -- src/lib/__tests__/oauth-auth-file-settings.test.ts`
   - Exit code: `0`
   - Result: passed with `2` focused regression tests covering `note` edits and `headers` edits

2. `cd dashboard && npm run typecheck`
   - Exit code: `0`
   - Result: passed after the repo's standard `prisma generate` pre-step

3. `cd dashboard && npm run lint`
   - Exit code: `0`
   - Result: passed with existing repo warnings only
   - Notes: ESLint reported `104` warnings in pre-existing files outside this bead scope and no lint errors

## Files Touched

- `dashboard/src/lib/providers/oauth-auth-file-settings.ts`
- `dashboard/src/lib/__tests__/oauth-auth-file-settings.test.ts`

## Implementation Summary

- Kept the OAuth modal surface narrowed while preserving hidden advanced auth-file keys in the backing JSON used for preview, dirty detection, and save payload generation
- Added a focused regression test that proves `note` and `headers` edits no longer strip `excluded_models`, `disable_cooling`, or `websocket`/`websockets`
