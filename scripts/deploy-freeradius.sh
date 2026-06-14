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

# 1. Find the AROFi Postgres container.
PG="$(docker ps --format '{{.ID}} {{.Names}}' | grep -i postgres | awk '{print $1}' | head -n1)"
[ -n "$PG" ] || { echo "ERROR: no running postgres container found (docker ps | grep postgres)."; exit 1; }
PG_NAME="$(docker inspect -f '{{.Name}}' "$PG" | sed 's#^/##')"
echo "[radius] postgres:   $PG_NAME"

# 2. The docker network postgres is attached to (so FreeRADIUS can reach it by name).
NET="$(docker inspect -f '{{range $k,$v := .NetworkSettings.Networks}}{{$k}} {{end}}' "$PG" | awk '{print $1}')"
[ -n "$NET" ] || { echo "ERROR: could not determine postgres network."; exit 1; }
echo "[radius] network:    $NET"

# 3. Database credentials, read straight from the postgres container.
PGUSER="$(docker exec "$PG" printenv POSTGRES_USER 2>/dev/null || echo arofi)"
PGPASS="$(docker exec "$PG" printenv POSTGRES_PASSWORD 2>/dev/null || true)"
PGDB="$(docker exec "$PG" printenv POSTGRES_DB 2>/dev/null || echo arofi)"
[ -n "$PGPASS" ] || { echo "ERROR: could not read POSTGRES_PASSWORD from $PG_NAME."; exit 1; }

# 4. RADIUS shared secret, detected from whichever running container has it set
#    (the AROFi API/all-in-one container). Must match the routers' scripts.
SECRET=""
for c in $(docker ps -q); do
  v="$(docker exec "$c" printenv RADIUS_SHARED_SECRET 2>/dev/null || true)"
  if [ -n "$v" ]; then SECRET="$v"; break; fi
done
[ -n "$SECRET" ] || { echo "ERROR: RADIUS_SHARED_SECRET not found in any container. Pass it: RADIUS_SHARED_SECRET=... sh scripts/deploy-freeradius.sh"; exit 1; }
SECRET="${RADIUS_SHARED_SECRET:-$SECRET}"
echo "[radius] shared secret detected (${#SECRET} chars)"

# 5. (Re)create the FreeRADIUS container.
docker rm -f arofi-freeradius 2>/dev/null || true
docker run -d --name arofi-freeradius --restart unless-stopped \
  --network "$NET" \
  -p 1812:1812/udp -p 1813:1813/udp \
  -v "$CFG_DIR":/arofi-freeradius:ro \
  -e POSTGRES_HOST="$PG_NAME" \
  -e POSTGRES_PORT=5432 \
  -e POSTGRES_USER="$PGUSER" \
  -e POSTGRES_PASSWORD="$PGPASS" \
  -e POSTGRES_DB="$PGDB" \
  -e RADIUS_SHARED_SECRET="$SECRET" \
  --entrypoint /bin/sh \
  "$IMAGE" /arofi-freeradius/entrypoint.sh

echo ""
echo "[radius] started. Watch it authenticate a real customer with:"
echo "         docker logs -f arofi-freeradius"
echo "[radius] If config is bad it prints the exact error and exits — read the logs."
