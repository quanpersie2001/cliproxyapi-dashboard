# Discovery Report: OAuth Config UI/UX Polish

**Date**: 2026-05-04
**Feature**: `oauth-config-ui-ux`
**Discovery output**: `history/oauth-config-ui-ux/discovery.md`
**CONTEXT.md reference**: `history/oauth-config-ui-ux/CONTEXT.md`

## Institutional Learnings

### Critical Patterns
- None applicable. `.pulse/memory/critical-patterns.md` is not present for this repo state.

### Domain-Specific Learnings
| File | Module | Key Insight | Severity |
|------|--------|-------------|----------|
| `dashboard/src/components/providers/oauth-section.tsx` | Providers UI orchestration | The list load, settings modal lifecycle, full-file save, and post-save refresh all converge here, so modal and card changes should preserve this single orchestration path. | medium |
| `dashboard/src/lib/providers/oauth-auth-file-settings.ts` | Auth-file editor model | The current editor owns parse, preview, dirty detection, and upload payload generation, but it still models `excluded_models`, `disable_cooling`, and `websockets`, and has no `headers` validation state yet. | high |
| `dashboard/src/components/providers/oauth-account-settings-modal.tsx` | Providers modal UI | The modal already has metadata and JSON preview blocks, but they sit above a long single-column form and the field hierarchy is visually flat. | medium |
| `dashboard/src/components/providers/oauth-credential-list.tsx` | Providers card UI | Status uses a badge that can collapse into raw error text, the warning panel uses an accent treatment the user wants removed, and config/download/delete actions are currently icon-heavy. | medium |
| `dashboard/src/lib/providers/oauth-ops.ts` | Providers server contract | `listOAuthWithOwnership` builds the OAuth card list from `/auth-files` metadata only, and the current account summary has no custom proxy display field. | high |
| `references/Cli-Proxy-API-Management-Center/src/features/authFiles/components/AuthFilesPrefixProxyEditorModal.tsx` + `references/Cli-Proxy-API-Management-Center/src/features/authFiles/hooks/useAuthFilesPrefixProxyEditor.ts` | Local reference implementation | The reference pattern already narrows the editable field surface to prefix, proxy, priority, headers, and note, with JSON textarea validation for `headers`. | medium |

## Architecture Snapshot
| Area | Purpose | Key Paths |
|------|---------|-----------|
| OAuth account inventory | Load paginated account cards, ownership details, status, and card actions | `dashboard/src/components/providers/oauth-section.tsx`, `dashboard/src/components/providers/oauth-credential-list.tsx`, `dashboard/src/app/api/providers/oauth/route.ts`, `dashboard/src/lib/providers/oauth-ops.ts` |
| OAuth settings editing | Load raw auth file JSON, project it into an editor model, preview the upload payload, and save the full file back upstream | `dashboard/src/components/providers/oauth-account-settings-modal.tsx`, `dashboard/src/components/providers/oauth-section.tsx`, `dashboard/src/lib/providers/oauth-auth-file-settings.ts`, `dashboard/src/app/api/providers/oauth/[id]/settings/route.ts` |
| Reference auth-files editor | Provide the desired narrower settings surface and JSON header editing behavior | `references/Cli-Proxy-API-Management-Center/src/features/authFiles/components/AuthFilesPrefixProxyEditorModal.tsx`, `references/Cli-Proxy-API-Management-Center/src/features/authFiles/hooks/useAuthFilesPrefixProxyEditor.ts` |
| Product terminology | Lock provider and auth-file vocabulary so planning does not rename concepts | `CONTEXT.md`, `docs/FEATURES.md`, `history/oauth-config-ui-ux/CONTEXT.md` |

## Pattern Search
| Implementation | Location | Pattern Used | Reusable? |
|----------------|----------|--------------|-----------|
| Current OAuth settings modal | `dashboard/src/components/providers/oauth-account-settings-modal.tsx` | Existing metadata chips, auth file info block, JSON preview block, and save footer | Partial |
| Current OAuth settings editor model | `dashboard/src/lib/providers/oauth-auth-file-settings.ts` | Full-file JSON parse/serialize with dirty detection and preview generation | Yes |
| Reference auth-files editor | `references/Cli-Proxy-API-Management-Center/src/features/authFiles/components/AuthFilesPrefixProxyEditorModal.tsx` + `.../useAuthFilesPrefixProxyEditor.ts` | Narrow field surface plus JSON textarea validation for `headers` | Yes |
| Current OAuth card warnings | `dashboard/src/components/providers/oauth-credential-list.tsx` | Separate badge row plus detail warning panel beneath stats | Partial |
| OAuth list contract | `dashboard/src/app/api/providers/oauth/route.ts` + `dashboard/src/lib/providers/oauth-ops.ts` | Server-owned account summary contract with ownership filtering | Yes |

## Constraints
- Runtime/toolchain: Next.js 16 App Router, React 19, strict TypeScript, dashboard-owned API routes, and `API_ENDPOINTS` constants for client fetches.
- Build/quality commands: `cd dashboard && npm run typecheck && npm run lint && npm run test && npm run build`.
- Dependency constraints:
  - This pass must not change OAuth runtime semantics or auth-file schema semantics.
  - The settings route already uses full-file upload with a 1 MB cap; planning should preserve that contract.
  - Any proxy value shown on cards must be masked before display and should not broaden secret exposure.
  - Locked decisions D1 through D13 prohibit scope creep into inherited/global proxy taxonomy or advanced-field restoration.

## External / Adjacent Research (if needed)
| Source | Version/Date | Key Reference |
|--------|--------------|---------------|
| Local project docs | 2026-05-04 | `docs/FEATURES.md` confirms OAuth editing belongs to provider inventory and auth-file workflows, not a separate settings product surface. |
| Local reference project | 2026-05-04 | `references/Cli-Proxy-API-Management-Center/src/features/authFiles/components/AuthFilesPrefixProxyEditorModal.tsx` shows the desired field surface and layout bias. |
| Local reference project | 2026-05-04 | `references/Cli-Proxy-API-Management-Center/src/features/authFiles/hooks/useAuthFilesPrefixProxyEditor.ts` shows JSON `headers` validation and patch semantics. |
| GitNexus code graph | 2026-05-04 | Query confirmed `OAuthSection`, `OAuthAccountSettingsModal`, `/api/providers/oauth/[id]/settings`, and `listOAuthWithOwnership` as the primary execution cluster for this feature. |

## Open Questions
- [ ] Can the dashboard produce a masked custom proxy summary from current `/auth-files` metadata, or will Phase 2 need a server-only enrichment path to derive it from raw auth files?
- [ ] What truncation threshold and tooltip behavior keeps masked proxy badges readable across the current 2 to 4 column card grid without crowding the status row?

## Summary for Synthesis
**What we have**: A working OAuth account list and a full-file auth-file editor flow already exist, including ownership-aware list loading, raw auth-file download, preview generation, and upload back to CLIProxyAPI.

**What we need**: A narrower, clearer modal editing surface aligned to the auth-files reference, plus a scan-friendly card surface with stable statuses, explicit config affordance, and masked custom proxy display.

**Key constraints**:
- Keep full-file save semantics intact.
- Keep proxy terminology and badge scope exactly as locked in D1, D2, D5, and D6.
- Preserve ownership filtering and existing dashboard route boundaries.

**Institutional warnings**:
- Do not leak raw proxy credentials into new client-visible list fields.
- Do not solve the missing proxy badge data by adding browser-side N+1 auth-file downloads unless validating proves there is no bounded server alternative.
- Do not reintroduce removed advanced fields through the editor model or modal layout.
