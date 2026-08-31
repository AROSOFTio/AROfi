#!/usr/bin/env bash
set -Eeuo pipefail

# AROFi production release script for the current Contabo topology.
# It intentionally does NOT run docker compose down, prune Docker volumes,
# recreate PostgreSQL/Redis/FreeRADIUS, or touch the host SSTP service.

RELEASE_DIR="${1:-$(pwd)}"
RELEASE_SHA="${AROFI_RELEASE_SHA:-unknown}"
PRODUCTION_IP="${AROFI_PRODUCTION_IP:-95.111.234.34}"
NETWORK="${AROFI_PRODUCTION_NETWORK:-arofi-prod}"
EDGE_NETWORK="${AROFI_EDGE_NETWORK:-edge}"

API_NAME="${AROFI_API_CONTAINER:-arofi-api-v2-20260809-api-1-pre-load-tune-20260826-221759}"
ADMIN_NAME="${AROFI_ADMIN_CONTAINER:-arofi-admin-v2-20260809-admin-1}"
PORTAL_NAME="${AROFI_PORTAL_CONTAINER:-arofi-portal-v2-20260809-portal-1}"
NGINX_NAME="${AROFI_NGINX_CONTAINER:-arofi-nginx-v2-20260809}"
POSTGRES_NAME="${AROFI_POSTGRES_CONTAINER:-arofi-postgres}"
REDIS_NAME="${AROFI_REDIS_CONTAINER:-arofi-redis}"
RADIUS_NAME="${AROFI_RADIUS_CONTAINER:-arofi-freeradius-1}"

STAMP="$(date -u +%Y%m%d_%H%M%S)"
BACKUP_ROOT="/root/arofi-runner-backups/${STAMP}-${RELEASE_SHA:0:12}"
RUNTIME_IMAGE="arofi-runtime:${RELEASE_SHA}"
BUILDER_IMAGE="arofi-builder:${RELEASE_SHA}"

API_ROLLBACK=""
ADMIN_ROLLBACK=""
PORTAL_ROLLBACK=""
NGINX_ROLLBACK=""

mkdir -p "$BACKUP_ROOT"
chmod 700 "$BACKUP_ROOT"

log() { printf '\n[%s] %s\n' "$(date -u +%FT%TZ)" "$*"; }
fail() { printf '\n[deploy] ERROR: %s\n' "$*" >&2; exit 1; }

require_running() {
  local name="$1"
  [ "$(docker inspect -f '{{.State.Running}}' "$name" 2>/dev/null || true)" = "true" ] \
    || fail "Required production container is not running: $name"
}

container_exists() {
  docker inspect "$1" >/dev/null 2>&1
}

wait_http_in_container() {
  local name="$1"
  local url="$2"
  local attempts="${3:-40}"
  local delay="${4:-3}"
  local i
  for i in $(seq 1 "$attempts"); do
    if docker exec "$name" sh -lc "wget -qO- '$url' >/dev/null 2>&1"; then
      return 0
    fi
    sleep "$delay"
  done
  return 1
}

assert_container_role() {
  local name="$1"
  local expected="$2"
  docker inspect "$name" --format '{{range .Config.Env}}{{println .}}{{end}}' \
    | grep -qx "SERVICE_NAME=${expected}" \
    || fail_after_cutover "Replacement ${name} did not start with SERVICE_NAME=${expected}"
}

attach_live_networks() {
  local name="$1"
  local role="$2"
  case "$role" in
    api)
      docker network connect --alias api --alias arofi-api-v2 --alias arofi-api-canary "$NETWORK" "$name"
      ;;
    admin)
      docker network connect --alias admin --alias arofi-admin-v2 "$NETWORK" "$name"
      ;;
    portal)
      docker network connect --alias portal --alias arofi-portal-v2 "$NETWORK" "$name"
      ;;
    nginx)
      docker network connect "$NETWORK" "$name"
      docker network connect "$EDGE_NETWORK" "$name"
      ;;
    *)
      fail "Unknown application role for network restore: $role"
      ;;
  esac
}

detach_live_networks() {
  local name="$1"
  local role="$2"
  docker network disconnect -f "$NETWORK" "$name" >/dev/null 2>&1 || true
  if [ "$role" = "nginx" ]; then
    docker network disconnect -f "$EDGE_NETWORK" "$name" >/dev/null 2>&1 || true
  fi
}

