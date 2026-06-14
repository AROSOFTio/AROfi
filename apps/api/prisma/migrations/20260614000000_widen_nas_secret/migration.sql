-- Widen the FreeRADIUS NAS client secret column.
--
-- The platform RADIUS shared secret (RADIUS_SHARED_SECRET) can exceed the
-- FreeRADIUS default of VARCHAR(60). When that happens, every router
-- registration fails on the nested NAS client insert with an opaque
-- "Internal server error", because the value is too long for the column.
-- Widening to VARCHAR(128) covers long, high-entropy secrets while staying
-- compatible with FreeRADIUS' sql `nas` table reads.

ALTER TABLE "nas" ALTER COLUMN "secret" TYPE VARCHAR(128);
