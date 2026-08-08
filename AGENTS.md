# AROFi Agent Rules

## AROFI_NO_AUTOMATIC_MAC_AUTH

Automatic MikroTik HotSpot RADIUS MAC authentication is permanently forbidden in AROFi.

Never:
- add the exact `mac` token to any RouterOS HotSpot `login-by` value;
- add or restore `mac-auth-mode`;
- authenticate a newly connected phone with MAC-as-username/password;
- bypass the captive portal with a MAC/IP binding;
- replace the direct RouterOS voucher/payment/reconnect POST with an iframe or timer delay;
- add a local idle, keepalive or session timer that ends an otherwise active bundle.

The required HotSpot login mode is exactly:

```routeros
login-by=cookie,mac-cookie,http-pap
```

`mac-cookie` is required and is not the forbidden `mac` mode. RouterOS creates a trusted mac-cookie only after the customer successfully logs in with voucher/payment credentials. It allows that same device to reconnect automatically while access remains active. Do not remove it.

Every HotSpot user profile must preserve:

```routeros
shared-users=1 add-mac-cookie=yes mac-cookie-timeout=30d idle-timeout=none keepalive-timeout=none session-timeout=0s
```

Voucher, payment, recovery and active-return credentials must be submitted immediately to the router login endpoint with a top-level POST. A returning device with an ACTIVE, unexpired, matching MAC/router activation must auto-reconnect instead of showing “Action required.”

Allowed MAC uses are device identification, one-device package binding, trusted post-login mac-cookie reconnect, anti-sharing, accounting and explicit customer-initiated Smart TV provisioning. They must never trigger RADIUS authentication before a new customer sees the captive portal.

An active bundle may end only because of its real RADIUS/package expiry, data-quota exhaustion, or explicit authorized revocation. Missing heartbeat/accounting, screen lock, inactivity and temporary Wi-Fi sleep must never revoke access.

Any change touching MikroTik onboarding, HotSpot profiles, captive login, Smart TV access, voucher reconnect, accounting or portal redirects must preserve this rule and pass:

```bash
python3 scripts/verify_router_captive_invariants.py
python3 scripts/forbid_mikrotik_auto_mac_auth.py
```

Do not weaken, bypass, remove or rename these guards. Reversing this policy requires an explicit repository-owner instruction that specifically names the policy being reversed.
