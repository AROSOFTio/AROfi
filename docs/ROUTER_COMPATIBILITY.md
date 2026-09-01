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

## Important product boundary

“Compatible” means AROFi can provide the server-side service the device/controller asks for: RADIUS credentials, voucher identities, payment-backed access, accounting ingestion, session tracking and supported Disconnect/CoA. It does **not** mean every model or firmware from a vendor exposes every feature.

MikroTik remains the deepest integration because AROFi also controls RouterOS configuration and remote-management workflows. Other stacks use their standards-based RADIUS and external-portal capabilities unless a dedicated controller driver is added later.

## Vendor references used when defining the profiles

- MikroTik RouterOS RADIUS documentation: https://help.mikrotik.com/docs/spaces/ROS/pages/328097/RADIUS
- Ubiquiti UniFi Hotspots and Captive Portals: https://help.ui.com/hc/en-us/articles/115000166827-UniFi-Hotspots-and-Captive-Portals
- Ubiquiti RADIUS configuration: https://help.ui.com/hc/en-us/articles/360015268353-Configuring-a-RADIUS-Server-in-UniFi
- TP-Link Omada EAP documentation for External RADIUS Server / accounting
- Ruijie/Reyee support guidance for third-party portal on supported EG gateways and the documented limitation that some Reyee AP models do not expose an external captive portal
