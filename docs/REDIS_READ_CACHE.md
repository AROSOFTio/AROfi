# Redis read cache

AROFi uses a private Redis container to reduce repeated database work on the public portal and admin dashboards. It is self-hosted in Docker Compose and does not require a paid Redis account.

## Cached reads

- Router overview: 6 seconds
- Payment overview: 12 seconds
- Report previews: 20 seconds
- Public portal branding, package catalog and available payment networks: 120 seconds
- Admin package catalog: 300 seconds

Identical concurrent misses are coalesced so only one request performs the database calculation. Safe admin reads are shared by users with the same tenant and role, while cache keys keep different tenants isolated.

## Never cached

- Wallet balances or wallet mutations
- Payment initiation, payment status checks or webhook processing
- Withdrawals or disbursements
- Authentication and authorization decisions
- Customer active-access lookups, latest payments or portal sessions
- Router heartbeat writes or RADIUS accounting writes
- Full report exports

## Failure behavior

Redis is an optional optimization. If it is unavailable or restarted, AROFi logs one warning and immediately falls back to normal database reads. A short failure cooldown keeps repeated connection timeouts off the request path while Redis is unavailable. Cache serialization failures are also ignored, so a successful database response is never turned into an API error by the cache. Redis contains no source-of-truth business data.

## Deployment

`docker-compose.yaml` and `docker-compose.local.yml` include an internal Redis 7 container. It has no public host port and uses a 128 MB `allkeys-lru` memory limit. Persistence is unnecessary because the cache safely rebuilds from PostgreSQL.

Optional environment variables:

```env
REDIS_URL=redis://redis:6379
CACHE_KEY_PREFIX=arofi
CACHE_VERSION=v1
REDIS_CONNECT_TIMEOUT_MS=1000
REDIS_FAILURE_COOLDOWN_MS=5000
```

Change `CACHE_VERSION` to invalidate every existing cache key after a major response-shape change.
