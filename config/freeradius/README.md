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
- `clients.conf` — localhost (SSTP/pppd) + the AROFi NAS client block.
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
| `RADIUS_CLIENT_CIDR` | `0.0.0.0/0` | Source range accepted as NAS clients. Set to your VPN subnet (e.g. `10.66.0.0/16`) when routers connect over WireGuard/SSTP. |
| `RADIUS_REQUIRE_MESSAGE_AUTHENTICATOR` | `no` | Set `yes` once every router runs RouterOS ≥ 7.15 (BlastRADIUS mitigation). |
| `POSTGRES_HOST/PORT/USER/PASSWORD/DB` | — | Same database the API uses. |

## Firewall requirements (mandatory in production)

UDP 1812/1813 must **not** be open to the whole internet:

```sh
# Example with ufw — allow only the ISP CIDRs your routers egress from:
ufw deny 1812/udp
ufw deny 1813/udp
ufw allow from <ROUTER_CIDR> to any port 1812 proto udp
ufw allow from <ROUTER_CIDR> to any port 1813 proto udp
```

Preferred: run routers over the AROFi WireGuard/SSTP VPN, set
`RADIUS_CLIENT_CIDR` to the VPN subnet, and allow 1812/1813 only on the VPN
interface.

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
