# AROFi Copilot Instructions

## AROFI_NO_AUTOMATIC_MAC_AUTH

Do not generate, suggest, restore or preserve automatic MikroTik HotSpot MAC authentication.

Forbidden in every RouterOS provisioning script and runtime patch:
- any `login-by` list containing `mac`;
- any `mac-auth-mode` setting;
- automatic MAC-as-username/password login when a normal device joins Wi-Fi;
- HotSpot bypass bindings used to avoid the captive portal;
- iframe or timer-based login submission that delays the proven direct POST flow.

Required captive login mode:

```routeros
login-by=cookie,http-pap
```

Required voucher/payment behavior: immediately submit the returned RADIUS username and password with a top-level POST to the router-provided login URL.

MAC addresses may only be used for device identification, one-device binding, accounting, anti-sharing and explicit customer-initiated Smart TV provisioning. They must never start automatic authentication for ordinary phones.

Before completing any router, portal, voucher, Smart TV or MikroTik change, preserve and run:

```bash
python3 scripts/verify_router_captive_invariants.py
python3 scripts/forbid_mikrotik_auto_mac_auth.py
```

Never remove or weaken these checks unless the repository owner explicitly reverses the automatic-MAC-auth ban.
