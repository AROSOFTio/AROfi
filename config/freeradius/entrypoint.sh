#!/bin/sh
set -eu

ln -sf /etc/raddb/mods-available/sql /etc/raddb/mods-enabled/sql

if command -v freeradius >/dev/null 2>&1; then
  exec freeradius -f
fi

if command -v radiusd >/dev/null 2>&1; then
  exec radiusd -f
fi

if [ -x /usr/sbin/freeradius ]; then
  exec /usr/sbin/freeradius -f
fi

if [ -x /usr/sbin/radiusd ]; then
  exec /usr/sbin/radiusd -f
fi

echo "Could not find FreeRADIUS server binary. Available radius commands:" >&2
find / -maxdepth 4 -type f \( -name 'freeradius' -o -name 'radiusd' \) 2>/dev/null >&2 || true
exit 127
