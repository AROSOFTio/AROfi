ALTER TABLE "TenantPayoutNumber"
  ALTER COLUMN "status" SET DEFAULT 'PENDING_ADMIN_APPROVAL';

ALTER TABLE "TenantPayoutNumberChangeRequest"
  ALTER COLUMN "status" SET DEFAULT 'PENDING_ADMIN_APPROVAL';

UPDATE "TenantPayoutNumber"
SET "status" = 'VERIFIED',
    "verifiedAt" = COALESCE("verifiedAt", "createdAt")
WHERE "status"::text = 'ACTIVE';

WITH ranked AS (
  SELECT id, ROW_NUMBER() OVER (PARTITION BY "tenantId" ORDER BY "createdAt" ASC) AS rn
  FROM "TenantPayoutNumber"
  WHERE "status" = 'VERIFIED'
)
UPDATE "TenantPayoutNumber" number
SET "isPrimary" = true
FROM ranked
WHERE number.id = ranked.id AND ranked.rn = 1 AND number."isPrimary" = false;
