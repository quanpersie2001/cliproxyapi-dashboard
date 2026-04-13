#!/bin/bash
#
# CLIProxyAPI Dashboard installation script
# Can run from a repo checkout or as a standalone bootstrap.
# Ensures the minimal production deployment bundle exists in INSTALL_DIR,
# installs Docker, writes infrastructure/.env, and optionally configures
# Nginx, backups, UFW, and the deploy webhook.
#

set -euo pipefail

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

DEFAULT_INSTALL_DIR="/opt/cliproxyapi-dashboard"
CLIPROXYAPI_DASHBOARD_REPO="${CLIPROXYAPI_DASHBOARD_REPO:-quanpersie2001/cliproxyapi-dashboard}"
CLIPROXYAPI_DASHBOARD_REF="${CLIPROXYAPI_DASHBOARD_REF:-main}"
ARCHIVE_URL="https://codeload.github.com/${CLIPROXYAPI_DASHBOARD_REPO}/tar.gz/${CLIPROXYAPI_DASHBOARD_REF}"
TMP_BUNDLE_DIR=""
PRESERVE_DIR=""
LOCAL_BUNDLE_DIR=""
NGINX_SITE_PATH=""
NGINX_AUTO_CONFIGURED=0
MINIMAL_BUNDLE_PATHS=("install.sh" "infrastructure")
LEGACY_BUNDLE_PATHS=(
    ".agents"
    ".claude"
    ".env.example"
    ".github"
    ".gitignore"
    ".release-please-manifest.json"
    "AGENTS.md"
    "CONTRIBUTING.md"
    "LICENSE"
    "README.md"
    "dashboard"
    "docker-compose.local.yml"
    "docs"
    "references"
    "release-please-config.json"
    "setup-local.ps1"
    "setup-local.sh"
    "skills-lock.json"
    "version.json"
)

log_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

log_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

print_section() {
    echo ""
    echo -e "${BLUE}=== $1 ===${NC}"
    echo ""
}

print_key_value() {
    printf "  %-22s %s\n" "$1" "$2"
}

prompt_user() {
    local __var_name="$1"
    local __message="$2"
    local __default="${3-__NO_DEFAULT__}"
    local __input_value=""

    if [ -r /dev/tty ]; then
        printf "%s" "$__message" > /dev/tty
        IFS= read -r __input_value < /dev/tty || __input_value=""
    else
        printf "%s" "$__message"
        IFS= read -r __input_value || __input_value=""
    fi

    if [ "$__default" != "__NO_DEFAULT__" ] && [ -z "$__input_value" ]; then
        __input_value="$__default"
    fi

    printf -v "$__var_name" '%s' "$__input_value"
}

