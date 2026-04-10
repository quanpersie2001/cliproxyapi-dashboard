#!/bin/bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
BACKUP_DIR="$PROJECT_DIR/backups"

usage() {
    cat <<'EOF'
Usage: ./scripts/rotate-backups.sh [keep_count]

Removes older backup archives and keeps only the newest N files.
Default keep_count: 4
EOF
}

if [[ "${1:-}" == "-h" || "${1:-}" == "--help" ]]; then
    usage
    exit 0
fi

KEEP_COUNT="${1:-4}"
if ! [[ "$KEEP_COUNT" =~ ^[0-9]+$ ]]; then
    echo "[ERROR] keep_count must be a non-negative integer" >&2
    exit 1
fi

if [[ ! -d "$BACKUP_DIR" ]]; then
    echo "[INFO] No backups directory found"
    exit 0
fi

BACKUP_COUNT="$(find "$BACKUP_DIR" -name 'cliproxyapi_backup_*.tar.gz' | wc -l | tr -d ' ')"

if [[ "$BACKUP_COUNT" -le "$KEEP_COUNT" ]]; then
    echo "[INFO] Current backups ($BACKUP_COUNT) within retention limit ($KEEP_COUNT)"
    exit 0
fi

echo "[INFO] Rotating backups (keep $KEEP_COUNT, remove $((BACKUP_COUNT - KEEP_COUNT)))"

ls -1t "$BACKUP_DIR"/cliproxyapi_backup_*.tar.gz 2>/dev/null | \
    tail -n +"$((KEEP_COUNT + 1))" | \
    while read -r file; do
        echo "[INFO] Removing old backup: $(basename "$file")"
        rm -f "$file"
    done

echo "[SUCCESS] Backup rotation completed"
