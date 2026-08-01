CREATE TYPE "SmsCreditLedgerType" AS ENUM ('MONTHLY_INCLUDED', 'PURCHASE', 'DEBIT', 'REFUND', 'ADJUSTMENT');

ALTER TABLE "TenantSetting"
  ADD COLUMN "smsMonthlyIncluded" INTEGER NOT NULL DEFAULT 100,
  ADD COLUMN "smsMonthlyUsed" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "smsMonthlyCycleStartedAt" TIMESTAMP(3),
  ADD COLUMN "smsPurchasedBalance" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "smsUnitPriceUgx" INTEGER NOT NULL DEFAULT 40;

ALTER TABLE "SmsMessage"
  ADD COLUMN "creditSource" TEXT;

CREATE TABLE "SmsCreditPurchase" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "status" "PaymentStatus" NOT NULL DEFAULT 'INITIATED',
    "smsQuantity" INTEGER NOT NULL,
    "unitPriceUgx" INTEGER NOT NULL,
    "amountUgx" INTEGER NOT NULL,
    "network" "PaymentNetwork" NOT NULL,
    "phoneNumber" TEXT NOT NULL,
    "externalReference" TEXT NOT NULL,
    "providerReference" TEXT,
    "statusMessage" TEXT,
    "requestPayload" JSONB,
    "responsePayload" JSONB,
    "creditedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "failedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SmsCreditPurchase_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "SmsCreditLedger" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "type" "SmsCreditLedgerType" NOT NULL,
    "quantity" INTEGER NOT NULL,
    "balanceAfter" INTEGER,
    "unitPriceUgx" INTEGER,
    "amountUgx" INTEGER,
    "smsMessageId" TEXT,
    "purchaseId" TEXT,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SmsCreditLedger_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "SmsCreditPurchase_externalReference_key" ON "SmsCreditPurchase"("externalReference");
CREATE INDEX "SmsCreditPurchase_tenantId_createdAt_idx" ON "SmsCreditPurchase"("tenantId", "createdAt");
CREATE INDEX "SmsCreditPurchase_status_createdAt_idx" ON "SmsCreditPurchase"("status", "createdAt");
CREATE INDEX "SmsCreditLedger_tenantId_createdAt_idx" ON "SmsCreditLedger"("tenantId", "createdAt");
CREATE INDEX "SmsCreditLedger_purchaseId_idx" ON "SmsCreditLedger"("purchaseId");
CREATE INDEX "SmsCreditLedger_smsMessageId_idx" ON "SmsCreditLedger"("smsMessageId");

ALTER TABLE "SmsCreditPurchase" ADD CONSTRAINT "SmsCreditPurchase_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SmsCreditLedger" ADD CONSTRAINT "SmsCreditLedger_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
