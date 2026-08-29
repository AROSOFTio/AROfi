#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
NODE_BIN="/www/server/nodejs/v20.20.2/bin"
PM2="$NODE_BIN/pm2"

cd "$ROOT"

admin_server="$ROOT/apps/admin-web/.next/standalone/apps/admin-web/server.js"
portal_server="$ROOT/apps/portal-web/.next/standalone/apps/portal-web/server.js"
api_main="$ROOT/apps/api/dist/main.js"
api_src_main="$ROOT/apps/api/dist/src/main.js"

# aaPanel Git deployments replace the checkout and can remove untracked build
# artifacts (.next and dist). If that happened, recover them once using the
# already-installed dependencies instead of entering a PM2 crash loop.
if [ ! -f "$admin_server" ] || [ ! -f "$portal_server" ] || { [ ! -f "$api_main" ] && [ ! -f "$api_src_main" ]; }; then
  echo "[AROFI] Generated runtime files are missing after Git deployment; running fast recovery build"
  exec bash "$ROOT/ops/aapanel/recover-runtime.sh"
fi

echo "[AROFI] Preparing standalone Admin and Portal runtimes"

prepare_web_runtime() {
  local app="$1"
  local app_root="$ROOT/apps/$app"
  local standalone="$app_root/.next/standalone/apps/$app"

  if [ ! -f "$standalone/server.js" ]; then
    echo "[AROFI] ERROR: standalone server missing for $app: $standalone/server.js"
    exit 1
  fi
  if [ ! -d "$app_root/.next/static" ]; then
    echo "[AROFI] ERROR: static build output missing for $app: $app_root/.next/static"
    exit 1
  fi

  mkdir -p "$standalone/.next"
  rm -rf "$standalone/.next/static" "$standalone/public"
  ln -s "$app_root/.next/static" "$standalone/.next/static"
  if [ -d "$app_root/public" ]; then
    ln -s "$app_root/public" "$standalone/public"
  fi
}

prepare_web_runtime admin-web
prepare_web_runtime portal-web

echo "[AROFI] Moving runtime services to aaPanel's www PM2 account"

# Remove only the three AROFi runtime apps from the root-owned PM2 daemon.
# Do not kill the daemon because aaPanel may have other root-managed processes.
if [ -x "$PM2" ]; then
  "$PM2" delete arofi_api arofi_admin arofi_portal >/dev/null 2>&1 || true
  "$PM2" save >/dev/null 2>&1 || true
fi

# aaPanel's Node project manager and PM2 Monitor operate under the www account.
# Start/reload the real AROFi services there so the GUI can see and manage them.
sudo -u www -H bash -lc "
  export PATH='$NODE_BIN':\$PATH
  export PM2_HOME=/home/www/.pm2
  cd '$ROOT'
  '$PM2' delete arofi_api arofi_admin arofi_portal >/dev/null 2>&1 || true
  '$PM2' start ops/aapanel/ecosystem.config.cjs --update-env
  '$PM2' save
  sleep 3
  '$PM2' status
"

echo "[AROFI] Runtime services are now owned by www PM2"
