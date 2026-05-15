# AROFi Deployment

## Local Docker

1. Copy `.env.example` to `.env` and replace all `change_me` and `replace_with` values.
2. Run `docker compose up --build`.
3. Apply Prisma migrations from the API container or CI release step: `npx prisma migrate deploy --schema apps/api/prisma/schema.prisma`.
4. Seed only local/demo environments; production should start empty and be onboarded through the admin UI.

The Docker stack includes PostgreSQL, Redis, API, admin web, portal web, Nginx, and FreeRADIUS with SQL-backed `radcheck`, `radreply`, `radacct`, and `radpostauth`.

## Pesapal

Configure `PESAPAL_MODE`, credentials, IPN ID, callback URL, and webhook token. A callback or IPN never grants access by itself; the API verifies status server-to-server before creating an activation and RADIUS credential.

## MikroTik Self-Service Onboarding

1. Tenant opens `Routers / Add MikroTik Router`.
2. Enter router display name, branch/site name, optional HotSpot server name, and RouterOS version.
3. Keep `Safe existing router integration` unless this is a new router and the tenant accepts the fresh HotSpot setup warning.
4. Copy or download the generated RouterOS script.
5. Open WinBox Terminal, WebFig Terminal, or SSH.
6. Paste the script and press Enter.
7. Connect a test client, open the captive portal, redeem a voucher or complete a Pesapal test payment.
8. Router status becomes `VERIFIED_ONLINE` only after real RADIUS/accounting/authentication traffic is detected.

The script does not reset the router or wipe WAN/LAN settings. The fresh-router mode adds HotSpot objects but still avoids a full reset.

## Ports And Firewall

Allow UDP `1812` and `1813` from MikroTik routers to FreeRADIUS. Allow HTTPS to the portal/API hosts and the Pesapal domains in the MikroTik walled garden.

## Anti-Sharing Controls

AROFi enforces MAC binding, `Simultaneous-Use := 1`, MikroTik `shared-users=1`, second-device rejection, and optional TTL rules. These reduce common sharing and tethering abuse. NAT-based tethering cannot be guaranteed to be detectable in every case by a captive portal billing platform alone.
