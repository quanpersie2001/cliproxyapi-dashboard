# Operations

Canonical docs hub: [`docs/README.md`](README.md)

This guide is the operator-facing reference for lifecycle commands, health checks, updates, backup/restore, and the optional dashboard deploy webhook.

## Control Surfaces

| Entry point | Use it for |
| --- | --- |
| [`../infrastructure/manage.sh`](../infrastructure/manage.sh) | Bundled runtime stack control, backup, restore, image pulls |
| [`../setup-local.sh`](../setup-local.sh) / [`../setup-local.ps1`](../setup-local.ps1) | Local appliance lifecycle using published images |
| [`../dashboard/dev-local.sh`](../dashboard/dev-local.sh) / [`../dashboard/dev-local.ps1`](../dashboard/dev-local.ps1) | Source development lifecycle |
| [`../install.sh`](../install.sh) | Ubuntu/Debian provisioning, cron wiring, optional webhook install |

## First Boot Checklist

1. Start the stack.
2. Open the dashboard.
3. If there are no users yet, create the first admin account at `/setup`.
4. Add provider credentials or OAuth accounts.
5. Issue dashboard client API keys.
6. Review proxy settings and save any runtime changes from the Config page.

## Health Checks

### Dashboard Health

```bash
curl -s http://127.0.0.1:3000/api/health
```

Current behavior:

- returns `200` with `status: "ok"` when both PostgreSQL and the proxy are reachable
- returns `503` with `status: "degraded"` when either dependency is unavailable

### Bundled Stack State

```bash
cd infrastructure
./manage.sh ps
./manage.sh logs dashboard
./manage.sh logs cliproxyapi
```

### Local Appliance State

```bash
docker compose -f docker-compose.local.yml ps
docker compose -f docker-compose.local.yml logs -f
```

### Source-Dev State

```bash
cd dashboard
docker compose -f docker-compose.dev.yml ps
docker compose -f docker-compose.dev.yml logs -f
```

## `infrastructure/manage.sh`

Run from [`../infrastructure/`](../infrastructure/):

```bash
./manage.sh up
./manage.sh down
./manage.sh restart cliproxyapi
./manage.sh ps
./manage.sh logs dashboard
./manage.sh pull
./manage.sh pull dashboard
./manage.sh dashboard-update
./manage.sh backup
./manage.sh restore cliproxyapi_backup_YYYYMMDD_HHMMSS.tar.gz
./manage.sh rotate-backups 4
./manage.sh compose exec postgres psql -U cliproxyapi -d cliproxyapi
```

Current command surface:

- `up [services...]`
- `down`
- `restart [services...]`
- `ps`
- `logs [docker args...]`
- `pull [services...]`
- `dashboard-update`
- `backup`
- `restore <archive>`
- `rotate-backups [count]`
- `compose <args...>`

## Local Lifecycle Shortcuts

### Local Appliance

```bash
./setup-local.sh
./setup-local.sh --down
./setup-local.sh --reset
```

Current local appliance endpoints:

- Dashboard: `http://localhost:3000`
- Proxy API: `http://localhost:8317`

### Source Development

```bash
cd dashboard
./dev-local.sh
./dev-local.sh --down
./dev-local.sh --reset
```

Current source-dev endpoints:

- Dashboard: `http://localhost:3000`
- Proxy API: `http://localhost:28317`
- PostgreSQL: `localhost:5433`

Source-dev callback host ports also bind to loopback with dev-specific host ports:

- `28085 -> 8085`
- `21455 -> 1455`
- `24545 -> 54545`
- `21121 -> 51121`
- `21451 -> 11451`

## Usage Collection

The dashboard persists proxy usage into PostgreSQL through `POST /api/usage/collect`.

Manual trigger from the host:

```bash
curl -sf -X POST http://127.0.0.1:3000/api/usage/collect \
  -H "Authorization: Bearer $COLLECTOR_API_KEY"
```

Important behavior:

- `install.sh` installs a cron trigger every 5 minutes
- the generated cron job sources `infrastructure/.env` on each run so `COLLECTOR_API_KEY` rotations do not leave a stale bearer token in crontab
- concurrent runs are serialized through `collector_state`
- overlapping runs return `202` instead of double-processing
- long-term analytics are exposed via `GET /api/usage/history`

## Updates

### Update CLIProxyAPI

From the UI:

- Dashboard -> Settings -> Software Updates -> CLIProxyAPI

From the host:

```bash
cd infrastructure
./manage.sh pull cliproxyapi
./manage.sh compose up -d --no-deps --force-recreate cliproxyapi
```

Notes:

- the dashboard prefers compose-aware recreation when the compose file is available
- if compose is unavailable in the runtime, the app falls back to `docker run` recreation using the current container config snapshot

### Update the Dashboard Container

Host-only path:

```bash
cd infrastructure
./manage.sh dashboard-update
```

UI-triggered path:

