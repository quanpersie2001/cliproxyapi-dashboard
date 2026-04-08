# Installation Guide

← [Back to README](../README.md)

## Overview

The bundled stack is now proxy-only:

- `dashboard` on `127.0.0.1:3000`
- `cliproxyapi` on `127.0.0.1:8317`
- `postgres` on the internal Docker network
- `docker-proxy` on the internal Docker network

The stack does **not** include a bundled public TLS or ingress layer. If you want public HTTPS access, put your own reverse proxy or ingress in front of the loopback endpoints.

## Prerequisites

### Local Use

- Docker Desktop

### Server Deployment

- Ubuntu 20.04+ or Debian 11+
- root or `sudo`
- Docker Engine with Compose plugin
- Optional: your own reverse proxy or ingress if you want public access
- Optional: public reachability for OAuth callback ports if you use OAuth providers remotely

OAuth callback ports:

- `8085`
- `1455`
- `54545`
- `51121`
- `11451`

## Quick Start

### Local

```bash
git clone https://github.com/itsmylife44/cliproxyapi-dashboard.git
cd cliproxyapi-dashboard
./setup-local.sh
```

Open `http://localhost:3000`, create the first admin account, then connect providers and create client API keys.

Useful local commands:

```bash
./setup-local.sh --down
./setup-local.sh --reset
```

### Server

```bash
git clone https://github.com/itsmylife44/cliproxyapi-dashboard.git
cd cliproxyapi-dashboard
sudo ./install.sh
```

The installer:

1. installs Docker if needed
2. generates secrets
3. writes `infrastructure/.env`
4. installs a `systemd` unit
5. optionally configures backups and the deploy webhook

Then start the stack:

```bash
sudo systemctl start cliproxyapi-stack
sudo systemctl status cliproxyapi-stack
```

## Public Access

By default, the stack binds dashboard and proxy to loopback only:

- `http://127.0.0.1:3000`
- `http://127.0.0.1:8317`

For public access, configure your own reverse proxy to forward to those local ports.

Example upstream targets:

- dashboard upstream: `127.0.0.1:3000`
- proxy upstream: `127.0.0.1:8317`

You should also set these in `infrastructure/.env` so the UI shows correct external links:

- `DASHBOARD_URL`
- `API_URL`

## Manual Installation

### 1. Install Docker

Install Docker Engine and the Docker Compose plugin for your distribution.

### 2. Create `infrastructure/.env`

```bash
JWT_SECRET=$(openssl rand -base64 32)
MANAGEMENT_API_KEY=$(openssl rand -hex 32)
POSTGRES_PASSWORD=$(openssl rand -hex 32)
COLLECTOR_API_KEY=$(openssl rand -hex 32)

cat > infrastructure/.env << EOF
DATABASE_URL=postgresql://cliproxyapi:${POSTGRES_PASSWORD}@postgres:5432/cliproxyapi
POSTGRES_PASSWORD=${POSTGRES_PASSWORD}
JWT_SECRET=${JWT_SECRET}
MANAGEMENT_API_KEY=${MANAGEMENT_API_KEY}
COLLECTOR_API_KEY=${COLLECTOR_API_KEY}
CLIPROXYAPI_MANAGEMENT_URL=http://cliproxyapi:8317/v0/management
INSTALL_DIR=$(pwd)
TZ=UTC
LOG_LEVEL=info
DASHBOARD_URL=http://localhost:3000
API_URL=http://localhost:8317
EOF

chmod 600 infrastructure/.env
```

### 3. Start The Stack

```bash
cd infrastructure
docker compose up -d --wait
```

### 4. Create The First Admin Account

Visit the dashboard. If no users exist, you will be redirected to `/setup`.

After the first admin is created:

- `/setup` is disabled
- you can log in normally
- provider and API-key management becomes available

## Firewall Guidance

Recommended:

- allow SSH
- allow OAuth callback ports only if you need remote OAuth login flows
- keep `3000` and `8317` private unless you intentionally expose them through another layer

Example UFW rules:

```bash
sudo ufw limit 22/tcp
sudo ufw allow 8085/tcp
sudo ufw allow 1455/tcp
sudo ufw allow 54545/tcp
sudo ufw allow 51121/tcp
sudo ufw allow 11451/tcp
sudo ufw enable
```
