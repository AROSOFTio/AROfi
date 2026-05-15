AROFi production FreeRADIUS foundation

- `mods-available/sql` enables PostgreSQL-backed authorization, session checks, accounting, and post-auth logging.
- `radcheck`, `radreply`, `radacct`, and `radpostauth` are created by Prisma migrations.
- `mods-config/files/authorize` contains only the health-check user. Customer vouchers and paid packages must be provisioned by the API into SQL.
- MikroTik HotSpot must send `Calling-Station-Id` so MAC binding can be enforced.

Deployment notes:

- Update `RADIUS_PUBLIC_HOST` in `docker-compose.yml` or `.env` so MikroTik routers point at the reachable VPS IP or hostname.
- Keep the shared secret aligned between `RADIUS_SHARED_SECRET`, the router onboarding script, and `clients.conf`.
- Add NAS clients to `clients.conf` or mount a generated clients file from router onboarding.
- Enable accounting and interim updates on the MikroTik HotSpot profile.
- `Simultaneous-Use := 1`, HotSpot `shared-users=1`, and MAC-bound `Calling-Station-Id` reduce sharing. NAT tethering cannot be guaranteed to be detectable in every case by a captive portal platform alone.
