ALTER TYPE "PaymentProvider" ADD VALUE IF NOT EXISTS 'MTN_MOMO_DIRECT';
ALTER TYPE "PaymentProvider" ADD VALUE IF NOT EXISTS 'AIRTEL_MONEY_DIRECT';
ALTER TYPE "PaymentProvider" ADD VALUE IF NOT EXISTS 'AGGREGATOR';

ALTER TABLE "Payment" ADD COLUMN IF NOT EXISTS "normalizedPhone" TEXT;
ALTER TABLE "PaymentWebhook" ADD COLUMN IF NOT EXISTS "network" "PaymentNetwork";
ALTER TABLE "PaymentWebhook" ADD COLUMN IF NOT EXISTS "status" TEXT;
ALTER TABLE "PaymentWebhook" ADD COLUMN IF NOT EXISTS "idempotencyKey" TEXT;

-- Existing legacy gateway rows should be mapped to AGGREGATOR before this migration is applied in live environments.

CREATE INDEX IF NOT EXISTS "Payment_tenantId_network_status_createdAt_idx" ON "Payment"("tenantId", "network", "status", "createdAt");
CREATE INDEX IF NOT EXISTS "Payment_providerReference_status_idx" ON "Payment"("providerReference", "status");
CREATE INDEX IF NOT EXISTS "PaymentWebhook_provider_providerReference_createdAt_idx" ON "PaymentWebhook"("provider", "providerReference", "createdAt");
CREATE INDEX IF NOT EXISTS "Package_tenantId_status_isFeatured_createdAt_idx" ON "Package"("tenantId", "status", "isFeatured", "createdAt");
CREATE UNIQUE INDEX IF NOT EXISTS "PaymentWebhook_idempotencyKey_key" ON "PaymentWebhook"("idempotencyKey");

CREATE TABLE IF NOT EXISTS "PaymentProviderConfig" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT,
  "network" "PaymentNetwork" NOT NULL,
  "collectionProvider" "PaymentProvider" NOT NULL,
  "disbursementProvider" "PaymentProvider" NOT NULL,
  "mode" TEXT NOT NULL DEFAULT 'sandbox',
  "currency" TEXT NOT NULL DEFAULT 'UGX',
  "commissionBps" INTEGER NOT NULL DEFAULT 0,
  "minimumPayoutUgx" INTEGER NOT NULL DEFAULT 0,
  "requirePayoutApproval" BOOLEAN NOT NULL DEFAULT true,
  "allowedPrefixes" TEXT[],
  "lastSuccessfulCollectionAt" TIMESTAMP(3),
  "lastSuccessfulDisbursementAt" TIMESTAMP(3),
  "webhookHealthStatus" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "PaymentProviderConfig_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "PaymentProviderConfig_tenantId_network_key" ON "PaymentProviderConfig"("tenantId", "network");
ALTER TABLE "PaymentProviderConfig" ADD CONSTRAINT "PaymentProviderConfig_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE SET NULL ON UPDATE CASCADE;
