DO $$ BEGIN
  CREATE TYPE "KycDocumentType" AS ENUM ('BUSINESS_REGISTRATION', 'OWNER_ID', 'PROOF_OF_ADDRESS', 'OTHER');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE "KycDocumentStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

CREATE TABLE IF NOT EXISTS "KycDocument" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "documentType" "KycDocumentType" NOT NULL,
  "fileName" TEXT NOT NULL,
  "mimeType" TEXT NOT NULL,
  "fileSize" INTEGER NOT NULL,
  "fileData" BYTEA NOT NULL,
  "status" "KycDocumentStatus" NOT NULL DEFAULT 'PENDING',
  "uploadedById" TEXT,
  "reviewedById" TEXT,
  "reviewNotes" TEXT,
  "reviewedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "KycDocument_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "KycDocument_tenantId_status_idx" ON "KycDocument"("tenantId", "status");
CREATE INDEX IF NOT EXISTS "KycDocument_status_createdAt_idx" ON "KycDocument"("status", "createdAt");

DO $$ BEGIN
  ALTER TABLE "KycDocument" ADD CONSTRAINT "KycDocument_tenantId_fkey"
    FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;
