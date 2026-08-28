-- Read-path indexes for Agent voucher accountability/reporting.
-- These are additive and scoped to predicates used by AgentVoucherMetricsService.

-- Voucher accountability first narrows batches by business/Agent/package before
-- grouping their vouchers by status. Keep those batch ownership predicates
-- together so reporting does not scan unrelated tenant inventory.
CREATE INDEX IF NOT EXISTS idx_voucherbatch_tenant_agent_package
  ON "VoucherBatch"("tenantId", "agentId", "packageId");

-- Status totals and date-expiry reconciliation both group per batch and then
-- filter by status / expiresAt. Extending the existing batch+status read index
-- makes the expiry branch index-friendly without materializing voucher rows.
CREATE INDEX IF NOT EXISTS idx_voucher_batch_status_expires
  ON "Voucher"("batchId", status, "expiresAt");

-- Agent voucher reports only count completed voucher sale/redemption rows with
-- positive gross value and optionally constrain tenant, Agent, package and date.
-- Keep unrelated billing history out of this hot reporting index.
CREATE INDEX IF NOT EXISTS idx_billing_completed_voucher_metrics
  ON "BillingTransaction"("tenantId", "agentId", "packageId", "createdAt")
  WHERE status = 'COMPLETED'
    AND type IN ('VOUCHER_SALE', 'VOUCHER_REDEMPTION')
    AND "grossAmountUgx" > 0;
