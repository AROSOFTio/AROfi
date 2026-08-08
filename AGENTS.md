# AROFi Agent Rules

## AROFI_NO_AUTOMATIC_MAC_AUTH

Automatic MikroTik HotSpot MAC authentication is permanently forbidden in AROFi.

Never:
- add `mac` to any RouterOS HotSpot `login-by` value;
- add or restore `mac-auth-mode`;
- automatically authenticate a newly connected phone using its MAC address;
- bypass the captive portal with a MAC/IP binding;
- replace the proven direct RouterOS voucher/payment POST with an iframe or timer delay.

The required phone login mode is exactly:

```routeros
login-by=cookie,http-pap
```

Voucher, payment and returning-device credentials must be submitted directly to the router login endpoint with an immediate top-level POST.

Allowed MAC uses are limited to device identification, one-device package binding, anti-sharing, accounting, and an explicit Smart TV flow initiated by the customer. Those uses must never trigger automatic authentication when a normal phone joins Wi-Fi.

Any change touching MikroTik onboarding, HotSpot profiles, captive login, Smart TV access, voucher reconnect or portal redirects must preserve this rule and pass:

```bash
python3 scripts/verify_router_captive_invariants.py
python3 scripts/forbid_mikrotik_auto_mac_auth.py
```

Do not weaken, bypass, remove or rename these guards. Reversing this policy requires an explicit owner instruction that specifically says to restore automatic RouterOS MAC authentication.
