# Environment Variables

Canonical docs hub: [`docs/README.md`](README.md)

This file distinguishes between values written by helper scripts, validated core runtime variables, and optional runtime overrides.

## Written by `install.sh` Into `infrastructure/.env`

These values are always written by `install.sh` for the bundled production compose stack.

| Variable | Required | Default / Example | Purpose |
| --- | --- | --- | --- |
| `DATABASE_URL` | Yes | `postgresql://cliproxyapi:pass@postgres:5432/cliproxyapi` | Dashboard database connection string |
| `POSTGRES_PASSWORD` | Yes | generated | Password used by the bundled `postgres` container on first volume initialization |
| `JWT_SECRET` | Yes | generated | Secret used for dashboard session signing |
| `MANAGEMENT_API_KEY` | Yes | generated | Bearer key used when the dashboard talks to the CLIProxyAPI management API |
| `COLLECTOR_API_KEY` | Yes | generated | Bearer key accepted by `POST /api/usage/collect` for cron-based collection |
| `PROVIDER_ENCRYPTION_KEY` | Yes | 64 hex chars | AES-256-GCM key used to persist custom-provider API keys for later re-sync |
| `CLIPROXYAPI_MANAGEMENT_URL` | No | `http://cliproxyapi:8317/v0/management` | Internal management API base URL |
| `INSTALL_DIR` | Yes | `/opt/cliproxyapi-dashboard` | Host path mounted into the dashboard container for compose-aware operations |
| `TZ` | No | `UTC` | Container timezone |
| `LOG_LEVEL` | No | `info` | Dashboard log verbosity |
| `DASHBOARD_URL` | No | `http://localhost:3000` | Public dashboard URL shown in UI links |
| `API_URL` | No | `http://localhost:8317` | Public proxy API URL shown in UI |

## Added Only When Webhook Deploy Is Installed

If you enable the optional dashboard deploy webhook during `install.sh`, the installer appends:

| Variable | Default / Example | Purpose |
| --- | --- | --- |
| `WEBHOOK_HOST` | `http://host.docker.internal:9000` | Base URL of the webhook service used by `/api/admin/deploy` |
| `DEPLOY_SECRET` | generated | Shared secret sent as `X-Deploy-Token` |

## Compose Defaults and Optional Runtime Overrides

These values are read by the current app or compose stack but are not written by `install.sh` unless noted elsewhere.

| Variable | Default | Notes |
| --- | --- | --- |
| `GITHUB_REPO` | `quanpersie2001/cliproxyapi-dashboard` | Used by dashboard update checks to fetch `version.json` |
| `DASHBOARD_VERSION` | `dev` | Usually injected at image build time |
| `DOCKER_HOST` | none | Used by Docker CLI operations inside the dashboard container |
| `API_URL` | none | Also consumed in UI links; `install.sh` writes it for bundled installs |
| `DASHBOARD_URL` | none | Used in UI links and origin validation; `install.sh` writes it for bundled installs |

## Validated Core Runtime Variables

These are validated at startup by [`../dashboard/src/lib/env.ts`](../dashboard/src/lib/env.ts).

| Variable | Required | Default | Notes |
| --- | --- | --- | --- |
| `DATABASE_URL` | Yes | none | Must be a PostgreSQL connection string |
| `JWT_SECRET` | Yes | none | Must be at least 32 characters |
| `MANAGEMENT_API_KEY` | Yes | none | Must be at least 16 characters |
| `CLIPROXYAPI_MANAGEMENT_URL` | No | `http://cliproxyapi:8317/v0/management` | Used by management proxy routes |
| `NODE_ENV` | No | `development` | `development`, `production`, or `test` |
| `TZ` | No | `UTC` | Used in containers and runtime output |
| `JWT_EXPIRES_IN` | No | `7d` | Session token lifetime; accepted units are `s`, `m`, `h`, `d` |
| `CLIPROXYAPI_CONTAINER_NAME` | No | `cliproxyapi` | Used by container status and update operations |
| `LOG_LEVEL` | No | `info` | Pino log level |
| `PROVIDER_ENCRYPTION_KEY` | No | none | If unset, custom provider API keys cannot be re-decrypted for re-sync |

## Local Appliance Defaults

The local appliance flow is driven by root-level scripts and [`../docker-compose.local.yml`](../docker-compose.local.yml).

The scripts generate:

- root `.env`
- root `config.local.yaml`

The generated root `.env` contains only:

- `JWT_SECRET`
- `MANAGEMENT_API_KEY`
- `POSTGRES_PASSWORD`

The compose file injects the remaining dashboard runtime values directly.

Local appliance endpoints:

- dashboard on `http://localhost:3000`
- proxy API on `http://localhost:8317`
- local CLIProxyAPI management URL of `http://cliproxyapi:8317/v0/management` inside the compose network

## Source-Dev Defaults

[`../dashboard/.env.development`](../dashboard/.env.development) is copied to `dashboard/.env.local` by the source-dev scripts.

Current source-dev defaults:

| Variable | Value |
| --- | --- |
| `DATABASE_URL` | `postgresql://cliproxyapi:devpassword@localhost:5433/cliproxyapi` |
| `JWT_SECRET` | development placeholder |
| `CLIPROXYAPI_MANAGEMENT_URL` | `http://localhost:28317/v0/management` |
| `MANAGEMENT_API_KEY` | `devmanagementkey` |
| `DOCKER_HOST` | `auto` placeholder in `.env.development` |
| `CLIPROXYAPI_CONTAINER_NAME` | `cliproxyapi-dev-api` |
| `DASHBOARD_URL` | `http://localhost:3000` |
| `API_URL` | `http://localhost:28317` |
| `NODE_ENV` | `development` |
| `LOG_LEVEL` | `debug` |

Notes:

- The Bash source-dev script rewrites `DOCKER_HOST` from `auto` to a platform-appropriate value in `dashboard/.env.local`.
- The PowerShell source-dev script copies the file as-is; the current app code does not depend on `DOCKER_HOST`.

## Validation Notes

The app validates the core env schema at startup in [`../dashboard/src/lib/env.ts`](../dashboard/src/lib/env.ts).

If validation fails, the dashboard process exits early with a detailed error message naming the invalid variable.
