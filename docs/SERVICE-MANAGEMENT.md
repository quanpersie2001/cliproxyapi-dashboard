# Service Management

← [Back to README](../README.md)

## Systemd Commands

```bash
# Start the stack
sudo systemctl start cliproxyapi-stack

# Stop the stack
sudo systemctl stop cliproxyapi-stack

# Restart the stack
sudo systemctl restart cliproxyapi-stack

# View status
sudo systemctl status cliproxyapi-stack

# Enable auto-start on boot
sudo systemctl enable cliproxyapi-stack

# Disable auto-start
sudo systemctl disable cliproxyapi-stack
```

## Manage Script

Use the checked-in helper so the correct compose file and `.env` are always selected:

```bash
cd infrastructure

# Start services
./manage.sh up

# Stop services
./manage.sh down

# Restart services
./manage.sh restart

# View running containers
./manage.sh ps

# View logs (all services)
./manage.sh logs

# View logs (specific service)
./manage.sh logs cliproxyapi
./manage.sh logs dashboard
./manage.sh logs postgres
./manage.sh logs docker-proxy

# Execute command in container
./manage.sh compose exec cliproxyapi sh
./manage.sh compose exec dashboard sh
./manage.sh compose exec postgres psql -U cliproxyapi -d cliproxyapi

# Pull latest images
./manage.sh pull

# Pull and restart just the dashboard
./manage.sh dashboard-update
```

## Exposed Endpoints

The bundled compose stack binds the main services to loopback only:

- Dashboard: `http://127.0.0.1:3000`
- CLIProxyAPI: `http://127.0.0.1:8317`

OAuth callback ports remain published so upstream CLI login flows can complete:

- `8085`
- `1455`
- `54545`
- `51121`
- `11451`

If you need public HTTPS access, run your own reverse proxy in front of these loopback endpoints.
