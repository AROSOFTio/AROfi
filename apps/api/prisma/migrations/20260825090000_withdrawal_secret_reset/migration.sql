CREATE TABLE IF NOT EXISTS "WithdrawalSecretResetToken" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "tokenHash" TEXT NOT NULL,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "usedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "WithdrawalSecretResetToken_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "WithdrawalSecretResetToken_tokenHash_key" ON "WithdrawalSecretResetToken"("tokenHash");
CREATE INDEX IF NOT EXISTS "WithdrawalSecretResetToken_tenantId_usedAt_idx" ON "WithdrawalSecretResetToken"("tenantId", "usedAt");
CREATE INDEX IF NOT EXISTS "WithdrawalSecretResetToken_userId_usedAt_idx" ON "WithdrawalSecretResetToken"("userId", "usedAt");

ALTER TABLE "WithdrawalSecretResetToken"
  ADD CONSTRAINT "WithdrawalSecretResetToken_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "WithdrawalSecretResetToken"
  ADD CONSTRAINT "WithdrawalSecretResetToken_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
