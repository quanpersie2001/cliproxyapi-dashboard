# Phase Contract: Phase 2 - Scan-Ready OAuth Account Cards

**Date**: 2026-05-04
**Feature**: `oauth-config-ui-ux`
**Phase Plan Reference**: `history/oauth-config-ui-ux/phase-plan.md`

## 1. What This Phase Changes
Phase 2 finishes the user-facing OAuth polish on `/dashboard/providers` by making each OAuth card easier to scan and act on. Operators should be able to identify `Active`, `Disabled`, and `Limit Reached` states from the badge row, spot custom per-account proxy overrides through a masked display-only badge, and reach the Phase 1 modal through an explicit `Config` action in the approved action order.

## 2. Why This Phase Exists Now
- Phase 1 already stabilized the settings modal and the meaning of the `Config` affordance, so card polish can now point at a finished editing experience.
- The remaining feature value is primarily scan speed and action clarity on the card grid.
- `br-wpd.6` closed the masked proxy summary question with a bounded server-owned enrichment contract, so execution no longer needs to guess between metadata reuse, browser-side raw-file downloads, or full-list upstream fan-out.

## 3. Entry State
- `dashboard/src/components/providers/oauth-credential-list.tsx` still shows raw error text inside the top-line status badge when an account has an error state.
- The detailed warning panel still uses the current accent treatment the user asked to remove.
- `Download`, `Config`, and `Delete` are still icon-only controls, and the action order does not match D7.
- `dashboard/src/lib/providers/oauth-ops.ts` and `dashboard/src/app/api/providers/oauth/route.ts` do not yet expose any display-ready custom proxy summary field.

## 4. Exit State
- `GET /api/providers/oauth` stays metadata-only by default and supports repeated `maskedProxyFor` query params for at most 12 unique account names, returning `maskedProxyUrl` only for safe custom per-account overrides and omitting the field otherwise.
- The card badge row shows stable semantic states: `Active`, `Disabled`, or `Limit Reached`.
- The lower detail message remains available for non-active problem accounts, but the old accent styling is removed and non-limit errors do not replace the semantic badge label.
- Card actions render in the approved order `Models` → `Config` → `Download` → `Delete`, and `Config` uses icon plus text rather than icon-only treatment.
- A masked proxy badge appears only when the account has a custom per-account proxy override and a safe display summary is available.

## 5. Unlocks Next
- The full feature becomes ready for execution, review, and human UAT as one coherent OAuth polish pass.
- Review can verify the feature in two clear layers: Phase 1 editing semantics and Phase 2 card scanning semantics.
- Release readiness no longer depends on operators learning hidden icon meanings or decoding raw status text in the badge row.

## 6. Locked Assumptions vs Open Ambiguities
### Locked Assumptions
- D1: keep the existing repo vocabulary `OAuth account`, `auth file`, and per-account `proxy_url`.
- D2: proxy badges are limited to custom per-account `proxy_url` overrides only.
- D3: the card state taxonomy is `Active`, `Disabled`, or `Limit Reached`.
- D4: the detailed warning panel stays below the card, but loses the current accent treatment.
- D5: the proxy badge shows the proxy URL itself when present.
- D6: any displayed proxy URL must mask credentials.
- D7: action order is `Models` → `Config` → `Download` → `Delete`.
- D8: `Config` is icon plus text.
- `br-wpd.6`: keep the unscoped list fast and metadata-only; when proxy badge data is needed, use bounded `maskedProxyFor` enrichment limited to 12 unique accounts and return `maskedProxyUrl` only when safe.

### Open Ambiguities
- The exact truncation length and tooltip treatment for long masked proxy badges remain implementation detail, as long as the full unmasked secret never appears.
- The exact message matcher for `Limit Reached` can be refined during execution, but only usage-limit cases may map to that badge and all other provider errors must remain in the lower detail panel.

## 7. Demo Walkthrough
Open `/dashboard/providers` and scan the OAuth card grid without opening any modal. A usage-limited account should read as `Limit Reached` in the badge row and still show its explanatory message below the stats area without the old accent treatment. A custom-proxy account should show a masked proxy badge such as `socks5://***@proxy-us:1080`, while accounts without a per-account `proxy_url` show no proxy badge at all. The action row should read `Models`, `Config`, `Download`, `Delete`, and clicking `Config` should open the Phase 1 split modal.

## 8. Story Sequence At A Glance
| Story | What Happens | Why Now | Unlocks Next | Done Looks Like |
|-------|--------------|---------|--------------|-----------------|
| Story 1: Establish the masked proxy summary contract | The dashboard locks the server-owned source of the optional masked custom proxy display field. | The card UI should not depend on a contract that might leak secrets or create unbounded fetch fan-out. | Story 2 can render proxy badges from a safe additive contract. | `br-wpd.4` is ready and the route returns only bounded `maskedProxyUrl` data or omission. |
| Story 2: Normalize the card scan surface | The card UI adopts the stable state badge, softer detail panel, approved action order, explicit `Config` affordance, and masked proxy badge rendering. | It depends on Story 1 to know which display field the card can trust. | Phase 2 reaches its user-visible exit state. | `br-wpd.5` is ready and the grid visually matches D2 through D8. |

## 9. Out Of Scope
- Any changes to OAuth connect, import, claim, delete semantics, or model-inspection behavior.
- Any broad inherited/global/direct proxy taxonomy for accounts without a custom override.
- Any unconditional full-list proxy enrichment.
- Any further edits to the Phase 1 modal field surface or save semantics.
- Browser-side raw auth-file downloads used only to paint card badges.

## 10. Success Contract
### Execution Success
- [ ] `br-wpd.4` and `br-wpd.5` both reach their done criteria.
- [ ] No client-visible field contains raw proxy credentials or requires browser-side raw auth-file downloads.
- [ ] The list route never enriches the full OAuth inventory by default; proxy summary work stays bounded to requested visible accounts only.
- [ ] The card surface matches D2 through D8 without reopening Phase 1 modal scope.

### Validation Success
- [ ] Verification evidence is captured for both Phase 2 beads under `history/oauth-config-ui-ux/verification/`.
- [ ] Automated checks prove `maskedProxyUrl` never exposes raw credentials and is omitted when no safe custom override exists.
- [ ] Human verification confirms the new action order, explicit `Config` affordance, `Limit Reached` scan behavior, and custom-proxy badge visibility on the card grid.

### Gate Decision Rule
- Advance only when proxy-summary data is proven safe, bounded to requested visible accounts, and consumed without browser-side raw auth-file downloads or invented inherited/global states.

## 11. Failure / Pivot Signals
- Any implementation enriches the full list unconditionally instead of scoping proxy work to bounded requested accounts.
- Any implementation returns raw proxy credentials, raw auth-file content, `null`, or invented inherited/global state instead of omitting `maskedProxyUrl` when unavailable.
- `Limit Reached` normalization cannot distinguish the usage-limit case cleanly enough to keep unrelated errors out of the semantic badge row.
