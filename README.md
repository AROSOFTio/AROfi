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
PESAPAL_BROWSER_CALLBACK_URL=https://arofi.arosoft.io/portal/payment-return
PESAPAL_IPN_URL=https://arofi.arosoft.io/api/payments/webhooks/pesapal
PESAPAL_CALLBACK_URL=https://arofi.arosoft.io/api/payments/webhooks/pesapal
PESAPAL_WEBHOOK_TOKEN=change_this_pesapal_webhook_token

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

- Yo Uganda webhook: `POST /api/payments/webhooks/yo-uganda`
- Pesapal webhook: `GET/POST /api/payments/webhooks/pesapal`

Both support token verification via `YO_WEBHOOK_TOKEN` / `PESAPAL_WEBHOOK_TOKEN`.

## Fresh MikroTik Acceptance Flow

Use **Fresh full captive Wi-Fi** only on a router where AROFi is allowed to configure LAN/Wi-Fi/HotSpot.

1. Register the MikroTik in AROFi with script mode `FRESH_FULL_CAPTIVE_WIFI`.
2. Copy the one-line RouterOS command from Routers -> View Setup and paste it into MikroTik Terminal.
3. Confirm the terminal prints `AROFi HotSpot login.html installed` and `AROFi provisioning callback sent`.
4. On the router, confirm an open SSID appears using the registered site/router name.
5. Connect a phone to that open SSID. MikroTik should open `hotspot/login.html`, which redirects to `/portal` with `mac`, `ip`, `link-login`, `server`, and `routerKey`.
6. Buy a package. Pesapal returns the browser to `/portal/payment-return`, where AROFi checks payment status.
7. When payment is completed, AROFi creates RADIUS credentials with `Session-Timeout` from the package duration and posts them to MikroTik `link-login-only`.
8. Dashboard should then show these independently: script callback received, RADIUS auth seen, accounting seen, and management API reachable/unreachable.

Real-world limits:
- If the MikroTik is behind an upstream modem, RouterOS API health checks require TCP 8728/8729 port forwarding or VPN. HotSpot/RADIUS can still work without API reachability.
- Some RouterOS device-mode restrictions require physical confirmation and reboot before HotSpot or Wi-Fi changes are accepted.
- Unknown or unsupported Wi-Fi packages/interface layouts may need manual Wi-Fi setup, but Ethernet captive portal and RADIUS can still work.