- configure the optional dashboard deploy webhook described below
- use Dashboard -> Settings -> Dashboard Deployment

## Dashboard Deploy Webhook

The webhook flow is optional and only applies to dashboard image deployment from the UI.

This repo keeps a short alias at [`../infrastructure/WEBHOOK_SETUP.md`](../infrastructure/WEBHOOK_SETUP.md) because the dashboard UI references that path directly.

### Fastest Path

Run:

```bash
sudo ./install.sh
```

Answer yes to the webhook prompt. The installer will:

- install `webhook` if missing
- generate `DEPLOY_SECRET`
- render `/etc/webhook/hooks.yaml` from [`../infrastructure/webhook.yaml`](../infrastructure/webhook.yaml)
- install and start `webhook-deploy.service`
- append `WEBHOOK_HOST` and `DEPLOY_SECRET` to `infrastructure/.env`
- create `infrastructure/docker-compose.override.yml` with `host.docker.internal:host-gateway` when needed

### Manual Setup

1. Install `webhook`.

```bash
sudo apt-get update
sudo apt-get install -y webhook
```

2. Generate a deploy token.

```bash
openssl rand -hex 32
```

3. Render the hooks file.

```bash
INSTALL_DIR=/opt/cliproxyapi-dashboard
DEPLOY_SECRET=your-generated-token

sudo mkdir -p /etc/webhook
sudo sh -c "sed \
  -e 's|{{INSTALL_DIR}}|${INSTALL_DIR}|g' \
  -e 's|{{LOG_DIR}}|/var/log/cliproxyapi|g' \
  -e 's|{{DEPLOY_SECRET}}|${DEPLOY_SECRET}|g' \
  '${INSTALL_DIR}/infrastructure/webhook.yaml' > /etc/webhook/hooks.yaml"
sudo chmod 600 /etc/webhook/hooks.yaml
```

4. Add runtime values to `infrastructure/.env`.

```env
WEBHOOK_HOST=http://host.docker.internal:9000
DEPLOY_SECRET=your-generated-token
```

5. Ensure the dashboard container can resolve `host.docker.internal`.

```yaml
services:
  dashboard:
    extra_hosts:
      - "host.docker.internal:host-gateway"
```

6. Install a `systemd` unit.

```ini
[Unit]
Description=Webhook Deploy Service for CLIProxyAPI Dashboard
After=network.target

[Service]
Type=simple
ExecStart=/usr/bin/webhook -hooks /etc/webhook/hooks.yaml -port 9000 -verbose
Restart=on-failure
RestartSec=5
User=root
Group=root

[Install]
WantedBy=multi-user.target
```

7. Enable and start it.

```bash
sudo systemctl daemon-reload
sudo systemctl enable webhook-deploy
sudo systemctl start webhook-deploy
```

### Verify the Webhook Flow

```bash
sudo systemctl status webhook-deploy
cat /var/log/cliproxyapi/dashboard-deploy-status.json
cat /var/log/cliproxyapi/dashboard-deploy.log
```

From the UI, open Settings and trigger Dashboard Deployment.

## Backup and Restore

Backups are managed through [`../infrastructure/manage.sh`](../infrastructure/manage.sh).

### Create a Backup

```bash
cd infrastructure
./manage.sh backup
```

Backups are stored under:

```text
backups/cliproxyapi_backup_YYYYMMDD_HHMMSS.tar.gz
```

The current backup flow includes:

- PostgreSQL dump
- `infrastructure/config/config.yaml`
- `infrastructure/.env` snapshot
- `infrastructure/docker-compose.override.yml` snapshot when present
- auth-dir volume snapshot when the auth volume exists

### Restore a Backup

```bash
cd infrastructure
./manage.sh restore cliproxyapi_backup_20260411_020000.tar.gz
```

Current restore flow:

1. extracts the archive to a temp directory
2. restores `.env` only if one does not already exist
3. restores `docker-compose.override.yml` only if one does not already exist
4. stops the stack
5. starts PostgreSQL
6. recreates the `public` schema
7. imports the SQL dump
8. restores `config.yaml`
9. restores the auth volume when present
10. brings the stack back up with `--wait`

### Rotate Backups

```bash
cd infrastructure
./manage.sh rotate-backups 4
```

### Automated Backups

When enabled by `install.sh`:

- daily backup uses `0 2 * * *`
- weekly backup uses `0 2 * * 0`
- rotation runs after each backup

Check the installed cron jobs with:

```bash
sudo crontab -l
```

## Quick Recovery Notes

- If health is degraded because the database is unreachable, verify the current `POSTGRES_PASSWORD` matches the initialized database.
- If update, monitoring, or container pages fail, verify `docker-proxy` is healthy and `DOCKER_HOST` is set correctly in the dashboard container.
- If the UI can check for dashboard updates but cannot deploy them, re-check `WEBHOOK_HOST`, `DEPLOY_SECRET`, and the host-gateway mapping.
