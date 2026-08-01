CREATE TYPE "SmsProvider" AS ENUM ('AFRICAS_TALKING', 'DISABLED');

CREATE TYPE "SmsMessageStatus" AS ENUM ('SKIPPED', 'QUEUED', 'SENT', 'FAILED');

CREATE TABLE "SmsMessage" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT,
    "provider" "SmsProvider" NOT NULL DEFAULT 'AFRICAS_TALKING',
    "status" "SmsMessageStatus" NOT NULL DEFAULT 'QUEUED',
    "templateKey" TEXT,
    "recipient" TEXT NOT NULL,
    "normalizedRecipient" TEXT,
    "body" TEXT NOT NULL,
    "segments" INTEGER NOT NULL DEFAULT 1,
    "estimatedCostUgx" INTEGER,
    "providerMessageId" TEXT,
    "providerResponse" JSONB,
    "errorMessage" TEXT,
    "sentAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SmsMessage_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "SmsMessage_tenantId_createdAt_idx" ON "SmsMessage"("tenantId", "createdAt");
CREATE INDEX "SmsMessage_status_createdAt_idx" ON "SmsMessage"("status", "createdAt");
CREATE INDEX "SmsMessage_normalizedRecipient_createdAt_idx" ON "SmsMessage"("normalizedRecipient", "createdAt");

ALTER TABLE "SmsMessage" ADD CONSTRAINT "SmsMessage_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE SET NULL ON UPDATE CASCADE;
