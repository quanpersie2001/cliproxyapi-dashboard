<!-- Updated: 2026-04-11 -->
# Architecture

This document replaces the older codemap split and keeps the architecture view in one place.

## Stack

Next.js 16 + React 19 + TypeScript 5.9 + Tailwind CSS 4 + Prisma 7 + PostgreSQL 16

## System Diagram

```text
Browser
  -> Next.js App Router dashboard (:3000)
      -> Prisma -> PostgreSQL
      -> /api/management/[...path] -> CLIProxyAPI management API (:8317/v0/management)
      -> docker CLI -> docker-socket-proxy

CLIProxyAPI
  -> config.yaml
  -> auth volume
  -> logs volume

Usage collector
  -> POST /api/usage/collect
  -> usage_records / collector_state tables
```

## Deployment Boundaries

- **Dashboard (`dashboard/`)**
  - Next.js UI and API routes
  - JWT session auth
  - Prisma access to PostgreSQL
  - provider ownership and custom-provider orchestration
  - update and container-operation control plane
- **Runtime stack (`infrastructure/`)**
  - bundled Docker Compose deployment
  - loopback-bound dashboard and proxy API
  - internal PostgreSQL network
  - deploy webhook helper and ops wrapper script
- **Maintenance scripts (`scripts/`)**
  - backup
  - restore
  - retention rotation

## Current Source Layout

```text
dashboard/src/
├── app/                16 page routes total
│   ├── api/            48 route handlers
│   └── dashboard/      13 authenticated dashboard pages
├── components/         69 shared UI/component files
├── features/           14 feature-surface files
├── hooks/              dashboard hooks
├── lib/                55 service/utility files
├── server/             server-side usage services
└── generated/          Prisma client output
```

## Frontend Surface

### Page Tree

```text
/
├── /login
├── /setup
└── /dashboard
    ├── /
    ├── /providers
    ├── /api-keys
    ├── /usage
    ├── /quota
    ├── /config
    ├── /settings
    ├── /monitoring
    ├── /logs
    ├── /containers
    ├── /setup
    └── /admin
        ├── /users
        └── /logs
```

### Main Surfaces

- `DashboardOverviewPage`: overall health, usage summary, model catalog, quick links
- `ProvidersPage`: provider API keys, OAuth accounts, custom providers, provider admin settings
- `ApiKeysPage`: dashboard-issued client credentials
- `UsagePage`: persistent usage analytics based on `GET /api/usage/history`
- `QuotaPage`: provider quota aggregation and capacity windows
- `ConfigPage`: managed CLIProxyAPI runtime settings and YAML preview
- `SettingsPage`: password changes, session revoke, proxy update, dashboard update, deploy flow
- `MonitoringPage`: proxy health, usage polling, live logs, restart actions
- `LogsPage`: log-focused monitoring entry
- `ContainersPage`: allowlisted container inspection and actions
- `AdminUsersPage`: user and role management
- `AdminLogsPage`: audit log review

## Backend Surface

### Auth and Setup

- `POST /api/auth/login`
- `POST /api/auth/logout`
- `GET /api/auth/me`
- `POST /api/auth/change-password`
- `GET|POST /api/setup`
- `GET /api/setup-status`

### Admin

- `GET|POST|DELETE /api/admin/users`
- `GET|PUT /api/admin/settings`
- `GET|DELETE /api/admin/logs`
- `GET|POST /api/admin/deploy`
- `POST /api/admin/revoke-sessions`
- `POST /api/admin/migrate-api-keys`

### User and Provider Management

- `GET|POST|DELETE /api/user/api-keys`
- `GET|POST /api/providers/keys`
- `DELETE /api/providers/keys/[keyHash]`
- `GET|POST /api/providers/oauth`
- `DELETE|PATCH /api/providers/oauth/[id]`
- `GET /api/providers/oauth/[id]/download`
- `GET /api/providers/oauth/[id]/models`
- `GET|PATCH /api/providers/oauth/[id]/settings`
- `POST /api/providers/oauth/import`
- `POST /api/providers/oauth/claim`
- `POST /api/management/oauth-callback`
- `GET|POST /api/custom-providers`
- `PATCH|DELETE /api/custom-providers/[id]`
- `POST /api/custom-providers/fetch-models`
- `POST /api/custom-providers/resync`
- `PUT /api/custom-providers/reorder`
- `GET|POST /api/provider-groups`
- `PATCH|DELETE /api/provider-groups/[id]`
- `PUT /api/provider-groups/reorder`
- `GET|PUT /api/model-preferences`

