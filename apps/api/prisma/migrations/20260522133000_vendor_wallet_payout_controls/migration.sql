CREATE TYPE "PayoutNumberStatus" AS ENUM ('ACTIVE', 'DISABLED');
CREATE TYPE "PayoutNumberChangeStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'CANCELLED');

ALTER TABLE "Disbursement" ALTER COLUMN "agentId" DROP NOT NULL;
ALTER TABLE "Disbursement" ADD COLUMN IF NOT EXISTS "network" "PaymentNetwork";
ALTER TABLE "Disbursement" ADD COLUMN IF NOT EXISTS "provider" "PaymentProvider";

CREATE TABLE "TenantPayoutProfile" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "secretHash" TEXT NOT NULL,
  "termsVersion" TEXT NOT NULL DEFAULT '2026-05-22',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "TenantPayoutProfile_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "TenantPayoutNumber" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "network" "PaymentNetwork" NOT NULL,
  "phone" TEXT NOT NULL,
  "normalizedPhone" TEXT NOT NULL,
  "label" TEXT,
  "status" "PayoutNumberStatus" NOT NULL DEFAULT 'ACTIVE',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "TenantPayoutNumber_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "TenantPayoutNumberChangeRequest" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "existingPayoutNumberId" TEXT,
  "requestedNetwork" "PaymentNetwork" NOT NULL,
  "requestedPhone" TEXT NOT NULL,
  "requestedNormalizedPhone" TEXT NOT NULL,
  "reason" TEXT NOT NULL,
  "status" "PayoutNumberChangeStatus" NOT NULL DEFAULT 'PENDING',
  "reviewedByUserId" TEXT,
  "reviewedAt" TIMESTAMP(3),
  "reviewNotes" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "TenantPayoutNumberChangeRequest_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "TenantPayoutProfile_tenantId_key" ON "TenantPayoutProfile"("tenantId");
CREATE UNIQUE INDEX "TenantPayoutNumber_tenantId_normalizedPhone_key" ON "TenantPayoutNumber"("tenantId", "normalizedPhone");
CREATE INDEX "TenantPayoutNumber_tenantId_status_idx" ON "TenantPayoutNumber"("tenantId", "status");
CREATE INDEX "TenantPayoutNumberChangeRequest_tenantId_status_createdAt_idx" ON "TenantPayoutNumberChangeRequest"("tenantId", "status", "createdAt");

ALTER TABLE "TenantPayoutProfile" ADD CONSTRAINT "TenantPayoutProfile_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "TenantPayoutNumber" ADD CONSTRAINT "TenantPayoutNumber_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "TenantPayoutNumberChangeRequest" ADD CONSTRAINT "TenantPayoutNumberChangeRequest_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
