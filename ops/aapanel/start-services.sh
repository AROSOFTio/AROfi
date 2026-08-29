#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
NODE_BIN="/www/server/nodejs/v20.20.2/bin"
PM2="$NODE_BIN/pm2"

cd "$ROOT"

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
