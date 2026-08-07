#!/bin/sh
# All-in-one entrypoint: runs the API, admin-web, and portal-web inside a single
# container, fronted by nginx on port 3000.
set -e

ROOT=/usr/src/app

find_next_server() {
  bundle="$1"
  app_name="$2"
  server="$(find "$bundle" -type f -path "*/apps/$app_name/server.js" -print -quit)"
  if [ -z "$server" ] && [ -f "$bundle/server.js" ]; then
    server="$bundle/server.js"
  fi
  if [ ! -f "$server" ]; then
    echo "[start-all] ERROR: standalone server for $app_name was not found in $bundle" >&2
    exit 1
  fi
  printf '%s\n' "$server"
}

start_next_app() {
  bundle="$1"
  app_name="$2"
  port="$3"
  server="$(find_next_server "$bundle" "$app_name")"
  app_dir="$(dirname "$server")"
  (
    cd "$app_dir"
    PORT="$port" HOSTNAME=0.0.0.0 node server.js
  ) &
  echo "[start-all] $app_name started on :$port from $app_dir"
}

# --- API (port 3001) ---
cd "$ROOT/apps/api"
if [ -n "$DATABASE_URL" ]; then
  echo "[start-all] Running prisma migrate deploy..."
  if ./node_modules/.bin/prisma migrate deploy; then
    echo "[start-all] migrate deploy OK"
  else
    echo "[start-all] WARNING: migrate deploy failed. Applying critical safety-net SQL."
    ./node_modules/.bin/prisma db execute --url "$DATABASE_URL" --stdin <<'SQL' || echo "[start-all] safety-net SQL skipped"
ALTER TABLE "nas" ALTER COLUMN "secret" TYPE VARCHAR(128);
ALTER TABLE "PlatformSetting" ADD COLUMN IF NOT EXISTS "platformWalletBalanceUgx" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "Wallet" ADD COLUMN IF NOT EXISTS "earnedBalanceUgx" INTEGER NOT NULL DEFAULT 0;
ALTER TYPE "BillingTransactionType" ADD VALUE IF NOT EXISTS 'TENANT_WALLET_TOPUP';
SQL
  fi
fi
if [ -f dist/main.js ]; then
  PORT=3001 node dist/main.js &
else
  PORT=3001 node dist/src/main.js &
fi
echo "[start-all] API started on :3001"

# Server-rendered web requests reach the API through localhost inside this one
# container. Browser requests continue using nginx's /api route.
export API_SERVER_URL=http://127.0.0.1:3001/api
export NEXT_PUBLIC_API_URL=/api

# --- Next.js standalone servers ---
start_next_app "$ROOT/standalone/admin" admin-web 3002
start_next_app "$ROOT/standalone/portal" portal-web 3003

# --- nginx (foreground, port 3000) ---
echo "[start-all] starting nginx on :3000"
exec nginx -g 'daemon off;'
