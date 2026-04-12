# Features

Canonical docs hub: [`docs/README.md`](README.md)

This guide describes the product surface exposed by the current dashboard build. It complements the deeper technical detail in [`ARCHITECTURE.md`](ARCHITECTURE.md).

## Product Scope

CLIProxyAPI Dashboard is a proxy administration console. It is not a general product control plane.

The current build focuses on:

- dashboard user accounts and admin controls
- provider credentials and OAuth inventory
- OpenAI-compatible custom upstreams
- proxy runtime settings and config preview
- usage history, quotas, logs, updates, and safe container operations

## Access Model

### First Boot

- If the database contains no users, the app exposes first-time setup at `/setup`.
- The first created user is always an admin.
- After setup completes, standard login becomes the expected entrypoint.

### Authentication

- Username/password login is handled by `/api/auth/login`.
- Sessions are stored in a signed HTTP-only cookie.
- Global logout is implemented by incrementing `users.sessionVersion`.
- Password changes use `/api/auth/change-password`.

### Authorization

- All `/dashboard/**` pages require an authenticated session.
- Admin-only pages and routes additionally check `users.isAdmin`.
- State-changing session-authenticated routes also validate request origin.

## Dashboard Pages

| Route | Access | What it does |
| --- | --- | --- |
| `/` | public | Redirect/start surface |
| `/login` | public | Username/password login |
| `/setup` | public, first boot only | Creates the first admin account |
| `/dashboard` | authenticated | Overview, health, usage snapshot, model catalog |
| `/dashboard/providers` | authenticated | Direct keys, OAuth accounts, custom providers, provider groups |
| `/dashboard/providers/oauth/connect` | authenticated | OAuth connect flow landing page |
| `/dashboard/providers/oauth/model-alias` | authenticated | OAuth model alias editor |
| `/dashboard/api-keys` | authenticated | Dashboard-issued client API keys |
| `/dashboard/usage` | authenticated | Persistent usage analytics from PostgreSQL |
| `/dashboard/quota` | authenticated | Provider quota aggregation and capacity windows |
| `/dashboard/settings` | authenticated | Password changes, session revoke, update surfaces |
| `/dashboard/setup` | authenticated | Post-login onboarding checklist |
| `/dashboard/monitoring` | admin | Proxy runtime health, restart actions, live telemetry |
| `/dashboard/logs` | admin | Monitoring-oriented log view |
| `/dashboard/containers` | admin | Allowlisted container inspection and actions |
| `/dashboard/config` | admin | Managed CLIProxyAPI runtime settings and YAML preview |
| `/dashboard/admin/users` | admin | User creation, role changes, user management |
| `/dashboard/admin/logs` | admin | Audit log review |

## Provider Management Model

The current provider model spans four surfaces.

### Direct API-Key Providers

The dedicated API-key UI currently manages:

- Claude
- Gemini
- OpenAI / Codex

OpenAI-compatible upstreams are handled separately through custom providers instead of the direct-key cards.

### OAuth Providers

The OAuth inventory currently supports:

- Claude Code
- Gemini CLI
- Codex
- Antigravity
- iFlow
- Kimi
- Qwen Code
- GitHub Copilot
- Kiro
- Cursor
- CodeBuddy

Key OAuth workflows include:

- connect, import, and claim account ownership
- download auth files
- inspect provider-discovered models
- edit account settings
- maintain OAuth model aliases

### Custom Providers

Custom provider records are for OpenAI-compatible upstreams and include:

- display name and stable provider ID
- base URL
- encrypted API-key persistence when `PROVIDER_ENCRYPTION_KEY` is configured
- optional prefix and upstream proxy URL
- custom headers
- model alias mappings
- excluded-model patterns
- grouping and ordering

### Model Preferences and Provider Policy

The dashboard also stores:

- per-user excluded models (`model_preferences`)
- provider-key ownership
- OAuth ownership
- provider groups
- the admin setting `max_provider_keys_per_user`

## Operational Surfaces

The dashboard currently exposes these operator actions directly in the UI:

- update CLIProxyAPI by pulling a new published image and recreating the proxy container
- check dashboard version against `version.json`
- trigger dashboard deployment through the optional webhook flow
- revoke all active sessions
- inspect safe container state and run allowlisted start/stop/restart actions
- edit managed parts of `config.yaml`
- view audit logs and monitoring output

## API Surface Map

| Area | Key routes |
| --- | --- |
| Auth and setup | `/api/auth/*`, `/api/setup`, `/api/setup-status` |
| Admin | `/api/admin/users`, `/api/admin/settings`, `/api/admin/logs`, `/api/admin/deploy`, `/api/admin/revoke-sessions` |
| Provider ownership | `/api/providers/keys`, `/api/providers/oauth/*`, `/api/custom-providers/*`, `/api/provider-groups/*`, `/api/model-preferences` |
| Proxy management passthrough | `/api/management/[...path]`, `/api/management/oauth-callback` |
| Runtime operations | `/api/proxy/status`, `/api/proxy/oauth-settings`, `/api/restart`, `/api/containers/*`, `/api/update*` |
| Usage and quota | `/api/quota`, `/api/usage/collect`, `/api/usage/history`, `/api/usage` |

## Current Product Constraints

- The bundled stack assumes a single dashboard instance.
- `providerMutex` is process-local only; it is not a distributed lock.
- `GET /api/usage` remains a compatibility route. New consumers should use `GET /api/usage/history`.
- The bundled deployment intentionally keeps the dashboard and primary proxy API loopback-only by default.
