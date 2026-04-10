# AROFi - Production Hotspot Billing Platform

AROFi is a multi-tenant hotspot billing platform with:
- Admin operations (`/`)
- Customer captive portal (`/portal`)
- Backend API (`/api`)
- PostgreSQL, Redis, FreeRADIUS, and Nginx in Docker Compose
- Live payments (Yo Uganda + Pesapal mobile money/card checkout)

## Production Deploy (Contabo / Ubuntu)

Run from project root (example: `/www/wwwroot/arofi.arosoft.io`):

```bash
# 1) Update source
git checkout main
git pull origin main

# 2) Build and start
docker compose pull --ignore-buildable
docker compose build --no-cache
docker compose up -d --remove-orphans

# 3) Apply database schema
docker compose exec -T api npx prisma db push

# 4) Optional seed
docker compose exec -T api npx prisma db seed

# 5) Verify
docker compose ps
docker compose logs -f --tail=200 api nginx
```

## Required `.env` keys (minimum)

```env
POSTGRES_USER=postgres
POSTGRES_PASSWORD=strong_password_here
POSTGRES_DB=arofi_dev
JWT_SECRET=change_this_to_long_random_secret

# Default provider when client does not specify one
PAYMENT_DEFAULT_PROVIDER=PESAPAL

# Yo Uganda
YO_API_MODE=live
YO_API_USERNAME=your_yo_username
YO_API_PASSWORD=your_yo_password
YO_WEBHOOK_BASE_URL=https://arofi.arosoft.io/api/payments/webhooks/yo-uganda
YO_WEBHOOK_TOKEN=change_this_webhook_token

# Pesapal
PESAPAL_MODE=live
PESAPAL_CONSUMER_KEY=your_pesapal_consumer_key
PESAPAL_CONSUMER_SECRET=your_pesapal_consumer_secret
PESAPAL_IPN_ID=your_pesapal_ipn_id
PESAPAL_CALLBACK_URL=https://arofi.arosoft.io/api/payments/webhooks/pesapal
PESAPAL_WEBHOOK_TOKEN=change_this_pesapal_webhook_token

# Router / Radius
ROUTER_CREDENTIAL_SECRET=change_this_router_secret
RADIUS_PUBLIC_HOST=your_server_public_ip
RADIUS_SHARED_SECRET=radius-secret
```

## Nginx and Reverse Proxy

- Docker Nginx listens on host port `8098`.
- In aaPanel (or host Nginx/Apache), reverse proxy target should be:

`http://127.0.0.1:8098`

Routing inside container Nginx:
- `/` -> admin web
- `/portal` -> customer portal
- `/api` -> backend API

## Live Payment Webhooks

- Yo Uganda webhook: `POST /api/payments/webhooks/yo-uganda`
- Pesapal webhook: `GET/POST /api/payments/webhooks/pesapal`

Both support token verification via `YO_WEBHOOK_TOKEN` / `PESAPAL_WEBHOOK_TOKEN`.
