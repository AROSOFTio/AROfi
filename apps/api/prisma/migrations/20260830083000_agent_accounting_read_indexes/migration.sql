-- Agent accounting is loaded frequently and currently filters the same hot tables
-- by tenant + Agent + terminal state before producing dashboard/accounting totals.
-- Keep these indexes partial so unrelated historical rows do not bloat the hot path.
-- Include the values consumed by the accounting summary/history reads so PostgreSQL
-- can satisfy these hot queries from the index when visibility permits.

CREATE INDEX IF NOT EXISTS idx_billing_agent_completed_sales
  ON "BillingTransaction"("tenantId", "agentId", "createdAt" DESC)
  INCLUDE ("channel", "grossAmountUgx")
  WHERE status = 'COMPLETED'
    AND type IN ('VOUCHER_SALE', 'MOBILE_MONEY_SALE');

CREATE INDEX IF NOT EXISTS idx_agent_commission_active_by_agent
  ON "AgentCommission"("tenantId", "agentId", "createdAt" DESC)
  INCLUDE ("amountUgx", "status", "sourceTransactionId")
  WHERE status <> 'REVERSED';

CREATE INDEX IF NOT EXISTS idx_settlement_agent_cash_completed
  ON "Settlement"("tenantId", "agentId", "createdAt" DESC)
  INCLUDE ("payableAmountUgx", "reference")
  WHERE status = 'COMPLETED'
    AND notes LIKE 'AGENT_CASH_REMITTANCE%';

CREATE INDEX IF NOT EXISTS idx_billing_agent_pending_float_return
  ON "BillingTransaction"("tenantId", "agentId", "createdAt" DESC)
  INCLUDE ("grossAmountUgx")
  WHERE status = 'PENDING'
    AND type = 'AGENT_FLOAT_RETURN';

-- getMyAccounting() returns only the newest Agent disbursements, scoped by tenant
-- and Agent. The existing tenant/date and Agent/status indexes cannot satisfy this
-- filter + ordering together, so keep a dedicated covering read-path index for that query.
CREATE INDEX IF NOT EXISTS idx_disbursement_tenant_agent_recent
  ON "Disbursement"("tenantId", "agentId", "createdAt" DESC)
  INCLUDE ("status", "amountUgx", "destinationReference", "metadata")
  WHERE "agentId" IS NOT NULL;
