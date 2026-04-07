AROFi Phase 4 FreeRADIUS foundation

- `clients.conf` registers the bootstrap MikroTik NAS clients used by the seeded router inventory.
- `mods-config/files/authorize` provides a minimal bootstrap files-based auth source so the container starts with a working AAA path.
- The API now stores router, client, AAA event, and session records. Later phases can extend this with dynamic sync or REST-backed authorization.

Deployment notes:

- Update `RADIUS_PUBLIC_HOST` in `docker-compose.yml` or `.env` so MikroTik routers point at the reachable VPS IP or hostname.
- Keep the shared secret aligned between `RADIUS_SHARED_SECRET`, the router onboarding script, and `clients.conf`.
- Add new NAS clients to `clients.conf` or move to dynamic client sync when router onboarding is automated end-to-end.
