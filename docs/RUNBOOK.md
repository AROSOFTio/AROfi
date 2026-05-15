# AROFi Operations Runbook

## Smoke Test Payment

1. Join the HotSpot as a new device.
2. Confirm the portal URL includes MikroTik MAC/IP parameters.
3. Buy a package through Pesapal sandbox.
4. Confirm payment becomes `COMPLETED`.
5. Confirm an activation and RADIUS credential are created.
6. Click reconnect if the browser cannot auto-post to MikroTik.

## Smoke Test Voucher

1. Generate a voucher batch in admin.
2. Print/export the batch.
3. Redeem one code from the captive portal with MAC parameters present.
4. Confirm the activation is bound to that MAC.
5. Try the same code from another MAC and confirm rejection plus suspicious-attempt logging.

## Reconnect

Disconnect the same client and reconnect before expiry. The portal should show “Welcome back. Your package is still active.” and provide a reconnect action without requiring payment.

## Router Diagnostics

Pending states mean:

- `Router has not contacted RADIUS yet`: script may not be pasted, RADIUS host/ports blocked, or NAS secret mismatch.
- `Accounting traffic has not been seen yet`: HotSpot profile may not have `radius-accounting=yes` or interim updates.
- `No successful test authentication yet`: run a voucher or paid package login from a client.

## Common MikroTik Fixes

- Check `/radius print detail` for server, ports, and secret.
- Check `/ip hotspot profile print detail` for `use-radius=yes`, `radius-accounting=yes`, and interim update.
- Confirm walled garden contains portal/API/Pesapal hosts.
- Confirm FreeRADIUS receives packets on UDP `1812/1813`.