trim_whitespace() {
    local value="$1"
    value="${value#"${value%%[![:space:]]*}"}"
    value="${value%"${value##*[![:space:]]}"}"
    printf '%s' "$value"
}

is_local_endpoint() {
    local value="$1"
    [[ "$value" =~ ^(localhost|127\.[0-9]+\.[0-9]+\.[0-9]+|0\.0\.0\.0|\[[0-9A-Fa-f:]+\])([:/]|$) ]]
}

normalize_public_url() {
    local value="$1"
    value="$(trim_whitespace "$value")"

    if [ -z "$value" ]; then
        printf '%s' ""
        return
    fi

    if [[ ! "$value" =~ ^https?:// ]]; then
        if is_local_endpoint "$value"; then
            value="http://${value}"
        else
            value="https://${value}"
        fi
    fi

    while [[ "$value" =~ ^https?://.+/$ ]]; do
        value="${value%/}"
    done

    printf '%s' "$value"
}

validate_public_url() {
    local value="$1"
    [[ "$value" =~ ^https?://[^[:space:]]+$ ]]
}

extract_url_authority() {
    local value="$1"
    local without_scheme="${value#*://}"
    printf '%s' "${without_scheme%%/*}"
}

extract_url_host() {
    local authority
    authority="$(extract_url_authority "$1")"

    if [[ "$authority" == \[* ]]; then
        authority="${authority%%]*}"
        printf '%s' "${authority#\[}"
        return
    fi

    printf '%s' "${authority%%:*}"
}

extract_url_path() {
    local value="$1"
    local without_scheme="${value#*://}"

    if [[ "$without_scheme" == */* ]]; then
        printf '/%s' "${without_scheme#*/}"
        return
    fi

    printf '%s' "/"
}

prompt_public_url() {
    local __var_name="$1"
    local __label="$2"
    local __default="$3"
    local __raw=""
    local __normalized=""

    while true; do
        prompt_user __raw "${__label} [default: ${__default}]: " "$__default"
        __normalized="$(normalize_public_url "$__raw")"

        if ! validate_public_url "$__normalized"; then
            log_error "${__label} must be a valid http(s) URL or hostname without spaces."
            continue
        fi

        if [ "$__raw" != "$__normalized" ]; then
            log_info "Using ${__normalized}"
        fi

        printf -v "$__var_name" '%s' "$__normalized"
        return
    done
}

prompt_yes_no() {
    local __var_name="$1"
    local __message="$2"
    local __default="${3:-0}"
    local __hint="[y/N]"
    local __response=""

    if [ "$__default" = "1" ]; then
        __hint="[Y/n]"
    fi

    while true; do
        prompt_user __response "${__message} ${__hint}: "
        __response="$(trim_whitespace "$__response")"
        __response="${__response,,}"

        case "$__response" in
            "")
                printf -v "$__var_name" '%s' "$__default"
                return
                ;;
            y|yes)
                printf -v "$__var_name" '1'
                return
                ;;
            n|no)
                printf -v "$__var_name" '0'
                return
                ;;
            *)
                log_error "Please enter y or n."
                ;;
        esac
    done
}

backup_interval_label() {
    case "$1" in
        daily)
            printf '%s' "Daily (keep last 7)"
            ;;
        weekly)
            printf '%s' "Weekly (keep last 4)"
            ;;
        *)
            printf '%s' "Disabled"
            ;;
    esac
}

enabled_label() {
    if [ "${1:-0}" = "1" ]; then
        printf '%s' "Enabled"
    else
        printf '%s' "Disabled"
    fi
}

ensure_cron_available() {
    if command -v crontab &> /dev/null; then
        return
    fi

    log_info "Installing cron..."
    apt-get update
    apt-get install -y cron
    systemctl enable cron >/dev/null 2>&1 || true
    systemctl start cron >/dev/null 2>&1 || true
}

ensure_runtime_dirs() {
    mkdir -p "$INSTALL_DIR/backups"
    mkdir -p "$INSTALL_DIR/infrastructure/config"
}

cleanup_bootstrap() {
    if [ -n "${TMP_BUNDLE_DIR}" ] && [ -d "${TMP_BUNDLE_DIR}" ]; then
        rm -rf "${TMP_BUNDLE_DIR}"
    fi
}

require_root() {
    if [ "$EUID" -ne 0 ]; then
        log_error "This script must be run as root"
        log_error "Example: curl -fsSL https://raw.githubusercontent.com/${CLIPROXYAPI_DASHBOARD_REPO}/main/install.sh | sudo bash"
        exit 1
    fi
}

ensure_supported_platform() {
    if ! command -v apt-get &> /dev/null; then
        log_error "This script only supports Ubuntu/Debian systems"
        exit 1
    fi
}

ensure_command() {
    local command_name="$1"
    local package_name="${2:-$1}"

    if command -v "$command_name" &> /dev/null; then
        return
    fi

    log_info "Installing missing dependency: ${package_name}"
    apt-get update
    apt-get install -y "${package_name}"
}

resolve_script_dir() {
    local source_path="${BASH_SOURCE[0]:-}"

    if [ -n "$source_path" ] && [ -e "$source_path" ]; then
        (
            cd "$(dirname "$source_path")" >/dev/null 2>&1
            pwd
        )
        return
    fi

    printf '%s\n' ""
}

bundle_dir_ready() {
    local candidate_dir="$1"

    [ -n "$candidate_dir" ] &&
    [ -d "$candidate_dir" ] &&
    [ -f "$candidate_dir/install.sh" ] &&
    [ -f "$candidate_dir/infrastructure/docker-compose.yml" ] &&
    [ -f "$candidate_dir/infrastructure/manage.sh" ]
}

dir_has_entries() {
    local target_dir="$1"

    [ -d "$target_dir" ] && find "$target_dir" -mindepth 1 -maxdepth 1 -print -quit 2>/dev/null | grep -q .
}

looks_like_existing_install() {
    bundle_dir_ready "$INSTALL_DIR"
}

validate_install_dir() {
    if [ -e "$INSTALL_DIR" ] && [ ! -d "$INSTALL_DIR" ]; then
        log_error "INSTALL_DIR exists but is not a directory: $INSTALL_DIR"
        exit 1
    fi

    if dir_has_entries "$INSTALL_DIR" && ! looks_like_existing_install; then
        log_error "INSTALL_DIR is not empty and does not look like a previous CLIProxyAPI Dashboard install: $INSTALL_DIR"
        log_error "Choose an empty directory, or point INSTALL_DIR at an existing CLIProxyAPI Dashboard install."
        exit 1
    fi
}

download_archive() {
    local archive_path="$1"

    log_info "Downloading ${CLIPROXYAPI_DASHBOARD_REPO}@${CLIPROXYAPI_DASHBOARD_REF}"

    if command -v curl &> /dev/null; then
        curl -fsSL "$ARCHIVE_URL" -o "$archive_path"
        return
    fi

    if command -v wget &> /dev/null; then
        wget -qO "$archive_path" "$ARCHIVE_URL"
        return
    fi

    log_error "Neither curl nor wget is available for downloading the install bundle."
    exit 1
}

preserve_existing_files() {
    PRESERVE_DIR="${TMP_BUNDLE_DIR}/preserve"
    mkdir -p "$PRESERVE_DIR"

    for relative_path in \
        "infrastructure/.env" \
        "infrastructure/config/config.yaml" \
        "infrastructure/docker-compose.override.yml"
    do
        if [ -e "${INSTALL_DIR}/${relative_path}" ]; then
            mkdir -p "${PRESERVE_DIR}/$(dirname "${relative_path}")"
            cp -a "${INSTALL_DIR}/${relative_path}" "${PRESERVE_DIR}/${relative_path}"
        fi
    done
}

restore_existing_files() {
    if [ -z "$PRESERVE_DIR" ] || [ ! -d "$PRESERVE_DIR" ]; then
        return
    fi

    for relative_path in \
        "infrastructure/.env" \
        "infrastructure/config/config.yaml" \
        "infrastructure/docker-compose.override.yml"
    do
        if [ -e "${PRESERVE_DIR}/${relative_path}" ]; then
            mkdir -p "${INSTALL_DIR}/$(dirname "${relative_path}")"
            cp -a "${PRESERVE_DIR}/${relative_path}" "${INSTALL_DIR}/${relative_path}"
        fi
    done
}

sync_bundle_from_directory() {
    local source_dir="$1"
    local bundle_path=""

    mkdir -p "$INSTALL_DIR"

    for bundle_path in "${MINIMAL_BUNDLE_PATHS[@]}"; do
        if [ ! -e "${source_dir}/${bundle_path}" ]; then
            log_error "Required bundle path is missing: ${bundle_path}"
            exit 1
        fi
    done

    tar -C "$source_dir" -cf - "${MINIMAL_BUNDLE_PATHS[@]}" | tar -C "$INSTALL_DIR" -xf -
}

extract_bundle_from_archive() {
    local archive_path="$1"
    local extracted_root="${TMP_BUNDLE_DIR}/extracted"
    local extracted_bundle_dir=""

    mkdir -p "$extracted_root"
    tar -xzf "$archive_path" -C "$extracted_root"

    extracted_bundle_dir="$(find "$extracted_root" -mindepth 1 -maxdepth 1 -type d | head -n 1)"
    if [ -z "$extracted_bundle_dir" ]; then
        log_error "Unable to locate extracted install bundle contents."
        exit 1
    fi

    sync_bundle_from_directory "$extracted_bundle_dir"
}

cleanup_legacy_bundle_paths() {
    local legacy_path=""

    for legacy_path in "${LEGACY_BUNDLE_PATHS[@]}"; do
        if [ -e "${INSTALL_DIR}/${legacy_path}" ]; then
            rm -rf "${INSTALL_DIR:?}/${legacy_path}"
        fi
    done
}

prepare_install_bundle() {
    local archive_path=""

    if [ -n "$LOCAL_BUNDLE_DIR" ] && [ "$INSTALL_DIR" = "$LOCAL_BUNDLE_DIR" ]; then
        return
    fi

    TMP_BUNDLE_DIR="$(mktemp -d)"

    if looks_like_existing_install; then
        log_warning "Existing CLIProxyAPI Dashboard install detected at $INSTALL_DIR"
        log_warning "Refreshing bundled scripts while preserving runtime state files."
        preserve_existing_files
    fi

    cleanup_legacy_bundle_paths

    if [ -n "$LOCAL_BUNDLE_DIR" ]; then
        log_info "Copying minimal deployment bundle into $INSTALL_DIR"
        sync_bundle_from_directory "$LOCAL_BUNDLE_DIR"
    else
        archive_path="${TMP_BUNDLE_DIR}/cliproxyapi-dashboard.tar.gz"
        ensure_command tar tar
        download_archive "$archive_path"
        extract_bundle_from_archive "$archive_path"
    fi

    restore_existing_files

    chmod +x "$INSTALL_DIR/install.sh"
    chmod +x "$INSTALL_DIR/infrastructure/manage.sh"

    if [ -f "$INSTALL_DIR/infrastructure/internal/dashboard-deploy.sh" ]; then
        chmod +x "$INSTALL_DIR/infrastructure/internal/dashboard-deploy.sh"
    fi
}

check_port_conflict() {
    local port=$1

    if command -v ss &> /dev/null; then
        ss -tln 2>/dev/null | grep -q ":$port " && return 0
    elif command -v lsof &> /dev/null; then
        lsof -i ":$port" 2>/dev/null | grep -q LISTEN && return 0
    elif command -v netstat &> /dev/null; then
        netstat -tln 2>/dev/null | grep -q ":$port " && return 0
    fi

    return 1
}

check_container_conflicts() {
    local container_names=("cliproxyapi" "cliproxyapi-dashboard" "cliproxyapi-docker-proxy" "cliproxyapi-postgres")
    local conflicts=()

    if ! command -v docker &> /dev/null; then
        return 0
    fi

    if ! docker ps &> /dev/null 2>&1; then
        return 0
    fi

    for container in "${container_names[@]}"; do
        if docker ps -a --format '{{.Names}}' 2>/dev/null | grep -q "^${container}$"; then
            conflicts+=("$container")
        fi
    done

    if [ ${#conflicts[@]} -gt 0 ]; then
        printf '%s\n' "${conflicts[@]}"
    fi
}

install_docker() {
    if command -v docker &> /dev/null && docker compose version &> /dev/null; then
        log_success "Docker and Docker Compose already installed"
        return
    fi

    log_info "Installing Docker Engine and Docker Compose plugin..."

    apt-get update
    apt-get install -y ca-certificates curl gnupg lsb-release

    install -m 0755 -d /etc/apt/keyrings

    if [ ! -f /etc/apt/keyrings/docker.gpg ]; then
        curl -fsSL "$DOCKER_REPO_URL/gpg" | gpg --dearmor -o /etc/apt/keyrings/docker.gpg
        chmod a+r /etc/apt/keyrings/docker.gpg
    fi

    echo \
      "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] $DOCKER_REPO_URL $DISTRO_CODENAME stable" \
      > /etc/apt/sources.list.d/docker.list

    apt-get update
    apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin

    systemctl enable docker
    systemctl start docker

    log_success "Docker installed"
}

ensure_docker_running() {
    if ! systemctl is-active --quiet docker; then
        log_info "Starting Docker..."
        systemctl start docker
    fi

    if ! docker info > /dev/null 2>&1; then
        log_error "Docker daemon is not available"
        exit 1
    fi
}

configure_ufw() {
    if [ "${CONFIGURE_UFW:-0}" -ne 1 ]; then
        log_info "Skipping UFW configuration"
        return
    fi

    log_info "Configuring UFW..."

    if ! command -v ufw &> /dev/null; then
        apt-get update
        apt-get install -y ufw
    fi

    if ! ufw status | grep -q "22/tcp"; then
        ufw limit 22/tcp comment 'SSH'
    fi

    if [ "$OAUTH_ENABLED" -eq 1 ]; then
        for port in 8085 1455 54545 51121 11451; do
            if ! ufw status | grep -q "${port}/tcp"; then
                ufw allow "${port}/tcp" comment "CLIProxyAPI OAuth callback"
            fi
        done
    fi

    if [ "${INSTALL_NGINX:-0}" -eq 1 ]; then
        if ! ufw status | grep -q "80/tcp"; then
            ufw allow 80/tcp comment 'Nginx reverse proxy'
        fi
    fi

    if ! ufw status | grep -q "Status: active"; then
        ufw --force enable
    fi

    log_success "UFW configured"
}

create_env_file() {
    local env_file="$INSTALL_DIR/infrastructure/.env"
    local skip_env=0

    if [ -f "$env_file" ]; then
        log_warning ".env file already exists"
        prompt_yes_no OVERWRITE_ENV "Overwrite .env file?" 0
        if [ "$OVERWRITE_ENV" -ne 1 ]; then
            skip_env=1
        fi
    fi

    if [ "$skip_env" -eq 1 ]; then
        log_info "Keeping existing .env file"
        set -a
        source "$env_file"
        set +a
        return
    fi

    cat > "$env_file" << EOF
# CLIProxyAPI Dashboard stack
# Generated by install.sh on $(date)

DATABASE_URL=postgresql://cliproxyapi:${POSTGRES_PASSWORD}@postgres:5432/cliproxyapi
POSTGRES_PASSWORD=${POSTGRES_PASSWORD}

JWT_SECRET=${JWT_SECRET}
MANAGEMENT_API_KEY=${MANAGEMENT_API_KEY}
COLLECTOR_API_KEY=${COLLECTOR_API_KEY}
PROVIDER_ENCRYPTION_KEY=${PROVIDER_ENCRYPTION_KEY}

CLIPROXYAPI_MANAGEMENT_URL=http://cliproxyapi:8317/v0/management

INSTALL_DIR=${INSTALL_DIR}
TZ=UTC
LOG_LEVEL=info

DASHBOARD_URL=${DASHBOARD_URL}
API_URL=${API_URL}
EOF

    chmod 600 "$env_file"
    log_success ".env file created at $env_file"
}

setup_nginx_reverse_proxy() {
    if [ "${INSTALL_NGINX:-0}" -ne 1 ]; then
        log_info "Skipping Nginx reverse proxy setup"
        return
    fi

    local dashboard_host api_host dashboard_path api_path template_path enabled_path
    dashboard_host="$(extract_url_host "$DASHBOARD_URL")"
    api_host="$(extract_url_host "$API_URL")"
    dashboard_path="$(extract_url_path "$DASHBOARD_URL")"
    api_path="$(extract_url_path "$API_URL")"

    if [ -z "$dashboard_host" ] || [ -z "$api_host" ]; then
        log_warning "Could not derive hostnames from DASHBOARD_URL/API_URL. Skipping automatic Nginx config."
        return
    fi

    if [ "$dashboard_path" != "/" ] || [ "$api_path" != "/" ]; then
        log_warning "Automatic Nginx setup only supports root-path URLs. Skipping automatic Nginx config."
        return
    fi

    if [ "$dashboard_host" = "$api_host" ]; then
        log_warning "Automatic Nginx setup expects separate dashboard and API hostnames. Skipping automatic Nginx config."
        return
    fi

    if [[ "$DASHBOARD_URL" == https://* ]] || [[ "$API_URL" == https://* ]]; then
        log_warning "Generated Nginx config is HTTP-only. Add TLS certificates or another TLS terminator separately."
    fi

    ensure_command nginx nginx

    template_path="$INSTALL_DIR/infrastructure/nginx/cliproxyapi-dashboard.http.conf.template"
    if [ ! -f "$template_path" ]; then
        log_error "Missing Nginx template: $template_path"
        exit 1
    fi

    NGINX_SITE_PATH="/etc/nginx/sites-available/cliproxyapi-dashboard.conf"
    enabled_path="/etc/nginx/sites-enabled/cliproxyapi-dashboard.conf"

    if [ -f "$NGINX_SITE_PATH" ]; then
        log_warning "Nginx site already exists at $NGINX_SITE_PATH"
        prompt_yes_no OVERWRITE_NGINX_SITE "Overwrite Nginx site config?" 0
        if [ "$OVERWRITE_NGINX_SITE" -ne 1 ]; then
            log_info "Keeping existing Nginx site config"
            return
        fi
    fi

    install -d -m 0755 /etc/nginx/sites-available /etc/nginx/sites-enabled

    sed \
        -e "s|{{DASHBOARD_SERVER_NAME}}|${dashboard_host}|g" \
        -e "s|{{API_SERVER_NAME}}|${api_host}|g" \
        -e "s|{{DASHBOARD_UPSTREAM}}|127.0.0.1:3000|g" \
        -e "s|{{API_UPSTREAM}}|127.0.0.1:8317|g" \
        "$template_path" > "$NGINX_SITE_PATH"

    ln -sfn "$NGINX_SITE_PATH" "$enabled_path"

    nginx -t
    systemctl enable nginx >/dev/null 2>&1 || true
    systemctl restart nginx

    NGINX_AUTO_CONFIGURED=1
    log_success "Nginx reverse proxy configured"
}

setup_backup_scripts() {
    local manage_script="$INSTALL_DIR/infrastructure/manage.sh"

    if [ ! -f "$manage_script" ]; then
        log_error "infrastructure/manage.sh is missing"
        exit 1
    fi

    ensure_cron_available
    chmod +x "$manage_script"

    log_success "Backup commands are ready via infrastructure/manage.sh"

    if [ "$BACKUP_INTERVAL" = "none" ]; then
        return
    fi

    local cron_schedule
    local cron_comment

    if [ "$BACKUP_INTERVAL" = "daily" ]; then
        cron_schedule="0 2 * * *"
        cron_comment="CLIProxyAPI daily backup"
    else
        cron_schedule="0 2 * * 0"
        cron_comment="CLIProxyAPI weekly backup"
    fi

    if crontab -l 2>/dev/null | grep -Eq "$manage_script backup|$INSTALL_DIR/scripts/backup.sh"; then
        log_warning "Backup cron job already exists"
        return
    fi

    (
        crontab -l 2>/dev/null || true
        echo "# $cron_comment"
        echo "$cron_schedule $manage_script backup >> $INSTALL_DIR/backups/backup.log 2>&1 && $manage_script rotate-backups $BACKUP_RETENTION >> $INSTALL_DIR/backups/backup.log 2>&1"
    ) | crontab -

    log_success "Backup cron job installed"
}

setup_usage_collector() {
    local collector_url="http://127.0.0.1:3000"
    local cron_schedule="*/5 * * * *"
    local cron_cmd="curl -sf -X POST ${collector_url}/api/usage/collect -H 'Authorization: Bearer ${COLLECTOR_API_KEY}' -o /dev/null"

    ensure_cron_available
    ensure_command curl curl

    if crontab -l 2>/dev/null | grep -q "/api/usage/collect"; then
        log_warning "Usage collector cron job already exists"
        return
    fi

    (
        crontab -l 2>/dev/null || true
        echo "# CLIProxyAPI usage collector (every 5 minutes)"
        echo "$cron_schedule $cron_cmd"
    ) | crontab -

    log_success "Usage collector cron job installed"
}

install_webhook_service() {
    prompt_yes_no INSTALL_WEBHOOK "Install webhook deploy service?" 0
    if [ "$INSTALL_WEBHOOK" -ne 1 ]; then
        log_info "Skipping webhook installation"
        return
    fi

    if ! command -v webhook &> /dev/null; then
        apt-get update
        apt-get install -y webhook
    fi

    local deploy_secret
    deploy_secret="$(openssl rand -hex 32)"

    mkdir -p /etc/webhook
    mkdir -p /var/log/cliproxyapi
    sed \
        -e "s|{{DEPLOY_SECRET}}|${deploy_secret}|g" \
        -e "s|{{INSTALL_DIR}}|${INSTALL_DIR}|g" \
        -e "s|{{LOG_DIR}}|/var/log/cliproxyapi|g" \
        "$INSTALL_DIR/infrastructure/webhook.yaml" > /etc/webhook/hooks.yaml
    chmod 600 /etc/webhook/hooks.yaml
    chmod +x "$INSTALL_DIR/infrastructure/internal/dashboard-deploy.sh"
    chmod +x "$INSTALL_DIR/infrastructure/manage.sh"

    cat > /etc/systemd/system/webhook-deploy.service << EOF
[Unit]
Description=Webhook Deploy Service for CLIProxyAPI Dashboard
After=network.target

[Service]
Type=simple
ExecStart=/usr/bin/webhook -hooks /etc/webhook/hooks.yaml -port 9000 -verbose
Restart=on-failure
RestartSec=5
User=root
Group=root

[Install]
WantedBy=multi-user.target
EOF

    systemctl daemon-reload
    systemctl enable webhook-deploy.service
    systemctl start webhook-deploy.service

    if ! grep -q "^WEBHOOK_HOST=" "$INSTALL_DIR/infrastructure/.env"; then
        cat >> "$INSTALL_DIR/infrastructure/.env" << EOF

WEBHOOK_HOST=http://host.docker.internal:9000
DEPLOY_SECRET=${deploy_secret}
EOF
    fi

    local override_file="$INSTALL_DIR/infrastructure/docker-compose.override.yml"
    if [ ! -f "$override_file" ]; then
        cat > "$override_file" << 'EOF'
services:
  dashboard:
    extra_hosts:
      - "host.docker.internal:host-gateway"
EOF
    elif ! grep -q "host.docker.internal:host-gateway" "$override_file"; then
        log_warning "Please add host.docker.internal mapping to $override_file manually"
    fi

    log_success "Webhook deploy service installed"
}

trap cleanup_bootstrap EXIT

require_root
ensure_supported_platform

SCRIPT_DIR="$(resolve_script_dir)"
if bundle_dir_ready "$SCRIPT_DIR"; then
    LOCAL_BUNDLE_DIR="$SCRIPT_DIR"
fi

INSTALL_DIR="${INSTALL_DIR:-${LOCAL_BUNDLE_DIR:-$DEFAULT_INSTALL_DIR}}"
validate_install_dir

if [ "${CLIPROXYAPI_INSTALL_SKIP_BOOTSTRAP:-0}" != "1" ]; then
    prepare_install_bundle

    if [ -f "$INSTALL_DIR/install.sh" ] && { [ -z "$LOCAL_BUNDLE_DIR" ] || [ "$INSTALL_DIR" != "$LOCAL_BUNDLE_DIR" ]; }; then
        log_info "Switching to bundled installer in $INSTALL_DIR"
        exec env \
            INSTALL_DIR="$INSTALL_DIR" \
            CLIPROXYAPI_DASHBOARD_REPO="$CLIPROXYAPI_DASHBOARD_REPO" \
            CLIPROXYAPI_DASHBOARD_REF="$CLIPROXYAPI_DASHBOARD_REF" \
            CLIPROXYAPI_INSTALL_SKIP_BOOTSTRAP=1 \
            bash "$INSTALL_DIR/install.sh"
    fi
fi

ensure_runtime_dirs

log_info "Installation directory: $INSTALL_DIR"

if [ -f /etc/os-release ]; then
    . /etc/os-release
    DISTRO_ID="${ID:-}"
    DISTRO_CODENAME="${VERSION_CODENAME:-}"
else
    log_error "Cannot detect Linux distribution"
    exit 1
fi

case "$DISTRO_ID" in
    ubuntu)
        DOCKER_REPO_URL="https://download.docker.com/linux/ubuntu"
        ;;
    debian)
        DOCKER_REPO_URL="https://download.docker.com/linux/debian"
        ;;
    *)
        log_error "Unsupported distribution: $DISTRO_ID"
        exit 1
        ;;
esac

if [ -z "$DISTRO_CODENAME" ]; then
    log_error "Cannot determine distro codename"
    exit 1
fi

print_section "Install Context"
print_key_value "Installation dir" "$INSTALL_DIR"
print_key_value "Repository" "$CLIPROXYAPI_DASHBOARD_REPO"
print_key_value "Ref" "$CLIPROXYAPI_DASHBOARD_REF"
print_key_value "Distribution" "$DISTRO_ID ($DISTRO_CODENAME)"

print_section "Configuration"
echo "Enter a full URL or just a hostname. Bare hostnames will be normalized automatically."
echo "Use separate hostnames if you want the installer to manage Nginx for both the dashboard and public API."
echo ""

prompt_public_url DASHBOARD_URL "Public dashboard URL" "http://localhost:3000"
prompt_public_url API_URL "Public API URL" "http://localhost:8317"

prompt_yes_no INSTALL_NGINX "Install and configure Nginx reverse proxy now?" 1
prompt_yes_no OAUTH_ENABLED "Enable OAuth callback ports in the firewall?" 0
prompt_yes_no CONFIGURE_UFW "Configure UFW firewall now?" 0

print_section "Backup Schedule"
echo "  1) Daily backups (keep last 7)"
echo "  2) Weekly backups (keep last 4)"
echo "  3) No automated backups"
while true; do
    prompt_user BACKUP_CHOICE "Choose backup interval [1-3]: "
    case "$BACKUP_CHOICE" in
        1)
            BACKUP_INTERVAL="daily"
            BACKUP_RETENTION=7
            break
            ;;
        2)
            BACKUP_INTERVAL="weekly"
            BACKUP_RETENTION=4
            break
            ;;
        3)
            BACKUP_INTERVAL="none"
            BACKUP_RETENTION=0
            break
            ;;
        *)
            log_error "Invalid choice"
            ;;
    esac
