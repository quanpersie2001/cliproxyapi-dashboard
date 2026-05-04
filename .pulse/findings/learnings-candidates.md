# Learnings Candidates

- Feature: `oauth-config-ui-ux`
- Review completed at: `2026-05-04T17:32:29Z`
- Review follow-up beads: `br-kez`, `br-obt`, `br-pp5`

## Institutional Repeat Assessment

- `br-kez` (fail-closed proxy masking) is a **novel institutional finding**. No existing `.pulse/memory` entry currently captures a fail-closed masking invariant for UI-visible proxy strings.
- `br-obt` (untouched headers drift during unrelated full-file saves) is a **partial institutional repeat** of `.pulse/memory/learnings/20260504-oauth-full-file-preservation.md`. That learning covers preserving hidden keys, but not preserving the originally loaded `headers` subtree when the field was never edited.
- `br-pp5` (missing route/UI boundary coverage) is a **repeat in verification discipline** rather than a novel product bug. The code paths are readable and partially verified at lower layers, but the user-facing contracts are still not locked down by focused boundary tests.

## Evidence Classification

- **Verified but unintegrated evidence:** existing verification artifacts such as `history/oauth-config-ui-ux/verification/br-wpd.5.md` and `history/oauth-config-ui-ux/verification/br-wpd.7.md` prove the delivered UI/usage outcomes, but they do not cover malformed proxy userinfo or untouched-headers stability.
- **Missing focused verification evidence:** there is still no dedicated proof for repeated `maskedProxyFor` forwarding at the route boundary or for the invalid-headers early-return save path.

## Compounding Candidates

### 1. Fail-Closed Proxy Masking Contract
- **Why it compounds:** turns credential masking into an explicit invariant that can be reused anywhere the dashboard surfaces proxy URLs.
- **Rough scope:** `dashboard/src/lib/providers/oauth-ops.ts`, `dashboard/src/lib/__tests__/oauth-ops.test.ts`, plus a future shared guidance entry in `.pulse/memory/` if the fix lands.

### 2. Parsed-Form Fidelity Guardrail for Full-File Editors
- **Why it compounds:** extends the existing hidden-key preservation lesson into a broader rule: untouched config subtrees should not be normalized on unrelated saves.
- **Rough scope:** `dashboard/src/lib/providers/oauth-auth-file-settings.ts`, `dashboard/src/lib/__tests__/oauth-auth-file-settings.test.ts`, and a follow-up `.pulse/memory/learnings/` update if the fix lands.

### 3. Route/UI Contract Tests for OAuth Enrichment and Save Rejection
- **Why it compounds:** locks down the user-visible behavior at the route and UI boundaries where lower-level helper tests do not fully protect against regressions.
- **Rough scope:** `dashboard/src/app/api/providers/oauth/route.ts`, `dashboard/src/app/api/providers/oauth/route.test.ts`, `dashboard/src/components/providers/oauth-section.tsx`, and the smallest credible focused test proving invalid-header save rejection.
