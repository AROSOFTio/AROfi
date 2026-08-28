-- Focused read indexes for Agent dashboard/overview aggregates.
-- These are additive, partial PostgreSQL indexes: the hot paths only read
-- completed sales and non-reversed commissions, so avoid bloating indexes with
-- unrelated pending/failed/reversed history.

-- Supports Agent dashboard today/total sales, cash liability aggregates, and
-- management overview sales grouping. INCLUDE keeps the summed amount/channel
-- available to index-only plans when visibility permits.
CREATE INDEX IF NOT EXISTS idx_billing_agent_completed_sales_read
  ON "BillingTransaction"("tenantId", "agentId", "createdAt")
  INCLUDE ("grossAmountUgx", channel, type)
  WHERE status = 'COMPLETED'
    AND type IN ('VOUCHER_SALE', 'MOBILE_MONEY_SALE');

-- Supports today's commission, lifetime commission, and management commission
-- totals without scanning reversed commission history.
CREATE INDEX IF NOT EXISTS idx_agentcommission_nonreversed_read
  ON "AgentCommission"("tenantId", "agentId", "createdAt")
  INCLUDE ("amountUgx", "sourceTransactionId")
  WHERE status <> 'REVERSED';

-- Cash-remittance reads always require completed settlements and a fixed notes
-- prefix. text_pattern_ops lets PostgreSQL use the prefix predicate efficiently
-- after tenant/Agent equality filtering.
CREATE INDEX IF NOT EXISTS idx_settlement_completed_cash_read
  ON "Settlement"("tenantId", "agentId", notes text_pattern_ops)
  INCLUDE ("payableAmountUgx")
  WHERE status = 'COMPLETED';
