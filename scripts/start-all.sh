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
  if npx prisma migrate deploy; then
    echo "[start-all] migrate deploy OK"
  else
    echo "[start-all] WARNING: migrate deploy failed. Forcing critical column widths so router registration still works."
    # Idempotent safety net: guarantees the columns that block onboarding are
    # wide enough even if a migration could not be applied cleanly.
    npx prisma db execute --url "$DATABASE_URL" --stdin <<'SQL' || echo "[start-all] safety-net SQL skipped"
ALTER TABLE "nas" ALTER COLUMN "secret" TYPE VARCHAR(128);
SQL
  fi
fi
if [ -f dist/main.js ]; then
  PORT=3001 node dist/main.js &
else
  PORT=3001 node dist/src/main.js &
fi
echo "[start-all] API started on :3001"

# admin-web / portal-web do server-side (SSR) calls to the API. Inside this
# single container the API is on 127.0.0.1:3001 (nginx owns 3000), and there is
# no docker service named "api". Force the internal URL so an external value
# like http://api:3000/api can't break SSR auth and cause a /login reload loop.
export API_SERVER_URL=http://127.0.0.1:3001/api
export NEXT_PUBLIC_API_URL=/api

# --- Admin web (port 3002) ---
cd "$ROOT/apps/admin-web"
PORT=3002 npm run start &
echo "[start-all] admin-web started on :3002"

# --- Portal web (port 3003) ---
cd "$ROOT/apps/portal-web"
PORT=3003 npm run start &
echo "[start-all] portal-web started on :3003"

# --- nginx (foreground, port 3000) ---
# Start nginx immediately so Coolify's health check can reach port 3000.
# nginx.coolify.conf already has proxy_connect_timeout / proxy_read_timeout
# set so it will naturally 502 for any upstream that isn't ready yet and
# recover as soon as the Node process binds its port — no manual wait needed.
echo "[start-all] starting nginx on :3000"
exec nginx -g 'daemon off;'