prepare_rollback_container() {
  local current="$1"
  local rollback="$2"
  local role="$3"
  docker stop -t 20 "$current"
  docker rename "$current" "$rollback"
  # A stopped container still owns its Docker DNS aliases. Disconnect it before
  # starting the replacement so aliases such as "api" never resolve to both
  # the old and new container at the same time.
  detach_live_networks "$rollback" "$role"
}

restore_rollback_container() {
  local current="$1"
  local rollback="$2"
  local role="$3"

  container_exists "$rollback" || return 0
  log "Rolling back $current to $rollback"
  docker stop -t 15 "$current" >/dev/null 2>&1 || true
  docker rm "$current" >/dev/null 2>&1 || true
  docker rename "$rollback" "$current"
  attach_live_networks "$current" "$role"
  docker start "$current" >/dev/null
}

rollback_all_apps() {
  log "Restoring all application containers from this release attempt"
  [ -n "$API_ROLLBACK" ] && container_exists "$API_ROLLBACK" && restore_rollback_container "$API_NAME" "$API_ROLLBACK" api || true
  [ -n "$ADMIN_ROLLBACK" ] && container_exists "$ADMIN_ROLLBACK" && restore_rollback_container "$ADMIN_NAME" "$ADMIN_ROLLBACK" admin || true
  [ -n "$PORTAL_ROLLBACK" ] && container_exists "$PORTAL_ROLLBACK" && restore_rollback_container "$PORTAL_NAME" "$PORTAL_ROLLBACK" portal || true
  [ -n "$NGINX_ROLLBACK" ] && container_exists "$NGINX_ROLLBACK" && restore_rollback_container "$NGINX_NAME" "$NGINX_ROLLBACK" nginx || true
  docker exec edge-nginx nginx -s reload >/dev/null 2>&1 || true
}

fail_after_cutover() {
  local message="$1"
  rollback_all_apps
  fail "$message"
}

snapshot_env() {
  local name="$1"
  local file="$2"
  docker inspect "$name" --format '{{range .Config.Env}}{{println .}}{{end}}' > "$file"
  chmod 600 "$file"
}

cutover_api() {
  local rollback="${API_NAME}-rollback-${STAMP}"
  API_ROLLBACK="$rollback"
  prepare_rollback_container "$API_NAME" "$rollback" api

  if ! docker run -d \
      --name "$API_NAME" \
      --restart unless-stopped \
      --network "$NETWORK" \
      --network-alias api \
      --network-alias arofi-api-v2 \
      --network-alias arofi-api-canary \
      --env-file "$BACKUP_ROOT/api.env" \
      -e SERVICE_NAME=api \
      --memory 768m \
      -p 31000-31100:31000-31100/tcp \
      "$RUNTIME_IMAGE" >/dev/null; then
    restore_rollback_container "$API_NAME" "$rollback" api
    fail "Could not start replacement API container; old API restored"
  fi

  assert_container_role "$API_NAME" api

  if ! wait_http_in_container "$API_NAME" 'http://127.0.0.1:3000/api/health' 80 3; then
    docker logs --tail 150 "$API_NAME" || true
    restore_rollback_container "$API_NAME" "$rollback" api
    fail "Replacement API failed its health check; old API restored"
  fi

  if ! curl -fsS --max-time 15 http://127.0.0.1:18080/api/health >/dev/null; then
    restore_rollback_container "$API_NAME" "$rollback" api
    fail "Captive/bootstrap path could not reach replacement API; old API restored"
  fi

  printf '%s\n' "$rollback" > "$BACKUP_ROOT/api.rollback-container"
}

cutover_admin() {
  local rollback="${ADMIN_NAME}-rollback-${STAMP}"
  ADMIN_ROLLBACK="$rollback"
  prepare_rollback_container "$ADMIN_NAME" "$rollback" admin

  if ! docker run -d \
      --name "$ADMIN_NAME" \
      --restart unless-stopped \
      --network "$NETWORK" \
      --network-alias admin \
      --network-alias arofi-admin-v2 \
      --env-file "$BACKUP_ROOT/admin.env" \
      -e SERVICE_NAME=admin \
      --memory 384m \
      "$RUNTIME_IMAGE" >/dev/null; then
    restore_rollback_container "$ADMIN_NAME" "$rollback" admin
    fail_after_cutover "Could not start replacement Admin container"
  fi

  assert_container_role "$ADMIN_NAME" admin

  if ! wait_http_in_container "$ADMIN_NAME" 'http://127.0.0.1:3000/' 60 3; then
    docker logs --tail 150 "$ADMIN_NAME" || true
    restore_rollback_container "$ADMIN_NAME" "$rollback" admin
    fail_after_cutover "Replacement Admin failed its health check"
  fi

  printf '%s\n' "$rollback" > "$BACKUP_ROOT/admin.rollback-container"
}

