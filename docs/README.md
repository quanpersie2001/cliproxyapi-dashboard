# Documentation Hub

This directory is the canonical documentation set for the active CLIProxyAPI Dashboard codebase.

## Recommended Reading Order

| Document | Use it for |
| --- | --- |
| [`INSTALLATION.md`](INSTALLATION.md) | Choose a deployment mode and get the stack running |
| [`CONFIGURATION.md`](CONFIGURATION.md) | Understand where config lives and what the dashboard owns |
| [`ENV.md`](ENV.md) | See which environment variables are required, optional, generated, or defaulted |
| [`FEATURES.md`](FEATURES.md) | Learn the actual UI/product surfaces and access model |
| [`OPERATIONS.md`](OPERATIONS.md) | Day-2 operations: health, updates, backup/restore, webhook deploy |
| [`SECURITY.md`](SECURITY.md) | Security posture, firewall expectations, and secret handling |
| [`TROUBLESHOOTING.md`](TROUBLESHOOTING.md) | Common failure cases and recovery steps |
| [`ARCHITECTURE.md`](ARCHITECTURE.md) | Technical system view, route groups, data model, and module layout |
| [`../CONTRIBUTING.md`](../CONTRIBUTING.md) | Local development workflow and contribution rules |

## Canonical Set

| Document | Role |
| --- | --- |
| [`FEATURES.md`](FEATURES.md) | Product and page-level overview |
| [`ARCHITECTURE.md`](ARCHITECTURE.md) | Technical system map |
| [`INSTALLATION.md`](INSTALLATION.md) | Local, source-dev, and server setup |
| [`CONFIGURATION.md`](CONFIGURATION.md) | Config layers and managed settings |
| [`ENV.md`](ENV.md) | Environment variable reference |
| [`OPERATIONS.md`](OPERATIONS.md) | Runtime operations and lifecycle commands |
| [`SECURITY.md`](SECURITY.md) | Security and firewall guidance |
| [`TROUBLESHOOTING.md`](TROUBLESHOOTING.md) | Recovery guide |

## Script Entry Points

| Script | Scope | Notes |
| --- | --- | --- |
| [`../setup-local.sh`](../setup-local.sh) / [`../setup-local.ps1`](../setup-local.ps1) | Published-image local appliance | Creates root `.env` and `config.local.yaml`, then starts the bundled local stack |
| [`../apps/dashboard/tools/dev/dev-local.sh`](../apps/dashboard/tools/dev/dev-local.sh) / [`../apps/dashboard/tools/dev/dev-local.ps1`](../apps/dashboard/tools/dev/dev-local.ps1) | Source development | Starts PostgreSQL + CLIProxyAPI for development and runs the Next.js dev server |
| [`../install.sh`](../install.sh) | Server install | Single server installer; can run from a checkout or as a one-file bootstrap, writes `infrastructure/.env`, can install Nginx plus a split-host ingress config, can install backup cron jobs, and optionally installs the webhook flow |
| [`../infrastructure/manage.sh`](../infrastructure/manage.sh) | Bundled runtime control | Wrapper around `docker compose` plus backup/restore operations |
| [`../infrastructure/WEBHOOK_SETUP.md`](../infrastructure/WEBHOOK_SETUP.md) | UI-linked webhook alias | Redirects to the canonical webhook section in [`OPERATIONS.md`](OPERATIONS.md) |

## Ingress Assets

| File | Role |
| --- | --- |
| [`../infrastructure/nginx/cliproxyapi-dashboard.http.conf.template`](../infrastructure/nginx/cliproxyapi-dashboard.http.conf.template) | Split-host HTTP Nginx reverse proxy starter for `dashboard` and the public proxy API |

## Workspace Notes

- `apps/dashboard/` remains the primary app workspace; root scripts are workspace-level proxies.
- `apps/dashboard/scripts/runtime/` is the runtime-script boundary for dashboard container bootstrap and collector runtime assets.
- `apps/dashboard/tools/dev/` is the local source-dev orchestration boundary (`dev-local.*`, `docker-compose.dev.yml`, dev config templates).
- `npm run build:collector` from the repo root delegates to the dashboard workspace collector build.
- `apps/dashboard/src/server/jobs/workers/usage-collector/` is the embedded worker source boundary for usage ingestion runtime code packaged into the dashboard image.
- `packages/*` is an active shared-module boundary (`api-contracts`, `auth-contracts`, `config`, `db`, `logger`, `shared`, `usage-contracts`).
- Keep Next instrumentation entrypoints in `apps/dashboard/src/instrumentation.ts` and `apps/dashboard/src/instrumentation-node.ts`; they are load-bearing for runtime instrumentation hooks.

## Maintenance Notes

- If a guide conflicts with the code, the code wins.
- Historical snapshots under `references/` are not source of truth for the active repo.
- Generated analysis artifacts are supporting material only.
- Documentation changes should stay aligned with:
  - [`../apps/dashboard/prisma/schema.prisma`](../apps/dashboard/prisma/schema.prisma)
  - [`../infrastructure/docker-compose.yml`](../infrastructure/docker-compose.yml)
  - [`../apps/dashboard/package.json`](../apps/dashboard/package.json)
