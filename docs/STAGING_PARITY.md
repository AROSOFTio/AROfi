# AROFi desktop -> staging -> production parity

This is the release contract for AROFi.

## Environments

| Environment | Git branch | Image channel | Database | Public URL | Owns migrations/workers/webhooks |
|---|---|---|---|---|---|
| Desktop staging | `staging` | `staging` | AROFi staging Supabase | `http://localhost:3000` | No |
| Online staging | `staging` | `staging` | AROFi staging Supabase | `https://dev.arofi.net` | Yes |
| Production | `main` | `stable` | AROFi production Supabase | `https://arofi.net` | Yes |

Desktop and `dev.arofi.net` intentionally share the same **staging** Supabase project and the same staging secrets/payment test credentials. Production must use a separate Supabase project with the same schema/migrations.

Never point desktop/staging at the production Supabase database.

## One build, three places

A push to `staging` builds these images once in GitHub Actions:

- `ghcr.io/arosoftio/arofi-api:<full-git-sha>` and `:staging`
- `ghcr.io/arosoftio/arofi-admin:<full-git-sha>` and `:staging`
- `ghcr.io/arosoftio/arofi-portal:<full-git-sha>` and `:staging`
- `ghcr.io/arosoftio/arofi-nginx:<full-git-sha>` and `:staging`
- `ghcr.io/arosoftio/arofi-freeradius:<full-git-sha>` and `:staging`
- `ghcr.io/arosoftio/arofi-backup:<full-git-sha>` and `:staging`

Desktop and `dev.arofi.net` both pull the `staging` channel. They therefore run the same built application images.

After testing passes, `main` must fast-forward to the exact tested `staging` commit. The production promotion workflow does **not rebuild** the images. It verifies that `main` and `staging` point to the same commit, then retags those already-tested immutable SHA images as `stable`.

This is what makes production run the same application image that was tested in staging.

## Desktop startup

Create the real local secrets file from the template:

```powershell
Copy-Item .env.desktop-staging.example .env.desktop-staging
```

Fill it with the same staging Supabase and live-test integration credentials used by `dev.arofi.net`.

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

Set:

```text
AROFI_IMAGE_TAG=staging
APP_BASE_URL=https://dev.arofi.net
ADMIN_BASE_URL=https://dev.arofi.net
PORTAL_BASE_URL=https://dev.arofi.net/portal
RUN_DB_MIGRATIONS=true
ACCESS_WORKERS_ENABLED=true
RADIUS_DB_LISTEN_ENABLED=true
```

Use the staging Supabase connection and staging secrets from `.env.staging.example` as the variable checklist. Put real values only in Coolify; never commit them.

If staging and production share the same VPS, host ports must not collide. Keep the container ports identical while using different staging host bindings, for example:

```text
Production RADIUS host ports: 1812 / 1813
Staging RADIUS host ports:    1912 / 1913

Production MikroTik bootstrap: 18080
Staging MikroTik bootstrap:    18081

Production WinBox proxy: 31000-31100
Staging WinBox proxy:    32000-32100
```

The container internals remain identical; only the VPS host bindings differ so both environments can run simultaneously.

## Supabase

Use two Supabase projects:

```text
AROfi Staging
  -> desktop staging
  -> dev.arofi.net

AROfi Production
  -> arofi.net only
```

Apply the same Prisma migrations to both. AROFi uses persistent containers, so use the Supabase direct connection when the host has appropriate IPv6/IPv4 reachability, or the Supavisor **session pooler** on port `5432` for persistent IPv4 clients.

FreeRADIUS receives the same staging database host/user/password and `PGSSLMODE=require` in the parity compose stack.

## Real Yo! Uganda / IoTec tests

Staging may use live provider APIs with small controlled transactions.

Prefer a separate provider test/live merchant application, account or wallet when the provider supports it. If production and staging must share one provider credential set, do not change a provider-wide callback from production to staging unless the provider supports multiple callbacks or AROFi supplies the callback per transaction.

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

The `Promote tested staging images` workflow will refuse promotion if `main` is not exactly the staging commit.

After promotion succeeds, production Coolify runs the same compose file with:

```text
AROFI_IMAGE_TAG=stable
APP_BASE_URL=https://arofi.net
ADMIN_BASE_URL=https://arofi.net
PORTAL_BASE_URL=https://arofi.net/portal
RUN_DB_MIGRATIONS=true
ACCESS_WORKERS_ENABLED=true
RADIUS_DB_LISTEN_ENABLED=true
```

and the **production** Supabase/secrets.

Redeploy the production compose application after the `stable` promotion succeeds.

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

A failure means fix on `staging`, rebuild a new staging image set, and repeat testing. Do not patch production directly.

## Rollback

Every staging build also has an immutable full-Git-SHA image tag. Record the SHA of each approved production release. A rollback can point `AROFI_IMAGE_TAG` to the previously approved SHA and redeploy, then repair `main` normally through `staging`.
