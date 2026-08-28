-- Router overview reads recent/live FreeRADIUS accounting on every dashboard refresh.
-- radacct already has username/NAS/stop indexes, but the overview's day-window
-- predicate also filters acctstarttime and acctupdatetime. Index those signals so
-- PostgreSQL can use bitmap index scans instead of repeatedly scanning radacct.
CREATE INDEX IF NOT EXISTS idx_radacct_acctstarttime
  ON radacct(acctstarttime);

CREATE INDEX IF NOT EXISTS idx_radacct_acctupdatetime
  ON radacct(acctupdatetime);

-- Live-session detection ignores stopped rows and is driven by the freshest
-- accounting update. Keep this partial index small as historical rows close.
CREATE INDEX IF NOT EXISTS idx_radacct_live_update_nas_username
  ON radacct(acctupdatetime, nasipaddress, username)
  WHERE acctstoptime IS NULL;

-- Router overview groups today's RadiusEvent rows by event type. These indexes
-- cover both tenant-scoped and platform-wide dashboard variants without
-- changing application behavior.
CREATE INDEX IF NOT EXISTS idx_radius_event_created_type
  ON "RadiusEvent"("createdAt", "eventType");

CREATE INDEX IF NOT EXISTS idx_radius_event_tenant_created_type
  ON "RadiusEvent"("tenantId", "createdAt", "eventType");
