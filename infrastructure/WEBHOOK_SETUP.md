# Dashboard Deployment Webhook Setup

This guide explains how to set up the webhook server for deploying the dashboard from the UI.

## Prerequisites

- Linux server with Docker and Docker Compose
- The CLIProxyAPI Dashboard repository cloned to `/opt/cliproxyapi-dashboard`

## Installation

### 1. Install webhook

```bash
# Ubuntu/Debian
apt install webhook

# Or download binary from https://github.com/adnanh/webhook/releases
```

### 2. Generate a secret token

```bash
openssl rand -hex 32
```

Save this token - you'll need it for both the webhook config and the dashboard.

### 3. Configure webhook

Generate `/etc/webhook/hooks.yaml` from the template so both the install path and secret are correct:

```bash
INSTALL_DIR=/opt/cliproxyapi-dashboard
DEPLOY_SECRET=your-generated-token-here

sed \
  -e "s|{{INSTALL_DIR}}|${INSTALL_DIR}|g" \
  -e "s|{{LOG_DIR}}|/var/log/cliproxyapi|g" \
  -e "s|{{DEPLOY_SECRET}}|${DEPLOY_SECRET}|g" \
  "${INSTALL_DIR}/infrastructure/webhook.yaml" > /etc/webhook/hooks.yaml
```

### 4. Set environment variables

Add to your dashboard's `.env` or docker-compose environment:

```env
WEBHOOK_HOST=http://host.docker.internal:9000
DEPLOY_SECRET=your-generated-token-here
```

### 5. Start webhook server

```bash
# Run directly
webhook -hooks /etc/webhook/hooks.yaml -port 9000 -verbose

# Or create a systemd service (recommended)
```

### Systemd Service (Recommended)

Create `/etc/systemd/system/dashboard-webhook.service`:

```ini
[Unit]
Description=Dashboard Deployment Webhook
After=network.target

[Service]
Type=simple
ExecStart=/usr/bin/webhook -hooks /etc/webhook/hooks.yaml -port 9000
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
```

Enable and start:

```bash
systemctl daemon-reload
systemctl enable dashboard-webhook
systemctl start dashboard-webhook
```

## Usage

Once configured, you can deploy the dashboard from Settings > System > Dashboard Deployment.
The webhook pulls the latest published dashboard image from GHCR and restarts the dashboard container.

## Security Notes

- The webhook only accepts requests with the correct `X-Deploy-Token` header
- Keep your `DEPLOY_SECRET` secure and don't commit it to the repository
- The webhook server should only be accessible from localhost or your internal network
