-- Enterprise Bring-Your-Own Payment API connectors.
-- Kept as a dedicated table so provider credentials/configuration are tenant-scoped
-- and never need to live in global environment variables.
CREATE TABLE IF NOT EXISTS "EnterprisePaymentConnector" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "slug" TEXT NOT NULL,
  "countryCode" VARCHAR(2) NOT NULL,
  "currency" VARCHAR(12) NOT NULL,
  "networkCode" VARCHAR(64) NOT NULL,
  "providerName" TEXT NOT NULL,
  "collectionUrl" TEXT NOT NULL,
  "statusUrl" TEXT,
  "disbursementUrl" TEXT,
  "disbursementStatusUrl" TEXT,
  "collectionMethod" VARCHAR(12) NOT NULL DEFAULT 'POST',
  "statusMethod" VARCHAR(12) NOT NULL DEFAULT 'GET',
  "disbursementMethod" VARCHAR(12) NOT NULL DEFAULT 'POST',
  "headers" JSONB NOT NULL DEFAULT '{}'::jsonb,
  "staticBody" JSONB NOT NULL DEFAULT '{}'::jsonb,
  "authCiphertext" TEXT NOT NULL,
  "fieldMap" JSONB NOT NULL,
  "responseMap" JSONB NOT NULL,
  "statusMap" JSONB NOT NULL,
  "webhookTokenCiphertext" TEXT NOT NULL,
  "supportsCollections" BOOLEAN NOT NULL DEFAULT TRUE,
  "supportsDisbursements" BOOLEAN NOT NULL DEFAULT FALSE,
  "enabled" BOOLEAN NOT NULL DEFAULT TRUE,
  "lastValidatedAt" TIMESTAMP(3),
  "lastUsedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "EnterprisePaymentConnector_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "EnterprisePaymentConnector_tenantId_fkey"
    FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS "EnterprisePaymentConnector_tenantId_slug_key"
  ON "EnterprisePaymentConnector"("tenantId", "slug");

CREATE INDEX IF NOT EXISTS "EnterprisePaymentConnector_tenantId_enabled_idx"
  ON "EnterprisePaymentConnector"("tenantId", "enabled");

CREATE INDEX IF NOT EXISTS "EnterprisePaymentConnector_country_network_idx"
  ON "EnterprisePaymentConnector"("countryCode", "networkCode");
