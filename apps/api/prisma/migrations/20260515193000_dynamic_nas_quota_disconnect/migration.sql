-- Dynamic FreeRADIUS NAS clients, quota state, and active disconnect tracking.

-- Extend activation lifecycle for enforced data caps.
ALTER TYPE "PackageActivationStatus" ADD VALUE IF NOT EXISTS 'QUOTA_EXHAUSTED';

-- CreateEnum
CREATE TYPE "DisconnectionStatus" AS ENUM ('REQUESTED', 'SUCCESS', 'FAILED', 'NOT_SUPPORTED');

-- CreateEnum
CREATE TYPE "DisconnectionMethod" AS ENUM ('RADIUS_DISCONNECT', 'ROUTEROS_API', 'AUTH_DISABLE_ONLY');

-- AlterTable
ALTER TABLE "PackageActivation"
  ADD COLUMN "usedBytes" BIGINT NOT NULL DEFAULT 0,
  ADD COLUMN "quotaExhaustedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "TenantSetting"
  ADD COLUMN "allowUnboundCaptiveAccess" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "antiTetheringRuleEnabled" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "nas" (
  "id" SERIAL NOT NULL,
  "tenantId" TEXT,
  "routerId" TEXT,
  "nasname" VARCHAR(128) NOT NULL,
  "shortname" VARCHAR(32) NOT NULL,
  "type" VARCHAR(30) NOT NULL DEFAULT 'mikrotik',
  "ports" INTEGER,
  "secret" VARCHAR(60) NOT NULL,
  "server" VARCHAR(64),
  "community" VARCHAR(50),
  "description" VARCHAR(200),
  "enabled" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "nas_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DisconnectionAttempt" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "activationId" TEXT,
  "sessionId" TEXT,
  "method" "DisconnectionMethod" NOT NULL,
  "status" "DisconnectionStatus" NOT NULL DEFAULT 'REQUESTED',
  "routerId" TEXT,
  "username" TEXT,
  "macAddress" TEXT,
  "radiusSessionId" TEXT,
  "message" TEXT,
  "payload" JSONB,
  "attemptedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "completedAt" TIMESTAMP(3),
  CONSTRAINT "DisconnectionAttempt_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "nas_routerId_key" ON "nas"("routerId");

-- CreateIndex
CREATE UNIQUE INDEX "nas_nasname_shortname_key" ON "nas"("nasname", "shortname");

-- CreateIndex
CREATE INDEX "nas_tenantId_idx" ON "nas"("tenantId");

-- CreateIndex
CREATE INDEX "nas_routerId_idx" ON "nas"("routerId");

-- CreateIndex
CREATE INDEX "DisconnectionAttempt_tenantId_attemptedAt_idx" ON "DisconnectionAttempt"("tenantId", "attemptedAt");

-- CreateIndex
CREATE INDEX "DisconnectionAttempt_activationId_attemptedAt_idx" ON "DisconnectionAttempt"("activationId", "attemptedAt");

-- CreateIndex
CREATE INDEX "DisconnectionAttempt_status_attemptedAt_idx" ON "DisconnectionAttempt"("status", "attemptedAt");

-- AddForeignKey
ALTER TABLE "nas" ADD CONSTRAINT "nas_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "nas" ADD CONSTRAINT "nas_routerId_fkey" FOREIGN KEY ("routerId") REFERENCES "Router"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DisconnectionAttempt" ADD CONSTRAINT "DisconnectionAttempt_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DisconnectionAttempt" ADD CONSTRAINT "DisconnectionAttempt_activationId_fkey" FOREIGN KEY ("activationId") REFERENCES "PackageActivation"("id") ON DELETE SET NULL ON UPDATE CASCADE;
