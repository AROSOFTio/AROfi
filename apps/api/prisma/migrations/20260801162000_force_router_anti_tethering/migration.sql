UPDATE "Router"
SET "ttlAntiTetheringEnabled" = true
WHERE "ttlAntiTetheringEnabled" = false;

ALTER TABLE "Router"
ALTER COLUMN "ttlAntiTetheringEnabled" SET DEFAULT true;
