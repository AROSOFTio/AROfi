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
