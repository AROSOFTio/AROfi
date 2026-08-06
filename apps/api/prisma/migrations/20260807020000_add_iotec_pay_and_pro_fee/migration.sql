ALTER TYPE "PaymentProvider" ADD VALUE IF NOT EXISTS 'IOTEC_PAY';

ALTER TABLE "PlatformSetting"
  ALTER COLUMN "proMobileMoneyFeeBps" SET DEFAULT 400;

UPDATE "PlatformSetting"
SET "proMobileMoneyFeeBps" = 400
WHERE "id" = 'global'
  AND "proMobileMoneyFeeBps" = 300;
