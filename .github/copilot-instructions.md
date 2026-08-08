# AROFi Copilot Instructions

## AROFI_NO_AUTOMATIC_MAC_AUTH

Do not generate, suggest, restore or preserve automatic MikroTik HotSpot RADIUS MAC authentication.

Forbidden in every RouterOS provisioning script and runtime patch:
- the exact `mac` token in any `login-by` list;
- any `mac-auth-mode` setting;
- automatic MAC-as-username/password login when a new device joins Wi-Fi;
- HotSpot bypass bindings used to avoid the captive portal;
- iframe or timer-based login submission that delays the direct POST flow;
- local idle, keepalive or session timers that terminate an otherwise active bundle.

Required HotSpot login mode:

```routeros
login-by=cookie,mac-cookie,http-pap
```

`mac-cookie` is mandatory trusted post-login reconnect behavior and must not be confused with the forbidden exact `mac` mode. It allows a device that already completed a valid voucher/payment login to reconnect automatically while its activation is active.

Required HotSpot user-profile policy:

```routeros
shared-users=1 add-mac-cookie=yes mac-cookie-timeout=30d idle-timeout=none keepalive-timeout=none session-timeout=0s
```

Required portal behavior: immediately submit voucher, payment, recovery and returning-device RADIUS credentials with a top-level POST to the router-provided login URL. A returning device with an ACTIVE, unexpired, matching activation must auto-reconnect instead of seeing “Action required.”

MAC addresses may be used for device identification, one-device binding, trusted post-login mac-cookie reconnect, accounting, anti-sharing and explicit customer-initiated Smart TV provisioning. They must never start RADIUS authentication for an ordinary new phone before the captive portal appears.

Active access may end only at real package/RADIUS expiry, data-quota exhaustion or explicit authorized revocation. Do not revoke or disconnect because heartbeat/accounting is late, the screen is locked, the device is idle or Wi-Fi temporarily sleeps.

## AROFI_BUSINESS_VOUCHER_QR

All printed and preview QR codes must use:

```text
http://<business>.wifi/login?voucher=<URL-ENCODED-CODE>
```

Never force a QR to `10.55.0.1`, a public `arofi.net` portal URL, or `/login/voucher=...`. Use the authoritative API helper in `apps/api/src/common/tenant-hotspot-domain.ts`. Admin must consume the API-provided `hotspotDomain` so router DNS, PDFs and preview cannot diverge.

## AROFI_INSTANT_CAPTIVE_COMPLETION

Voucher, trial, recovery and MTN/Airtel payment success must:
- POST credentials directly to RouterOS once;
- remain in the current captive page while an STK/PIN request is pending;
- start status polling immediately;
- never redirect to a gateway checkout page for MTN/Airtel;
- never display a visible `Connected` page;
- use invisible `alogin.html` and `status.html` close/connectivity responses;
- never send the customer back to `<business>.wifi/login?connected=1`.

Before completing any router, portal, voucher, Smart TV, Mobile Money, accounting or MikroTik change, preserve and run:

```bash
python3 scripts/enforce_business_voucher_qr.py
python3 scripts/verify_router_captive_invariants.py
python3 scripts/forbid_mikrotik_auto_mac_auth.py
```

Never remove or weaken these checks unless the repository owner explicitly reverses the named policy.
