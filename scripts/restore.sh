#!/bin/bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
INFRA_DIR="$PROJECT_DIR/infrastructure"

usage() {
    cat <<'EOF'
Usage: ./scripts/restore.sh <backup_file.tar.gz>

Restores:
- PostgreSQL database dump
- infrastructure/config/config.yaml
- auth volume (if auth-dir.tar.gz exists)

If the backup contains .env or docker-compose.override.yml snapshots:
- they are restored only when the target file does not already exist
- otherwise they are written next to the target with a .restored-from-backup suffix
EOF
}

if [[ "${1:-}" == "-h" || "${1:-}" == "--help" ]]; then
    usage
    exit 0
fi

if [[ $# -ne 1 ]]; then
    echo "[ERROR] Usage: $0 <backup_file.tar.gz>" >&2
    echo "" >&2
    echo "Available backups:" >&2
    ls -lh "$PROJECT_DIR/backups" 2>/dev/null >&2 || echo "  No backups found" >&2
    exit 1
fi

BACKUP_FILE="$1"

if [[ ! -f "$BACKUP_FILE" ]]; then
    echo "[ERROR] Backup file not found: $BACKUP_FILE" >&2
    exit 1
fi

echo "[WARNING] This will restore data from backup and overwrite current data!"
echo "[INFO] Backup file: $BACKUP_FILE"
read -r -p "Continue with restore? [y/N]: " CONFIRM
if [[ ! "$CONFIRM" =~ ^[Yy]$ ]]; then
    echo "[INFO] Restore cancelled"
    exit 0
fi

TMP_DIR="$(mktemp -d)"
trap 'rm -rf "$TMP_DIR"' EXIT

echo "[INFO] Extracting backup..."
tar xzf "$BACKUP_FILE" -C "$TMP_DIR"

cd "$INFRA_DIR"

if [[ -f "$TMP_DIR/.env.backup" ]]; then
    if [[ -f ".env" ]]; then
        cp "$TMP_DIR/.env.backup" ".env.restored-from-backup"
        echo "[WARN] Existing infrastructure/.env kept; backup copy written to infrastructure/.env.restored-from-backup"
    else
        cp "$TMP_DIR/.env.backup" ".env"
        chmod 600 ".env"
        echo "[INFO] Restored infrastructure/.env"
    fi
fi

if [[ -f "$TMP_DIR/docker-compose.override.yml.backup" ]]; then
    if [[ -f "docker-compose.override.yml" ]]; then
        cp "$TMP_DIR/docker-compose.override.yml.backup" "docker-compose.override.yml.restored-from-backup"
        echo "[WARN] Existing docker-compose.override.yml kept; backup copy written to infrastructure/docker-compose.override.yml.restored-from-backup"
    else
        cp "$TMP_DIR/docker-compose.override.yml.backup" "docker-compose.override.yml"
        echo "[INFO] Restored docker-compose.override.yml"
    fi
fi

echo "[INFO] Stopping CLIProxyAPI stack..."
docker compose down

echo "[INFO] Starting Postgres for restore..."
docker compose up -d postgres
sleep 10

echo "[INFO] Restoring database..."
docker compose exec -T postgres psql -U cliproxyapi -d cliproxyapi -c "DROP SCHEMA public CASCADE; CREATE SCHEMA public;" 2>/dev/null
docker compose exec -T postgres psql -U cliproxyapi -d cliproxyapi < "$TMP_DIR/database.sql"

echo "[INFO] Restoring config.yaml..."
cp "$TMP_DIR/config.yaml" "config/config.yaml"

if [[ -f "$TMP_DIR/auth-dir.tar.gz" ]]; then
    echo "[INFO] Restoring auth directory..."
    AUTH_VOLUME="$(docker volume ls --format '{{.Name}}' | grep 'cliproxyapi_auths' | head -1 || true)"
    if [[ -z "$AUTH_VOLUME" ]]; then
        echo "[WARN] Auth volume not found, skipping auth restore"
    else
        docker run --rm \
            -v "$AUTH_VOLUME":/data \
            -v "$TMP_DIR":/backup \
            alpine sh -c "find /data -mindepth 1 -maxdepth 1 -exec rm -rf {} + && tar xzf /backup/auth-dir.tar.gz -C /data"
    fi
else
    echo "[INFO] No auth-dir.tar.gz found in backup, skipping auth restore"
fi

echo "[INFO] Starting CLIProxyAPI stack..."
docker compose up -d --wait

echo "[SUCCESS] Restore completed successfully"
