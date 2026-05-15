# Tenant Self-Onboarding SOP

## 1. Create Workspace

Open `/register`, enter the business details, owner details, and password. The email and password entered here become the tenant admin login.

## 2. Add MikroTik Router

Open `Routers`, register the MikroTik, then copy the generated RouterOS script into WinBox, WebFig, or SSH Terminal.

Use safe mode for an existing router. Use fresh mode only for a new router where the LAN bridge is named `bridge`.

## 3. Create Packages

Open `Packages`, create at least one package, set the price, duration, and optional data limit, then publish it.

## 4. Test Customer Portal

Connect a phone or laptop to the hotspot WiFi. The router should redirect the device to `/portal`. Buy a test package using a phone number and confirm the payment prompt is received.

## 5. Verify Router Traffic

Open `Routers` and confirm RADIUS authentication or accounting traffic has been seen. Open `Sessions` to confirm active users appear after login.

## 6. Go Live

Confirm these are working before customers use the service:

- UDP `1812` and `1813` are open to the router.
- The generated MikroTik script has been applied.
- At least one package is published.
- Payment prompt flow works.
- Voucher redemption works if vouchers are sold.
- Customer session appears in `Sessions`.
