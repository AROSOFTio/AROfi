#!/bin/sh
set -eu

# Required environment — fail fast instead of starting an unauthenticatable
# (or worse, empty-secret) RADIUS server.
if [ -z "${RADIUS_SHARED_SECRET:-}" ]; then
  echo "FATAL: RADIUS_SHARED_SECRET is not set. Refusing to start FreeRADIUS." >&2
  exit 1
fi

# RADIUS_CLIENT_CIDR default is 0.0.0.0/0 (accept a NAS client from any
# source IP) — this is CORRECT and INTENDED for a self-service, nationwide
# SaaS where routers self-register from unknown IPs with zero server-side
# action. Security comes from the shared secret plus per-request SQL
# credential validation (see clients.conf), not from an IP allowlist.
#
# Optional: operators who deliberately run a closed/private deployment can
# still narrow this to a comma-separated list of IPs/CIDRs, e.g.
#   RADIUS_CLIENT_CIDR=102.134.5.9/32,41.210.3.20/32
# One `client` block is generated per entry. Do not set this for a normal
# public self-service platform — it would reject every router whose IP
# isn't already listed, breaking self-service onboarding.
RADIUS_CLIENT_CIDR="${RADIUS_CLIENT_CIDR:-0.0.0.0/0}"
RADIUS_REQUIRE_MESSAGE_AUTHENTICATOR="${RADIUS_REQUIRE_MESSAGE_AUTHENTICATOR:-no}"

if ! find / -name libpq.so.5 -print -quit 2>/dev/null | grep -q .; then
  if command -v apk >/dev/null 2>&1; then
    apk add --no-cache postgresql-libs
  fi
fi

if [ -d /arofi-freeradius ]; then
  for raddb_dir in /etc/raddb /opt/etc/raddb; do
    if [ ! -d "$raddb_dir" ]; then
      continue
    fi

    cp /arofi-freeradius/clients.conf "$raddb_dir/clients.conf"
    sed -i "s/\$ENV{RADIUS_SHARED_SECRET}/$RADIUS_SHARED_SECRET/g" "$raddb_dir/clients.conf"

    # Append one `client` block per comma-separated RADIUS_CLIENT_CIDR entry.
    # Re-run on every container start, so clients.conf always matches the
    # current env var — nothing to hand-edit or keep in sync manually.
    n=0
    old_ifs="$IFS"
    IFS=','
    for cidr in $RADIUS_CLIENT_CIDR; do
      IFS="$old_ifs"
      cidr_trimmed=$(echo "$cidr" | sed 's/^ *//; s/ *$//')
      [ -n "$cidr_trimmed" ] || continue
      n=$((n + 1))
      {
        echo ""
        echo "client arofi-nas-$n {"
        echo "	ipaddr = $cidr_trimmed"
        echo "	secret = $RADIUS_SHARED_SECRET"
        echo "	shortname = arofi-nas-$n"
        echo "	nas_type = other"
        echo "	require_message_authenticator = $RADIUS_REQUIRE_MESSAGE_AUTHENTICATOR"
        echo "}"
      } >> "$raddb_dir/clients.conf"
      IFS=','
    done
    IFS="$old_ifs"
    echo "[radius] configured $n NAS client CIDR(s) from RADIUS_CLIENT_CIDR"
    mkdir -p "$raddb_dir/mods-config/files" "$raddb_dir/mods-available" "$raddb_dir/sites-enabled" "$raddb_dir/mods-enabled"
    cp /arofi-freeradius/mods-config/files/authorize "$raddb_dir/mods-config/files/authorize"
    cp /arofi-freeradius/mods-available/sql "$raddb_dir/mods-available/sql"
    cp /arofi-freeradius/sites-enabled/default "$raddb_dir/sites-enabled/default"
    cp /arofi-freeradius/sites-enabled/inner-tunnel "$raddb_dir/sites-enabled/inner-tunnel"
    # Find the group owner of radiusd.conf dynamically, fallback to freerad
    RAD_GROUP=$(stat -c '%g' "$raddb_dir/radiusd.conf" 2>/dev/null || stat -c '%G' "$raddb_dir/radiusd.conf" 2>/dev/null || echo "freerad")

    chown :"$RAD_GROUP" \
      "$raddb_dir/clients.conf" \
      "$raddb_dir/mods-config/files/authorize" \
      "$raddb_dir/mods-available/sql" \
      "$raddb_dir/sites-enabled/default" \
      "$raddb_dir/sites-enabled/inner-tunnel"

    chmod 0640 \
      "$raddb_dir/clients.conf" \
      "$raddb_dir/mods-config/files/authorize" \
      "$raddb_dir/mods-available/sql" \
      "$raddb_dir/sites-enabled/default" \
      "$raddb_dir/sites-enabled/inner-tunnel"

    rm -f "$raddb_dir/mods-enabled/eap" 2>/dev/null || true
    ln -sf "$raddb_dir/mods-available/sql" "$raddb_dir/mods-enabled/sql"
    if [ -e "$raddb_dir/mods-available/acct_unique" ]; then
      ln -sf "$raddb_dir/mods-available/acct_unique" "$raddb_dir/mods-enabled/acct_unique"
    fi
  done
fi

SERVER_BIN=""

for candidate in freeradius radiusd /usr/sbin/freeradius /usr/sbin/radiusd /opt/sbin/freeradius /opt/sbin/radiusd; do
  if command -v "$candidate" >/dev/null 2>&1; then
    SERVER_BIN="$(command -v "$candidate")"
    break
  fi

  if [ -x "$candidate" ]; then
    SERVER_BIN="$candidate"
    break
  fi
done

if [ -z "$SERVER_BIN" ]; then
  SERVER_BIN="$(find / -maxdepth 5 -type f \( -name 'freeradius' -o -name 'radiusd' \) 2>/dev/null | head -n 1 || true)"
fi

if [ -z "$SERVER_BIN" ]; then
  echo "Could not find FreeRADIUS server binary. Available radius commands:" >&2
  find / -maxdepth 5 -type f \( -name 'freeradius' -o -name 'radiusd' \) 2>/dev/null >&2 || true
  exit 127
fi

echo "Starting FreeRADIUS with $SERVER_BIN"
if ! "$SERVER_BIN" -C; then
  echo "FreeRADIUS config validation failed. Running debug mode once so docker logs show the real error." >&2
  "$SERVER_BIN" -X || true
  exit 1
fi

if [ "${AROFI_RADIUS_DEBUG:-}" = "1" ]; then
  exec "$SERVER_BIN" -X
fi

exec "$SERVER_BIN" -f
