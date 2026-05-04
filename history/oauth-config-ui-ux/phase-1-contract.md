# Phase Contract: Phase 1 - Clear OAuth Settings Editing

**Date**: 2026-05-04
**Feature**: `oauth-config-ui-ux`
**Phase Plan Reference**: `history/oauth-config-ui-ux/phase-plan.md`

## 1. What This Phase Changes
Phase 1 makes the OAuth settings modal easier to use without changing how auth files are loaded or saved. Operators will see a clearer split between editable settings and informational JSON, and they will only edit the narrowed auth-file field set approved in D9 through D13. The data contract behind the modal also becomes stricter, especially for `headers`, so invalid JSON is caught before save.

## 2. Why This Phase Exists Now
- The current modal already sits behind a stable raw-file load and full-file save boundary, so it is the least risky place to deliver immediate UX value.
- Phase 2 card polish depends on the final settings vocabulary and should not proceed while the modal still exposes removed advanced fields.
- Delaying this phase would keep the highest-friction editing surface unchanged even though the underlying flow is already stable.

## 3. Entry State
- `dashboard/src/lib/providers/oauth-auth-file-settings.ts` still models `excluded_models`, `disable_cooling`, and `websockets`.
- `dashboard/src/components/providers/oauth-account-settings-modal.tsx` renders metadata, preview, and editable fields in a long single-column stack.
- `headers` cannot be edited through a dedicated JSON textarea with validation state.
- `dashboard/src/components/providers/oauth-section.tsx` already owns the modal lifecycle, preview copy action, and full-file PATCH save flow.

## 4. Exit State
- The OAuth editor model is narrowed to `prefix`, `proxyUrl`, `priority`, `headers`, and `note`, with validation-aware `headers` editing.
- The modal uses a split information architecture: editable settings on the left, `Auth file info` and `JSON preview` on the right.
- Loading, error, dirty, copy-preview, and save behaviors still work through the existing orchestration path in `dashboard/src/components/providers/oauth-section.tsx`.
- Removed advanced fields are no longer present in the rendered modal surface.

## 5. Unlocks Next
- Phase 2 can treat `Config` as the stable entry point to a finalized settings experience.
- Validating can check card-level polish separately from modal/editor semantics.
- Review/UAT can verify the feature in two clear passes: editing first, scanning second.

## 6. Locked Assumptions vs Open Ambiguities
### Locked Assumptions
- D9: the modal must become a split layout.
- D10: field hierarchy must be visually stronger.
- D11: `Disable cooling`, `WebSockets`, and `Excluded models` are removed from this modal.
- D12: `Custom Headers (headers)` is added.
- D13: `Custom Headers` uses a JSON textarea.
- The existing `/api/providers/oauth/[id]/settings` GET/PATCH boundary remains the only load/save path for this phase.

### Open Ambiguities
- The exact desktop breakpoint where the split layout collapses into a stacked layout.
- The exact visual treatment for section spacing and field header emphasis, as long as the hierarchy is materially stronger.
- Whether `headers` validation copy mirrors the reference phrasing exactly or uses repo-local language with the same behavior.

## 7. Demo Walkthrough
Open `/dashboard/providers`, choose any OAuth account, and open settings. The modal should immediately separate edit controls from informational preview content, with only the approved fields visible on the editable side. Change `prefix`, `proxy_url`, `priority`, `headers`, and `note`, confirm the JSON preview updates, try an invalid `headers` JSON payload to confirm save readiness is blocked, then save and reopen to verify the narrowed surface and persisted JSON remain aligned.

## 8. Story Sequence At A Glance
| Story | What Happens | Why Now | Unlocks Next | Done Looks Like |
|-------|--------------|---------|--------------|-----------------|
| Story 1: Narrow the editor contract | The modal data model and payload builder are reduced to the approved field surface and gain `headers` validation behavior. | The modal layout should not be rebuilt on top of fields that are about to disappear. | Story 2 can render the final field set without compatibility shims. | `br-wpd.1` is ready for execution and the modal consumer no longer depends on removed fields. |
| Story 2: Rebuild the modal hierarchy | The modal is reorganized into a split layout with clearer sections and stronger field emphasis. | It depends on Story 1’s final field contract to avoid rework. | Phase 1 reaches its user-visible exit state. | `br-wpd.2` is ready for execution and the modal matches D9 through D13. |

## 9. Out Of Scope
- Card badge changes (`Active` / `Disabled` / `Limit Reached`).
- Card action order and the explicit `Config` button on cards.
- Any masked proxy-summary contract for the card grid.
- Changes to OAuth connect, import, claim, download, or model-inspection flows.

## 10. Success Contract
### Execution Success
- [ ] `br-wpd.1` and `br-wpd.2` both reach their done criteria.
- [ ] Removed advanced fields stay removed from both editor state and rendered modal surface.
- [ ] Save and preview behavior remain on the existing route/orchestration path.

### Validation Success
- [ ] The Phase 1 demo walkthrough is reproducible end to end.
- [ ] Verification evidence is captured for both beads under `history/oauth-config-ui-ux/verification/`.
- [ ] Typecheck and lint pass for the dashboard workspace after Phase 1 implementation.

### Gate Decision Rule
- Advance only when execution and validation both prove that the narrowed editor contract and the split modal hierarchy work together without restoring removed fields.

## 11. Failure / Pivot Signals
- `headers` validation becomes entangled with preview generation in a way that makes the modal unreliable.
- A hidden consumer still depends on removed fields from `oauth-auth-file-settings.ts`.
- The split layout cannot preserve preview readability at realistic widths without revisiting the chosen information architecture.
