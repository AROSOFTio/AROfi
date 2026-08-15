#!/bin/sh
# Start the API without making docker compose wait on a cross-service health
# dependency. The container itself waits for PostgreSQL, applies migrations,
# then starts NestJS. restart: unless-stopped handles any later DB outage.
set -eu

# Hard safety boundary: validate desktop/dev/production isolation BEFORE
# touching PostgreSQL or running Prisma migrations. A bad environment must
# fail here rather than migrate or contact the wrong AroFi deployment.
node /usr/src/app/scripts/assert_deployment_isolation.js

cd /usr/src/app/apps/api

if [ -n "${DATABASE_URL:-}" ]; then
  echo "[start-api] Waiting for PostgreSQL..."
  attempt=0
  until node <<'NODE'
const { Client } = require('pg')
const client = new Client({ connectionString: process.env.DATABASE_URL, connectionTimeoutMillis: 3000 })
client.connect()
  .then(() => client.end())
  .then(() => process.exit(0))
  .catch(() => process.exit(1))
NODE
  do
    attempt=$((attempt + 1))
    if [ "$attempt" -ge 90 ]; then
      echo "[start-api] PostgreSQL was not ready after 180 seconds. Exiting so Docker can restart the container."
      exit 1
    fi
    sleep 2
  done

  echo "[start-api] PostgreSQL is ready. Applying Prisma migrations..."
  migration_attempt=0
  until ./node_modules/.bin/prisma migrate deploy; do
    migration_attempt=$((migration_attempt + 1))
    if [ "$migration_attempt" -ge 5 ]; then
      echo "[start-api] Prisma migrations failed after 5 attempts. Exiting instead of running an incompatible API."
      exit 1
    fi
    echo "[start-api] Migration attempt $migration_attempt failed; retrying in 5 seconds..."
    sleep 5
  done
fi

if [ -f dist/main.js ]; then
  exec node dist/main.js
fi

exec node dist/src/main.js