### Proxy Runtime and Operations

- `GET|POST|PUT|PATCH|DELETE /api/management/[...path]`
- `GET /api/proxy/status`
- `GET /api/proxy/oauth-settings`
- `GET /api/health`
- `POST /api/restart`
- `GET /api/containers/list`
- `GET /api/containers/[name]/details`
- `GET /api/containers/[name]/logs`
- `POST /api/containers/[name]/action`
- `GET /api/quota`
- `POST /api/usage/collect`
- `GET /api/usage/history`
- `GET /api/usage` (deprecated compatibility route)
- `GET /api/update/check`
- `POST /api/update`
- `GET /api/update/dashboard/check`

## Data Model Summary

```text
User
  ├── UserApiKey
  ├── ProviderKeyOwnership
  ├── ProviderOAuthOwnership
  ├── CustomProvider
  ├── ProviderGroup
  ├── ModelPreference
  ├── AuditLog
  └── UsageRecord

CustomProvider
  ├── CustomProviderModel
  └── CustomProviderExcludedModel

SystemSetting
CollectorState
```

- `User`: dashboard identity, admin role, session invalidation via `sessionVersion`
- `UserApiKey`: dashboard-issued client API keys
- `ProviderKeyOwnership`: direct provider-key ownership mapping
- `ProviderOAuthOwnership`: OAuth account ownership mapping
- `ModelPreference`: per-user excluded model preferences
- `CustomProvider`: user-managed OpenAI-compatible upstream definition
- `ProviderGroup`: grouping, ordering, and activation state for custom providers
- `SystemSetting`: global dashboard settings such as provider-key limits
- `AuditLog`: admin and security trail
- `UsageRecord`: persistent usage facts collected from CLIProxyAPI
- `CollectorState`: serialized `POST /api/usage/collect` run state

## Runtime Dependencies

### External Services and Images

- **CLIProxyAPIPlus** (`eceasy/cli-proxy-api-plus:latest`) for proxy runtime and management API
- **PostgreSQL 16** (`postgres:16-alpine`) for persistent storage
- **Docker socket proxy** (`tecnativa/docker-socket-proxy:latest`) for restricted Docker API access
- **GHCR dashboard image** (`ghcr.io/<repo>/dashboard`) for published dashboard builds

### Internal Modules Worth Knowing

- `lib/api-endpoints.ts`: shared route constants
- `lib/errors.ts`: canonical API response helpers
- `lib/env.ts`: env schema and validation
- `lib/proxy-runtime.ts`: proxy container and compose-path resolution
- `lib/providers/management-api.ts`: management API wrapper and process-local mutex
- `lib/usage/history.ts`: persistent usage snapshot and aggregation logic
- `lib/containers.ts`: allowlist for container management

## Runtime Notes

- The production dashboard image runs [`dashboard/entrypoint.sh`](../dashboard/entrypoint.sh), which bootstraps and patches core tables with a PostgreSQL advisory lock.
- Source development still uses Prisma bootstrap plus `prisma migrate deploy`.
- The bundled stack does not include a public reverse proxy or TLS termination layer.
- `providerMutex` in [`dashboard/src/lib/providers/management-api.ts`](../dashboard/src/lib/providers/management-api.ts) is process-local only.
- [`dashboard/prisma/schema.prisma`](../dashboard/prisma/schema.prisma) is the active source of truth for the data model.

## Auth Model

```text
setup/login
  -> hash password with bcrypt
  -> sign JWT with jose
  -> store session cookie
  -> verify JWT on server
  -> invalidate globally via users.sessionVersion
```
