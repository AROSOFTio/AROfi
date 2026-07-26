ALTER TABLE "PlatformSetting" ADD COLUMN IF NOT EXISTS "proPlanEnabled" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "PlatformSetting" ADD COLUMN IF NOT EXISTS "proRenewalRule" TEXT NOT NULL DEFAULT 'MANUAL_RENEWAL';
ALTER TABLE "PlatformSetting" ADD COLUMN IF NOT EXISTS "proGracePeriodDays" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "PlatformSetting" ADD COLUMN IF NOT EXISTS "subscriptionExpiryNotificationDays" TEXT NOT NULL DEFAULT '7,3,1,0';
ALTER TABLE "PlatformSetting" ADD COLUMN IF NOT EXISTS "freePlanDescription" TEXT NOT NULL DEFAULT 'Starter plan with no monthly subscription. Services remain active with standard transaction fees.';
ALTER TABLE "PlatformSetting" ADD COLUMN IF NOT EXISTS "proPlanDescription" TEXT NOT NULL DEFAULT 'Paid plan for growing WiFi businesses with lower Mobile Money fees and no voucher fee.';
ALTER TABLE "PlatformSetting" ADD COLUMN IF NOT EXISTS "freePlanBenefits" TEXT NOT NULL DEFAULT 'Cloud WinBox Tunnels|7-day analytics history|AROFi branding';
ALTER TABLE "PlatformSetting" ADD COLUMN IF NOT EXISTS "proPlanBenefits" TEXT NOT NULL DEFAULT 'Cloud WinBox Tunnels|Custom Branding|30-day analytics history';
