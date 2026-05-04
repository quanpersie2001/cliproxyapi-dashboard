# Phase Plan: OAuth Config UI/UX Polish

**Date**: 2026-05-04
**Feature**: `oauth-config-ui-ux`
**Based on**:
- `history/oauth-config-ui-ux/CONTEXT.md`
- `history/oauth-config-ui-ux/discovery.md`
- `history/oauth-config-ui-ux/approach.md`

## 1. Feature Summary
On `/dashboard/providers`, operators should be able to scan OAuth account state quickly and edit the small set of auth-file overrides without decoding ambiguous icons or digging through unrelated fields. This feature keeps the current ownership and save boundaries intact, narrows the modal to the auth-file settings users actually need, and upgrades the card surface so custom proxy overrides and limit-reached states are obvious at a glance. The work stays inside current dashboard and management route semantics, with any new list data limited to masked display-only proxy summary information.

## 2. Whole-Feature Architecture Baseline
### Enduring Foundations
- The OAuth settings modal continues to load one raw auth file, project it into one editor model, preview one upload payload, and save one full-file JSON document back through the existing PATCH route.
- The OAuth card grid remains a display surface fed by `/api/providers/oauth`; any new proxy signal is optional, masked, and server-owned.
- Status hierarchy is explicit: the badge row shows stable semantic state, while the lower panel carries detailed warnings when needed.
- This pass changes clarity, hierarchy, and display contract only. It does not add new runtime capabilities or rename existing domain concepts.

### Ownership Boundaries
| Area / Module | Owner | Responsibilities In Scope | Explicitly Out Of Scope |
|---|---|---|---|
| `dashboard/src/lib/providers/oauth-auth-file-settings.ts` | Client editor model | Parse raw auth-file JSON, track editable field state, build preview/save payload | New upstream schema or partial-save protocol |
| `dashboard/src/components/providers/oauth-account-settings-modal.tsx` + `oauth-section.tsx` | Providers product UI | Modal layout, field hierarchy, settings field handlers, save affordances | Connect/import flow redesign |
| `dashboard/src/lib/providers/oauth-ops.ts` + `dashboard/src/app/api/providers/oauth/route.ts` | Dashboard server | OAuth account summary contract, optional masked proxy display enrichment | New management API semantics or inherited/global proxy taxonomy |
| `dashboard/src/components/providers/oauth-credential-list.tsx` | Providers product UI | Card status row, warning panel styling, action order, proxy badge rendering | Provider ownership rules or new destructive actions |

### Interfaces and Contracts
| Interface / Contract | Producer | Consumer | Contract Shape | Stability Expectation |
|---|---|---|---|---|
| OAuth account list | `/api/providers/oauth` | `OAuthSection` -> `OAuthCredentialList` | `accounts[]` with ownership, status, file metadata, and optional display-only proxy summary | Stable, additive only |
| OAuth settings payload | `/api/providers/oauth/[id]/settings` | `OAuthSection` -> `createOAuthAuthFileSettingsEditor` | Raw JSON text on load, full JSON text on save | Stable, unchanged semantics |
| OAuth editor state | `oauth-auth-file-settings.ts` | `OAuthAccountSettingsModal` and `OAuthSection` | Focused fields for `prefix`, `proxyUrl`, `priority`, `headers`, and `note` plus preview/dirty metadata | Stable within this feature |

## 3. Why This Breakdown
- Phase 1 goes first because the modal and editor model already sit behind a contained load/save contract, so users can get a real clarity win without waiting on the higher-risk proxy-summary question.
- Phase 2 stays separate because card-level proxy display depends on a new list-contract decision that should not block the narrower modal surface.
- This split isolates the only HIGH-risk item, masked proxy summary derivation, into a later phase while still delivering a meaningful operator-facing improvement first.

