# Spike Findings: br-wpd.6

**Date:** 2026-05-04  
**Feature:** `oauth-config-ui-ux`  
**Phase:** `Phase 2 - Scan-Ready OAuth Account Cards`

## Spike Question
Can the dashboard derive a masked custom OAuth proxy display on the server without browser-side raw auth-file downloads and without full-list upstream fan-out?

## Decision
**YES**

## Why the answer is YES
1. `listOAuthWithOwnership` currently builds `/api/providers/oauth` from `/auth-files` metadata only, and that metadata shape does not include `proxy_url`, so the current route cannot render the badge directly from its first fetch path.
2. The dashboard already has a server-side raw auth-file read path through `GET /api/providers/oauth/[id]/settings` and `GET /api/providers/oauth/[id]/download`, both backed by `GET ${MANAGEMENT_BASE_URL}/auth-files/download?name=...`.
3. The client already paginates OAuth cards locally with `OAUTH_ACCOUNT_PAGE_SIZE = 12`, so a second server-owned fetch scoped to the visible account set can stay bounded even when the total account list grows.

## Evidence
- `dashboard/src/lib/providers/oauth-ops.ts`
  - `listOAuthWithOwnership` fetches `${MANAGEMENT_BASE_URL}/auth-files` and maps metadata fields such as `id`, `name`, `provider`, `email`, `status`, `status_message`, `size`, and timestamps.
  - No `proxy_url` is read from the metadata payload.
- `dashboard/src/app/api/providers/oauth/[id]/settings/route.ts`
  - The dashboard already downloads the raw auth file from `${MANAGEMENT_BASE_URL}/auth-files/download?name=...` and returns `rawText` server-side.
- `dashboard/src/app/api/providers/oauth/[id]/download/route.ts`
  - The same upstream download path already exists for authenticated dashboard users.
- `dashboard/src/components/providers/oauth-section.tsx`
  - The visible account window is bounded by `OAUTH_ACCOUNT_PAGE_SIZE = 12` and `paginatedAccounts`.

## Recommended Contract To Lock
1. Keep the existing unscoped `GET /api/providers/oauth` fast and metadata-only.
2. Add an optional bounded enrichment mode on the same route using repeated `maskedProxyFor` query params, scoped to the visible account names only.
3. Cap enrichment to **12 unique account names** per request to match the current page size budget.
4. For each requested account only:
   - download the raw auth file on the server,
   - parse the JSON object,
   - read `proxy_url`,
   - mask credentials before serialization,
   - return **`maskedProxyUrl`** only when a custom per-account proxy override exists.
5. If the file cannot be fetched, parsed, or does not contain a custom `proxy_url`, omit `maskedProxyUrl` instead of returning `null`, raw auth-file content, or an invented inherited/global proxy state.

## Rejected Paths
- **Reuse `/auth-files` metadata directly** — rejected because the current metadata shape does not expose `proxy_url`.
- **Enrich the entire OAuth list on every GET** — rejected because the route currently returns all accounts, so full-list raw-file fan-out would be unbounded as account count grows.
- **Browser-side auth-file downloads per card** — rejected because it leaks raw-file access into the client and creates N+1 browser requests.

## Planning Consequences
- `br-wpd.4` should depend on this spike and lock the bounded query-param contract plus `maskedProxyUrl` omission behavior.
- `br-wpd.5` should consume `maskedProxyUrl` only, never raw `proxy_url`, and should assume the field may be absent.
- Validation should treat any implementation that enriches the full list unconditionally or returns raw proxy credentials as a failure against this spike.
