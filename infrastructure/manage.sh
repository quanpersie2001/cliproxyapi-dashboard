#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
COMPOSE_FILE="${SCRIPT_DIR}/docker-compose.yml"
ENV_FILE="${SCRIPT_DIR}/.env"

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
  compose <args...>        Run raw docker compose commands with the project defaults
EOF
}

ensure_prereqs() {
    command -v docker >/dev/null 2>&1 || die "Docker is not installed"
    [ -f "$COMPOSE_FILE" ] || die "Missing compose file: $COMPOSE_FILE"
    [ -f "$ENV_FILE" ] || die "Missing environment file: $ENV_FILE"
}

docker_compose() {
    docker compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE" "$@"
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

    ensure_prereqs

    case "$command" in
        up)
            docker_compose up -d --wait "$@"
            ;;
        down)
            docker_compose down
            ;;
        restart)
            docker_compose restart "$@"
            ;;
        ps|status)
            docker_compose ps
            ;;
        logs)
            docker_compose logs "$@"
            ;;
        pull)
            if [ "$#" -gt 0 ]; then
                docker_compose pull "$@"
            else
                docker_compose pull
            fi
            ;;
        dashboard-update)
            docker_compose pull dashboard
            docker_compose up -d --wait docker-proxy
            docker_compose up -d --no-deps --wait dashboard
            ;;
        compose)
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
