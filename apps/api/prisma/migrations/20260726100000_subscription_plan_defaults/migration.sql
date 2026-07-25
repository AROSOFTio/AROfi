ALTER TABLE "PlatformSetting" ALTER COLUMN "mobileMoneyFeeBps" SET DEFAULT 800;
ALTER TABLE "PlatformSetting" ALTER COLUMN "proMobileMoneyFeeBps" SET DEFAULT 300;

ALTER TABLE "PlatformSetting" ADD COLUMN IF NOT EXISTS "proSubscriptionPriceUgx" INTEGER NOT NULL DEFAULT 20000;
ALTER TABLE "PlatformSetting" ADD COLUMN IF NOT EXISTS "proSubscriptionDurationDays" INTEGER NOT NULL DEFAULT 30;

UPDATE "PlatformSetting"
SET
  "mobileMoneyFeeBps" = CASE WHEN "mobileMoneyFeeBps" = 700 THEN 800 ELSE "mobileMoneyFeeBps" END,
  "proMobileMoneyFeeBps" = CASE WHEN "proMobileMoneyFeeBps" = 400 THEN 300 ELSE "proMobileMoneyFeeBps" END,
  "proSubscriptionPriceUgx" = COALESCE("proSubscriptionPriceUgx", 20000),
  "proSubscriptionDurationDays" = COALESCE("proSubscriptionDurationDays", 30)
WHERE "id" = 'global'
  AND ("mobileMoneyFeeBps" = 700 OR "proMobileMoneyFeeBps" = 400);
