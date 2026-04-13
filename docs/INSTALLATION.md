# Installation

Canonical docs hub: [`docs/README.md`](README.md)

## Deployment Modes

This repo supports three distinct ways to run the project:

| Mode | Primary script | Best for |
| --- | --- | --- |
| Local appliance stack | [`../setup-local.sh`](../setup-local.sh) / [`../setup-local.ps1`](../setup-local.ps1) | Running the published dashboard image locally with minimal setup |
| Source development | [`../dashboard/dev-local.sh`](../dashboard/dev-local.sh) / [`../dashboard/dev-local.ps1`](../dashboard/dev-local.ps1) | Working on dashboard code from this checkout |
| Server install | [`../install.sh`](../install.sh) | Provisioning the bundled production compose stack on Ubuntu/Debian, with or without pre-cloning the repo |

## Bundled Stack Topology

The bundled runtime stack contains:

- `dashboard` on `127.0.0.1:3000`
- `cliproxyapi` on `127.0.0.1:8317`
- `postgres` on the internal Docker network
- `docker-proxy` on the internal Docker network

Published OAuth callback ports:

- `8085`
- `1455`
- `54545`
- `51121`
- `11451`

The Docker stack itself does not include a public ingress container. The repo ships [`../infrastructure/nginx/cliproxyapi-dashboard.http.conf.template`](../infrastructure/nginx/cliproxyapi-dashboard.http.conf.template), and `install.sh` can optionally install Nginx plus render `/etc/nginx/sites-available/cliproxyapi-dashboard.conf` as an HTTP reverse proxy starter for the split-host layout:

- dashboard hostname -> `127.0.0.1:3000`
- API hostname -> `127.0.0.1:8317`

TLS certificate provisioning remains outside the bundled stack.

## Option 1: Local Appliance Setup

Use the root setup scripts when you want the full stack quickly without building the dashboard from source.

### Prerequisites

- Docker Desktop (macOS/Windows) or Docker Engine + Compose plugin (Linux)
- `openssl` for the Bash setup script

### Commands

```bash
git clone https://github.com/quanpersie2001/cliproxyapi-dashboard.git
cd cliproxyapi-dashboard
./setup-local.sh
```

Windows:

```powershell
git clone https://github.com/quanpersie2001/cliproxyapi-dashboard.git
cd cliproxyapi-dashboard
.\setup-local.ps1
```

What the script does:

- creates a root `.env` containing `JWT_SECRET`, `MANAGEMENT_API_KEY`, and `POSTGRES_PASSWORD`
- creates `config.local.yaml` with a local CLIProxyAPI config and a generated local API key if the file does not already exist
- starts [`../docker-compose.local.yml`](../docker-compose.local.yml)
- waits for `postgres`, `cliproxyapi`, `docker-proxy`, and `dashboard` to become healthy

Local appliance endpoints:

- Dashboard: `http://localhost:3000`
- Proxy API: `http://localhost:8317`

Lifecycle helpers:

```bash
./setup-local.sh --down
./setup-local.sh --reset
```

`--reset` removes volumes and deletes the generated root `.env` plus `config.local.yaml`.

## Option 2: Source Development

Use the source-dev scripts when you want to modify the Next.js app from this checkout.

### Prerequisites

- Node.js 20+
- npm
- Docker Desktop or Docker Engine + Compose plugin

### Commands

```bash
cd dashboard
./dev-local.sh
```

Windows:

```powershell
cd dashboard
.\dev-local.ps1
```

What the source-dev script does:

- starts [`../dashboard/docker-compose.dev.yml`](../dashboard/docker-compose.dev.yml)
- waits for PostgreSQL and CLIProxyAPI
- creates `dashboard/config.dev.yaml` from [`../dashboard/config.dev.yaml.example`](../dashboard/config.dev.yaml.example) when needed
- runs `prisma migrate deploy`
- generates the Prisma client
- writes `dashboard/.env.local`
- starts `npm run dev`

Source-dev endpoints:

- Dashboard: `http://localhost:3000`
- Proxy API: `http://localhost:28317`
- PostgreSQL: `localhost:5433`

Source-dev callback host ports:

- `28085`
- `21455`
- `24545`
- `21121`
- `21451`

Lifecycle helpers:

```bash
cd dashboard
./dev-local.sh --down
./dev-local.sh --reset
```

## Option 3: Server Install

[`../install.sh`](../install.sh) is the single server installer for Ubuntu/Debian hosts with root access. It can run directly from a repo checkout, or as a one-file bootstrap that installs a minimal production bundle into `INSTALL_DIR` before continuing.

### Prerequisites

- Ubuntu 20.04+ or Debian 11+
- root or `sudo`
- outbound network access for package and image downloads
- optional public reachability for OAuth callback ports if provider logins will happen remotely

### Commands

```bash
curl -fsSL https://raw.githubusercontent.com/quanpersie2001/cliproxyapi-dashboard/main/install.sh | sudo bash
```

Default install location:

- `/opt/cliproxyapi-dashboard`

URL prompt behavior:

- you can enter a full URL such as `https://dash.example.com`
- or enter only a hostname such as `dash.example.com`; the installer will normalize it to `https://dash.example.com`
- local addresses such as `localhost:3000` are normalized to `http://localhost:3000`

Optional overrides:

