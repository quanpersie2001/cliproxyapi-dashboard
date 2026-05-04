# Approach: OAuth Config UI/UX Polish

**Date**: 2026-05-04
**Feature**: `oauth-config-ui-ux`
**Based on**:
- `history/oauth-config-ui-ux/discovery.md`
- `history/oauth-config-ui-ux/CONTEXT.md`

## 1. Gap Analysis
| Component | Have | Need | Gap Size |
|---|---|---|---|
| OAuth account card status row | Current card shows `Active`, `Disabled`, or a raw error message in the badge, with the detail warning panel using a left-accent treatment. | Stable semantic status states, `Limit Reached` handling, softer detail panel styling, and optional masked custom proxy badge. | medium |
| OAuth account card actions | `Models` is labeled, but `Download`, `Config`, and `Delete` are icon-only and ordered around the current layout rather than the locked order. | `Models` -> `Config` -> `Download` -> `Delete`, with `Config` rendered as icon plus text. | small |
| OAuth settings editor model | Full-file parse/serialize exists, but it still models `excluded_models`, `disable_cooling`, and `websockets`, and it cannot validate/edit `headers`. | Auth-files-style editor state focused on `prefix`, `proxy_url`, `priority`, `headers`, and `note`, while preserving preview and dirty detection. | medium |
| OAuth settings modal information architecture | Metadata, JSON preview, and editable fields all exist, but they are stacked in one long column with weak section hierarchy. | Split layout with editable controls on the left and `Auth file info` plus `JSON preview` on the right, with clearer section headers and field emphasis. | medium |
| OAuth list server contract | `/api/providers/oauth` returns ownership, status, and file metadata only. No display-ready proxy summary is available. | Optional display-only masked custom proxy summary, produced without exposing raw credentials to the browser. | large |

## 2. Recommended Approach
Keep the current OAuth ownership, raw-text settings load, and full-file save pipeline intact, then realign the UI around two contracts: a narrower auth-file editor model for the modal and a display-only account summary for the cards. The modal work should move the editor state toward the reference auth-files pattern by replacing removed advanced fields with JSON `headers` editing, while preserving the existing preview and upload flow. The card work should treat top-line status as stable semantic state only, keep detailed messages below the stats row, and expose custom proxy information only through a masked, optional display field owned by the server side list contract. This keeps runtime semantics unchanged, contains risk at the route and editor boundaries already in place, and avoids spreading auth-file parsing into multiple client components.

### Why This Approach
- It reuses the existing raw auth-file GET/PATCH contract instead of inventing a second save path.
- It honors locked decisions D3 through D13 without broadening scope into inherited/global proxy state or advanced runtime toggles.
- It follows the local auth-files reference where the desired behavior is already proven, especially for `headers` JSON editing.
- It keeps secret masking and proxy-summary derivation at the server/display boundary instead of pushing raw auth-file content into card components.

### Architecture Baseline for Phase Slicing
#### Enduring Foundations
- `dashboard/src/lib/providers/oauth-auth-file-settings.ts` remains the single source of truth for modal parse, serialize, preview, and dirty-detection behavior.
- The OAuth card list contract remains server-owned and display-oriented. If proxy summary is added, it is optional and already masked before it reaches the client.
- Card badge rows show stable semantic state, while contextual detail messages remain in the lower message panel.
- This feature does not change upstream auth-file semantics, provider ownership semantics, or the full-file upload contract.

#### Ownership and Contracts
| Boundary | Owner | Contract / Interface | Constraint to Preserve |
|---|---|---|---|
| OAuth list route | `dashboard/src/app/api/providers/oauth/route.ts` + `dashboard/src/lib/providers/oauth-ops.ts` | `{ accounts: OAuthAccountWithOwnership[] }`, extended only with optional display-ready proxy summary fields | Preserve ownership filtering, current auth-file discovery behavior, and no raw secret leakage |
| OAuth settings route | `dashboard/src/app/api/providers/oauth/[id]/settings/route.ts` | `GET` returns raw auth-file text, `PATCH` accepts full JSON file content | Preserve auth checks, origin validation, and 1 MB payload ceiling |
| OAuth editor model | `dashboard/src/lib/providers/oauth-auth-file-settings.ts` | Editor object projected from raw JSON and serialized back into a full-file payload | Preserve preview fidelity and dirty detection |
| OAuth modal and card UI | `dashboard/src/components/providers/oauth-account-settings-modal.tsx`, `oauth-section.tsx`, `oauth-credential-list.tsx` | Render-only consumers of the two contracts above | Keep UI changes bounded to clarity and display semantics |

