# Troubleshooting

Canonical docs hub: [`docs/README.md`](README.md)

## Start With Health

```bash
curl -s http://127.0.0.1:3000/api/health
```

The current health route checks both PostgreSQL and the proxy. If it reports `degraded`, investigate the dependency named in the response.

## Database Connection Errors

### Symptom: `28P01` or password authentication failed

Cause:

- `POSTGRES_PASSWORD` in `.env` changed after the database volume was initialized

Why this happens:

- PostgreSQL only consumes `POSTGRES_PASSWORD` during first-time cluster creation
- later changes do not rewrite the database user's stored password

### Fix Option 1: reset the volume

This destroys data.

```bash
# Local appliance
docker compose -f docker-compose.local.yml down -v
./setup-local.sh

# Bundled runtime stack
cd infrastructure
./manage.sh compose down -v
./manage.sh up
```

### Fix Option 2: align the database password with `.env`

```bash
cd infrastructure
./manage.sh compose exec postgres psql -U cliproxyapi -d cliproxyapi -c \
  "ALTER USER cliproxyapi PASSWORD 'YOUR_PASSWORD_FROM_ENV';"
```

## Dashboard Does Not Load

Check:

```bash
cd infrastructure
./manage.sh ps
./manage.sh logs dashboard
curl -I http://127.0.0.1:3000/api/health
```

Common causes:

- invalid `DATABASE_URL`
- invalid `JWT_SECRET`
- PostgreSQL unavailable
- proxy unavailable
- environment validation failure in `dashboard/src/lib/env.ts`

## Proxy Not Reachable

```bash
cd infrastructure
./manage.sh logs cliproxyapi
curl -I http://127.0.0.1:8317/
```

If the UI is up but provider/config actions fail:

- verify `CLIPROXYAPI_MANAGEMENT_URL`
- verify `MANAGEMENT_API_KEY`
- confirm the proxy container is healthy

## Source-Dev Environment Fails

### Prisma or schema drift issues

```bash
cd dashboard
./dev-local.sh --reset
```

The source-dev script already contains recovery logic for the known local migration drift `20260329_add_custom_provider_encrypted_key`.

### Build errors after switching branches

```bash
cd dashboard
npx prisma generate
npm install
npm run typecheck
```

## Local Appliance Setup Confusion

The current local appliance stack uses:

- dashboard on `http://localhost:3000`
- proxy API on `http://localhost:8317`

If you were expecting `11451`, that is an OAuth callback port, not the main API endpoint.

## OAuth Callback Problems

Remote OAuth flows require callback ports to be reachable from outside the host.

Check:

```bash
sudo ufw status numbered
nc -zv YOUR_SERVER_IP 8085
nc -zv YOUR_SERVER_IP 1455
nc -zv YOUR_SERVER_IP 54545
nc -zv YOUR_SERVER_IP 51121
nc -zv YOUR_SERVER_IP 11451
```

Also inspect proxy logs:

```bash
cd infrastructure
./manage.sh logs cliproxyapi
```

## Dashboard Deploy Webhook Problems

If dashboard update checks work but the deploy action fails:

- verify `WEBHOOK_HOST`
- verify `DEPLOY_SECRET`
- verify the webhook service is running
- verify `host.docker.internal:host-gateway` is available to the dashboard container when required

Useful checks:

```bash
sudo systemctl status webhook-deploy
cat /var/log/cliproxyapi/dashboard-deploy-status.json
cat /var/log/cliproxyapi/dashboard-deploy.log
```

## Port Already In Use

Bundled runtime ports:

- `3000`
- `8317`
- `8085`
- `1455`
- `54545`
- `51121`
- `11451`

Check conflicts:

```bash
sudo lsof -i :3000
sudo lsof -i :8317
sudo lsof -i :8085
sudo lsof -i :1455
sudo lsof -i :54545
sudo lsof -i :51121
sudo lsof -i :11451
```

## Cannot Log In

There are no default credentials.

Expected flow:

1. Visit the dashboard.
2. If no users exist, the app redirects to `/setup`.
3. Create the first admin user.

If you need to reset local users entirely:

```bash
cd infrastructure
./manage.sh compose exec postgres psql -U cliproxyapi -d cliproxyapi -c "DELETE FROM users;"
```
