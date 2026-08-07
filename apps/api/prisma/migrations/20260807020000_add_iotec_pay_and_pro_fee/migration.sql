ALTER TYPE "PaymentProvider" ADD VALUE IF NOT EXISTS 'YO_UGANDA';
ALTER TYPE "PaymentProvider" ADD VALUE IF NOT EXISTS 'IOTEC_PAY';
ALTER TYPE "PaymentProvider" ADD VALUE IF NOT EXISTS 'PESAPAL';

DO $$
BEGIN
  CREATE TYPE "PlatformPaymentGateway" AS ENUM (
    'YO_UGANDA',
    'IOTEC_PAY',
    'PESAPAL',
    'DIRECT_MNO'
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE "PlatformSetting"
  ADD COLUMN IF NOT EXISTS "paymentGateway" "PlatformPaymentGateway" NOT NULL DEFAULT 'YO_UGANDA';

-- Preserve the intent of installations that already selected ioTec or both
-- direct operator APIs before the single global selector was introduced.
UPDATE "PlatformSetting"
SET "paymentGateway" = CASE
  WHEN "mtnCollectionProvider"::text = 'IOTEC_PAY'
    OR "airtelCollectionProvider"::text = 'IOTEC_PAY'
    OR "mtnDisbursementProvider"::text = 'IOTEC_PAY'
    OR "airtelDisbursementProvider"::text = 'IOTEC_PAY'
    THEN 'IOTEC_PAY'::"PlatformPaymentGateway"
  WHEN "mtnCollectionProvider"::text = 'MTN_MOMO_DIRECT'
    AND "airtelCollectionProvider"::text = 'AIRTEL_MONEY_DIRECT'
    AND "mtnDisbursementProvider"::text = 'MTN_MOMO_DIRECT'
    AND "airtelDisbursementProvider"::text = 'AIRTEL_MONEY_DIRECT'
    THEN 'DIRECT_MNO'::"PlatformPaymentGateway"
  ELSE 'YO_UGANDA'::"PlatformPaymentGateway"
END
WHERE "id" = 'global';

ALTER TABLE "PlatformSetting"
  ALTER COLUMN "proMobileMoneyFeeBps" SET DEFAULT 400;

UPDATE "PlatformSetting"
SET "proMobileMoneyFeeBps" = 400
WHERE "id" = 'global'
  AND "proMobileMoneyFeeBps" = 300;
