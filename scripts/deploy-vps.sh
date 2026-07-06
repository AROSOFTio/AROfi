#!/usr/bin/env bash
# Manual VPS deployment: plain Docker Compose on a bare server, no Coolify and
# no control panel required.
set -euo pipefail

PROJECT_DIR="${PROJECT_DIR:-/opt/arofi}"
ENV_FILE="${PROJECT_DIR}/.env"
SEED_DATABASE="false"

if [ "${1:-}" = "--seed" ]; then
  SEED_DATABASE="true"
fi

cd "$PROJECT_DIR"

compose() {
  if docker compose version >/dev/null 2>&1; then
    docker compose "$@"
  elif command -v docker-compose >/dev/null 2>&1; then
    docker-compose "$@"
  else
    echo "Docker Compose is not installed. Install Docker and the Compose plugin first."
    exit 1
  fi
}

random_secret() {
  local num_bytes="${1:-32}"
  if command -v openssl >/dev/null 2>&1; then
    openssl rand -hex "$num_bytes"
  else
    date +%s%N | sha256sum | awk '{print $1}' | cut -c1-$((num_bytes * 2))
  fi
}

create_env_if_missing() {
  if [ -f "$ENV_FILE" ]; then
    return
  fi

  if [ ! -f ".env.vps.example" ]; then
    echo ".env is missing and .env.vps.example was not found."
    exit 1
  fi

  cp .env.vps.example "$ENV_FILE"

  sed -i "s/CHANGE_ME_STRONG_POSTGRES_PASSWORD/$(random_secret)/g" "$ENV_FILE"
  sed -i "s/CHANGE_ME_64_CHAR_RANDOM_JWT_SECRET/$(random_secret)/g" "$ENV_FILE"
  sed -i "s/CHANGE_ME_64_CHAR_RANDOM_PORTAL_TOKEN_SECRET/$(random_secret)/g" "$ENV_FILE"
  sed -i "s/CHANGE_ME_64_CHAR_RANDOM_ROUTER_SECRET/$(random_secret)/g" "$ENV_FILE"
  # RADIUS shared secret MUST be <= 32/64 characters to avoid buffer limits in pppd's radius client library
  sed -i "s/CHANGE_ME_RANDOM_RADIUS_SHARED_SECRET/$(random_secret 16)/g" "$ENV_FILE"
  sed -i "s/CHANGE_ME_RANDOM_RADIUS_INTERNAL_API_KEY/$(random_secret 16)/g" "$ENV_FILE"
  sed -i "s/CHANGE_ME_RANDOM_RADIUS_DISCONNECT_SECRET/$(random_secret 16)/g" "$ENV_FILE"

  echo "Created $ENV_FILE with generated secrets."
  echo "Edit payment credentials before going live:"
  echo "  nano $ENV_FILE"
}

require_env_value() {
  local key="$1"
  local value
  value="$(grep -E "^${key}=" "$ENV_FILE" | tail -n 1 | cut -d= -f2- || true)"

  if [ -z "$value" ] || echo "$value" | grep -Eq "CHANGE_ME|change_me|replace_with"; then
    echo "Set a real value for ${key} in ${ENV_FILE} before deploying."
    exit 1
  fi
}

create_env_if_missing

require_env_value POSTGRES_PASSWORD
require_env_value JWT_SECRET
require_env_value PORTAL_TOKEN_SECRET
require_env_value ROUTER_CREDENTIAL_SECRET
require_env_value RADIUS_SHARED_SECRET
require_env_value RADIUS_INTERNAL_API_KEY

# Payment gateway: Yo! Uganda is the only active provider
require_env_value YO_UGANDA_USERNAME
require_env_value YO_UGANDA_PASSWORD

# MTN / Airtel direct and Pesapal are disabled — Yo! Uganda handles all networks
# require_env_value MTN_MOMO_COLLECTION_SUBSCRIPTION_KEY
# require_env_value MTN_MOMO_COLLECTION_API_USER
# require_env_value MTN_MOMO_COLLECTION_API_KEY

echo "Pulling public images..."
compose pull --ignore-buildable || true

echo "Building AROFi images..."
compose build --no-cache

echo "Starting database services..."
compose up -d postgres

echo "Applying database migrations..."
compose run --rm api npx prisma migrate deploy

echo "Starting AROFi stack..."
compose up -d --remove-orphans

echo "Reloading edge proxy..."
compose up -d --force-recreate nginx

if [ "$SEED_DATABASE" = "true" ]; then
  echo "Seeding database..."
  compose exec -T api npx prisma db seed
fi

echo "Current containers:"
compose ps

echo
echo "Done. Point your reverse proxy (Nginx/Apache/host control panel) for"
echo "arofi.net to:"
echo "  http://127.0.0.1:4012"
echo
echo "Useful checks:"
echo "  docker compose logs -f --tail=200 api nginx"
echo "  curl -I http://127.0.0.1:4012"
