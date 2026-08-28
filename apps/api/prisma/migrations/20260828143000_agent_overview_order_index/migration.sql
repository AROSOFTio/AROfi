-- Speed the management Agent overview's tenant-scoped newest-first page.
--
-- AgentOverviewService requests up to 500 rows with
--   WHERE "tenantId" = ? ORDER BY "createdAt" DESC
-- while the existing Agent indexes cover tenant/status and unique business keys.
-- This keeps that hot read from sorting/scanning more of a tenant's Agent history
-- as the table grows.
CREATE INDEX IF NOT EXISTS "Agent_tenantId_createdAt_desc_idx"
  ON "Agent" ("tenantId", "createdAt" DESC);
