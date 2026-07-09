-- Per-router operational metadata: physical location, upstream ISP, and the
-- contact of the person managing the site.
ALTER TABLE "Router" ADD COLUMN IF NOT EXISTS "locationText" TEXT;
ALTER TABLE "Router" ADD COLUMN IF NOT EXISTS "ispName" TEXT;
ALTER TABLE "Router" ADD COLUMN IF NOT EXISTS "managerName" TEXT;
ALTER TABLE "Router" ADD COLUMN IF NOT EXISTS "managerPhone" TEXT;
