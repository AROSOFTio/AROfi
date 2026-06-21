# AROFi - Production Hotspot Billing Platform

AROFi is a multi-tenant hotspot billing platform with:
- Admin operations (`/`)
- Customer captive portal (`/portal`)
- Backend API (`/api`)
- PostgreSQL, Redis, FreeRADIUS, and Nginx in Docker Compose
- Mobile money payments: MTN MoMo and Airtel Money in Uganda

- **Setup & Installation:** See [docs/SETUP_GUIDE.md](file:///d:/Projects/arofi/docs/SETUP_GUIDE.md) for a clean, step-by-step system setup guide.

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

### RouterOS 6 Savana WAN recovery

If the AROFi callback fails and the router cannot ping `8.8.8.8`, check whether the upstream/Savana cable is in `ether1` but `ether1` is still inside `bridgeLocal`.

```routeros
/ping 192.168.1.1 count=4
/ping 8.8.8.8 count=4
/ping arofi.arosoft.io count=4
/ip dhcp-client print
/ip route print
/interface bridge port print
```

If DHCP is bound on `bridgeLocal`, move WAN to `ether1`:

```routeros
/interface bridge port remove [find interface=ether1]
/ip dhcp-client remove [find interface=bridgeLocal]
/ip dhcp-client add interface=ether1 add-default-route=yes use-peer-dns=yes disabled=no comment="AROFi WAN"
/ip address remove [find address="192.168.1.2/24"]
/ip firewall nat remove [find comment="AROFi nat"]
/ip firewall nat add chain=srcnat out-interface=ether1 action=masquerade comment="AROFi nat"
/ip dns set allow-remote-requests=yes servers=1.1.1.1,8.8.8.8
```

Verify:

```routeros
/ip dhcp-client print
/ip address print
/ip route print
/ping 192.168.1.1 count=4
/ping 8.8.8.8 count=4
/ping arofi.arosoft.io count=4
```

RouterOS 6 wireless recovery:

```routeros
/interface wireless cap set enabled=no
/interface wireless security-profiles add name=arofi-open mode=none authentication-types=""
/interface wireless set wlan1 disabled=no mode=ap-bridge ssid="Kitintale Market" security-profile=arofi-open
/interface bridge port add bridge=bridgeLocal interface=wlan1
/ip firewall filter print
```

After internet works, retry the callback:

```routeros
/tool fetch url="http://95.111.234.34:4012/api/mikrotik/provisioned/<registration-key>" mode=http keep-result=no
```

Remote WinBox still requires TCP `8291` reachability through public IP, port forwarding, VPN, or tunnel. The script cannot bypass ISP NAT.
