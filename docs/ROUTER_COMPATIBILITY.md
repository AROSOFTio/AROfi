# AROFi Router Compatibility

AROFi keeps one billing, voucher, payment, RADIUS and accounting core while allowing different network access hardware to act as the NAS/controller.

## Integration levels

| Stack | AROFi integration | Authentication | Accounting | Captive portal | Disconnect / CoA |
| --- | --- | --- | --- | --- | --- |
| MikroTik RouterOS | First-class RouterOS + RADIUS | Yes | Yes | AROFi RouterOS portal | Yes |
| TP-Link Omada | RADIUS + supported portal modes | Yes | Yes | Controller/model dependent | Controller/model dependent |
| Ubiquiti UniFi | RADIUS + supported hotspot/external portal | Yes | Yes | Network version/model dependent | Supported configurations can use CoA |
| Ruijie Reyee | RADIUS / third-party portal on supported products | Model dependent | Model dependent | Reyee EG third-party portal support is product/firmware dependent | Model dependent |
| Cisco | Standard AAA / RADIUS | Device dependent | Device dependent | Product dependent | Product dependent |
| Huawei | Standard AAA / RADIUS | Device dependent | Device dependent | Product dependent | Product dependent |
| D-Link | Standard AAA / RADIUS | Model dependent | Model dependent | Model dependent | Model dependent |
| Cambium | Standard AAA / RADIUS | Device dependent | Device dependent | Product dependent | Product dependent |
| Other | Standard RADIUS | Required | Optional | Optional | Optional |

## Standard AROFi RADIUS values

The compatibility API returns the live values configured for the AROFi deployment. Standard defaults are:

- Authentication: UDP 1812
- Accounting: UDP 1813
- Disconnect / Change of Authorization: UDP 3799 when supported
- Shared secret: generated per compatible NAS unless supplied by the operator
- Accounting: enable Start, Interim-Update and Stop where the hardware exposes them

Do not assume that a private LAN address is the NAS identity that cloud FreeRADIUS sees. The registered NAS source address must match the stable source address/hostname visible to the RADIUS service, or the deployment must provide a stable tunnel/controller path.

## Compatibility Center

Admin UI:

`/admin/settings/router-compatibility`

API:

- `GET /router-compatibility/profiles`
- `POST /router-compatibility/register`
- `GET /router-compatibility/:routerId/setup`
- `POST /router-compatibility/:routerId/verify`

Registration creates the AROFi Router record, encrypted RadiusClient secret, SQL FreeRADIUS NAS row and compatibility metadata, then signals FreeRADIUS to reload NAS clients. Verification requires observed RADIUS authentication and accounting traffic before the device is marked verified online.

## RADIUS payment and voucher handoff

The hosted portal also exposes:

`/radius`

The compatibility API returns a router-specific URL containing the AROFi `routerId` and vendor. Controllers can redirect to that URL when their third-party portal mode supports it, or an operator can expose it as the purchase page alongside a controller's native RADIUS login form.

The RADIUS checkout:

1. resolves the correct AROFi business and router,
2. receives common vendor redirect parameters such as client MAC, client IP and original/continue URL,
3. starts the existing AROFi Mobile Money payment or redeems an AROFi voucher,
4. waits until the activation has a real RADIUS username and password,
5. shows those credentials for the controller/native RADIUS login flow,
6. keeps the same AROFi package, MAC-binding, expiry, accounting and session policy used by MikroTik.

This closes the RouterOS-specific auto-login gap: a paid non-MikroTik activation no longer depends on a MikroTik `link-login` URL to expose its RADIUS credential.

## Native RADIUS versus seamless external portal authorization

These are deliberately treated as two different integration modes.

**Native RADIUS authentication** is the portable baseline. The controller/router displays its RADIUS login flow; AROFi supplies the paid credential, validates it in FreeRADIUS, receives accounting and tracks the session.

**Seamless external portal authorization** is controller-specific. For example, current UniFi external hotspot deployments require the external portal to call the UniFi Network API after payment to authorize the client. Omada's documented External Portal Server workflow likewise requires the portal to send the authenticated client information back to the Omada Controller API. AROFi must have that controller integration configured before it should claim one-click external-portal authorization.

Reyee is explicitly model/firmware dependent: supported EG gateways can interwork with third-party/WISPr authentication, while not every Reyee AP exposes an external captive-portal workflow.

## Important product boundary

“Compatible” means AROFi can provide the server-side service the device/controller asks for: RADIUS credentials, voucher identities, payment-backed access, accounting ingestion, session tracking and supported Disconnect/CoA. It does **not** mean every model or firmware from a vendor exposes every feature.

MikroTik remains the deepest integration because AROFi also controls RouterOS configuration and remote-management workflows. Omada, UniFi and supported Reyee deployments have dedicated AROFi profiles and checkout parsing; seamless controller-side guest authorization requires the matching controller API capability and credentials where the vendor requires that callback.

## Vendor references used when defining the profiles

- MikroTik RouterOS RADIUS documentation: https://help.mikrotik.com/docs/spaces/ROS/pages/328097/RADIUS
- Ubiquiti UniFi Hotspots and Captive Portals: https://help.ui.com/hc/en-us/articles/115000166827-UniFi-Hotspots-and-Captive-Portals
- Ubiquiti External Hotspot API for Authorization Clients: https://help.ui.com/hc/en-us/articles/31228198640023-External-Hotspot-API-for-Authorization-Clients
- Ubiquiti RADIUS configuration: https://help.ui.com/hc/en-us/articles/360015268353-Configuring-a-RADIUS-Server-in-UniFi
- TP-Link Omada External Portal API sample: https://www.tp-link.com/us/support/faq/2907/
- Ruijie/Reyee support guidance for third-party portal on supported EG gateways and the documented limitation that some Reyee AP models do not expose an external captive portal
