# UFW Firewall Setup

Canonical docs hub: [`docs/README.md`](README.md)

The bundled stack keeps the dashboard and main proxy API on loopback. In most cases the only ports you need to expose externally are SSH and the OAuth callback ports used by CLIProxyAPI.

## Ports That Matter

| Port | Exposure | Purpose |
| --- | --- | --- |
| `22/tcp` | external | SSH |
| `8085/tcp` | external when needed | OAuth callback |
| `1455/tcp` | external when needed | OAuth callback |
| `54545/tcp` | external when needed | OAuth callback |
| `51121/tcp` | external when needed | OAuth callback |
| `11451/tcp` | external when needed | OAuth callback |
| `127.0.0.1:3000` | loopback only | dashboard |
| `127.0.0.1:8317` | loopback only | proxy API |

## Recommended Setup

Always allow SSH before enabling UFW.

```bash
sudo ufw default deny incoming
sudo ufw default allow outgoing
sudo ufw limit 22/tcp comment "SSH"
sudo ufw allow 8085/tcp comment "CLIProxyAPI OAuth"
sudo ufw allow 1455/tcp comment "CLIProxyAPI OAuth"
sudo ufw allow 54545/tcp comment "CLIProxyAPI OAuth"
sudo ufw allow 51121/tcp comment "CLIProxyAPI OAuth"
sudo ufw allow 11451/tcp comment "CLIProxyAPI OAuth"
sudo ufw enable
sudo ufw status numbered
```

If you do not use remote OAuth flows, omit the OAuth callback rules.

## Why `3000` and `8317` Stay Closed

In [`infrastructure/docker-compose.yml`](../infrastructure/docker-compose.yml):

- dashboard binds to `127.0.0.1:3000`
- main proxy API binds to `127.0.0.1:8317`

This reduces the exposed surface and assumes you will place your own reverse proxy in front if remote access is required.

## Verification

From the host:

```bash
curl -I http://127.0.0.1:3000/api/health
curl -I http://127.0.0.1:8317/
```

From another machine, these should succeed only for the callback ports you intentionally opened:

```bash
nc -zv YOUR_SERVER_IP 8085
nc -zv YOUR_SERVER_IP 1455
nc -zv YOUR_SERVER_IP 54545
nc -zv YOUR_SERVER_IP 51121
nc -zv YOUR_SERVER_IP 11451
```

The following should not be externally reachable unless you deliberately front them elsewhere:

```bash
nc -zv YOUR_SERVER_IP 3000
nc -zv YOUR_SERVER_IP 8317
```

## Recovery If You Locked Yourself Out

Use your cloud console / KVM / physical access, then:

```bash
sudo ufw disable
sudo ufw allow 22/tcp
sudo ufw enable
```
