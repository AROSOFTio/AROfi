-- Structured compliance/business-verification profile per tenant.
-- Supporting documents reuse the existing KycDocument table.

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'ComplianceStatus') THEN
    CREATE TYPE "ComplianceStatus" AS ENUM ('PENDING_REVIEW', 'APPROVED', 'REJECTED', 'NEEDS_INFO');
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS "ComplianceProfile" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "businessName" TEXT NOT NULL,
  "ownerName" TEXT NOT NULL,
  "phoneNumber" TEXT NOT NULL,
  "email" TEXT NOT NULL,
  "country" TEXT NOT NULL DEFAULT 'Uganda',
  "district" TEXT NOT NULL,
  "hotspotLocation" TEXT NOT NULL,
  "businessType" TEXT NOT NULL,
  "ispName" TEXT NOT NULL,
  "ispPackage" TEXT,
  "routerCount" INTEGER NOT NULL DEFAULT 1,
  "expectedUsers" INTEGER,
  "payoutPhoneNumber" TEXT,
  "notes" TEXT,
  "status" "ComplianceStatus" NOT NULL DEFAULT 'PENDING_REVIEW',
  "reviewedBy" TEXT,
  "reviewedAt" TIMESTAMP(3),
  "reviewNotes" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "ComplianceProfile_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "ComplianceProfile_tenantId_key" ON "ComplianceProfile"("tenantId");
CREATE INDEX IF NOT EXISTS "ComplianceProfile_status_createdAt_idx" ON "ComplianceProfile"("status", "createdAt");

ALTER TABLE "ComplianceProfile"
  ADD CONSTRAINT "ComplianceProfile_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
