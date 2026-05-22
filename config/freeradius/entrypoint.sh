#!/bin/sh
set -eu

if ! find / -name libpq.so.5 -print -quit 2>/dev/null | grep -q .; then
  if command -v apk >/dev/null 2>&1; then
    apk add --no-cache postgresql-libs
  fi
fi

if [ -d /arofi-freeradius ]; then
  cp /arofi-freeradius/clients.conf /etc/raddb/clients.conf
  mkdir -p /etc/raddb/mods-config/files /etc/raddb/mods-available /etc/raddb/sites-enabled
  cp /arofi-freeradius/mods-config/files/authorize /etc/raddb/mods-config/files/authorize
  cp /arofi-freeradius/mods-available/sql /etc/raddb/mods-available/sql
  cp /arofi-freeradius/sites-enabled/default /etc/raddb/sites-enabled/default
  cp /arofi-freeradius/sites-enabled/inner-tunnel /etc/raddb/sites-enabled/inner-tunnel
  chmod 0640 \
    /etc/raddb/clients.conf \
    /etc/raddb/mods-config/files/authorize \
    /etc/raddb/mods-available/sql \
    /etc/raddb/sites-enabled/default \
    /etc/raddb/sites-enabled/inner-tunnel
fi

rm -f /etc/raddb/mods-enabled/eap /opt/etc/raddb/mods-enabled/eap 2>/dev/null || true
ln -sf /etc/raddb/mods-available/sql /etc/raddb/mods-enabled/sql
if [ -e /etc/raddb/mods-available/acct_unique ]; then
  ln -sf /etc/raddb/mods-available/acct_unique /etc/raddb/mods-enabled/acct_unique
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

exec "$SERVER_BIN" -f
