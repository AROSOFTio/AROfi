-- Security data cleanup: remove credentials that older payment adapters may
-- have persisted inside diagnostic JSON. This migration does not alter schema,
-- payment routing, wallet balances, RADIUS, MikroTik, or router connectivity.
--
-- Older Yo! Uganda adapters returned their authenticated XML as rawRequest.
-- Because APIUsername/APIPassword live inside the XML body, provider diagnostic
-- JSON could therefore contain real credentials. New code stores a redacted
-- diagnostic copy; this migration cleans historical rows already in Postgres.

DO $$
BEGIN
  -- Payment provider responses (customer package payments).
  UPDATE "Payment"
  SET "responsePayload" = regexp_replace(
      regexp_replace(
        "responsePayload"::text,
        '<APIUsername>[^<]*</APIUsername>',
        '<APIUsername>[REDACTED]</APIUsername>',
        'gi'
      ),
      '<APIPassword>[^<]*</APIPassword>',
      '<APIPassword>[REDACTED]</APIPassword>',
      'gi'
    )::jsonb
  WHERE "responsePayload" IS NOT NULL
    AND "responsePayload"::text ~* '<API(User(name)?|Password)>';

  -- Subscription payment provider responses may use the same collection
  -- adapter, so clean them as well if historical rows contain raw XML.
  UPDATE "SubscriptionPayment"
  SET "responsePayload" = regexp_replace(
      regexp_replace(
        "responsePayload"::text,
        '<APIUsername>[^<]*</APIUsername>',
        '<APIUsername>[REDACTED]</APIUsername>',
        'gi'
      ),
      '<APIPassword>[^<]*</APIPassword>',
      '<APIPassword>[REDACTED]</APIPassword>',
      'gi'
    )::jsonb
  WHERE "responsePayload" IS NOT NULL
    AND "responsePayload"::text ~* '<API(User(name)?|Password)>';

  -- Vendor payout metadata stores providerResponse, which historically could
  -- contain Yo! Uganda rawRequest with API credentials.
  UPDATE "Disbursement"
  SET "metadata" = regexp_replace(
      regexp_replace(
        "metadata"::text,
        '<APIUsername>[^<]*</APIUsername>',
        '<APIUsername>[REDACTED]</APIUsername>',
        'gi'
      ),
      '<APIPassword>[^<]*</APIPassword>',
      '<APIPassword>[REDACTED]</APIPassword>',
      'gi'
    )::jsonb
  WHERE "metadata" IS NOT NULL
    AND "metadata"::text ~* '<API(User(name)?|Password)>';

  -- Old webhook handlers sometimes merged ?secret= into the stored payload.
  -- Delete top-level authorization material while preserving business fields.
  UPDATE "PaymentWebhook"
  SET
    "payload" = CASE
      WHEN jsonb_typeof("payload") = 'object' THEN
        "payload"
          - 'secret'
          - 'Secret'
          - 'webhookSecret'
          - 'webhook_secret'
          - 'authorization'
          - 'Authorization'
      ELSE "payload"
    END,
    "headers" = CASE
      WHEN jsonb_typeof("headers") = 'object' THEN
        "headers"
          - 'x-webhook-secret'
          - 'X-Webhook-Secret'
          - 'x-yo-webhook-secret'
          - 'X-Yo-Webhook-Secret'
          - 'authorization'
          - 'Authorization'
          - 'x-webhook-signature'
          - 'X-Webhook-Signature'
      ELSE "headers"
    END
  WHERE
    (jsonb_typeof("payload") = 'object' AND (
      "payload" ? 'secret' OR
      "payload" ? 'Secret' OR
      "payload" ? 'webhookSecret' OR
      "payload" ? 'webhook_secret' OR
      "payload" ? 'authorization' OR
      "payload" ? 'Authorization'
    ))
    OR
    (jsonb_typeof("headers") = 'object' AND (
      "headers" ? 'x-webhook-secret' OR
      "headers" ? 'X-Webhook-Secret' OR
      "headers" ? 'x-yo-webhook-secret' OR
      "headers" ? 'X-Yo-Webhook-Secret' OR
      "headers" ? 'authorization' OR
      "headers" ? 'Authorization' OR
      "headers" ? 'x-webhook-signature' OR
      "headers" ? 'X-Webhook-Signature'
    ));
END $$;
