# Configuration

Canonical docs hub: [`docs/README.md`](README.md)

## Configuration Sources

The current architecture has three configuration layers:

| Layer | Location | Owned by |
| --- | --- | --- |
| Stack/runtime environment | `infrastructure/.env` | operator / `install.sh` |
| CLIProxyAPI runtime config | `infrastructure/config/config.yaml` | operator + dashboard config editor |
| Dashboard-local state | PostgreSQL | dashboard UI and APIs |

During local appliance setup the equivalents are:

- root `.env`
- root `config.local.yaml`

During source development the equivalents are:

- `dashboard/.env.local`
- `dashboard/config.dev.yaml`

## Environment Layer

The environment layer controls:

- PostgreSQL connection details
- JWT secret and session behavior
- management API authentication
- usage collector authentication
- provider secret encryption
- public dashboard and proxy URLs shown in the UI
- dashboard update-check repository and optional deploy webhook host

See the canonical variable reference in [`ENV.md`](ENV.md).

## CLIProxyAPI Runtime Config

`infrastructure/config/config.yaml` is the proxy runtime document mounted into the `cliproxyapi` container.

The dashboard config page currently manages or edits these groups.

### General Runtime

- `proxy-url`
- `auth-dir`
- `force-model-prefix`
- `debug`
- `commercial-mode`
- `ws-auth`
- `disable-cooling`
- `request-log`
- `passthrough-headers`
- `incognito-browser`

### Streaming and Retry

- `streaming.keepalive-seconds`
- `streaming.bootstrap-retries`
- `nonstream-keepalive-interval`
- `request-retry`
- `max-retry-interval`
- `max-retry-credentials`
- `quota-exceeded.switch-project`
- `quota-exceeded.switch-preview-model`
- `routing.strategy`

### Logging and Observability

- `logging-to-file`
- `logs-max-total-size-mb`
- `error-logs-max-files`
- `usage-statistics-enabled`
- `pprof.enable`
- `pprof.addr`

### TLS and Advanced Integrations

- `tls.enable`
- `tls.cert`
- `tls.key`
- `claude-header-defaults.*`
- `kiro-preferred-endpoint`
- `kiro`
- `ampcode.*`
- `payload.*`
- `oauth-model-alias`

The dashboard does not replace `config.yaml`; it acts as the control plane for the parts of that file that are actively managed by the UI.

## Dashboard-Local State

Some state is intentionally stored in PostgreSQL instead of `config.yaml`:

- users and admin roles
- session invalidation via `sessionVersion`
- dashboard-issued client API keys
- provider key ownership and OAuth ownership
- custom provider definitions and provider groups
- model preferences
- usage history and collector state
- audit logs
- global dashboard settings

The admin settings API currently allowlists one key:

- `max_provider_keys_per_user`

## Provider Surfaces

The current provider model is split across three surfaces.

### Direct Provider API Keys

- Claude
- Gemini
- OpenAI / Codex

OpenAI-compatible upstreams are modeled through custom providers instead of the direct-key cards.

### OAuth Providers

- Claude Code
- Gemini CLI
- Codex
- Antigravity
- iFlow
- Qwen Code

### Custom Providers

Custom provider records allow:

- display name + provider ID
- base URL
- encrypted API-key storage when `PROVIDER_ENCRYPTION_KEY` is configured
- optional prefix
- optional upstream proxy URL
- optional headers
- model alias mappings
- excluded-model patterns
- grouping and ordering via provider groups

## Update and Deployment Settings

The current update model has two separate flows:

| Flow | How it works |
| --- | --- |
| CLIProxyAPI update | Dashboard pulls a new `eceasy/cli-proxy-api` image and recreates the proxy container |
| Dashboard update | Dashboard checks `version.json` from `GITHUB_REPO`, then optionally triggers the external webhook deploy flow |

Relevant environment variables:

- `GITHUB_REPO`
- `WEBHOOK_HOST`
- `DEPLOY_SECRET`
- `DASHBOARD_URL`
- `API_URL`

## Health and Usage Collection

Two runtime behaviors are easy to miss:

- `GET /api/health` checks both PostgreSQL and the proxy root endpoint, not just the dashboard process.
- `POST /api/usage/collect` persists usage from the proxy into PostgreSQL and supports cron auth via `COLLECTOR_API_KEY`.

## Current Configuration Constraints

- The bundled stack assumes a single dashboard instance.
- `providerMutex` only protects concurrent provider operations inside one process.
- New code should prefer `GET /api/usage/history`; `GET /api/usage` is compatibility-only.
- The bundled deployment keeps the management plane private by design.
