# Security

Canonical docs hub: [`docs/README.md`](README.md)

## Current Security Posture

The bundled architecture intentionally limits exposure:

- dashboard binds to `127.0.0.1:3000`
- main proxy API binds to `127.0.0.1:8317`
- PostgreSQL stays on the internal Docker network
- the management API is consumed internally by the dashboard
- Docker access is mediated through `tecnativa/docker-socket-proxy`

Only OAuth callback ports are published by default.

## Hardening Checklist

1. Protect `infrastructure/.env`.

```bash
chmod 600 infrastructure/.env
```

2. Keep the management plane private.

- Do not expose `CLIPROXYAPI_MANAGEMENT_URL` publicly.
- Put your own reverse proxy in front of the loopback dashboard/proxy ports if you need remote access.

3. Terminate TLS outside the bundled stack.

- The bundled stack does not provision certificates.
- If you expose the dashboard or proxy publicly, enforce HTTPS at your own ingress layer.

4. Rotate secrets periodically.

Relevant secrets:

- `JWT_SECRET`
- `MANAGEMENT_API_KEY`
- `COLLECTOR_API_KEY`
- `PROVIDER_ENCRYPTION_KEY`
- `DEPLOY_SECRET`

5. Configure firewall rules only for what you actually use.

- always allow SSH first
- only open OAuth callback ports when remote OAuth logins are needed
- keep `3000` and `8317` private unless deliberately fronted by another layer

6. Use `PROVIDER_ENCRYPTION_KEY`.

Without it, custom provider API keys cannot be re-decrypted for re-sync after process restarts.

7. Review logs and health checks.

```bash
cd infrastructure
./manage.sh logs dashboard
./manage.sh logs cliproxyapi
curl -s http://127.0.0.1:3000/api/health
```

8. Protect backups.

- store them outside the primary host
- encrypt them when moving to remote storage
- test restore procedures

## Application-Level Notes

- Sessions use signed JWT cookies and are invalidated by `sessionVersion`.
- Cookie `secure` is enabled automatically in production when requests are served over HTTPS through a reverse proxy.
- `GET /api/health` checks both the database and the proxy, so it is a better signal than checking only whether the web process is alive.
- Provider ownership, audit logs, usage history, and system settings are persisted in PostgreSQL.

## Known Architectural Constraint

`providerMutex` is in-process only. It protects concurrent provider updates inside one dashboard process, but it is not safe as a distributed lock for multi-instance deployments.
