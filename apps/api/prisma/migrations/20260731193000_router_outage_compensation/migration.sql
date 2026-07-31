CREATE TYPE "RouterOutageStatus" AS ENUM ('OPEN', 'RESOLVED', 'COMPENSATED', 'COMPENSATION_SKIPPED');
CREATE TYPE "RouterCompensationMode" AS ENUM ('AUTO', 'MANUAL');

CREATE TABLE "RouterOutage" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "routerId" TEXT NOT NULL,
  "offlineAt" TIMESTAMP(3) NOT NULL,
  "restoredAt" TIMESTAMP(3),
  "durationSeconds" INTEGER,
  "status" "RouterOutageStatus" NOT NULL DEFAULT 'OPEN',
  "autoCompensate" BOOLEAN NOT NULL DEFAULT true,
  "compensationProcessedAt" TIMESTAMP(3),
  "affectedActivations" INTEGER NOT NULL DEFAULT 0,
  "totalSecondsCredited" INTEGER NOT NULL DEFAULT 0,
  "notes" TEXT,
  "metadata" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "RouterOutage_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "RouterCompensation" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "routerId" TEXT NOT NULL,
  "outageId" TEXT NOT NULL,
  "activationId" TEXT NOT NULL,
  "mode" "RouterCompensationMode" NOT NULL DEFAULT 'AUTO',
  "secondsCredited" INTEGER NOT NULL,
  "previousEndsAt" TIMESTAMP(3) NOT NULL,
  "newEndsAt" TIMESTAMP(3) NOT NULL,
  "customerReference" TEXT,
  "accessPhoneNumber" TEXT,
  "notifiedEmailAt" TIMESTAMP(3),
  "notifiedTextAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "RouterCompensation_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "RouterOutage_tenantId_status_offlineAt_idx" ON "RouterOutage"("tenantId", "status", "offlineAt");
CREATE INDEX "RouterOutage_routerId_status_offlineAt_idx" ON "RouterOutage"("routerId", "status", "offlineAt");
CREATE UNIQUE INDEX "RouterCompensation_outageId_activationId_key" ON "RouterCompensation"("outageId", "activationId");
CREATE INDEX "RouterCompensation_tenantId_createdAt_idx" ON "RouterCompensation"("tenantId", "createdAt");
CREATE INDEX "RouterCompensation_routerId_createdAt_idx" ON "RouterCompensation"("routerId", "createdAt");
CREATE INDEX "RouterCompensation_activationId_idx" ON "RouterCompensation"("activationId");

ALTER TABLE "RouterOutage" ADD CONSTRAINT "RouterOutage_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "RouterOutage" ADD CONSTRAINT "RouterOutage_routerId_fkey" FOREIGN KEY ("routerId") REFERENCES "Router"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "RouterCompensation" ADD CONSTRAINT "RouterCompensation_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "RouterCompensation" ADD CONSTRAINT "RouterCompensation_routerId_fkey" FOREIGN KEY ("routerId") REFERENCES "Router"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "RouterCompensation" ADD CONSTRAINT "RouterCompensation_outageId_fkey" FOREIGN KEY ("outageId") REFERENCES "RouterOutage"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "RouterCompensation" ADD CONSTRAINT "RouterCompensation_activationId_fkey" FOREIGN KEY ("activationId") REFERENCES "PackageActivation"("id") ON DELETE CASCADE ON UPDATE CASCADE;
