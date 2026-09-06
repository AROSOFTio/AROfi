# AROFi RouterOS 6 captive-flow recovery release

Release date: 2026-09-07
Production release: `70732318`

This release preserves the current known-good captive-flow behavior observed on
RouterOS 6.49.21: returning devices can reconnect through `mac-cookie`, the
portal submits the accepted credentials directly to the RouterOS login route,
and the payment completion flow does not require a separate connected page.

The generated router policy must not use automatic `login-by=mac` authentication.
It keeps trusted post-login `mac-cookie` reconnect and limits self-healing
changes to the AROFi-managed hotspot profile plus the default user profile.

## Rollback

Use the immutable production image from this release:

```sh
docker image inspect arofi-runtime:70732318
```

The guarded deployment runner records rollback metadata under
`/root/arofi-runner-backups/` and keeps the PostgreSQL backup created before
deployment. Restore the previous application release through the deployment
runner; do not roll back Prisma migrations blindly.

## RouterOS 6 note

The RouterOS bootstrap wrapper supports the RouterOS 6 NTP fallback and the
RouterOS 6 HTTPS-fetch compatibility path. The downloaded `.rsc` remains the
source of the router policy, so it must be generated from this release before
provisioning another router.

A `RADIUS accounting request not sent` warning is a router-to-RADIUS response
failure, not proof that the database is damaged. Confirm the router's RADIUS
address, ports, shared secret, route, and firewall before changing database
records.
