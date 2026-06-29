# AROFi Deployment

## Local Docker

1. Copy `.env.example` to `.env` and replace all `change_me` and `replace_with` values.
2. Run `docker compose up --build`.
3. Apply Prisma migrations from the API container or CI release step: `npx prisma migrate deploy --schema apps/api/prisma/schema.prisma`.
4. Seed only local/demo environments; production should start empty and be onboarded through the admin UI.

The Docker stack includes PostgreSQL, Redis, API, admin web, portal web, Nginx, and FreeRADIUS with SQL-backed `radcheck`, `radreply`, `radacct`, `radpostauth`, and dynamic `nas` clients.

## Mobile Money Payments

Configure MTN MoMo collection/disbursement credentials and the callback URLs under `/api/payments/webhooks/mtn/*`. Airtel remains available in the portal, but requires official Airtel endpoint and credential configuration before live payments can be processed. A callback never grants access by itself; the API verifies status server-to-server before creating an activation and RADIUS credential.

## MikroTik Self-Service Onboarding

1. Tenant opens `Routers / Add MikroTik Router`.
2. Enter router display name, branch/site name, optional HotSpot server name, and RouterOS version.
3. Keep `Safe existing router integration` unless this is a new router and the tenant accepts the fresh HotSpot setup warning.
4. Copy or download the generated RouterOS script.
5. Open WinBox Terminal, WebFig Terminal, or SSH.
6. Paste the script and press Enter.
7. Connect a test client, open the captive portal, redeem a voucher or complete an MTN sandbox payment.
8. Router status becomes `VERIFIED_ONLINE` only after real RADIUS/accounting/authentication traffic is detected.

The script does not reset the router or wipe WAN/LAN settings. The fresh-router mode adds HotSpot objects but still avoids a full reset.

Each router gets a unique RADIUS secret and a SQL `nas` row. FreeRADIUS is configured with SQL client loading. If the router sends packets before the RADIUS process has loaded the new SQL client row, restart/reload only the FreeRADIUS service and retry; do not edit `clients.conf` with tenant secrets.

## Expiry And Disconnect

Expired, revoked, suspended, and quota-exhausted activations disable their RADIUS credential immediately. When `RADIUS_DISCONNECT_ENABLED=true`, the worker also attempts a RADIUS Disconnect-Request using `radclient` and records success/failure in `DisconnectionAttempt`. When disconnect is not enabled, AROFi records `NOT_SUPPORTED` and still prevents the next login.

## Ports And Firewall

Allow UDP `1812` and `1813` from MikroTik routers to FreeRADIUS. Allow HTTPS to the portal/API hosts and Mobile Money provider callback/API hosts in the MikroTik walled garden. If active disconnect is enabled, also allow CoA/Disconnect traffic on UDP `3799` or your configured `RADIUS_DISCONNECT_PORT`.

## Anti-Sharing Controls

AROFi enforces MAC binding, `Simultaneous-Use := 1`, MikroTik `shared-users=1`, second-device rejection, and optional TTL rules. These reduce common sharing and tethering abuse. NAT-based tethering cannot be guaranteed to be detectable in every case by a captive portal billing platform alone.

## Database Backup and Restore

### Automated offsite backups

The `backup` service in `docker-compose.yml` runs continuously alongside the stack (see `config/backup/`). It dumps Postgres every `BACKUP_INTERVAL_SECONDS` (default 24h), gzips it, and — if `BACKUP_S3_BUCKET` is set — uploads it to any S3-compatible bucket (AWS S3, Backblaze B2, DigitalOcean Spaces, Cloudflare R2, MinIO). Set these in `.env`:

```
BACKUP_S3_BUCKET=your-bucket-name
BACKUP_S3_ACCESS_KEY_ID=...
BACKUP_S3_SECRET_ACCESS_KEY=...
BACKUP_S3_REGION=us-east-1          # omit/irrelevant for non-AWS endpoints
BACKUP_S3_ENDPOINT=                  # only needed for non-AWS S3-compatible providers
BACKUP_RETENTION_DAYS=14             # local copies older than this are pruned
BACKUP_INTERVAL_SECONDS=86400
```

If `BACKUP_S3_BUCKET` is left empty, backups are still taken but stay local-only inside the `backup-data` volume — the container logs a warning every cycle so this isn't silently missed. **Set the S3 variables before going live**; a local-only backup doesn't protect against the VPS itself being lost.

Check it's running: `docker compose logs -f backup`

### Manual one-off backup

```sh
docker compose exec postgres pg_dump -U $POSTGRES_USER $POSTGRES_DB | gzip > backup_$(date +%Y%m%d_%H%M%S).sql.gz
```

### Restore

```sh
gunzip -c backup_YYYYMMDD_HHMMSS.sql.gz | docker compose exec -T postgres psql -U $POSTGRES_USER $POSTGRES_DB
```

Test a real restore at least once before going live — an untested backup is not a backup.

## High Availability

**FreeRADIUS:** set `RADIUS_SECONDARY_HOST` to a second FreeRADIUS instance's address (same `RADIUS_SHARED_SECRET`, same SQL backend) and every router's provisioning script automatically gets a backup RADIUS entry — MikroTik fails over to it natively if the primary stops responding. This only helps if both instances point at a healthy Postgres, though; it doesn't make Postgres itself redundant. Re-run provisioning on existing routers after setting this for it to take effect.

**Postgres:** there is currently no replication or automatic failover — a single Postgres container backs the whole stack. If it goes down, FreeRADIUS can't authenticate anyone (new or already-paying customers), regardless of how many FreeRADIUS instances exist. This is a real architectural gap, not yet closed in this repo, and closing it is an infrastructure decision rather than a code change:
- **Managed Postgres** (AWS RDS, DigitalOcean Managed DB, Supabase, Neon, etc.) — handles replication/failover for you, costs more, least ops work.
- **Self-hosted streaming replication** (a read replica you manually promote on failure) — cheaper, but failover isn't automatic; you need a runbook and someone on call.
- **Self-hosted automated failover** (Patroni + etcd/Consul) — no ongoing cost beyond hardware, but meaningfully more to operate and get right.
- **Accept the risk for now** — the automated backups and Sentry error monitoring above are the mitigation: you lose at most one backup interval of data and find out fast when Postgres is unhealthy, but uptime isn't guaranteed.

## Error Monitoring

Set `SENTRY_DSN` in `.env` to get notified when something breaks in production instead of finding out from a customer complaint. Without it, the API runs exactly as before — Sentry is a no-op when the DSN is unset. Get a free DSN at sentry.io, create a Node project, and paste the DSN in.
