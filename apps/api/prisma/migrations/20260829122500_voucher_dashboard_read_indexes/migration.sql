-- Focused read indexes for the voucher sales dashboard.
-- Keep these partial so dashboard refreshes do not walk unrelated billing,
-- commission, and settlement history as transaction volume grows.

-- Current/previous-period voucher sales are always completed, positive-value
-- voucher sale/redemption rows ordered or aggregated by createdAt. INCLUDE
-- keeps the dashboard amount fields available to index-only plans when possible.
CREATE INDEX IF NOT EXISTS idx_billing_voucher_dashboard_period_read
  ON "BillingTransaction"("tenantId", "createdAt" DESC)
  INCLUDE ("agentId", "packageId", "voucherId", "grossAmountUgx", "feeAmountUgx", "netAmountUgx")
  WHERE status = 'COMPLETED'
    AND "grossAmountUgx" > 0
    AND type IN ('VOUCHER_SALE', 'VOUCHER_REDEMPTION');

-- Tenant-wide dashboard commission refreshes filter by createdAt without an
-- Agent predicate. The older Agent dashboard index orders agentId before
-- createdAt, so add a tenant/date path while keeping reversed rows out.
CREATE INDEX IF NOT EXISTS idx_agentcommission_voucher_dashboard_period_read
  ON "AgentCommission"("tenantId", "createdAt")
  INCLUDE ("agentId", "amountUgx")
  WHERE status <> 'REVERSED';

-- Completed settlement totals are read by tenant/Agent and periodEnd for the
-- selected dashboard range. The gross value can be satisfied from the index.
CREATE INDEX IF NOT EXISTS idx_settlement_voucher_dashboard_completed_read
  ON "Settlement"("tenantId", "agentId", "periodEnd")
  INCLUDE ("grossSalesUgx")
  WHERE status = 'COMPLETED';

-- The dashboard alert only needs overdue READY/PROCESSING settlements. Keeping
-- this partial avoids repeatedly scanning completed/failed settlement history.
CREATE INDEX IF NOT EXISTS idx_settlement_voucher_dashboard_overdue_read
  ON "Settlement"("tenantId", "periodEnd")
  INCLUDE ("agentId")
  WHERE status IN ('READY', 'PROCESSING');
