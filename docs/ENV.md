# Environment Variables

Canonical docs hub: [`docs/README.md`](README.md)

This file is the canonical environment variable reference for the current architecture.

## Bundled Stack Variables

These are the variables written by `install.sh` into `infrastructure/.env` for the bundled production compose stack.

| Variable | Required | Default / Example | Purpose |
| --- | --- | --- | --- |
| `DATABASE_URL` | Yes | `postgresql://cliproxyapi:pass@postgres:5432/cliproxyapi` | Dashboard database connection string |
| `POSTGRES_PASSWORD` | Yes | generated | Password used by the bundled `postgres` container on first volume initialization |
| `JWT_SECRET` | Yes | generated | Secret used for dashboard session signing |
| `MANAGEMENT_API_KEY` | Yes | generated | Bearer key used when the dashboard talks to the CLIProxyAPI management API |
| `COLLECTOR_API_KEY` | Recommended | generated | Bearer key accepted by `POST /api/usage/collect` for cron-based collection |
| `PROVIDER_ENCRYPTION_KEY` | Recommended | 64 hex chars | AES-256-GCM key used to persist custom-provider API keys for later re-sync |
| `CLIPROXYAPI_MANAGEMENT_URL` | No | `http://cliproxyapi:8317/v0/management` | Internal management API base URL |
| `INSTALL_DIR` | Yes | `/opt/cliproxyapi-dashboard` | Host path mounted into the dashboard container for compose-aware operations |
| `TZ` | No | `UTC` | Container timezone |
| `LOG_LEVEL` | No | `info` | Dashboard log verbosity |
| `DASHBOARD_URL` | No | `http://localhost:3000` | Public dashboard URL shown in UI links |
| `API_URL` | No | `http://localhost:8317` | Public proxy API URL shown in UI |
| `GITHUB_REPO` | No | `itsmylife44/cliproxyapi-dashboard` | Repo used for dashboard version checks via `version.json` |
| `WEBHOOK_HOST` | No | `http://host.docker.internal:9000` | Base URL of the optional dashboard deploy webhook service |
| `DEPLOY_SECRET` | No | generated when webhook is installed | Shared secret sent as `X-Deploy-Token` |

## Dashboard Runtime Variables

These are read by the Next.js app at runtime regardless of deployment style.

| Variable | Required | Default | Notes |
| --- | --- | --- | --- |
| `DATABASE_URL` | Yes | none | Validated by [`dashboard/src/lib/env.ts`](../dashboard/src/lib/env.ts) |
| `JWT_SECRET` | Yes | none | Must be at least 32 characters |
| `MANAGEMENT_API_KEY` | Yes | none | Must be at least 16 characters |
| `CLIPROXYAPI_MANAGEMENT_URL` | No | `http://cliproxyapi:8317/v0/management` | Used by management proxy routes |
| `NODE_ENV` | No | `development` | `development`, `production`, or `test` |
| `TZ` | No | `UTC` | Used in containers and runtime output |
| `JWT_EXPIRES_IN` | No | `7d` | Session token lifetime; accepted units are `s`, `m`, `h`, `d` |
| `CLIPROXYAPI_CONTAINER_NAME` | No | `cliproxyapi` | Used by container status/update operations |
| `LOG_LEVEL` | No | `info` | Pino log level |
| `PROVIDER_ENCRYPTION_KEY` | No | none | If unset, custom provider API keys cannot be re-decrypted for re-sync |

## Local Appliance Defaults

The root local appliance scripts generate:

- root `.env`
- root `config.local.yaml`

They currently set up:

- dashboard on `http://localhost:3000`
- proxy API on `http://localhost:8317`
- local CLIProxyAPI management URL of `http://cliproxyapi:8317/v0/management` inside the compose network

## Source-Dev Defaults

[`dashboard/.env.development`](../dashboard/.env.development) is copied to `dashboard/.env.local` by the source-dev scripts.

Current source-dev defaults:

| Variable | Value |
| --- | --- |
| `DATABASE_URL` | `postgresql://cliproxyapi:devpassword@localhost:5433/cliproxyapi` |
| `JWT_SECRET` | development placeholder |
| `CLIPROXYAPI_MANAGEMENT_URL` | `http://localhost:28317/v0/management` |
| `MANAGEMENT_API_KEY` | `devmanagementkey` |
| `CLIPROXYAPI_CONTAINER_NAME` | `cliproxyapi-dev-api` |
| `DASHBOARD_URL` | `http://localhost:3000` |
| `API_URL` | `http://localhost:28317` |
| `NODE_ENV` | `development` |
| `LOG_LEVEL` | `debug` |

Notes:

- The Bash source-dev script rewrites `DOCKER_HOST` from `auto` to a platform-appropriate value in `dashboard/.env.local`.
- The PowerShell source-dev script copies the file as-is; the current app code does not depend on `DOCKER_HOST`.

## Variables You Normally Do Not Set Manually

| Variable | Where it comes from |
| --- | --- |
| `DASHBOARD_VERSION` | image build arg in [`dashboard/Dockerfile`](../dashboard/Dockerfile) |
| `NEXT_PHASE` | Next.js build/runtime internals |
| `NEXT_RUNTIME` | Next.js route runtime internals |

## Validation Notes

The app currently validates environment variables at startup in [`dashboard/src/lib/env.ts`](../dashboard/src/lib/env.ts).

If validation fails, the dashboard process exits early with a detailed error message naming the invalid variable.
