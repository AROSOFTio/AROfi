-- Payout destinations are peers. Existing records may retain the legacy
-- marker for historical compatibility, but it must not grant a default route.
UPDATE "TenantPayoutNumber" SET "isPrimary" = false WHERE "isPrimary" = true;
