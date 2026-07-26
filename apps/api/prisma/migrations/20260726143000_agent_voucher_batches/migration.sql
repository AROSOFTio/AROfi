ALTER TABLE "VoucherBatch" ADD COLUMN "agentId" TEXT;

ALTER TABLE "VoucherBatch"
  ADD CONSTRAINT "VoucherBatch_agentId_fkey"
  FOREIGN KEY ("agentId") REFERENCES "Agent"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "VoucherBatch_agentId_createdAt_idx" ON "VoucherBatch"("agentId", "createdAt");
