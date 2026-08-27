-- Read-path indexes for the lightweight dashboard/overview queries.
-- These are additive only and intentionally use IF NOT EXISTS so an existing
-- manually provisioned performance index does not block migration deploys.

-- Router overview: live/open accounting rows are filtered by the freshest
-- accounting timestamp before selecting only NAS IP + username.
CREATE INDEX IF NOT EXISTS idx_radacct_acctupdatetime
  ON radacct(acctupdatetime);

CREATE INDEX IF NOT EXISTS idx_radacct_acctstarttime
  ON radacct(acctstarttime);

-- Router/session liveness reads filter by router, active status and recent
-- accounting time together.
CREATE INDEX IF NOT EXISTS idx_networksession_router_status_accounting
  ON "NetworkSession"("routerId", status, "lastAccountingAt");

-- Voucher overview groups the displayed batches by voucher status without
-- materializing every voucher row.
CREATE INDEX IF NOT EXISTS idx_voucher_batch_status
  ON "Voucher"("batchId", status);

-- Agent dashboard/login resolution uses a tenant-scoped case-insensitive email
-- lookup. Prisma translates `mode: 'insensitive'` to LOWER(email), so a normal
-- btree on email cannot service that predicate efficiently as Agent volume grows.
CREATE INDEX IF NOT EXISTS idx_agent_tenant_email_lower
  ON "Agent"("tenantId", LOWER(email));

-- Agent overview aggregates completed sales by Agent/channel. Keeping the
-- equality predicates together avoids scanning unrelated historical billing
-- rows before PostgreSQL performs the group-by.
CREATE INDEX IF NOT EXISTS idx_billing_agent_status_type_channel
  ON "BillingTransaction"("agentId", status, type, channel);

-- Commission totals are grouped per Agent and exclude reversed rows. This
-- index keeps Agent + status adjacent for the aggregate read path.
CREATE INDEX IF NOT EXISTS idx_agentcommission_agent_status
  ON "AgentCommission"("agentId", status);

-- Cash accountability totals only consider completed Agent settlements.
CREATE INDEX IF NOT EXISTS idx_settlement_agent_status
  ON "Settlement"("agentId", status);
