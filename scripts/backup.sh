#!/bin/bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
INFRA_DIR="$PROJECT_DIR/infrastructure"
BACKUP_DIR="$PROJECT_DIR/backups"
TIMESTAMP="$(date +%Y%m%d_%H%M%S)"
BACKUP_FILE="cliproxyapi_backup_${TIMESTAMP}.tar.gz"

usage() {
    cat <<'EOF'
Usage: ./scripts/backup.sh

Creates a backup archive under ./backups containing:
- PostgreSQL SQL dump
- infrastructure/config/config.yaml
- infrastructure/.env.backup (if infrastructure/.env exists)
- infrastructure/docker-compose.override.yml.backup (if it exists)
- auth-dir.tar.gz (if the cliproxyapi_auths volume exists)
EOF
}

if [[ "${1:-}" == "-h" || "${1:-}" == "--help" ]]; then
    usage
    exit 0
fi

if [[ $# -ne 0 ]]; then
    echo "[ERROR] backup.sh does not accept positional arguments" >&2
    usage >&2
    exit 1
fi

mkdir -p "$BACKUP_DIR"

echo "[INFO] Starting backup at $(date)"
echo "[INFO] Backup location: $BACKUP_DIR/$BACKUP_FILE"

TMP_DIR="$(mktemp -d)"
trap 'rm -rf "$TMP_DIR"' EXIT

cd "$INFRA_DIR"

echo "[INFO] Backing up Postgres database..."
docker compose exec -T postgres pg_dump -U cliproxyapi -d cliproxyapi > "$TMP_DIR/database.sql"

echo "[INFO] Backing up config.yaml..."
cp "config/config.yaml" "$TMP_DIR/config.yaml"

if [[ -f ".env" ]]; then
    echo "[INFO] Capturing infrastructure/.env snapshot..."
    cp ".env" "$TMP_DIR/.env.backup"
fi

if [[ -f "docker-compose.override.yml" ]]; then
    echo "[INFO] Capturing docker-compose.override.yml snapshot..."
    cp "docker-compose.override.yml" "$TMP_DIR/docker-compose.override.yml.backup"
fi

echo "[INFO] Backing up auth directory..."
AUTH_VOLUME="$(docker volume ls --format '{{.Name}}' | grep 'cliproxyapi_auths' | head -1 || true)"
if [[ -z "$AUTH_VOLUME" ]]; then
    echo "[WARN] Auth volume not found, skipping auth backup"
else
    docker run --rm \
        -v "$AUTH_VOLUME":/data:ro \
        -v "$TMP_DIR":/backup \
        alpine tar czf /backup/auth-dir.tar.gz -C /data .
fi

echo "[INFO] Creating backup archive..."
tar czf "$BACKUP_DIR/$BACKUP_FILE" -C "$TMP_DIR" .

echo "[SUCCESS] Backup completed: $BACKUP_DIR/$BACKUP_FILE"
echo "[INFO] Backup size: $(du -h "$BACKUP_DIR/$BACKUP_FILE" | cut -f1)"
