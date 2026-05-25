DO $$ BEGIN
  CREATE TYPE "FeeSettingSource" AS ENUM ('GLOBAL_DEFAULT', 'TENANT_OVERRIDE');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

ALTER TYPE "DisbursementStatus" ADD VALUE IF NOT EXISTS 'PENDING_APPROVAL';

CREATE TABLE IF NOT EXISTS "PlatformSetting" (
  "id" TEXT NOT NULL DEFAULT 'global',
  "mobileMoneyFeeBps" INTEGER NOT NULL DEFAULT 700,
  "voucherFeeBps" INTEGER NOT NULL DEFAULT 200,
  "minimumWithdrawalUgx" INTEGER NOT NULL DEFAULT 0,
  "withdrawalFeeBps" INTEGER NOT NULL DEFAULT 0,
  "withdrawalFlatFeeUgx" INTEGER NOT NULL DEFAULT 0,
  "requireWithdrawalApproval" BOOLEAN NOT NULL DEFAULT false,
  "maxPayoutNumbers" INTEGER NOT NULL DEFAULT 2,
  "allowedPaymentNetworks" "PaymentNetwork"[] NOT NULL DEFAULT ARRAY['MTN']::"PaymentNetwork"[],
  "mtnCollectionProvider" "PaymentProvider" NOT NULL DEFAULT 'MTN_MOMO_DIRECT',
  "airtelCollectionProvider" "PaymentProvider" NOT NULL DEFAULT 'AGGREGATOR',
  "mtnDisbursementProvider" "PaymentProvider" NOT NULL DEFAULT 'MTN_MOMO_DIRECT',
  "airtelDisbursementProvider" "PaymentProvider" NOT NULL DEFAULT 'AGGREGATOR',
  "routerAutoConnectEnabled" BOOLEAN NOT NULL DEFAULT true,
  "captivePortalFallbackMessage" TEXT NOT NULL DEFAULT 'Payment confirmed, but automatic connection failed. Tap Connect Now or open your session.',
  "supportPhone" TEXT,
  "supportEmail" TEXT,
  "supportUrl" TEXT,
  "voucherTemplateDefaultStyle" TEXT NOT NULL DEFAULT 'signal',
  "auditLoggingEnabled" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PlatformSetting_pkey" PRIMARY KEY ("id")
);

INSERT INTO "PlatformSetting" ("id")
VALUES ('global')
ON CONFLICT ("id") DO NOTHING;

ALTER TABLE "BillingTransaction" ADD COLUMN IF NOT EXISTS "feeBasisPoints" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "BillingTransaction" ADD COLUMN IF NOT EXISTS "feeSource" "FeeSettingSource";
ALTER TABLE "LedgerTransaction" ADD COLUMN IF NOT EXISTS "feeBasisPoints" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "LedgerTransaction" ADD COLUMN IF NOT EXISTS "feeSource" "FeeSettingSource";

ALTER TABLE "TenantSetting" ADD COLUMN IF NOT EXISTS "tenantMobileMoneyFeeBps" INTEGER;
ALTER TABLE "TenantSetting" ADD COLUMN IF NOT EXISTS "tenantVoucherFeeBps" INTEGER;
ALTER TABLE "TenantSetting" ADD COLUMN IF NOT EXISTS "businessName" TEXT;
ALTER TABLE "TenantSetting" ADD COLUMN IF NOT EXISTS "supportPhone" TEXT;
ALTER TABLE "TenantSetting" ADD COLUMN IF NOT EXISTS "supportEmail" TEXT;
ALTER TABLE "TenantSetting" ADD COLUMN IF NOT EXISTS "logoUrl" TEXT;
ALTER TABLE "TenantSetting" ADD COLUMN IF NOT EXISTS "brandColor" TEXT;
ALTER TABLE "TenantSetting" ADD COLUMN IF NOT EXISTS "portalTemplate" TEXT;
ALTER TABLE "TenantSetting" ADD COLUMN IF NOT EXISTS "withdrawalSecretRequired" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "TenantSetting" ADD COLUMN IF NOT EXISTS "routerAutoConnectEnabled" BOOLEAN;
ALTER TABLE "TenantSetting" ADD COLUMN IF NOT EXISTS "routerOnboardingPreferences" JSONB;
ALTER TABLE "TenantSetting" ADD COLUMN IF NOT EXISTS "voucherPrintDefaultTemplate" TEXT;
ALTER TABLE "TenantSetting" ADD COLUMN IF NOT EXISTS "termsAcceptedAt" TIMESTAMP(3);
ALTER TABLE "TenantSetting" ADD COLUMN IF NOT EXISTS "termsAcceptedByUserId" TEXT;
