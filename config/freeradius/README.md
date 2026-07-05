# AROFi production FreeRADIUS

FreeRADIUS is a **required** part of the production stack: it answers MikroTik
Access-Requests on UDP 1812 and writes accounting to Postgres on UDP 1813.
Without it, paid customers never get online.

## What's in this directory

- `Dockerfile` — the production deployment unit, used by the `freeradius`
  service in the root `docker-compose.yaml`. Bakes this config into the image.
- `entrypoint.sh` — validates required env (fails fast without
  `RADIUS_SHARED_SECRET`), renders `clients.conf` from env, validates the
  FreeRADIUS config (`-C`) before starting.
- `clients.conf` — localhost (SSTP/pppd) client, plus a template comment.
  The actual per-router NAS client blocks are appended at container start by
  `entrypoint.sh`, one per entry in `RADIUS_CLIENT_CIDR`.
- `sites-enabled/default` — SQL-backed authorize/accounting virtual server.
- `mods-available/sql` — PostgreSQL module. `safe_characters` excludes quotes,
  so RADIUS attribute expansions inside SQL xlats are escaped and cannot
  inject SQL.
- `mods-config/files/authorize` — health-check user only. All customer
  credentials are provisioned by the API into `radcheck`/`radreply`.
  AROFi provisions `Session-Timeout` (bundle expiry) and never provisions
  `Idle-Timeout` — idle devices stay authorized until their bundle ends.

## Realtime bridge to the API

Accounting (`radacct`) and auth results (`radpostauth`) are written by
`rlm_sql`. Prisma migration `20260705020000_realtime_bridge_and_disconnect_retries`
installs Postgres triggers that `pg_notify` the AROFi API on every row —
the API updates session state and pushes admin dashboard events (SSE) within
milliseconds. No `rlm_rest` or outbound HTTP from FreeRADIUS is needed, and a
2-second API polling sweep remains as the fallback.

## Environment

| Variable | Default | Meaning |
|---|---|---|
| `RADIUS_SHARED_SECRET` | (required) | Shared secret used by all AROFi-provisioned MikroTik routers and for CoA. |
| `RADIUS_CLIENT_CIDR` | `0.0.0.0/0` | Accepts a NAS client from **any source IP** by default — see "Why RADIUS is open by default" below. This is the correct setting for normal operation. |
| `RADIUS_REQUIRE_MESSAGE_AUTHENTICATOR` | `no` | Set `yes` once every router runs RouterOS ≥ 7.15 (BlastRADIUS mitigation). |
| `POSTGRES_HOST/PORT/USER/PASSWORD/DB` | — | Same database the API uses. |

## Why RADIUS is open by default (self-service, nationwide SaaS)

AROFi is a self-service platform: any operator anywhere in the country can
register a router at any time, at an IP nobody on the AROFi side knows in
advance. **Onboarding a router must never require server-side or code
action** — no editing an IP allowlist, no restart, no manual step.

So `RADIUS_CLIENT_CIDR=0.0.0.0/0` (accept from anywhere) is the intended,
correct setting — not a temporary hack. UDP 1812/1813 stay open on the
firewall. Security comes from two things instead of source IP:

1. **The shared secret** — a NAS gets no response at all without it.
2. **Live per-request credential validation** — every Access-Request is
   checked against Postgres (`sites-enabled/default`'s `authorize{}` block):
   the username must belong to an ACTIVE, non-expired `PackageActivation`
   with a matching `RadiusCredential`, optionally MAC-bound. A stranger who
   somehow has the shared secret still gets nothing without a real paying
   customer's live, unexpired credential — there is no free access to steal.

This is the standard posture for multi-tenant hotspot billing platforms with
open self-service router enrollment; it is not a compromise made for
convenience.

### If you specifically want to restrict it anyway

Only relevant if you deliberately run a **closed/private** deployment (e.g.
you personally provision every router, all on one known ISP or VPN) —
**do not** apply this to a public self-service platform, it will reject
every router whose IP isn't already listed and break onboarding nationwide.

`RADIUS_CLIENT_CIDR` accepts a comma-separated list, one IP/CIDR per
allowed source, e.g. `RADIUS_CLIENT_CIDR=102.134.5.9/32,41.210.3.20/32` —
one `client arofi-nas-N { }` block is generated per entry. Requires a
`freeradius` container restart every time the list changes.

## Required MikroTik settings

The AROFi provisioning script (`/api/mikrotik/script/<key>`) configures all of
this; listed here for manual verification:

- `/radius add service=hotspot address=<RADIUS_PUBLIC_HOST> secret=<RADIUS_SHARED_SECRET> timeout=3s`
- `/radius incoming set accept=yes port=3799` — REQUIRED for CoA
  Disconnect-Requests (bundle expiry kicks the live session).
- Hotspot profile: `use-radius=yes`, `radius-accounting=yes`,
  `radius-interim-update=1m`, `login-by=http-pap`.
- Hotspot server: `keepalive-timeout=2m` (layer-2 presence detection only —
  AROFi never provisions RADIUS `Idle-Timeout`, so idle users are not billed
  out of their session).
- RouterOS ≥ 7.15 recommended so `Message-Authenticator` enforcement can be
  enabled.
- HotSpot `shared-users=1` reduces credential sharing.

## Message-Authenticator policy

- `localhost` client (pppd/SSTP): stripped in both directions — pppd's old
  radius client cannot validate it.
- MikroTik NAS clients: left intact; enforcement is opt-in via
  `RADIUS_REQUIRE_MESSAGE_AUTHENTICATOR=yes`.

## Deploying

Compose (normal path):

```sh
docker compose up -d --build freeradius
docker compose logs -f freeradius   # startup + config validation logs
```

Standalone VPS path (same entrypoint/config): `sh scripts/deploy-freeradius.sh`.

Verify auth end-to-end from the VPS:

```sh
docker compose exec api sh -c 'radtest <username> <password> freeradius 0 "$RADIUS_SHARED_SECRET"'
```
