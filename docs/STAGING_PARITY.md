# AROFi desktop -> staging -> production parity

This is the release contract for AROFi.

## Environments

| Environment | Git branch | Image tag | Database | Public URL | Owns migrations/workers/webhooks |
|---|---|---|---|---|---|
| Desktop staging | `staging` | exact tested full Git SHA | AROFi staging Supabase | `http://localhost:3000` | No |
| Online staging | `staging` | exact same full Git SHA | AROFi staging Supabase | `https://dev.arofi.net` | Yes |
| Production | `main` | exact same approved full Git SHA | AROFi production Supabase | `https://arofi.net` | Yes |

Desktop and `dev.arofi.net` intentionally share the same **staging** Supabase project and the same staging application/integration credentials. Production uses a separate Supabase project with the same Prisma schema and migrations.

Never point desktop or `dev.arofi.net` at the production Supabase database.

## One build, three places

A push to `staging` builds these images once in GitHub Actions:

- `ghcr.io/arosoftio/arofi-api:<full-git-sha>`
- `ghcr.io/arosoftio/arofi-admin:<full-git-sha>`
- `ghcr.io/arosoftio/arofi-portal:<full-git-sha>`
- `ghcr.io/arosoftio/arofi-nginx:<full-git-sha>`
- `ghcr.io/arosoftio/arofi-freeradius:<full-git-sha>`
- `ghcr.io/arosoftio/arofi-backup:<full-git-sha>`

The workflow also updates the convenience `:staging` alias, but **release testing must use the immutable full Git SHA tag**.

Set the exact same `AROFI_IMAGE_TAG=<full-git-sha>` on desktop and `dev.arofi.net`. After testing passes, fast-forward `main` to that exact staging commit and keep the exact same SHA as production's `AROFI_IMAGE_TAG`.

The main-branch promotion workflow verifies that `main` equals `staging` and also moves the convenience `:stable` alias to the approved SHA. Production does not need to rebuild anything.

This removes build drift: the API, Admin, Portal, Nginx, FreeRADIUS and backup images promoted to production are the exact image set already tested.

## Desktop startup

Create the local secrets file:

```powershell
Copy-Item .env.desktop-staging.example .env.desktop-staging
```

Put the approved staging commit SHA in:

```text
AROFI_IMAGE_TAG=<full-40-character-staging-commit-sha>
```

Fill the remaining values with the same staging Supabase and live-test integration credentials used by `dev.arofi.net`.

Login to GHCR once if the packages are private, then run:

```powershell
docker compose --env-file .env.desktop-staging -f docker-compose.parity.yml pull
docker compose --env-file .env.desktop-staging -f docker-compose.parity.yml up -d
```

For WhatsApp too:

```powershell
docker compose --env-file .env.desktop-staging -f docker-compose.parity.yml --profile integrations up -d
```

Desktop must keep:

```text
RUN_DB_MIGRATIONS=false
ACCESS_WORKERS_ENABLED=false
RADIUS_DB_LISTEN_ENABLED=false
```

The desktop API can create/read/update staging records, but it does not compete with `dev.arofi.net` for migrations or recurring workers.

## dev.arofi.net

Create a Coolify Docker Compose application from the `staging` branch using:

```text
docker-compose.parity.yml
```

Set the **same immutable SHA tested on desktop**:

```text
AROFI_IMAGE_TAG=<full-40-character-staging-commit-sha>
APP_BASE_URL=https://dev.arofi.net
ADMIN_BASE_URL=https://dev.arofi.net
PORTAL_BASE_URL=https://dev.arofi.net/portal
RUN_DB_MIGRATIONS=true
ACCESS_WORKERS_ENABLED=true
RADIUS_DB_LISTEN_ENABLED=true
```

Use `.env.staging.example` as the Coolify variable checklist. Put real values only in Coolify; never commit them.

If staging and production share the same VPS, host ports must not collide. Container ports remain the same, while staging uses different host bindings:

```text
Production RADIUS host ports: 1812 / 1813
Staging RADIUS host ports:    1912 / 1913

Production MikroTik bootstrap: 18080
Staging MikroTik bootstrap:    18081

Production WinBox proxy: 31000-31100
Staging WinBox proxy:    32000-32100

Production web host port: 3000
Staging web host port:    3006

Production WhatsApp host port: 3005
Staging WhatsApp host port:    3007
```

The container internals remain identical; only environment values and host bindings differ so both environments can run simultaneously.

## Supabase

Use two Supabase projects:

```text
AROfi Staging
  -> desktop staging
  -> dev.arofi.net

AROfi Production
  -> arofi.net only
```

Apply the same Prisma migrations to both. AROFi uses persistent containers, so use the Supabase direct connection when the host has appropriate network reachability, or the Supavisor session pooler on port `5432` for persistent IPv4 clients.

FreeRADIUS receives the same staging database host/user/password and `PGSSLMODE=require` in the parity compose stack.

## Real Yo! Uganda / IoTec tests

Staging may use live provider APIs with small controlled transactions.

Prefer a separate provider test/live merchant application, account or wallet when the provider supports one. If production and staging must share one provider credential set, do not change a provider-wide callback from production to staging unless the provider supports multiple callbacks or AROFi supplies the callback per transaction.

Public staging callbacks/IPNs belong on:

```text
https://dev.arofi.net/...
```

A provider cannot call `localhost`. Desktop still sees the result because desktop and `dev.arofi.net` share the staging Supabase database; the public staging server receives the webhook and writes the resulting transaction state to that shared database.

## Release to production

Do not squash or create a merge commit for a production release. Production must preserve the tested staging commit SHA.

From a clean local checkout:

```bash
git fetch origin
git checkout main
git pull --ff-only origin main
git merge --ff-only origin/staging
git push origin main
```

The `Promote tested staging images` workflow refuses promotion if `main` is not exactly the staging commit.

After promotion succeeds, production Coolify uses the same compose file and **the same approved SHA**:

```text
AROFI_IMAGE_TAG=<same-full-40-character-approved-sha>
APP_BASE_URL=https://arofi.net
ADMIN_BASE_URL=https://arofi.net
PORTAL_BASE_URL=https://arofi.net/portal
RUN_DB_MIGRATIONS=true
ACCESS_WORKERS_ENABLED=true
RADIUS_DB_LISTEN_ENABLED=true
```

Use `.env.production.example` as the production variable checklist and use the production Supabase project/secrets.

Redeploy production only after the image build/verification has passed and `main` has fast-forwarded to the tested staging SHA.

## Required release tests

Before `staging -> main`:

- admin login + OTP
- tenant isolation / permissions
- business dashboard
- agent dashboard and permissions
- voucher generation / PDF / redemption
- cash agent sale
- real small-value Yo!/IoTec collection
- provider webhook reconciliation
- wallet credit and commission split
- withdrawal flow using a controlled test amount
- captive portal package purchase
- MikroTik voucher login
- RADIUS auth + accounting
- returning-device reconnect
- expiry / Disconnect-Request behavior
- router online/offline presence
- responsive admin/portal desktop + tablet + mobile

A failure means fix on `staging`, produce a new staging SHA image set, pin desktop + dev to that new SHA, and repeat testing. Never patch production directly.

## Rollback

Every staging build has an immutable full-Git-SHA image tag. Record every approved production SHA. A rollback can set `AROFI_IMAGE_TAG` to the previously approved SHA and redeploy, then repair `main` normally through `staging`.
