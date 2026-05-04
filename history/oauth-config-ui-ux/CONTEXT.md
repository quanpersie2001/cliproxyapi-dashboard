# OAuth Config UI/UX Polish — Context

**Feature slug:** oauth-config-ui-ux
**Date:** 2026-05-04
**Exploring session:** complete
**Scope:** Quick
**Project docs consumed:** [.pulse/project-docs.json -> CONTEXT.md, docs/FEATURES.md]

---

## Feature Boundary

Polish the OAuth account cards and OAuth account settings modal on `/dashboard/providers` so per-account proxy and auth-file configuration are clearer to scan and edit, without changing the underlying runtime semantics or adding new runtime capabilities.

**Domain type(s):** SEE | CALL

---

## Locked Decisions

These are fixed. Planning must implement them exactly. No creative reinterpretation.

### Terminology & Domain Model
- **D1** Reuse the existing repo terms `OAuth account`, `auth file`, per-account `proxy_url`, and global `proxy-url`.
  *Rationale: Existing repo docs and code already distinguish auth-file-level overrides from runtime-level global config; this pass should clarify the UI, not rename the model.*

- **D2** The proxy badge on the OAuth card only appears when the account has its own per-account `proxy_url` override.
  *Rationale: The user explicitly chose “chỉ custom”; inherited/global/direct accounts should not gain new badges in this pass.*

### Card Status & Signals
- **D3** Replace the current free-text status badge behavior for the usage-limit case with a dedicated card status state: `Active`, `Disabled`, or `Limit Reached`.
  *Rationale: The user wants the top-line badge row to scan as stable states instead of showing the raw limit message inline.*

- **D4** When an account is in the `Limit Reached` state, keep the detailed warning/message panel below the card, but remove the current left-border/accent warning treatment.
  *Rationale: The badge should summarize state; the lower panel should keep the detailed message without the current visual imbalance.*

- **D5** For accounts with a custom proxy override, the card badge shows the actual proxy URL rather than a generic label.
  *Rationale: The user explicitly requested showing the proxy URL itself.*

- **D6** Any proxy URL shown on the card must mask credentials, e.g. `socks5://***@host:port`.
  *Rationale: The user approved masking credentials to avoid exposing secrets in the card UI.*

### Actions & Modal Layout
- **D7** The card action order becomes `Models` → `Config` → `Download` → `Delete`.
  *Rationale: The user wants the config action to be more discoverable and positioned before secondary destructive actions.*

- **D8** The config action uses icon + text (`Config`), not an icon-only button.
  *Rationale: The current icon-only affordance is too ambiguous for users scanning the card.*

- **D9** The OAuth account settings modal switches from a long single-column layout to a split layout: editable settings on the left, `Auth file info` and `JSON preview` on the right.
  *Rationale: The user wants the structure of the editable area vs. informational preview area to be visually obvious at a glance.*

- **D10** The modal should visually strengthen field headers and section hierarchy, especially for `Prefix`, `Priority`, `Proxy URL`, `Custom Headers`, and `Note`.
  *Rationale: The current modal is too low-contrast and does not clearly emphasize the editable controls.*

### Settings Surface
- **D11** Remove `Disable cooling`, `WebSockets`, and `Excluded models` from the OAuth settings modal in this pass.
  *Rationale: The user wants the OAuth modal aligned to the narrower auth-files-style settings surface instead of the broader current editor surface.*

- **D12** Add `Custom Headers (headers)` to the OAuth settings modal.
  *Rationale: This replaces the removed advanced fields with the header editing capability the user requested.*

- **D13** `Custom Headers` uses a JSON textarea, not key/value row inputs.
  *Rationale: The user chose the auth-files-style JSON editing pattern and wants this modal to stay close to the auth-files reference.*

### Agent's Discretion
- Exact badge tones, spacing, truncation, and tooltip treatment may be chosen during planning/implementation as long as they reinforce the locked semantics above.
- The exact breakpoint and internal spacing of the split modal layout may be chosen during planning/implementation as long as the left/right information architecture remains intact.

---

## Specific Ideas & References

- Follow the auth-files editing feel from the local reference project at `references/Cli-Proxy-API-Management-Center/`.
- The most relevant reference modal is `references/Cli-Proxy-API-Management-Center/src/features/authFiles/components/AuthFilesPrefixProxyEditorModal.tsx`.
- The matching reference state/patch logic is `references/Cli-Proxy-API-Management-Center/src/features/authFiles/hooks/useAuthFilesPrefixProxyEditor.ts`.
- Repo docs already frame OAuth account editing as part of the provider inventory and auth-file workflows rather than a separate settings product surface: `docs/FEATURES.md`.

---

## Scenario Checks

