#!/bin/sh
set -eu

ln -sf /etc/raddb/mods-available/sql /etc/raddb/mods-enabled/sql

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
