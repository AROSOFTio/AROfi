# AROFi Enterprise — Bring Your Own Payment API

AROFi Enterprise can store and execute tenant-owned payment API connectors without putting customer API credentials in global environment variables.

## Goal

A business operating outside Uganda can connect a mobile-money/payment REST API supplied by its local MNO, bank or aggregator. The connector records the provider name, country, currency, network label, collection/status endpoints, authentication method, request field mapping, response field mapping and provider status mapping.

This is deliberately a provider framework, not a claim that every payment API on earth has an identical protocol.

## Supported generic REST patterns

- JSON collection requests
- GET/POST/PUT/PATCH status endpoints
- provider webhooks using a long per-connector callback token
- static API-key header auth
- static Bearer token auth
- HTTP Basic auth
- OAuth2 client-credentials auth
- configurable nested JSON request field paths
- configurable nested response paths
- configurable success/pending/failed/cancelled values
- arbitrary ISO country code
- arbitrary currency code
- arbitrary network/provider label such as `MPESA`, `MTN`, `AIRTEL`, `ORANGE`, `WAVE`, `MOOV`, `TIGO`, or a local aggregator name

Providers that require custom cryptographic signing, SOAP/XML, certificate-bound requests, proprietary SDKs, asynchronous challenge exchanges or controller-specific payment handshakes should use a dedicated AROFi adapter rather than unsafe arbitrary code execution.

## Enterprise entitlement

Every management and execution operation resolves the tenant subscription and rejects non-Enterprise businesses. The public webhook path also re-checks that the owning tenant still has an active Enterprise entitlement.

## Security

- `PAYMENT_CONNECTOR_SECRET` is the dedicated encryption key for connector credentials.
- Credentials are AES-256-GCM encrypted before storage.
- Credential values are never returned by list/read APIs after save.
- Production connector URLs must use HTTPS.
- Localhost, `.local`, private IPv4, link-local, CGNAT and private/link-local IPv6 destinations are rejected.
- Redirects are disabled on server-to-server provider requests.
- Calls have hard timeouts.
- Each connector gets a random webhook token embedded in its provider callback URL.
- Provider responses are treated as data; AROFi never executes customer-supplied scripts.

Set a strong random key before enabling the feature in production:

```env
PAYMENT_CONNECTOR_SECRET=replace_with_32plus_random_chars
```

## API

Authenticated Enterprise settings API:

- `GET /api/enterprise-payment-connectors`
- `POST /api/enterprise-payment-connectors`
- `POST /api/enterprise-payment-connectors/:connectorId/validate`
- `POST /api/enterprise-payment-connectors/:connectorId/collect`
- `POST /api/enterprise-payment-connectors/:connectorId/status`
- `DELETE /api/enterprise-payment-connectors/:connectorId`

Provider callback:

- `POST /api/enterprise-payment-connectors/webhooks/:connectorId/:token`

Admin UI:

- `/admin/settings/payment-connectors`

## Example: M-Pesa-style JSON connector

A provider that expects:

```json
{
  "amount": "5000",
  "currency": "KES",
  "msisdn": "2547...",
  "externalId": "AROFI-...",
  "callback": "https://..."
}
```

can map:

- amount -> `amount`
- currency -> `currency`
- phone -> `msisdn`
- reference -> `externalId`
- callbackUrl -> `callback`

If the response is:

```json
{
  "data": {
    "state": "SUCCESS",
    "transactionId": "ABC123"
  }
}
```

map response status to `data.state` and provider reference to `data.transactionId`.

## Worldwide checkout boundary

The connector framework is the secure Enterprise foundation for worldwide providers. AROFi's existing captive-portal checkout still has historical Uganda-specific assumptions in parts of the current payment model (notably MTN/Airtel network enums and UGX-oriented billing fields). Those must be generalized before the product should advertise a single automatic captive-portal checkout for every country/provider.

The product wording should therefore be:

> Enterprise: Bring your own payment API. Connect supported REST-based mobile-money providers and local aggregators; dedicated adapters are available for providers with proprietary protocols.

Do not advertise "every API in every country works automatically" until the country-aware checkout/network/currency refactor and real provider certification tests have been completed.
