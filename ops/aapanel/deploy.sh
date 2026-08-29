#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
NODE_BIN="/www/server/nodejs/v20.20.2/bin"
export PATH="$NODE_BIN:$PATH"

cd "$ROOT"

echo "[AROFI] Repo root: $ROOT"

if [ ! -f package-lock.json ]; then
  echo "[AROFI] package-lock.json missing from working tree; restoring it from the checked-out Git commit"
  git show HEAD:package-lock.json > package-lock.json
fi

if [ ! -s package-lock.json ]; then
  echo "[AROFI] ERROR: package-lock.json could not be restored"
  exit 1
fi

echo "[AROFI] Installing locked workspace dependencies (including build tools)"
NODE_ENV=development npm ci --include=dev --no-audit --no-fund

export NODE_ENV=production

echo "[AROFI] Generating Prisma client"
npm run prisma:generate --workspace=arofi-api

echo "[AROFI] Applying production database migrations"
(
  cd apps/api
  npx prisma migrate deploy --schema=prisma/schema.prisma
)

echo "[AROFI] Verifying Next.js build installation"
node -e "require.resolve('next/dist/build/swc/index.js'); console.log('[AROFI] Next.js SWC build module OK')"

echo "[AROFI] Building API"
npm run build --workspace=arofi-api

echo "[AROFI] Building Portal"
npm run build --workspace=arofi-portal

echo "[AROFI] Re-checking Next.js build installation"
node -e "require.resolve('next/dist/build/swc/index.js'); console.log('[AROFI] Next.js SWC build module still OK')"

echo "[AROFI] Building Admin"
npm run build --workspace=arofi-admin

echo "[AROFI] Starting/reloading all services with PM2"
pm2 startOrReload ops/aapanel/ecosystem.config.cjs --update-env
pm2 save

echo "[AROFI] Deployment complete"
pm2 status
