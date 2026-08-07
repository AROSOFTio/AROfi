# ioTec Pay setup for AROFi

AROFi supports ioTec Pay for Mobile Money collections, UGX Visa/Mastercard checkout, and Mobile Money disbursements. Credentials are read only from deployment environment variables; never commit live credentials to Git.

## 1. Rotate exposed credentials first

If a Client Secret has appeared in email, chat, screenshots, tickets, or source code, revoke it in ioTec Pay and create a replacement before deployment.

## 2. Coolify environment variables

Add these variables to the AROFi application in Coolify:

```env
IOTEC_CLIENT_ID=your_client_id
IOTEC_CLIENT_SECRET=your_rotated_client_secret
IOTEC_WALLET_ID=your_test_or_live_wallet_id
IOTEC_IDENTITY_BASE_URL=https://id.iotec.io
IOTEC_PAY_BASE_URL=https://pay.iotec.io
IOTEC_WEBHOOK_SECRET=generate_a_long_random_secret
```

The test wallet and test number must be used only in the ioTec test environment. Replace the wallet ID with the approved live wallet before processing real customer money.

## 3. Collection callback

Configure the ioTec wallet callback to call:

```text
https://arofi.net/api/payments/webhooks/iotec/collection
```

Add this custom request header in ioTec wallet settings:

```text
x-webhook-secret: <same value as IOTEC_WEBHOOK_SECRET>
```

## 4. Disbursement callback

Configure the disbursement callback to call:

```text
https://arofi.net/api/wallets/webhooks/iotec/disbursement
```

Use the same `x-webhook-secret` header.

## 5. Select ioTec Pay in AROFi

Sign in as Platform/SaaS Admin and open **Settings → Payments & Fees**.

Choose **ioTec Pay** as the Platform Payment Gateway and save. The one global selection is used for new customer payments, Pro subscriptions, SMS-credit purchases, wallet top-ups, and withdrawals. ioTec Pay also enables UGX Visa/Mastercard checkout on the customer portal.

The visible gateway choices are:

- Yo! Uganda
- ioTec Pay
- Direct MTN + Airtel

Pesapal remains hidden until arbitrary payout/disbursement support is approved and integrated. Existing pending transactions continue checking the provider that originally created them.

## 6. Production checklist

- Business KYC approved by ioTec
- Live wallet ID configured
- Rotated Client Secret configured only in Coolify
- Collection callback configured
- Disbursement callback configured
- `x-webhook-secret` configured on both callbacks
- One MTN test collection completed
- One Airtel test collection completed
- One low-value UGX card payment completed
- One low-value disbursement completed
- Failed payment and failed disbursement callbacks verified
