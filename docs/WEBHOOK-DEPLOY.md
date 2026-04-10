# Dashboard Deploy Webhook

Canonical docs hub: [`docs/README.md`](README.md)

The dashboard image update flow is optional and external to the core compose stack. It relies on the `webhook` utility plus [`infrastructure/deploy.sh`](../infrastructure/deploy.sh).

## What It Does

When configured, the dashboard can:

- trigger `POST /api/admin/deploy`
- call the external webhook service
- pull the latest published dashboard image from GHCR
- restart only the dashboard container
- expose deploy status/log endpoints back to the UI

The current webhook endpoints come from [`infrastructure/webhook.yaml`](../infrastructure/webhook.yaml):

- `deploy-dashboard`
- `deploy-status`
- `deploy-log`

## Prerequisites

- Linux host with Docker Engine + Compose plugin
- this repo checked out on the server
- `webhook` installed
- dashboard container able to reach the webhook host

## Install the Webhook Service Manually

### 1. Install `webhook`

```bash
sudo apt-get update
sudo apt-get install -y webhook
```

### 2. Generate a deploy secret

```bash
openssl rand -hex 32
```

### 3. Render `/etc/webhook/hooks.yaml`

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

### 4. Add runtime variables to `infrastructure/.env`

```env
WEBHOOK_HOST=http://host.docker.internal:9000
DEPLOY_SECRET=your-generated-token
```

### 5. Ensure the dashboard container can resolve `host.docker.internal`

If your deployment does not already provide it, add a compose override:

```yaml
services:
  dashboard:
    extra_hosts:
      - "host.docker.internal:host-gateway"
```

### 6. Install a `systemd` service

Create `/etc/systemd/system/webhook-deploy.service`:

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

Enable it:

```bash
sudo systemctl daemon-reload
sudo systemctl enable webhook-deploy
sudo systemctl start webhook-deploy
```

## Install via `install.sh`

`install.sh` can do most of the above automatically when you answer yes to the webhook prompt.

Today it will:

- install `webhook` if needed
- generate a deploy secret
- render `/etc/webhook/hooks.yaml`
- install and start `webhook-deploy.service`
- append `WEBHOOK_HOST` and `DEPLOY_SECRET` to `infrastructure/.env`
- create `infrastructure/docker-compose.override.yml` with the `host.docker.internal` mapping if one does not already exist

## Verify It

From the host:

```bash
sudo systemctl status webhook-deploy
cat /var/log/cliproxyapi/dashboard-deploy-status.json
cat /var/log/cliproxyapi/dashboard-deploy.log
```

From the dashboard UI:

- open Settings
- trigger the dashboard deployment action
- poll the deploy status/log surface from the same page

## Security Notes

- the webhook uses `X-Deploy-Token`
- keep `DEPLOY_SECRET` out of source control
- expose the webhook only to localhost or a trusted internal network
- the webhook updates the dashboard image only; it is not a general remote execution endpoint
