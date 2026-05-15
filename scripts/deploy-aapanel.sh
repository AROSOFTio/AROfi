#!/usr/bin/env bash
set -euo pipefail

PROJECT_DIR="${PROJECT_DIR:-/www/wwwroot/arofi.arosoft.io}"
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
  if command -v openssl >/dev/null 2>&1; then
    openssl rand -hex 32
  else
    date +%s%N | sha256sum | awk '{print $1}'
  fi
}

create_env_if_missing() {
  if [ -f "$ENV_FILE" ]; then
    return
  fi

  if [ ! -f ".env.aapanel.example" ]; then
    echo ".env is missing and .env.aapanel.example was not found."
    exit 1
  fi

  cp .env.aapanel.example "$ENV_FILE"

  sed -i "s/CHANGE_ME_STRONG_POSTGRES_PASSWORD/$(random_secret)/g" "$ENV_FILE"
  sed -i "s/CHANGE_ME_STRONG_REDIS_PASSWORD/$(random_secret)/g" "$ENV_FILE"
  sed -i "s/CHANGE_ME_64_CHAR_RANDOM_JWT_SECRET/$(random_secret)/g" "$ENV_FILE"
  sed -i "s/CHANGE_ME_64_CHAR_RANDOM_PORTAL_TOKEN_SECRET/$(random_secret)/g" "$ENV_FILE"
  sed -i "s/CHANGE_ME_64_CHAR_RANDOM_ROUTER_SECRET/$(random_secret)/g" "$ENV_FILE"
  sed -i "s/CHANGE_ME_RANDOM_PESAPAL_WEBHOOK_TOKEN/$(random_secret)/g" "$ENV_FILE"
  sed -i "s/CHANGE_ME_RANDOM_YO_WEBHOOK_TOKEN/$(random_secret)/g" "$ENV_FILE"
  sed -i "s/CHANGE_ME_RANDOM_RADIUS_SHARED_SECRET/$(random_secret)/g" "$ENV_FILE"
  sed -i "s/CHANGE_ME_RANDOM_RADIUS_INTERNAL_API_KEY/$(random_secret)/g" "$ENV_FILE"
  sed -i "s/CHANGE_ME_RANDOM_RADIUS_DISCONNECT_SECRET/$(random_secret)/g" "$ENV_FILE"

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

payment_provider="$(grep -E "^PAYMENT_DEFAULT_PROVIDER=" "$ENV_FILE" | tail -n 1 | cut -d= -f2- | tr '[:lower:]' '[:upper:]' || true)"

require_env_value POSTGRES_PASSWORD
require_env_value REDIS_PASSWORD
require_env_value JWT_SECRET
require_env_value PORTAL_TOKEN_SECRET
require_env_value ROUTER_CREDENTIAL_SECRET
require_env_value RADIUS_SHARED_SECRET
require_env_value RADIUS_INTERNAL_API_KEY

if [ "${payment_provider:-PESAPAL}" = "PESAPAL" ]; then
  require_env_value PESAPAL_CONSUMER_KEY
  require_env_value PESAPAL_CONSUMER_SECRET
  require_env_value PESAPAL_IPN_ID
  require_env_value PESAPAL_WEBHOOK_TOKEN
else
  require_env_value YO_API_USERNAME
  require_env_value YO_API_PASSWORD
  require_env_value YO_WEBHOOK_TOKEN
fi

echo "Pulling public images..."
compose pull --ignore-buildable || true

echo "Building AROFi images..."
compose build --no-cache

echo "Starting database services..."
compose up -d postgres redis

echo "Applying database migrations..."
compose run --rm api npx prisma migrate deploy

echo "Starting AROFi stack..."
compose up -d --remove-orphans

if [ "$SEED_DATABASE" = "true" ]; then
  echo "Seeding database..."
  compose exec -T api npx prisma db seed
fi

echo "Current containers:"
compose ps

echo
echo "Done. In aaPanel, reverse proxy arofi.arosoft.io to:"
echo "  http://127.0.0.1:9096"
echo
echo "Useful checks:"
echo "  docker compose logs -f --tail=200 api nginx"
echo "  curl -I http://127.0.0.1:9096"
