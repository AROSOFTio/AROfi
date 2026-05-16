# AROFi Operations Runbook

## Smoke Test Payment

1. Join the HotSpot as a new device.
2. Confirm the portal URL includes MikroTik MAC/IP parameters.
3. Buy a package through Pesapal sandbox.
4. Confirm payment becomes `COMPLETED`.
5. Confirm an activation and RADIUS credential are created.
6. Confirm the portal auto-posts the MikroTik login form. Use the fallback connect button only if the browser/router blocks automatic submission.

## Smoke Test Voucher

1. Generate a voucher batch in admin.
2. Print or export the batch.
3. Redeem one code from the captive portal with MAC parameters present.
4. Confirm the activation is bound to that MAC.
5. Try the same code from another MAC and confirm rejection plus suspicious-attempt logging.

## Reconnect

Disconnect the same client and reconnect before expiry. The portal should show "Welcome back. Your package is still active." and auto-submit the reconnect login where the MikroTik login URL is available.

## Expiry Disconnect

1. Shorten a package duration in a test tenant.
2. Authenticate a HotSpot client and confirm an active session is visible.
3. Wait for the activation expiry worker interval.
4. Confirm the activation is `EXPIRED` or `QUOTA_EXHAUSTED`, the RADIUS credential is disabled, and a `DisconnectionAttempt` row exists.
5. If `RADIUS_DISCONNECT_ENABLED=true`, confirm the attempt is `SUCCESS` or inspect the failure message. If disabled, the row should be `NOT_SUPPORTED` and the user must be rejected on the next login.

## Router Diagnostics

Pending states mean:

- `Waiting for script callback to learn NAS IP`: the router has not fetched `/api/mikrotik/provisioned/<registration-key>` yet. Re-import the script and check RouterOS DNS/HTTPS internet access.
- `Router has not contacted RADIUS yet`: script may not be pasted, RADIUS host/ports blocked, or NAS secret mismatch.
- `Accounting traffic has not been seen yet`: HotSpot profile may not have `radius-accounting=yes` or interim updates.
- `No successful test authentication yet`: run a voucher or paid package login from a client.
- `RouterOS API endpoint offline`: this is only the management/API health check. If the MikroTik is behind a Savana/ISP router, forward TCP `8728` or `8729` to the MikroTik, or use a reachable VPN/private management IP.

## Common MikroTik Fixes

- Check `/radius print detail` for server, ports, and secret.
- Check `/ip hotspot profile print detail` for `use-radius=yes`, `radius-accounting=yes`, and interim update.
- Confirm walled garden contains portal/API/Pesapal hosts.
- Confirm FreeRADIUS receives packets on UDP `1812/1813`.
- After the first script callback changes a placeholder NAS IP to the router public/NAT IP, run `sudo docker compose restart freeradius` once so FreeRADIUS re-reads SQL clients.
- Replace or redirect MikroTik `hotspot/login.html` to `https://arofi.arosoft.io/portal?mac=$(mac)&ip=$(ip)&link-login=$(link-login-only)&server=$(server-name)` so customers land on AROFi instead of the default MikroTik page.
- If FreeRADIUS reports an unknown client for a newly added tenant router, confirm the `nas` table row exists and reload/restart the FreeRADIUS container so SQL clients are re-read.