- `INSTALL_DIR=/srv/cliproxyapi-dashboard` to change the target directory
- `CLIPROXYAPI_DASHBOARD_REF=dashboard-vX.Y.Z` to pin a tag instead of `main`

Example with a custom install path:

```bash
curl -fsSL https://raw.githubusercontent.com/quanpersie2001/cliproxyapi-dashboard/main/install.sh \
  | sudo env INSTALL_DIR=/srv/cliproxyapi-dashboard bash
```

If you already cloned the repo onto the server, you can also run:

```bash
sudo ./install.sh
```

The installer currently:

1. Detects Ubuntu/Debian and installs Docker Engine + Compose if needed.
2. Ensures the minimal deployment bundle exists in `INSTALL_DIR` by using the local checkout or downloading it when needed.
3. Prompts for public dashboard and API URLs.
4. Optionally installs and configures Nginx with a split-host HTTP reverse proxy config when the dashboard and API URLs use distinct hostnames rooted at `/`.
5. Optionally configures firewall rules for OAuth callback ports and the Nginx HTTP listener.
6. Generates `JWT_SECRET`, `MANAGEMENT_API_KEY`, `POSTGRES_PASSWORD`, `COLLECTOR_API_KEY`, and `PROVIDER_ENCRYPTION_KEY`.
7. Writes `infrastructure/.env`.
8. Optionally installs backup cron jobs, the usage collector cron, and the dashboard deploy webhook.

Installed files are intentionally limited to:

- `install.sh`
- `infrastructure/`
- generated runtime files such as `infrastructure/.env`, `infrastructure/docker-compose.override.yml`, and `backups/`

After install:

```bash
cd infrastructure
./manage.sh up
./manage.sh ps
```

Installer-managed Nginx notes:

- the generated site config lives at `/etc/nginx/sites-available/cliproxyapi-dashboard.conf`
- the current template is HTTP-only and expects separate dashboard and API hostnames
- if you use `https://...` public URLs, you still need to add certificate handling yourself or place another TLS terminator in front

## Manual Server Installation

Use this if you do not want the interactive `install.sh` flow.

### 1. Install Docker

Install Docker Engine and the Docker Compose plugin for your distribution.

### 2. Create `infrastructure/.env`

```bash
JWT_SECRET="$(openssl rand -base64 32)"
MANAGEMENT_API_KEY="$(openssl rand -hex 32)"
POSTGRES_PASSWORD="$(openssl rand -hex 32)"
COLLECTOR_API_KEY="$(openssl rand -hex 32)"
PROVIDER_ENCRYPTION_KEY="$(openssl rand -hex 32)"

cat > infrastructure/.env <<EOF
DATABASE_URL=postgresql://cliproxyapi:${POSTGRES_PASSWORD}@postgres:5432/cliproxyapi
POSTGRES_PASSWORD=${POSTGRES_PASSWORD}

JWT_SECRET=${JWT_SECRET}
MANAGEMENT_API_KEY=${MANAGEMENT_API_KEY}
COLLECTOR_API_KEY=${COLLECTOR_API_KEY}
PROVIDER_ENCRYPTION_KEY=${PROVIDER_ENCRYPTION_KEY}

CLIPROXYAPI_MANAGEMENT_URL=http://cliproxyapi:8317/v0/management

INSTALL_DIR=$(pwd)
TZ=UTC
LOG_LEVEL=info

DASHBOARD_URL=http://localhost:3000
API_URL=http://localhost:8317
EOF

chmod 600 infrastructure/.env
```

### 3. Review `infrastructure/config/config.yaml`

`config.yaml` is the runtime config consumed by CLIProxyAPI. The dashboard can edit large parts of this file later, but the initial file still needs to exist.

### 4. Optional: Install Nginx and render the bundled split-host template

```bash
sudo apt-get update
sudo apt-get install -y nginx

sudo sed \
  -e 's|{{DASHBOARD_SERVER_NAME}}|llm-dashboard.example.com|g' \
  -e 's|{{API_SERVER_NAME}}|llm-api.example.com|g' \
  -e 's|{{DASHBOARD_UPSTREAM}}|127.0.0.1:3000|g' \
  -e 's|{{API_UPSTREAM}}|127.0.0.1:8317|g' \
  infrastructure/nginx/cliproxyapi-dashboard.http.conf.template \
  | sudo tee /etc/nginx/sites-available/cliproxyapi-dashboard.conf >/dev/null

sudo ln -sfn \
  /etc/nginx/sites-available/cliproxyapi-dashboard.conf \
  /etc/nginx/sites-enabled/cliproxyapi-dashboard.conf

sudo nginx -t
sudo systemctl restart nginx
```

This template intentionally keeps:

- the dashboard hostname pointed at `127.0.0.1:3000`
- the public API hostname pointed at `127.0.0.1:8317`
- `/v0/management/*` blocked on the public API hostname

### 5. Start the stack

```bash
cd infrastructure
./manage.sh up
```

### 6. Create the first admin account

Visit the dashboard. If there are no users yet, you will be redirected to `/setup`.

After the first admin is created:

- `/setup` is no longer the normal entrypoint
- standard login flow is enabled

## Next Documents

After installation, the next documents to read are usually:

- [`CONFIGURATION.md`](CONFIGURATION.md)
- [`ENV.md`](ENV.md)
- [`OPERATIONS.md`](OPERATIONS.md)
- [`SECURITY.md`](SECURITY.md)