done

echo ""
log_info "Configuration summary:"
print_key_value "Dashboard URL" "$DASHBOARD_URL"
print_key_value "API URL" "$API_URL"
print_key_value "Nginx reverse proxy" "$(enabled_label "$INSTALL_NGINX")"
print_key_value "OAuth callback ports" "$(enabled_label "$OAUTH_ENABLED")"
print_key_value "UFW configuration" "$(enabled_label "$CONFIGURE_UFW")"
print_key_value "Backup interval" "$(backup_interval_label "$BACKUP_INTERVAL")"
echo ""

prompt_yes_no CONFIRM "Continue with installation?" 0
if [ "$CONFIRM" -ne 1 ]; then
    log_warning "Installation cancelled"
    exit 0
fi

print_section "Preflight Checks"

REQUIRED_PORTS=(3000 8317)
if [ "$OAUTH_ENABLED" -eq 1 ]; then
    REQUIRED_PORTS+=(8085 1455 54545 51121 11451)
fi

PORT_CONFLICTS=()
for port in "${REQUIRED_PORTS[@]}"; do
    if check_port_conflict "$port"; then
        PORT_CONFLICTS+=("$port")
    fi
done

if [ ${#PORT_CONFLICTS[@]} -gt 0 ]; then
    log_error "Port conflicts detected: ${PORT_CONFLICTS[*]}"
    exit 1
fi

CONTAINER_CONFLICTS=$(check_container_conflicts || true)
if [ -n "$CONTAINER_CONFLICTS" ]; then
    log_warning "Existing Docker containers found:"
    echo "$CONTAINER_CONFLICTS"
    prompt_yes_no CONTINUE_CONFLICTS "Continue anyway?" 0
    if [ "$CONTINUE_CONFLICTS" -ne 1 ]; then
        exit 1
    fi
fi

print_section "Docker Installation"

install_docker
ensure_docker_running

print_section "Secret Generation"

ensure_command openssl openssl
JWT_SECRET="$(openssl rand -base64 32)"
MANAGEMENT_API_KEY="$(openssl rand -hex 32)"
POSTGRES_PASSWORD="$(openssl rand -hex 32)"
COLLECTOR_API_KEY="$(openssl rand -hex 32)"
PROVIDER_ENCRYPTION_KEY="$(openssl rand -hex 32)"

log_success "Secrets generated"

print_section "Firewall Configuration"

configure_ufw

print_section "Environment Configuration"

create_env_file

print_section "Nginx Reverse Proxy"

setup_nginx_reverse_proxy

print_section "Backup Setup"

setup_backup_scripts

print_section "Usage Collector"

setup_usage_collector

print_section "Optional Webhook"

install_webhook_service

print_section "Installation Complete"
log_success "CLIProxyAPI Dashboard stack installation completed successfully"
echo ""
echo "Next steps:"
echo "  1. Start the stack:"
echo "     cd $INSTALL_DIR/infrastructure"
echo "     ./manage.sh up"
echo ""
echo "  2. Check status:"
echo "     cd $INSTALL_DIR/infrastructure"
echo "     ./manage.sh ps"
echo ""
echo "  3. View logs:"
echo "     cd $INSTALL_DIR/infrastructure"
echo "     ./manage.sh logs -f"
echo ""
echo "  4. Local service endpoints:"
echo "     Dashboard: http://127.0.0.1:3000"
echo "     API: http://127.0.0.1:8317"
echo ""
echo "  5. Public URLs configured in the dashboard:"
echo "     Dashboard: $DASHBOARD_URL"
echo "     API: $API_URL"
echo ""
echo "  6. Create the first admin account in the dashboard, then configure"
echo "     providers, proxy settings, and API keys."
echo ""
if [ "$NGINX_AUTO_CONFIGURED" -eq 1 ]; then
    echo "  7. Nginx site config:"
    echo "     $NGINX_SITE_PATH"
    echo "     This is an HTTP starter config for the dashboard/API split hostnames."
    echo ""
fi
echo "If you need TLS/HTTPS, add certificate handling to Nginx or place another"
echo "TLS terminator in front of the generated HTTP reverse proxy."
echo "The bundled Nginx template lives at:"
echo "  $INSTALL_DIR/infrastructure/nginx/cliproxyapi-dashboard.http.conf.template"
echo ""
log_warning "Secrets are stored in $INSTALL_DIR/infrastructure/.env"
