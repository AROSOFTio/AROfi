#!/bin/sh
# All-in-one entrypoint: runs the API, admin-web, and portal-web inside a single
# container, fronted by nginx on port 3000. Used for single-app deployments
# (e.g. Coolify) where one container serves the whole product on one domain.
set -e

ROOT=/usr/src/app

# --- API (port 3001) ---
cd "$ROOT/apps/api"
if [ -n "$DATABASE_URL" ]; then
  echo "[start-all] Running prisma migrate deploy..."
  npx prisma migrate deploy || echo "[start-all] migrate deploy failed (continuing)"
fi
if [ -f dist/main.js ]; then
  PORT=3001 node dist/main.js &
else
  PORT=3001 node dist/src/main.js &
fi
echo "[start-all] API started on :3001"

# --- Admin web (port 3002) ---
cd "$ROOT/apps/admin-web"
PORT=3002 npm run start &
echo "[start-all] admin-web started on :3002"

# --- Portal web (port 3003) ---
cd "$ROOT/apps/portal-web"
PORT=3003 npm run start &
echo "[start-all] portal-web started on :3003"

# --- nginx (foreground, port 3000) ---
echo "[start-all] starting nginx on :3000"
exec nginx -g 'daemon off;'
