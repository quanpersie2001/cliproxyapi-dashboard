# Runbook

Canonical docs hub: [`docs/README.md`](README.md)

## Health Checks

### Dashboard Health

```bash
curl -s http://127.0.0.1:3000/api/health
```

Current behavior:

- returns `200` with `status: "ok"` when both PostgreSQL and the proxy are reachable
- returns `503` with `status: "degraded"` when either dependency is unhealthy

### Stack State

```bash
cd infrastructure
./manage.sh ps
./manage.sh logs dashboard
./manage.sh logs cliproxyapi
```

## First Boot

1. Start the stack.
2. Open the dashboard.
3. If no users exist yet, the app redirects to `/setup`.
4. Create the first admin user.
5. Connect providers, configure proxy settings, and create client API keys.

## Usage Collection

The dashboard persists proxy usage into PostgreSQL through `POST /api/usage/collect`.

Manual trigger from the server:

```bash
curl -sf -X POST http://127.0.0.1:3000/api/usage/collect \
  -H "Authorization: Bearer $COLLECTOR_API_KEY"
```

Notes:

- `install.sh` configures a cron trigger every 5 minutes when `COLLECTOR_API_KEY` exists
- the collector uses a DB-backed single-flight lease and returns `202` when another run is already active
- the long-term analytics surface is `GET /api/usage/history`

## Updates

### Update CLIProxyAPI

From the UI:

- Dashboard -> Settings -> Provider / System operations -> update CLIProxyAPI

From the host, update the image and restart the service:

```bash
cd infrastructure
./manage.sh pull cliproxyapi
./manage.sh compose up -d --no-deps --force-recreate cliproxyapi
```

### Update Dashboard

Preferred path:

- configure the optional webhook documented in [`WEBHOOK-DEPLOY.md`](WEBHOOK-DEPLOY.md)
- trigger the dashboard deploy flow from the Settings page

Host-only equivalent:

```bash
cd infrastructure
./manage.sh dashboard-update
```

## Database Recovery Tasks

### Check connectivity

```bash
cd infrastructure
./manage.sh compose exec postgres pg_isready -U cliproxyapi
```

### Open `psql`

```bash
cd infrastructure
./manage.sh compose exec postgres psql -U cliproxyapi -d cliproxyapi
```

### Reset local source-dev database

```bash
cd dashboard
./dev-local.sh --reset
```

## Logs

### Runtime logs

```bash
cd infrastructure
./manage.sh logs dashboard
./manage.sh logs cliproxyapi
./manage.sh logs postgres
```

### Backup logs

```bash
tail -f backups/backup.log
```

### Deployment webhook logs

If the webhook flow is installed:

```bash
sudo journalctl -u webhook-deploy -f
cat /var/log/cliproxyapi/dashboard-deploy.log
```

## Common Escalation Paths

- If health is degraded because the database is unreachable, check for a `POSTGRES_PASSWORD` mismatch first.
- If the dashboard is up but provider operations fail, verify `CLIPROXYAPI_MANAGEMENT_URL` and `MANAGEMENT_API_KEY`.
- If dashboard update checks work but deploy fails, verify `WEBHOOK_HOST`, `DEPLOY_SECRET`, and the host-gateway mapping described in [`WEBHOOK-DEPLOY.md`](WEBHOOK-DEPLOY.md).
