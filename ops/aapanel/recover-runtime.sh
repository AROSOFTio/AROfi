#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
NODE_BIN="/www/server/nodejs/v20.20.2/bin"
PM2="$NODE_BIN/pm2"
export PATH="$NODE_BIN:$PATH"
export TURBO_TELEMETRY_DISABLED=1
export NEXT_TELEMETRY_DISABLED=1
export GENERATE_SOURCEMAP=false
export UV_THREADPOOL_SIZE=1
export NPM_CONFIG_AUDIT=false
export NPM_CONFIG_FUND=false
export NPM_CONFIG_PROGRESS=false

cd "$ROOT"

echo "[AROFI] Fast runtime recovery starting from $ROOT"

echo "[AROFI] Stopping the current www PM2 crash loop"
sudo -u www -H bash -lc "
  export PATH='$NODE_BIN':\$PATH
  export PM2_HOME=/home/www/.pm2
  '$PM2' delete arofi_api arofi_admin arofi_portal >/dev/null 2>&1 || true
  '$PM2' save >/dev/null 2>&1 || true
"

need_install=0
for file in \
  node_modules/.bin/next \
  node_modules/.bin/nest \
  node_modules/next/package.json \
  node_modules/next/dist/server/route-modules/app-page/module.compiled.js; do
  if [ ! -e "$file" ]; then
    echo "[AROFI] Missing dependency file: $file"
    need_install=1
  fi
done

if [ "$need_install" -eq 1 ]; then
  echo "[AROFI] Existing dependencies are incomplete; performing one locked reinstall"
  if [ ! -f package-lock.json ]; then
    git show HEAD:package-lock.json > package-lock.json
  fi
  NODE_ENV=development npm ci --include=dev --no-audit --no-fund --progress=false --prefer-online
else
  echo "[AROFI] Existing node_modules verified; skipping dependency installation"
fi

if ! command -v python3 >/dev/null 2>&1; then
  echo "[AROFI] ERROR: python3 is required"
  exit 1
fi

echo "[AROFI] Applying required production source patches"
python3 scripts/apply_iotec_source_patches.py
python3 scripts/apply_unified_gateway_patches.py
python3 scripts/apply_gateway_webhook_patches.py
python3 scripts/hide_pesapal_gateway.py
python3 scripts/apply_live_gateway_activation.py
python3 scripts/preserve_yo_uganda_gateway.py
python3 scripts/apply_voucher_preview_patches.py
python3 scripts/apply_voucher_dashboard_patches.py
python3 scripts/finalize_voucher_dashboard.py
python3 scripts/fix_lucide_icon_compat.py
python3 scripts/apply_public_content_patches.py
python3 scripts/apply_portal_tv_package_patches_v2.py
python3 scripts/apply_router_compensation_review.py
python3 scripts/apply_router_compensation_ui.py
python3 scripts/fix_support_ticket_workspace.py
python3 scripts/apply_router_wan_port_support.py
python3 scripts/sanitize_mikrotik_command_output.py
python3 scripts/apply_mikrotik_background_install.py
python3 scripts/enforce_no_idle_bundle_logout.py
python3 scripts/fix_router_presence_and_access_lifecycle.py
python3 scripts/stabilize_router_status_hysteresis.py
python3 scripts/fix_iotec_live_gateway_diagnostics.py
python3 scripts/fix_iotec_oauth_compatibility.py
python3 scripts/finalize_gateway_compile.py
python3 scripts/verify_router_captive_invariants.py
python3 scripts/forbid_mikrotik_auto_mac_auth.py

export NODE_ENV=production

echo "[AROFI] Generating Prisma client"
npx prisma generate --schema=apps/api/prisma/schema.prisma

echo "[AROFI] Clearing only generated build output"
rm -rf apps/admin-web/.next apps/portal-web/.next apps/api/dist

echo "[AROFI] Building Admin"
NODE_OPTIONS='--max-old-space-size=640 --max-semi-space-size=8' NEXT_CPU_LIMIT=1 CI=1 \
  npm run build --workspace=arofi-admin

echo "[AROFI] Building Portal"
NODE_OPTIONS='--max-old-space-size=512 --max-semi-space-size=8' NEXT_CPU_LIMIT=1 CI=1 \
  npm run build --workspace=arofi-portal

echo "[AROFI] Building API"
NODE_OPTIONS='--max-old-space-size=1024 --max-semi-space-size=8' CI=1 \
  npm run build --workspace=arofi-api

echo "[AROFI] Starting services through the aaPanel www PM2 account"
bash "$ROOT/ops/aapanel/start-services.sh"

sleep 5

echo "[AROFI] Verifying runtime ports"
for port in 3001 3002 3003; do
  if ss -ltn | grep -q ":${port} "; then
    echo "[AROFI] Port $port is listening"
  else
    echo "[AROFI] ERROR: port $port is not listening"
    sudo -u www -H bash -lc "export PM2_HOME=/home/www/.pm2; '$PM2' status" || true
    exit 1
  fi
done

echo "[AROFI] FAST RECOVERY COMPLETE — API 3001, Admin 3002, Portal 3003 are listening"
