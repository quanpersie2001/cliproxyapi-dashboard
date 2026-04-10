# Documentation Hub

This directory is the documentation source of truth for the current CLIProxyAPI Dashboard architecture.

## Architecture Summary

The repo is split into three operational layers:

| Layer | Location | Responsibility |
| --- | --- | --- |
| Dashboard app | `dashboard/` | Next.js 16 app, App Router UI, API routes, auth, Prisma, local source-dev workflow |
| Runtime stack | `infrastructure/` | Docker Compose deployment, proxy config, deploy webhook helper, server ops scripts |
| Maintenance scripts | `scripts/` | Backup, restore, and backup rotation helpers |

Current runtime topology:

```text
Browser
  -> Next.js dashboard (:3000)
      -> PostgreSQL
      -> CLIProxyAPI management API (:8317/v0/management)
      -> Docker socket proxy

CLIProxyAPI
  -> config.yaml
  -> auth volume
  -> logs volume

Usage collector
  -> POST /api/usage/collect
  -> persists usage history into PostgreSQL
```

Important constraints reflected in the current codebase:

- The dashboard is a proxy administration surface only.
- The bundled stack does not ship a public reverse proxy or TLS terminator.
- `providerMutex` is process-local only; it is not a distributed lock.
- `GET /api/usage` is compatibility-only and should not gain new consumers.
- Dashboard and main proxy API stay loopback-only in the bundled compose stack; only OAuth callback ports are published.

## Reading Order

### Getting Started

| Document | Use it for |
| --- | --- |
| [`INSTALLATION.md`](INSTALLATION.md) | Local quick start, source-dev vs appliance setup, server install |
| [`CONFIGURATION.md`](CONFIGURATION.md) | Where config lives and which settings the dashboard owns |
| [`ENV.md`](ENV.md) | Canonical environment variable reference |

### Operations

| Document | Use it for |
| --- | --- |
| [`SERVICE-MANAGEMENT.md`](SERVICE-MANAGEMENT.md) | `manage.sh`, compose, systemd, helper scripts |
| [`RUNBOOK.md`](RUNBOOK.md) | Routine operator tasks, health checks, updates, collector runs |
| [`BACKUP.md`](BACKUP.md) | Backup/restore workflow and retention |
| [`WEBHOOK-DEPLOY.md`](WEBHOOK-DEPLOY.md) | Optional dashboard image deploy webhook |
| [`UFW.md`](UFW.md) | UFW rules for OAuth callback traffic |
| [`SECURITY.md`](SECURITY.md) | Security posture and hardening notes |
| [`TROUBLESHOOTING.md`](TROUBLESHOOTING.md) | Known failure cases and recovery steps |

### Development

| Document | Use it for |
| --- | --- |
| [`../CONTRIBUTING.md`](../CONTRIBUTING.md) | Local development, test commands, contribution rules |
| [`ARCHITECTURE.md`](ARCHITECTURE.md) | System layout, runtime topology, route and API surfaces, data model overview |

## Script Entry Points

| Script | Scope | Notes |
| --- | --- | --- |
| [`../setup-local.sh`](../setup-local.sh) / [`../setup-local.ps1`](../setup-local.ps1) | Published-image local appliance | Creates root `.env` and `config.local.yaml`, then starts the bundled local stack |
| [`../dashboard/dev-local.sh`](../dashboard/dev-local.sh) / [`../dashboard/dev-local.ps1`](../dashboard/dev-local.ps1) | Source development | Starts Postgres + CLIProxyAPI for development and runs the Next.js dev server |
| [`../install.sh`](../install.sh) | Server install | Writes `infrastructure/.env`, installs systemd, optional UFW/backups/webhook |
| [`../infrastructure/manage.sh`](../infrastructure/manage.sh) | Production/runtime control | Wrapper around `docker compose` with project defaults |
| [`../scripts/backup.sh`](../scripts/backup.sh) | Backups | Archives DB dump, runtime config, auth volume, and optional stack files |

## Maintenance Notes

- If a guide conflicts with the code, the code wins.
- Generated analysis artifacts in the repo root or `references/` are supporting material only.
- Documentation changes should stay aligned with:
  - [`dashboard/prisma/schema.prisma`](../dashboard/prisma/schema.prisma)
  - [`infrastructure/docker-compose.yml`](../infrastructure/docker-compose.yml)
  - [`dashboard/package.json`](../dashboard/package.json)
