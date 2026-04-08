# Security Best Practices

← [Back to README](../README.md)

## Best Practices

1. **Use a strong initial admin password**

2. **Protect `infrastructure/.env`**
   ```bash
   chmod 600 infrastructure/.env
   ```

3. **Rotate secrets regularly**
   ```bash
   openssl rand -base64 32
   openssl rand -hex 32
   ```

4. **Keep the management plane private**
   - Do not expose the CLIProxyAPI management API publicly.
   - Keep dashboard and proxy loopback-only unless you deliberately front them with your own ingress layer.

5. **Terminate TLS in your own reverse proxy or ingress**
   - The bundled stack no longer provisions certificates.
   - If you expose the dashboard or proxy publicly, enforce HTTPS and authentication in that fronting layer.

6. **Open only required firewall ports**
   - SSH
   - OAuth callback ports, if you use OAuth providers on a remote server

7. **Monitor logs and updates**
   ```bash
   cd infrastructure
   docker compose logs -f --tail=100
   docker compose pull
   docker compose up -d
   ```

8. **Protect backups**
   - store them outside the server
   - encrypt them when possible
   - test restores periodically