cutover_portal() {
  local rollback="${PORTAL_NAME}-rollback-${STAMP}"
  PORTAL_ROLLBACK="$rollback"
  prepare_rollback_container "$PORTAL_NAME" "$rollback" portal

  if ! docker run -d \
      --name "$PORTAL_NAME" \
      --restart unless-stopped \
      --network "$NETWORK" \
      --network-alias portal \
      --network-alias arofi-portal-v2 \
      --env-file "$BACKUP_ROOT/portal.env" \
      -e SERVICE_NAME=portal \
      --memory 320m \
      "$RUNTIME_IMAGE" >/dev/null; then
    restore_rollback_container "$PORTAL_NAME" "$rollback" portal
    fail_after_cutover "Could not start replacement Portal container"
  fi

  assert_container_role "$PORTAL_NAME" portal

  if ! wait_http_in_container "$PORTAL_NAME" 'http://127.0.0.1:3000/portal' 60 3; then
    docker logs --tail 150 "$PORTAL_NAME" || true
    restore_rollback_container "$PORTAL_NAME" "$rollback" portal
    fail_after_cutover "Replacement Portal failed its health check"
  fi

  printf '%s\n' "$rollback" > "$BACKUP_ROOT/portal.rollback-container"
}

cutover_nginx() {
  local rollback="${NGINX_NAME}-rollback-${STAMP}"
  NGINX_ROLLBACK="$rollback"
  prepare_rollback_container "$NGINX_NAME" "$rollback" nginx

  if ! docker run -d \
      --name "$NGINX_NAME" \
      --restart unless-stopped \
      --network "$NETWORK" \
      --env-file "$BACKUP_ROOT/nginx.env" \
      -e SERVICE_NAME=nginx \
      --memory 64m \
      "$RUNTIME_IMAGE" >/dev/null; then
    restore_rollback_container "$NGINX_NAME" "$rollback" nginx
    fail_after_cutover "Could not start replacement AROFi Nginx container"
  fi

  assert_container_role "$NGINX_NAME" nginx

  if ! docker network connect "$EDGE_NETWORK" "$NGINX_NAME"; then
    restore_rollback_container "$NGINX_NAME" "$rollback" nginx
    fail_after_cutover "Could not attach replacement AROFi Nginx to edge network"
  fi

  if ! wait_http_in_container "$NGINX_NAME" 'http://127.0.0.1:3000/api/health' 60 3; then
    docker logs --tail 150 "$NGINX_NAME" || true
    restore_rollback_container "$NGINX_NAME" "$rollback" nginx
    fail_after_cutover "Replacement AROFi Nginx failed its health check"
  fi

  docker exec edge-nginx nginx -s reload >/dev/null 2>&1 || true
  printf '%s\n' "$rollback" > "$BACKUP_ROOT/nginx.rollback-container"
}

log "Preflight: production identity and live dependencies"
cd "$RELEASE_DIR"
[ -f Dockerfile ] || fail "Release directory does not contain Dockerfile: $RELEASE_DIR"

ip -4 addr show | grep -Fq "$PRODUCTION_IP" \
  || fail "This host does not own expected production IPv4 $PRODUCTION_IP"

docker network inspect "$NETWORK" >/dev/null 2>&1 \
  || fail "Production Docker network $NETWORK does not exist"

for container in "$API_NAME" "$ADMIN_NAME" "$PORTAL_NAME" "$NGINX_NAME" "$POSTGRES_NAME" "$REDIS_NAME" "$RADIUS_NAME"; do
  require_running "$container"
done

systemctl is-active --quiet sstpd || fail "sstpd.service is not active"
curl -fsS --max-time 15 https://arofi.net/api/health >/dev/null \
  || fail "Public API was unhealthy before deployment; refusing to change production"

log "Production preflight passed (release=$RELEASE_SHA, database container=$POSTGRES_NAME, network=$NETWORK)"

log "Snapshot current application environments and topology"
snapshot_env "$API_NAME" "$BACKUP_ROOT/api.env"
snapshot_env "$ADMIN_NAME" "$BACKUP_ROOT/admin.env"
snapshot_env "$PORTAL_NAME" "$BACKUP_ROOT/portal.env"
snapshot_env "$NGINX_NAME" "$BACKUP_ROOT/nginx.env"
docker inspect "$API_NAME" "$ADMIN_NAME" "$PORTAL_NAME" "$NGINX_NAME" "$POSTGRES_NAME" "$REDIS_NAME" "$RADIUS_NAME" > "$BACKUP_ROOT/containers.before.json"
docker network inspect "$NETWORK" > "$BACKUP_ROOT/network.before.json"
docker exec "$NGINX_NAME" nginx -T > "$BACKUP_ROOT/nginx.before.conf" 2>&1 || true

