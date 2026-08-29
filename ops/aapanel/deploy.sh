#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
NODE_BIN="/www/server/nodejs/v20.20.2/bin"
export PATH="$NODE_BIN:$PATH"
export TURBO_TELEMETRY_DISABLED=1
export NEXT_TELEMETRY_DISABLED=1
export GENERATE_SOURCEMAP=false
export UV_THREADPOOL_SIZE=1
export NPM_CONFIG_AUDIT=false
export NPM_CONFIG_FUND=false
export NPM_CONFIG_PROGRESS=false
export NPM_CONFIG_FETCH_RETRIES=4
export NPM_CONFIG_FETCH_RETRY_MINTIMEOUT=10000
export NPM_CONFIG_FETCH_RETRY_MAXTIMEOUT=30000
export NPM_CONFIG_FETCH_TIMEOUT=60000

cd "$ROOT"

echo "[AROFI] Repo root: $ROOT"

echo "[AROFI] Resetting tracked source to the deployed Git commit"
git reset --hard HEAD

if [ ! -f package-lock.json ]; then
  echo "[AROFI] package-lock.json missing from working tree; restoring it from the checked-out Git commit"
  git show HEAD:package-lock.json > package-lock.json
fi

if [ ! -s package-lock.json ]; then
  echo "[AROFI] ERROR: package-lock.json could not be restored"
  exit 1
fi

if ! command -v python3 >/dev/null 2>&1; then
  echo "[AROFI] ERROR: python3 is required by the repository production patch pipeline"
  exit 1
fi

install_dependencies() {
  NODE_ENV=development npm ci --include=dev --no-audit --no-fund --progress=false --prefer-online
}

verify_next_install() {
  node <<'NODE'
const fs = require('fs')
const path = require('path')

try {
  const packagePath = require.resolve('next/package.json')
  const nextRoot = path.dirname(packagePath)
  const version = require(packagePath).version
  const requiredFiles = [
    'dist/server/route-modules/app-page/module.compiled.js',
    'dist/server/route-modules/pages/module.compiled.js',
  ]

  if (version !== '16.2.6') {
    throw new Error(`expected Next 16.2.6 but found ${version}`)
  }

  for (const relativePath of requiredFiles) {
    const absolutePath = path.join(nextRoot, relativePath)
    if (!fs.existsSync(absolutePath) || fs.statSync(absolutePath).size === 0) {
      throw new Error(`missing required Next runtime file: ${absolutePath}`)
    }
  }

  console.log(`[AROFI] Next ${version} installation verified`)
} catch (error) {
  console.error(`[AROFI] Next installation verification failed: ${error.message}`)
  process.exit(1)
}
NODE
}

echo "[AROFI] Installing locked workspace dependencies (including build tools)"
install_dependencies

if ! verify_next_install; then
  echo "[AROFI] Detected an incomplete/corrupt Next installation; repairing dependencies once before build"
  rm -rf node_modules
  npm cache clean --force
  install_dependencies
  if ! verify_next_install; then
    echo "[AROFI] ERROR: Next installation is still incomplete after a clean reinstall; refusing to waste time on a doomed build"
    exit 1
  fi
fi

echo "[AROFI] Applying the repository's guarded production source patches"
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

echo "[AROFI] Generating Prisma client from patched production schema"
npx prisma generate --schema=apps/api/prisma/schema.prisma

echo "[AROFI] Applying production database migrations"
(
  cd apps/api
  npx prisma migrate deploy --schema=prisma/schema.prisma
)

echo "[AROFI] Clearing stale build output"
rm -rf apps/admin-web/.next apps/portal-web/.next apps/api/dist

echo "[AROFI] Building Admin with production memory limits"
NODE_OPTIONS='--max-old-space-size=640 --max-semi-space-size=8' NEXT_CPU_LIMIT=1 CI=1 \
  npm run build --workspace=arofi-admin

echo "[AROFI] Building Portal with production memory limits"
NODE_OPTIONS='--max-old-space-size=512 --max-semi-space-size=8' NEXT_CPU_LIMIT=1 CI=1 \
  npm run build --workspace=arofi-portal

echo "[AROFI] Building API"
NODE_OPTIONS='--max-old-space-size=1024 --max-semi-space-size=8' CI=1 \
  npm run build --workspace=arofi-api

echo "[AROFI] Starting/reloading API, Admin and Portal with PM2"
pm2 startOrReload ops/aapanel/ecosystem.config.cjs --update-env
pm2 save

echo "[AROFI] Deployment complete"
pm2 status
