# Troubleshooting

← [Back to README](../README.md)

## Services Not Starting

Check the service manager and compose state:

```bash
sudo systemctl status cliproxyapi-stack

cd infrastructure
docker compose ps
docker compose logs -f
```

## Database Connection Errors

### Password Authentication Failed (`28P01`)

This is usually caused by a mismatch between `POSTGRES_PASSWORD` and the password embedded in `DATABASE_URL`.

PostgreSQL only reads `POSTGRES_PASSWORD` during first-time volume initialization. Changing it later in `.env` does not update the database user automatically.

### Fix Option 1: Reset the Volume

This destroys local data.

```bash
# Local setup
docker compose -f docker-compose.local.yml down -v
./setup-local.sh

# Server setup
cd infrastructure
docker compose down -v
sudo systemctl start cliproxyapi-stack
```

### Fix Option 2: Update the PostgreSQL Password In Place

```bash
cd infrastructure
docker compose exec postgres psql -U cliproxyapi -d cliproxyapi -c \
  "ALTER USER cliproxyapi PASSWORD 'YOUR_NEW_PASSWORD_FROM_ENV';"
```

### Connectivity Checks

```bash
cd infrastructure
docker compose ps postgres
docker compose exec postgres pg_isready -U cliproxyapi
grep -E 'POSTGRES_PASSWORD|DATABASE_URL' .env
```

## Dashboard Not Loading

Verify the dashboard is healthy and reachable locally:

```bash
cd infrastructure
docker compose ps
docker compose logs dashboard
curl -I http://127.0.0.1:3000/api/health
```

Common causes:

- database not initialized
- invalid `JWT_SECRET`
- dashboard cannot reach PostgreSQL
- dashboard cannot reach CLIProxyAPI management API

## Proxy Not Reachable

Verify the proxy container and local bind:

```bash
cd infrastructure
docker compose logs cliproxyapi
curl -I http://127.0.0.1:8317/
```

If you are using your own reverse proxy, debug that layer separately. The bundled stack no longer manages TLS or public ingress.

## OAuth Callbacks Failing

OAuth flows still require callback ports to be reachable from the outside if you are authenticating against upstream providers on a server.

Check firewall and port exposure:

```bash
sudo ufw status numbered
nc -zv YOUR_SERVER_IP 8085
nc -zv YOUR_SERVER_IP 1455
nc -zv YOUR_SERVER_IP 54545
nc -zv YOUR_SERVER_IP 51121
nc -zv YOUR_SERVER_IP 11451
```

Check proxy logs:

```bash
cd infrastructure
docker compose logs -f cliproxyapi
```

## Port Already In Use

Because the stack binds to `127.0.0.1:3000` and `127.0.0.1:8317`, conflicts usually come from another local web service or proxy.

```bash
sudo lsof -i :3000
sudo lsof -i :8317
```

If OAuth callback ports fail to bind:

```bash
sudo lsof -i :8085
sudo lsof -i :1455
sudo lsof -i :54545
sudo lsof -i :51121
sudo lsof -i :11451
```

## Can't Login To Dashboard

There are no default credentials.

1. Visit the dashboard.
2. If no users exist, you will be redirected to `/setup`.
3. Create the first admin account.
4. After that, `/setup` is disabled.

If you need to reset the admin account:

```bash
cd infrastructure
docker compose exec postgres psql -U cliproxyapi -d cliproxyapi -c "DELETE FROM users;"
```