- An OAuth account whose `statusMessage` is “The usage limit has been reached” should show a top-level `Limit Reached` state badge and still keep the detailed message panel below the card, but without the current left warning border.
- An OAuth account whose auth file has `proxy_url: "socks5://user:pass@proxy-us:1080"` should show a proxy badge on the card as a masked value such as `socks5://***@proxy-us:1080`.
- An OAuth account with no per-account `proxy_url` should not show any proxy badge on the card, regardless of whether it inherits a global runtime proxy or goes direct.
- In the modal, editing `headers` through a JSON textarea should update the `JSON preview` and save back into the auth-file payload while the removed fields (`Disable cooling`, `WebSockets`, `Excluded models`) no longer appear in the editable form.

---

## Existing Code Context

From the quick codebase scout during exploring.
Downstream agents: read these files before planning to avoid reinventing existing patterns.

### Reusable Assets
- `dashboard/src/components/providers/oauth-credential-list.tsx` — renders the OAuth account card grid, current status badges, warning panel, and per-card action buttons.
- `dashboard/src/components/providers/oauth-account-settings-modal.tsx` — current OAuth account settings modal that needs layout, hierarchy, and field-surface changes.
- `dashboard/src/components/providers/oauth-section.tsx` — orchestrates loading accounts, opening the settings modal, updating editor state, and saving auth-file settings.
- `dashboard/src/lib/providers/oauth-auth-file-settings.ts` — parses auth-file JSON into the modal editor state and serializes edits back into the payload sent upstream.
- `dashboard/src/app/api/providers/oauth/[id]/settings/route.ts` — existing load/save route for raw auth-file settings via the management API.
- `references/Cli-Proxy-API-Management-Center/src/features/authFiles/components/AuthFilesPrefixProxyEditorModal.tsx` — reference auth-files modal with the narrower field surface and JSON-based header editing pattern the user wants to emulate.
- `references/Cli-Proxy-API-Management-Center/src/features/authFiles/hooks/useAuthFilesPrefixProxyEditor.ts` — reference implementation for `headers` parsing/patch semantics in an auth-file editor context.

### Established Patterns
- OAuth account status currently comes from the list payload (`status`, `statusMessage`, `unavailable`) and is rendered in `dashboard/src/components/providers/oauth-credential-list.tsx`.
- OAuth settings are currently edited by downloading/parsing raw auth-file JSON, mutating an editor object, and uploading the full auth-file content back through `dashboard/src/components/providers/oauth-section.tsx` and `dashboard/src/app/api/providers/oauth/[id]/settings/route.ts`.
- The repo already documents `optional prefix and upstream proxy URL` as auth/provider-level concepts in `docs/FEATURES.md:96-107`, so this UI pass should strengthen discoverability rather than invent new configuration semantics.

### Integration Points
- Any card-level proxy badge needs a data source for per-account `proxy_url`; the current OAuth list payload does not expose that field, so planning must decide how to surface it without changing the product semantics.
- Any new `headers` editor UI must round-trip through `dashboard/src/lib/providers/oauth-auth-file-settings.ts` so the modal preview and PATCH payload stay in sync.
- The modal layout changes should remain connected to the existing `OAuthAccountSettingsModal` usage in `dashboard/src/components/providers/oauth-section.tsx`.

---

## Canonical References

**Downstream agents MUST read these before planning or implementing.**

- `CONTEXT.md` — repo-level vocabulary and control-plane boundaries.
- `docs/FEATURES.md` — current documented OAuth/provider feature surface and terminology.
- `dashboard/src/components/providers/oauth-credential-list.tsx` — current OAuth card rendering and action ordering.
- `dashboard/src/components/providers/oauth-account-settings-modal.tsx` — current OAuth settings modal structure.
- `dashboard/src/components/providers/oauth-section.tsx` — current modal orchestration and save flow.
- `dashboard/src/lib/providers/oauth-auth-file-settings.ts` — current auth-file editor field model and serialization rules.
- `references/Cli-Proxy-API-Management-Center/src/features/authFiles/components/AuthFilesPrefixProxyEditorModal.tsx` — reference auth-files modal layout and field pattern.
- `references/Cli-Proxy-API-Management-Center/src/features/authFiles/hooks/useAuthFilesPrefixProxyEditor.ts` — reference `headers` field behavior.

---

## Outstanding Questions

### Deferred to Planning
- [ ] Choose the least-invasive way to surface per-account `proxy_url` for the card badge, because the current `/api/providers/oauth` list payload does not expose proxy metadata. — This requires codebase-level investigation of whether to enrich the list payload or fetch/derive the proxy override another way.
- [ ] Decide the exact truncation/tooltip behavior for long masked proxy URLs on cards. — This is a UI implementation detail that should be solved against the existing card width constraints.

---

## Deferred Ideas

- Showing inherited/global/direct proxy state badges for accounts without custom `proxy_url` is out of scope for this pass; the user explicitly narrowed the card badge to custom overrides only.

---

## Handoff Note

CONTEXT.md is the single source of truth for this feature.

- **planning** reads: locked decisions, code context, canonical refs, deferred-to-planning questions
- **validating** reads: locked decisions (to verify plan-checker coverage)
- **reviewing** reads: locked decisions (for UAT verification)

Decision IDs (D1, D2...) are stable. Reference them by ID in all downstream artifacts.
