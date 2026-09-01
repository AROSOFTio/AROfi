#!/usr/bin/env sh
set -eu

BACKUP_DIR="${AROFI_BACKUP_DIR:-/var/lib/arofi/backups}"

echo "AROFi Backup & Recovery preflight"
echo "backup_dir=$BACKUP_DIR"

for tool in pg_dump pg_restore psql createdb tar; do
  command -v "$tool" >/dev/null 2>&1 || { echo "missing_tool=$tool"; exit 1; }
done

mkdir -p "$BACKUP_DIR"
probe="$BACKUP_DIR/.preflight_$$"
printf 'ok' > "$probe"
rm -f "$probe"

if [ -n "${DATABASE_URL:-}" ]; then
  echo "database_url=present"
else
  echo "database_url=missing"
  exit 1
fi

echo "backup_recovery_preflight=ok"
