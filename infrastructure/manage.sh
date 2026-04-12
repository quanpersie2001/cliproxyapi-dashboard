#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
COMPOSE_FILE="${SCRIPT_DIR}/docker-compose.yml"
ENV_FILE="${SCRIPT_DIR}/.env"
BACKUP_DIR="${PROJECT_DIR}/backups"
BACKUP_PATTERN='cliproxyapi_backup_*.tar.gz'

die() {
    echo "error: $*" >&2
    exit 1
}

usage() {
    cat <<'EOF'
Usage: ./manage.sh <command> [args...]

Commands:
  up [services...]         Start the stack (waits for health checks)
  down                     Stop the stack
  restart [services...]    Restart one or more services
  ps                       Show running services
  logs [docker args...]    Show docker compose logs (pass -f to follow)
  pull [services...]       Pull latest images
  dashboard-update         Pull and restart the dashboard container
  backup                   Create a stack backup under ../backups
  restore <archive>        Restore a stack backup archive
  rotate-backups [count]   Keep only the newest N backup archives (default 4)
  compose <args...>        Run raw docker compose commands with the project defaults
EOF
}

ensure_docker() {
    command -v docker >/dev/null 2>&1 || die "Docker is not installed"
}

ensure_compose_file() {
    [ -f "$COMPOSE_FILE" ] || die "Missing compose file: $COMPOSE_FILE"
}

ensure_env_file() {
    [ -f "$ENV_FILE" ] || die "Missing environment file: $ENV_FILE"
}

docker_compose() {
    docker compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE" "$@"
}

find_auth_volume() {
    docker volume ls --format '{{.Name}}' | grep 'cliproxyapi_auths' | head -1 || true
}

resolve_backup_file() {
    local input="$1"
    local candidate

    for candidate in \
        "$input" \
        "$PROJECT_DIR/$input" \
        "$BACKUP_DIR/$input"
    do
        if [ -f "$candidate" ]; then
            printf '%s\n' "$candidate"
            return 0
        fi
    done

    die "Backup file not found: $input"
}

run_backup() {
    [ "$#" -eq 0 ] || die "backup does not accept arguments"

    ensure_docker
    ensure_compose_file
    ensure_env_file

    mkdir -p "$BACKUP_DIR"

    local timestamp backup_file tmp_dir override_file auth_volume
    timestamp="$(date +%Y%m%d_%H%M%S)"
    backup_file="cliproxyapi_backup_${timestamp}.tar.gz"
    tmp_dir="$(mktemp -d)"
    trap "rm -rf '$tmp_dir'" EXIT

    echo "[INFO] Starting backup at $(date)"
    echo "[INFO] Backup location: $BACKUP_DIR/$backup_file"

    echo "[INFO] Backing up Postgres database..."
    docker_compose exec -T postgres pg_dump -U cliproxyapi -d cliproxyapi > "$tmp_dir/database.sql"

    echo "[INFO] Backing up config.yaml..."
    cp "$SCRIPT_DIR/config/config.yaml" "$tmp_dir/config.yaml"

    if [ -f "$ENV_FILE" ]; then
        echo "[INFO] Capturing infrastructure/.env snapshot..."
        cp "$ENV_FILE" "$tmp_dir/.env.backup"
    fi

    override_file="$SCRIPT_DIR/docker-compose.override.yml"
    if [ -f "$override_file" ]; then
        echo "[INFO] Capturing docker-compose.override.yml snapshot..."
        cp "$override_file" "$tmp_dir/docker-compose.override.yml.backup"
    fi

    echo "[INFO] Backing up auth directory..."
    auth_volume="$(find_auth_volume)"
    if [ -z "$auth_volume" ]; then
        echo "[WARN] Auth volume not found, skipping auth backup"
    else
        docker run --rm \
            -v "$auth_volume":/data:ro \
            -v "$tmp_dir":/backup \
            alpine tar czf /backup/auth-dir.tar.gz -C /data .
    fi

    echo "[INFO] Creating backup archive..."
    tar czf "$BACKUP_DIR/$backup_file" -C "$tmp_dir" .

    echo "[SUCCESS] Backup completed: $BACKUP_DIR/$backup_file"
    echo "[INFO] Backup size: $(du -h "$BACKUP_DIR/$backup_file" | cut -f1)"
}