log "Create and verify pre-deployment PostgreSQL backup"
docker exec "$POSTGRES_NAME" sh -lc \
  'PGPASSWORD="$POSTGRES_PASSWORD" pg_dump -h 127.0.0.1 -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Fc' \
  > "$BACKUP_ROOT/arofi-production-predeploy.dump"

test -s "$BACKUP_ROOT/arofi-production-predeploy.dump" \
  || fail "PostgreSQL backup is empty"

docker exec -i "$POSTGRES_NAME" pg_restore --list \
  < "$BACKUP_ROOT/arofi-production-predeploy.dump" \
  > "$BACKUP_ROOT/arofi-production-predeploy.list"

sha256sum "$BACKUP_ROOT/arofi-production-predeploy.dump" \
  > "$BACKUP_ROOT/arofi-production-predeploy.dump.sha256"

log "Record SSTP/PPP recovery configuration without modifying it"
tar -czf "$BACKUP_ROOT/sstp-ppp-config.tar.gz" /etc/sstpd /etc/ppp 2>/dev/null || true

log "Build exact release while old production containers stay online"
docker build --target runtime -t "$RUNTIME_IMAGE" .
docker build --target builder -t "$BUILDER_IMAGE" .

log "Apply Prisma migrations against the live production database"
docker run --rm \
  --network "$NETWORK" \
  --env-file "$BACKUP_ROOT/api.env" \
  "$BUILDER_IMAGE" \
  sh -lc 'npx prisma migrate deploy --schema=apps/api/prisma/schema.prisma'

log "Cut over API"
cutover_api

log "Cut over Admin"
cutover_admin

log "Cut over Portal"
cutover_portal

log "Cut over internal AROFi Nginx"
cutover_nginx

log "Post-deployment verification"
if ! require_running "$POSTGRES_NAME"; then fail_after_cutover "Production PostgreSQL is not running"; fi
if ! require_running "$REDIS_NAME"; then fail_after_cutover "Production Redis is not running"; fi
if ! require_running "$RADIUS_NAME"; then fail_after_cutover "Production FreeRADIUS is not running"; fi
if ! systemctl is-active --quiet sstpd; then fail_after_cutover "SSTP stopped during deployment"; fi

if ! ss -lun | grep -q ':1812 '; then fail_after_cutover "RADIUS authentication UDP 1812 is not listening"; fi
if ! ss -lun | grep -q ':1813 '; then fail_after_cutover "RADIUS accounting UDP 1813 is not listening"; fi

if ! curl -fsS --max-time 15 http://127.0.0.1:18080/api/health >/dev/null; then
  fail_after_cutover "Local bootstrap/API health check failed after deployment"
fi
if ! curl -fsS --max-time 20 https://arofi.net/api/health >/dev/null; then
  fail_after_cutover "Public AROFi API health check failed after deployment"
fi
if ! curl -fsSI --max-time 20 https://arofi.net/ >/dev/null; then
  fail_after_cutover "Public AROFi site failed after deployment"
fi

docker exec "$POSTGRES_NAME" sh -lc \
  'psql -U "$POSTGRES_USER" "$POSTGRES_DB" -Atc "SELECT COUNT(*) FROM radacct; SELECT COUNT(*) FROM nas;"' \
  > "$BACKUP_ROOT/database.counts.after.txt"

log "Clean only disposable build cache; preserve volumes, databases, rollback containers and images"
docker image rm "$BUILDER_IMAGE" >/dev/null 2>&1 || true
docker builder prune -f --filter 'until=168h' >/dev/null 2>&1 || true

cat > "$BACKUP_ROOT/release.txt" <<EOF
release_sha=$RELEASE_SHA
deployed_at=$(date -u +%FT%TZ)
runtime_image=$RUNTIME_IMAGE
production_ip=$PRODUCTION_IP
network=$NETWORK
EOF

log "AROFi production deployment succeeded"
echo "Release: $RELEASE_SHA"
echo "Safety backup: $BACKUP_ROOT/arofi-production-predeploy.dump"
echo "Rollback metadata: $BACKUP_ROOT"
echo "PostgreSQL/Redis/FreeRADIUS/SSTP were preserved in place."
