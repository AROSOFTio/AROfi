#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
NODE_BIN="/www/server/nodejs/v20.20.2/bin"
export PATH="$NODE_BIN:$PATH"
export NODE_ENV=production

cd "$ROOT"

echo "[AROFI] Repo root: $ROOT"
echo "[AROFI] Installing locked workspace dependencies"
npm ci --no-audit --no-fund

echo "[AROFI] Generating Prisma client"
npm run prisma:generate --workspace=arofi-api

echo "[AROFI] Applying production database migrations"
(
  cd apps/api
  npx prisma migrate deploy --schema=prisma/schema.prisma
)

echo "[AROFI] Building API, Admin and Portal"
npm run build

echo "[AROFI] Starting/reloading all services with PM2"
pm2 startOrReload ops/aapanel/ecosystem.config.cjs --update-env
pm2 save

echo "[AROFI] Deployment complete"
pm2 status