run_restore() {
    if [ "$#" -ne 1 ]; then
        echo "error: restore requires a backup archive path or filename" >&2
        echo "" >&2
        echo "Available backups:" >&2
        ls -lh "$BACKUP_DIR" 2>/dev/null >&2 || echo "  No backups found" >&2
        exit 1
    fi

    ensure_docker
    ensure_compose_file

    local backup_file tmp_dir auth_volume
    backup_file="$(resolve_backup_file "$1")"

    echo "[WARNING] This will restore data from backup and overwrite current data!"
    echo "[INFO] Backup file: $backup_file"
    read -r -p "Continue with restore? [y/N]: " confirm
    if [[ ! "$confirm" =~ ^[Yy]$ ]]; then
        echo "[INFO] Restore cancelled"
        exit 0
    fi

    tmp_dir="$(mktemp -d)"
    trap "rm -rf '$tmp_dir'" EXIT

    echo "[INFO] Extracting backup..."
    tar xzf "$backup_file" -C "$tmp_dir"

    if [ ! -f "$ENV_FILE" ] && [ ! -f "$tmp_dir/.env.backup" ]; then
        die "Missing infrastructure/.env and backup does not contain .env.backup"
    fi

    if [ -f "$tmp_dir/.env.backup" ]; then
        if [ -f "$ENV_FILE" ]; then
            cp "$tmp_dir/.env.backup" "${ENV_FILE}.restored-from-backup"
            echo "[WARN] Existing infrastructure/.env kept; backup copy written to infrastructure/.env.restored-from-backup"
        else
            cp "$tmp_dir/.env.backup" "$ENV_FILE"
            chmod 600 "$ENV_FILE"
            echo "[INFO] Restored infrastructure/.env"
        fi
    fi

    if [ -f "$tmp_dir/docker-compose.override.yml.backup" ]; then
        if [ -f "$SCRIPT_DIR/docker-compose.override.yml" ]; then
            cp "$tmp_dir/docker-compose.override.yml.backup" "${SCRIPT_DIR}/docker-compose.override.yml.restored-from-backup"
            echo "[WARN] Existing docker-compose.override.yml kept; backup copy written to infrastructure/docker-compose.override.yml.restored-from-backup"
        else
            cp "$tmp_dir/docker-compose.override.yml.backup" "$SCRIPT_DIR/docker-compose.override.yml"
            echo "[INFO] Restored docker-compose.override.yml"
        fi
    fi

    ensure_env_file

    echo "[INFO] Stopping CLIProxyAPI stack..."
    docker_compose down

    echo "[INFO] Starting Postgres for restore..."
    docker_compose up -d --wait postgres

    echo "[INFO] Restoring database..."
    docker_compose exec -T postgres psql -U cliproxyapi -d cliproxyapi -c "DROP SCHEMA public CASCADE; CREATE SCHEMA public;" >/dev/null
    docker_compose exec -T postgres psql -U cliproxyapi -d cliproxyapi < "$tmp_dir/database.sql"

    echo "[INFO] Restoring config.yaml..."
    cp "$tmp_dir/config.yaml" "$SCRIPT_DIR/config/config.yaml"

    if [ -f "$tmp_dir/auth-dir.tar.gz" ]; then
        echo "[INFO] Restoring auth directory..."
        auth_volume="$(find_auth_volume)"
        if [ -z "$auth_volume" ]; then
            echo "[WARN] Auth volume not found, skipping auth restore"
        else
            docker run --rm \
                -v "$auth_volume":/data \
                -v "$tmp_dir":/backup \
                alpine sh -c "find /data -mindepth 1 -maxdepth 1 -exec rm -rf {} + && tar xzf /backup/auth-dir.tar.gz -C /data"
        fi
    else
        echo "[INFO] No auth-dir.tar.gz found in backup, skipping auth restore"
    fi

    echo "[INFO] Starting CLIProxyAPI stack..."
    docker_compose up -d --wait

    echo "[SUCCESS] Restore completed successfully"
}

run_rotate_backups() {
    [ "$#" -le 1 ] || die "rotate-backups accepts at most one argument"

    local keep_count="${1:-4}"
    local backup_count

    if ! [[ "$keep_count" =~ ^[0-9]+$ ]]; then
        die "keep_count must be a non-negative integer"
    fi

    if [ ! -d "$BACKUP_DIR" ]; then
        echo "[INFO] No backups directory found"
        return 0
    fi

    backup_count="$(find "$BACKUP_DIR" -name "$BACKUP_PATTERN" | wc -l | tr -d ' ')"
    if [ "$backup_count" -le "$keep_count" ]; then
        echo "[INFO] Current backups ($backup_count) within retention limit ($keep_count)"
        return 0
    fi

    echo "[INFO] Rotating backups (keep $keep_count, remove $((backup_count - keep_count)))"
    ls -1t "$BACKUP_DIR"/cliproxyapi_backup_*.tar.gz 2>/dev/null | \
        tail -n +"$((keep_count + 1))" | \
        while read -r file; do
            echo "[INFO] Removing old backup: $(basename "$file")"
            rm -f "$file"
        done

    echo "[SUCCESS] Backup rotation completed"
}

main() {
    local command="${1:-}"
    shift || true

    case "$command" in
        -h|--help|help|"")
            usage
            exit 0
            ;;
    esac

    case "$command" in
        up)
            ensure_docker
            ensure_compose_file
            ensure_env_file
            docker_compose up -d --wait "$@"
            ;;
        down)
            ensure_docker
            ensure_compose_file
            ensure_env_file
            docker_compose down
            ;;
        restart)
            ensure_docker
            ensure_compose_file
            ensure_env_file
            docker_compose restart "$@"
            ;;
        ps|status)
            ensure_docker
            ensure_compose_file
            ensure_env_file
            docker_compose ps
            ;;
        logs)
            ensure_docker
            ensure_compose_file
            ensure_env_file
            docker_compose logs "$@"
            ;;
        pull)
            ensure_docker
            ensure_compose_file
            ensure_env_file
            if [ "$#" -gt 0 ]; then
                docker_compose pull "$@"
            else
                docker_compose pull
            fi
            ;;
        dashboard-update)
            ensure_docker
            ensure_compose_file
            ensure_env_file
            docker_compose pull dashboard
            docker_compose up -d --wait docker-proxy
            docker_compose up -d --no-deps --wait dashboard
            ;;
        backup)
            run_backup "$@"
            ;;
        restore)
            run_restore "$@"
            ;;
        rotate-backups)
            run_rotate_backups "$@"
            ;;
        compose)
            ensure_docker
            ensure_compose_file
            ensure_env_file
            [ "$#" -gt 0 ] || die "compose requires docker compose arguments"
            docker_compose "$@"
            ;;
        *)
            usage >&2
            die "Unknown command: $command"
            ;;
    esac
}

main "$@"
