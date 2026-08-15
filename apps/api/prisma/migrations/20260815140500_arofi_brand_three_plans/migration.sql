-- Align the live subscription defaults with the approved three-tier SaaS catalog.
-- ENTERPRISE already exists in SubscriptionPlanTier; this migration only updates
-- persisted platform defaults that previously described Starter/Pro.

UPDATE "PlatformSetting"
SET
  "proSubscriptionPriceUgx" = 18000,
  "freePlanDescription" = 'Free plan with no monthly subscription. Services remain active with standard transaction fees.',
  "proPlanDescription" = 'Pro plan for WiFi operators that need lower transaction fees and advanced operating tools.',
  "freePlanBenefits" = 'Unlimited routers and hotspots|MTN MoMo & Airtel collection|Voucher sales and wallets|Agents|Cloud WinBox Tunnels|Live sales dashboard|AroFi branding',
  "proPlanBenefits" = 'Everything in Free|Lower Mobile Money fees|Free voucher sales|Custom logo and colours|SMS alerts|Smart TV package workflows|Router outage compensation alerts|30-day analytics history|Priority support'
WHERE "id" = 'global';
