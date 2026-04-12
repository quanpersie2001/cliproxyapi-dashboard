# Webhook Setup

Canonical guide: [`../docs/OPERATIONS.md#dashboard-deploy-webhook`](../docs/OPERATIONS.md#dashboard-deploy-webhook)

This file exists because the dashboard UI references `infrastructure/WEBHOOK_SETUP.md` directly.

Quick checklist:

1. Run `sudo ./install.sh` and enable the webhook option, or follow the manual steps in [`../docs/OPERATIONS.md#dashboard-deploy-webhook`](../docs/OPERATIONS.md#dashboard-deploy-webhook).
2. Ensure `WEBHOOK_HOST` and `DEPLOY_SECRET` exist in `infrastructure/.env`.
3. Ensure the dashboard container can resolve `host.docker.internal` when needed.
4. Verify `webhook-deploy.service` is running.

Verification commands:

```bash
sudo systemctl status webhook-deploy
cat /var/log/cliproxyapi/dashboard-deploy-status.json
cat /var/log/cliproxyapi/dashboard-deploy.log
```
