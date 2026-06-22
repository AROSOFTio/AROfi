#!/bin/sh
# Deploys the AROFi FreeRADIUS server on the SAME VPS + Docker network as the
# AROFi Postgres. FreeRADIUS reads radcheck / radreply / radacct / nas straight
# from the same database, so vouchers and paid packages authenticate.
#
# WHY THIS EXISTS: the AROFi app image only ships freeradius client utils, not
# the server. Without this container nothing answers MikroTik Access-Requests on
# UDP 1812, so paid customers can never get online ("no auth / no acct").
#
# Run on the VPS, from a checkout of this repo:
#   git clone https://github.com/AROSOFTio/AROfi /opt/arofi   # first time
#   cd /opt/arofi && git pull
#   sh scripts/deploy-freeradius.sh
#
# Re-run any time (it recreates the container). Override the image if needed:
#   RADIUS_IMAGE=freeradius/freeradius-server:3.2.5 sh scripts/deploy-freeradius.sh
set -eu

IMAGE="${RADIUS_IMAGE:-freeradius/freeradius-server:3.2.5-alpine}"
CFG_DIR="$(cd "$(dirname "$0")/.." && pwd)/config/freeradius"

echo "[radius] image:      $IMAGE"
echo "[radius] config dir: $CFG_DIR"
[ -f "$CFG_DIR/entrypoint.sh" ] || { echo "ERROR: $CFG_DIR/entrypoint.sh missing. Run from the AROFi repo root."; exit 1; }

# --- Find the AROFi APP container (the one that has RADIUS_SHARED_SECRET set). --
APP=""
for c in $(docker ps -q); do
  if [ -n "$(docker exec "$c" printenv RADIUS_SHARED_SECRET 2>/dev/null || true)" ]; then APP="$c"; break; fi
done
[ -n "$APP" ] || { echo "ERROR: could not find the AROFi app container (none has RADIUS_SHARED_SECRET). Is the app deployed?"; exit 1; }
echo "[radius] app container: $(docker inspect -f '{{.Name}}' "$APP" | sed 's#^/##')"

appenv() { docker exec "$APP" printenv "$1" 2>/dev/null || true; }

SECRET="$(appenv RADIUS_SHARED_SECRET)"
PGHOST="$(appenv POSTGRES_HOST)"
PGPORT="$(appenv POSTGRES_PORT)"
PGUSER="$(appenv POSTGRES_USER)"
PGPASS="$(appenv POSTGRES_PASSWORD)"
PGDB="$(appenv POSTGRES_DB)"

# Fallback: parse anything missing out of DATABASE_URL
# (postgresql://USER:PASS@HOST:PORT/DB?...). Assumes no '@' or ':' in the password.
DBURL="$(appenv DATABASE_URL)"
if [ -n "$DBURL" ]; then
  rest="${DBURL#*://}"; creds="${rest%%@*}"; hostportdb="${rest#*@}"
  [ -n "$PGUSER" ] || PGUSER="${creds%%:*}"
  [ -n "$PGPASS" ] || PGPASS="${creds#*:}"
  hp="${hostportdb%%/*}"
  [ -n "$PGHOST" ] || PGHOST="${hp%%:*}"
  if [ -z "$PGPORT" ]; then PGPORT="${hp#*:}"; [ "$PGPORT" = "$hp" ] && PGPORT=5432; fi
  if [ -z "$PGDB" ]; then dbpart="${hostportdb#*/}"; PGDB="${dbpart%%\?*}"; fi
fi
[ -n "$PGPORT" ] || PGPORT=5432

[ -n "$SECRET" ] && [ -n "$PGHOST" ] && [ -n "$PGPASS" ] && [ -n "$PGDB" ] || {
  echo "ERROR: missing DB settings. host='$PGHOST' db='$PGDB' user='$PGUSER' pass set=$([ -n "$PGPASS" ] && echo yes || echo no) secret set=$([ -n "$SECRET" ] && echo yes || echo no)"
  exit 1
}
echo "[radius] db host:    $PGHOST:$PGPORT/$PGDB  user=$PGUSER"
echo "[radius] shared secret detected (${#SECRET} chars)"

# --- Find the compose network the AROFi app is on. ---
# The APP container is always on the CURRENT compose network (Coolify attaches it
# there on every redeploy). Joining the APP's network guarantees the "postgres"
# DNS alias resolves, because Coolify's compose projects add service-name aliases
# to their project networks.
#
# The APP may also be on the Coolify proxy network (named "coolify*") — we skip
# that; it doesn't have the postgres alias.
NET=""
for n in $(docker inspect -f '{{range $k,$v := .NetworkSettings.Networks}}{{$k}} {{end}}' "$APP"); do
  case "$n" in coolify*) continue ;; esac
  NET="$n"
  break
done
# Absolute fallback: use the first network the APP is on (handles edge cases).
[ -n "$NET" ] || NET="$(docker inspect -f '{{range $k,$v := .NetworkSettings.Networks}}{{$k}} {{end}}' "$APP" | awk '{print $1}')"
[ -n "$NET" ] || { echo "ERROR: could not determine a docker network to join."; exit 1; }
echo "[radius] network:    $NET"

# --- (Re)create the FreeRADIUS container. ---
docker rm -f arofi-freeradius 2>/dev/null || true
docker run -d --name arofi-freeradius --restart unless-stopped \
  --network "$NET" \
  -p 1812:1812/udp -p 1813:1813/udp \
  -v "$CFG_DIR":/arofi-freeradius:ro \
  -e POSTGRES_HOST="$PGHOST" \
  -e POSTGRES_PORT="$PGPORT" \
  -e POSTGRES_USER="$PGUSER" \
  -e POSTGRES_PASSWORD="$PGPASS" \
  -e POSTGRES_DB="$PGDB" \
  -e RADIUS_SHARED_SECRET="$SECRET" \
  -e AROFI_RADIUS_DEBUG="${AROFI_RADIUS_DEBUG:-0}" \
  --entrypoint /bin/sh \
  "$IMAGE" /arofi-freeradius/entrypoint.sh

sleep 3
echo ""
echo "[radius] container state:"
docker ps --filter name=arofi-freeradius --format '  {{.Names}}  {{.Status}}'
echo ""
echo "[radius] last log lines:"
docker logs --tail 25 arofi-freeradius 2>&1 || true
echo ""
echo "[radius] Watch it authenticate a real customer with:  docker logs -f arofi-freeradius"
