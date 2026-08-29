-- Platform-wide voucher dashboard refreshes omit tenantId but still filter
-- completed positive voucher sale/redemption rows by createdAt. The tenant-first
-- dashboard index cannot seek directly into that date range when no tenant is
-- selected, so keep a small complementary partial index ordered by createdAt.
--
-- INCLUDE carries the fields used by period totals/attribution and the recent
-- sales row lookup so PostgreSQL can prefer index-only plans when visibility
-- permits, without widening the index predicate to unrelated billing history.
CREATE INDEX IF NOT EXISTS idx_billing_voucher_dashboard_global_period_read
  ON "BillingTransaction"("createdAt" DESC)
  INCLUDE ("tenantId", "agentId", "packageId", "voucherId", "grossAmountUgx", "feeAmountUgx", "netAmountUgx")
  WHERE status = 'COMPLETED'
    AND "grossAmountUgx" > 0
    AND type IN ('VOUCHER_SALE', 'VOUCHER_REDEMPTION');
