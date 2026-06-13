-- radreply: missing index — every auth does a rate-limit lookup here
CREATE INDEX IF NOT EXISTS idx_radreply_username ON radreply(username);

-- radacct: accounting writes and reads are heavy
CREATE INDEX IF NOT EXISTS idx_radacct_username ON radacct(username);
CREATE INDEX IF NOT EXISTS idx_radacct_nasipaddress ON radacct(nasipaddress);
CREATE INDEX IF NOT EXISTS idx_radacct_acctstoptime ON radacct(acctstoptime);

-- PackageActivation: core lookup for every portal context load and reconnect
CREATE INDEX IF NOT EXISTS idx_pa_tenant_status_ends 
  ON "PackageActivation"("tenantId", status, "endsAt");

CREATE INDEX IF NOT EXISTS idx_pa_mac_status_ends 
  ON "PackageActivation"("boundMacAddress", status, "endsAt") 
  WHERE "boundMacAddress" IS NOT NULL;

-- Payment: status polling happens every 5 seconds per active payment
CREATE INDEX IF NOT EXISTS idx_payment_tenant_status_created 
  ON "Payment"("tenantId", status, "createdAt");
