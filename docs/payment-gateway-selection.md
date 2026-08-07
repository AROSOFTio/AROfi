# AROFi platform payment gateway selection

Platform/SaaS Admin chooses one gateway for all new payment operations. The choice is stored in `PlatformSetting.paymentGateway` and is reused by customer package payments, Pro subscriptions, SMS-credit purchases, business wallet top-ups, business withdrawals, referral withdrawals, and platform withdrawals.

## Available choices

| Admin choice | Collections | Card checkout | Disbursements |
| --- | --- | --- | --- |
| Yo! Uganda | MTN and Airtel Mobile Money | No | MTN and Airtel Mobile Money |
| ioTec Pay | MTN and Airtel Mobile Money | UGX Visa/Mastercard | MTN and Airtel Mobile Money |
| Pesapal | Hosted payment checkout | Hosted card checkout | Blocked until an approved arbitrary payout API is configured |
| Direct MTN + Airtel | MTN Collection API and Airtel Collection API | No | MTN Disbursement API and Airtel Disbursement API |

## Routing rules

- The selected gateway applies only to newly created transactions.
- Every transaction stores the exact provider that created it.
- Status checks and callbacks continue using the stored provider even after Platform Admin changes the global selection.
- The Direct option automatically chooses the MTN API for MTN numbers and the Airtel API for Airtel numbers.
- The platform must never silently send a Pesapal withdrawal through a different gateway. Until Pesapal payout API access is available and integrated, universal Pesapal activation is rejected with a clear configuration error.

## Security

Each provider uses its own credentials and callback secret. Provider credentials belong only in Coolify environment variables and must never be committed to Git.