## 4. Phase Overview
| Phase | What Changes In Real Life | Why This Phase Exists Now | Demo Walkthrough | Unlocks Next |
|-------|----------------------------|---------------------------|------------------|--------------|
| Phase 1: Clear OAuth Settings Editing | Opening `Config` shows a split settings modal with strong section hierarchy, only the needed auth-file fields, and a live JSON preview that includes `headers`. | It resolves the biggest editing-friction problem on the existing save path and aligns the field surface with locked decisions D9 through D13. | Open an OAuth account settings modal, edit `prefix`, `proxy_url`, `headers`, and `note`, confirm the preview changes, save, and reopen to verify the narrowed surface persists. | Gives Phase 2 a final settings vocabulary and button label target. |
| Phase 2: Scan-Ready OAuth Account Cards | The account grid shows stable `Active` / `Disabled` / `Limit Reached` states, masked custom proxy badges for custom overrides only, softer detail warnings, and the new `Models` -> `Config` -> `Download` -> `Delete` action order. | It completes the user-visible scanning and affordance work once the proxy-summary contract is validated. | Load the providers grid, identify limit-reached accounts from the badge row, confirm masked proxy badges appear only on custom-proxy accounts, and use the explicit `Config` button from the new action order. | Completes the feature and hands off to validating/reviewing for UAT. |

## 5. Phase Details
### Phase 1: Clear OAuth Settings Editing
- **What Changes In Real Life**: Operators see a tighter modal with editable controls on the left and `Auth file info` plus `JSON preview` on the right. `Custom Headers` becomes a JSON textarea, while `Disable cooling`, `WebSockets`, and `Excluded models` disappear from the editable surface.
- **Why This Phase Exists Now**: The existing save flow is already stable, and the reference auth-files editor provides a concrete pattern to adopt without inventing new semantics.
- **Architecture Decisions Applied**:
  - Keep full-file preview/save in `oauth-auth-file-settings.ts`.
  - Add `headers` validation state to the editor model instead of validating ad hoc in the modal.
  - Keep `oauth-section.tsx` as the single orchestrator for load, dirty, copy, and save.
- **Boundary Integrity Check**: No new API routes are required, and `/api/providers/oauth/[id]/settings` stays the only settings read/write boundary.
- **Stories Inside This Phase**:
  - Realign the editor model to the narrowed field set.
  - Rebuild the modal information architecture around a split layout and stronger field hierarchy.
- **Demo Walkthrough**: From the OAuth card list, open settings for an account, edit the allowed fields, inspect the right-side preview and file info, save, then reopen to confirm the persisted JSON reflects the edited values.
- **Unlocks Next**: Phase 2 can reuse the final `Config` affordance vocabulary and does not need to revisit modal field semantics.

### Phase 2: Scan-Ready OAuth Account Cards
- **What Changes In Real Life**: The card grid becomes easier to scan for problem accounts and custom proxy overrides, while action affordances become explicit and less icon-dependent.
- **Why This Phase Exists Now**: It depends on a validated decision about where masked proxy summary data comes from, and that risk should stay isolated from the modal/editor work.
- **Architecture Decisions Applied**:
  - Keep proxy summary server-owned and masked before it reaches the client.
  - Keep the badge row semantic and the detail panel explanatory.
  - Keep action changes inside the existing card component instead of introducing new navigation flows.
- **Boundary Integrity Check**: Only the additive OAuth list summary contract is in scope. No provider ownership logic or upstream auth-file semantics change.
- **Stories Inside This Phase**:
  - Normalize card status and detail-message presentation.
  - Update action order and explicit config affordance.
  - Add masked custom proxy display once the data-contract choice is validated.
- **Demo Walkthrough**: Visit the OAuth grid, confirm limit-reached accounts surface via badge first, confirm warning panels no longer use the old accent treatment, verify custom proxy accounts show masked proxy badges only, and use the new `Config` button to open Phase 1’s modal.
- **Unlocks Next**: Feature-complete UAT and release readiness for the OAuth polish pass.

## 6. Phase Order Check
- [x] Phase 1 is obviously first
- [x] Dependencies are explicit
- [x] No phase is a technical bucket only

## 7. Approval Summary
- Approval status: `APPROVED`
- Approved phase to prepare next: `Phase 2 - Scan-Ready OAuth Account Cards`
- Approved at: `2026-05-04T14:24:53Z`
- Current phase to prepare next: `Phase 2 - Scan-Ready OAuth Account Cards`
