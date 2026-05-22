# AROFi - Production Hotspot Billing Platform

AROFi is a multi-tenant hotspot billing platform with:
- Admin operations (`/`)
- Customer captive portal (`/portal`)
- Backend API (`/api`)
- PostgreSQL, Redis, FreeRADIUS, and Nginx in Docker Compose
- Mobile money payments: MTN MoMo and Airtel Money in Uganda

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
docker compose exec -T api npx prisma migrate deploy

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

# Default provider - MTN MoMo recommended for Uganda
PAYMENT_DEFAULT_PROVIDER=MTN_MOMO_DIRECT

# MTN MoMo API (recommended for Uganda)
MTN_MOMO_ENV=sandbox
MTN_MOMO_COLLECTION_BASE_URL=https://sandbox.momodeveloper.mtn.com
MTN_MOMO_COLLECTION_SUBSCRIPTION_KEY=your_mtn_key
MTN_MOMO_COLLECTION_API_USER=your_mtn_user
MTN_MOMO_COLLECTION_API_KEY=your_mtn_api_key
MTN_MOMO_TARGET_ENVIRONMENT=sandbox
MTN_ALLOWED_PREFIXES=077,078,076,079,031,039

# Airtel Money API
AIRTEL_MONEY_ENV=sandbox
AIRTEL_MONEY_COLLECTION_BASE_URL=
AIRTEL_MONEY_DISBURSEMENT_BASE_URL=
AIRTEL_MONEY_CLIENT_ID=your_airtel_client_id
AIRTEL_MONEY_CLIENT_SECRET=your_airtel_secret
AIRTEL_ALLOWED_PREFIXES=070,075,074

# Router / Radius
ROUTER_CREDENTIAL_SECRET=change_this_router_secret
RADIUS_PUBLIC_HOST=your_server_public_ip
RADIUS_SHARED_SECRET=replace_with_random_radius_shared_secret
```

## Nginx and Reverse Proxy

- Docker Nginx listens on host port `4012`.
- In aaPanel (or host Nginx/Apache), reverse proxy target should be:

`http://127.0.0.1:4012`

Routing inside container Nginx:
- `/` -> admin web
- `/portal` -> customer portal
- `/api` -> backend API

## Live Payment Webhooks

- Yo! Uganda webhook: `POST /api/payments/webhooks/yo-uganda` (token-verified)
- MTN MoMo webhooks are configured via MTN dashboard
- Airtel Money webhooks are configured via Airtel dashboard

## Fresh MikroTik Acceptance Flow

Use **Fresh full captive Wi-Fi** only on a router where AROFi is allowed to configure LAN/Wi-Fi/HotSpot.

1. Register the MikroTik in AROFi with script mode `FRESH_FULL_CAPTIVE_WIFI`.
2. Copy the one-line RouterOS command from Routers -> View Setup and paste it into MikroTik Terminal.
3. Confirm the terminal prints `AROFi HotSpot login.html installed` and `AROFi provisioning callback sent`.
4. On the router, confirm an open SSID appears using the registered site/router name.
5. Connect a phone to that open SSID. MikroTik should open `hotspot/login.html`, which redirects to `/portal` with `mac`, `ip`, `link-login`, `server`, and `routerKey`.
6. Buy a package using MTN MoMo or Airtel Money. Approve the payment prompt on your phone.
7. AROFi receives payment confirmation and creates RADIUS credentials with `Session-Timeout` from the package duration and posts them to MikroTik `link-login-only`.
8. Dashboard should then show these independently: script callback received, RADIUS auth seen, accounting seen, and management API reachable/unreachable.

Real-world limits:
- If the MikroTik is behind an upstream modem, RouterOS API health checks require TCP 8728/8729 port forwarding or VPN. HotSpot/RADIUS can still work without API reachability.
- Some RouterOS device-mode restrictions require physical confirmation and reboot before HotSpot or Wi-Fi changes are accepted.
- Unknown or unsupported Wi-Fi packages/interface layouts may need manual Wi-Fi setup, but Ethernet captive portal and RADIUS can still work.
