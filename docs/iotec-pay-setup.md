# ioTec Pay setup for AROFi

AROFi can use ioTec Pay as the single platform payment gateway for MTN and Airtel Mobile Money collections, UGX Visa/Mastercard collections, wallet top-ups, subscriptions, and Mobile Money disbursements. Credentials are read only from deployment environment variables; never commit live credentials to Git.

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

Configure the ioTec wallet collection callback to call:

```text
https://arofi.net/api/payments/webhooks/iotec/collection
```

Add this custom request header in ioTec wallet settings:

```text
x-webhook-secret: <same value as IOTEC_WEBHOOK_SECRET>
```

The same collection callback handles Mobile Money and card status changes. AROFi redirects card customers to the `cardRedirectUrl` returned by ioTec and checks the authoritative transaction status before activating internet.

## 4. Disbursement callback

Configure the disbursement callback to call:

```text
https://arofi.net/api/wallets/webhooks/iotec/disbursement
```

Use the same `x-webhook-secret` header.

## 5. Select ioTec Pay in AROFi

Sign in as Platform/SaaS Admin and open **Settings → Payments & Fees**.

The single gateway selector contains:

1. Yo! Uganda
2. ioTec Pay
3. Pesapal
4. Direct MTN + Airtel

Choose **ioTec Pay** and save. The system then uses ioTec automatically for all new supported collection and disbursement operations. Existing pending transactions continue checking the provider that created them.

## 6. Card checkout

When ioTec Pay is active, the customer portal displays:

- Mobile Money
- Visa / Mastercard

Card payments are submitted in UGX. The customer provides an email address and phone number, AROFi creates the ioTec card transaction, and the browser is redirected to the hosted card page. The phone number remains attached to the order so AROFi can activate and later locate the customer's internet session.

## 7. Production checklist

- Business KYC approved by ioTec
- Live wallet ID configured
- Rotated Client Secret configured only in Coolify
- Collection callback configured
- Disbursement callback configured
- `x-webhook-secret` configured on both callbacks
- One MTN test collection completed
- One Airtel test collection completed
- One UGX Visa/Mastercard test completed
- One low-value disbursement completed
- Failed payment and failed disbursement callbacks verified
- Gateway switch tested to confirm it affects only new transactions
