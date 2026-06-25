#!/bin/sh
set -eu

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
    if [ -n "${RADIUS_SHARED_SECRET:-}" ]; then
      sed -i "s/\$ENV{RADIUS_SHARED_SECRET}/$RADIUS_SHARED_SECRET/g" "$raddb_dir/clients.conf"
    fi
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
