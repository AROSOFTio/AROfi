CREATE TABLE IF NOT EXISTS "SubscriptionPayment" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "plan" "SubscriptionPlanTier" NOT NULL,
  "status" "PaymentStatus" NOT NULL DEFAULT 'INITIATED',
  "amountUgx" INTEGER NOT NULL,
  "durationDays" INTEGER NOT NULL,
  "currency" TEXT NOT NULL DEFAULT 'UGX',
  "network" "PaymentNetwork" NOT NULL,
  "phoneNumber" TEXT NOT NULL,
  "externalReference" TEXT NOT NULL,
  "providerReference" TEXT,
  "statusMessage" TEXT,
  "requestPayload" JSONB,
  "responsePayload" JSONB,
  "initiatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "completedAt" TIMESTAMP(3),
  "failedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "SubscriptionPayment_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "SubscriptionPayment_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS "SubscriptionPayment_externalReference_key" ON "SubscriptionPayment"("externalReference");
CREATE UNIQUE INDEX IF NOT EXISTS "SubscriptionPayment_providerReference_key" ON "SubscriptionPayment"("providerReference");
CREATE INDEX IF NOT EXISTS "SubscriptionPayment_tenantId_createdAt_idx" ON "SubscriptionPayment"("tenantId", "createdAt");
CREATE INDEX IF NOT EXISTS "SubscriptionPayment_tenantId_status_createdAt_idx" ON "SubscriptionPayment"("tenantId", "status", "createdAt");
