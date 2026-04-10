# Service Management

Canonical docs hub: [`docs/README.md`](README.md)

## Primary Control Scripts

| Script | Use it for |
| --- | --- |
| [`../infrastructure/manage.sh`](../infrastructure/manage.sh) | Production/runtime compose wrapper |
| [`../setup-local.sh`](../setup-local.sh) / [`../setup-local.ps1`](../setup-local.ps1) | Local appliance lifecycle |
| [`../dashboard/dev-local.sh`](../dashboard/dev-local.sh) / [`../dashboard/dev-local.ps1`](../dashboard/dev-local.ps1) | Source-dev lifecycle |
| [`../scripts/backup.sh`](../scripts/backup.sh) | Stack backup |

## `infrastructure/manage.sh`

`manage.sh` is the preferred entry point for the bundled runtime stack because it always uses the checked-in compose file and `infrastructure/.env`.

Run from [`infrastructure/`](../infrastructure/):

```bash
./manage.sh up
./manage.sh down
./manage.sh restart
./manage.sh restart cliproxyapi
./manage.sh ps
./manage.sh logs
./manage.sh logs dashboard
./manage.sh pull
./manage.sh pull dashboard
./manage.sh dashboard-update
./manage.sh compose exec postgres psql -U cliproxyapi -d cliproxyapi
```

Current command surface from the script:

- `up [services...]`
- `down`
- `restart [services...]`
- `ps`
- `logs [docker args...]`
- `pull [services...]`
- `dashboard-update`
- `compose <args...>`

## `systemd`

`install.sh` installs `cliproxyapi-stack.service`.

Common commands:

```bash
sudo systemctl start cliproxyapi-stack
sudo systemctl stop cliproxyapi-stack
sudo systemctl restart cliproxyapi-stack
sudo systemctl status cliproxyapi-stack
sudo systemctl enable cliproxyapi-stack
sudo systemctl disable cliproxyapi-stack
```

## Local Appliance Lifecycle

The root setup scripts manage the published-image local stack.

```bash
./setup-local.sh
./setup-local.sh --down
./setup-local.sh --reset
```

Current local appliance endpoints:

- Dashboard: `http://localhost:3000`
- Proxy API: `http://localhost:8317`

## Source-Dev Lifecycle

The source-dev scripts manage PostgreSQL + CLIProxyAPI for development and run the Next.js app from source.

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

## Current Exposed Ports

Bundled production compose:

- loopback only:
  - `127.0.0.1:3000` dashboard
  - `127.0.0.1:8317` proxy API
- externally published callback ports:
  - `8085`
  - `1455`
  - `54545`
  - `51121`
  - `11451`

## Notes

- The dashboard update path is different from the proxy update path.
- Proxy updates are done from the dashboard by pulling a new CLIProxyAPI image and recreating the proxy container.
- Dashboard updates require the optional webhook flow documented in [`WEBHOOK-DEPLOY.md`](WEBHOOK-DEPLOY.md).