## 3. Alternatives Considered
- Option A: Fetch each auth file in the browser after list load and derive proxy badges client-side. Rejected because it adds client-side N+1 requests, broadens raw auth-file exposure, and couples card rendering to file-download logic.
- Option B: Add full inherited/global/direct proxy taxonomy to every card. Rejected because D2 and the deferred ideas explicitly limit this pass to custom proxy overrides only.
- Option C: Keep the current editor model and only restyle the modal. Rejected because D11 through D13 require a narrower field surface and real `headers` editing behavior, not just layout changes.

## 4. Risk Map
| Component | Risk Level | Reason | Validation Owner | Spike Question | Affected Beads |
|---|---|---|---|---|---|
| OAuth list proxy summary contract | HIGH | The current `/auth-files` list payload used by `listOAuthWithOwnership` does not expose proxy summary fields, so a naive solution could trigger extra upstream fan-out or leak raw credentials. | validating | Can the dashboard produce an optional masked custom proxy display without browser-side auth-file downloads and without sending raw credentials to the client? | Phase 2 card contract and card UI beads |
| OAuth headers JSON editing | MEDIUM | The modal needs new validation state that blocks invalid JSON saves while keeping preview generation predictable. | n/a | n/a | Phase 1 editor and modal beads |
| Split modal layout | MEDIUM | Long JSON preview content and auth-file metadata must remain legible at desktop width and collapse cleanly at smaller widths. | n/a | n/a | Phase 1 modal layout bead |
| Card status simplification | MEDIUM | The new `Limit Reached` mapping must remain accurate even when `statusMessage` is JSON-wrapped or provider-specific. | n/a | n/a | Phase 2 card UI bead |

For the HIGH row above:
- Option 1: Reuse an existing upstream list field if `/auth-files` metadata already contains a proxy override value.
- Option 2: Add a server-only enrichment step that derives a masked proxy summary before the list route responds.
- Option 3: Add a same-surface summary fetch for visible accounts only, still server-owned and masked, if the main list route cannot safely enrich in one pass.
- Recommended option: Prefer Option 1, fall back to Option 3 before Option 2 if validating shows that full list enrichment would create avoidable upstream fan-out.
- User-visible decision to lock: The card may show a masked custom proxy badge only when the summary is available, but it must never show raw credentials or invent inherited/global proxy states.
- `testing_mode` expectation if this remains HIGH in execution: `tdd-required` for the contract and masking logic.

## 5. Proposed File Structure
```text
dashboard/src/components/providers/
  oauth-credential-list.tsx            # card badges, warning panel styling, action order
  oauth-account-settings-modal.tsx     # split layout, stronger hierarchy, headers textarea
  oauth-section.tsx                    # modal field handlers and settings modal prop surface

dashboard/src/lib/providers/
  oauth-auth-file-settings.ts          # editor fields, headers validation, payload serialization
  oauth-ops.ts                         # optional masked custom proxy summary on list contract

dashboard/src/app/api/providers/oauth/
  route.ts                             # list route contract surface
  [id]/settings/route.ts               # unchanged save boundary, referenced for contract preservation
```

## 6. Dependency Order
- Group A: Narrow the editor model and payload logic to `prefix`, `proxy_url`, `priority`, `headers`, and `note` while preserving preview and dirty detection.
- Group B: Rebuild the modal hierarchy and responsive split layout on top of the updated editor model.
- Group C: Rework card status, badge, and action affordances, then add masked custom proxy summary once the contract choice is validated.

## 7. Institutional Learnings Applied
| Learning Source | Key Insight | How Applied |
|---|---|---|
| `history/oauth-config-ui-ux/CONTEXT.md` | Badge scope is limited to custom proxy overrides and status semantics are fixed by D2 through D6. | The recommended approach keeps proxy display optional, masked, and display-only. |
| `dashboard/src/lib/providers/oauth-auth-file-settings.ts` | The editor model already centralizes preview and dirty detection. | Planning keeps all modal field semantics inside this file rather than duplicating patch logic in components. |
| `references/Cli-Proxy-API-Management-Center/.../useAuthFilesPrefixProxyEditor.ts` | JSON textarea validation for `headers` is already proven in a nearby auth-file editing flow. | Planning adopts the same editing surface and validation shape for OAuth auth files. |
| `dashboard/src/components/providers/oauth-section.tsx` | Account reload, provider refresh, and settings save already converge after a successful PATCH. | Planning preserves the current orchestration boundary and avoids introducing new save workflows. |

## 8. Open Questions for Validating
- [ ] Which proxy-summary strategy should execution lock for Phase 2 after validating checks performance and secret-handling tradeoffs?
- [ ] Should the `Limit Reached` mapping key off a specific normalized message pattern only, or should validating require a broader provider-agnostic matcher before execution?
