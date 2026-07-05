DELETE FROM radreply WHERE attribute = 'Idle-Timeout';
DELETE FROM radreply_data WHERE attribute = 'Idle-Timeout';

CREATE TABLE IF NOT EXISTS "AdminLoginOtp" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "otpHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "maxAttempts" INTEGER NOT NULL DEFAULT 5,
    "verifiedAt" TIMESTAMP(3),
    "resendAvailableAt" TIMESTAMP(3) NOT NULL,
    "requestIp" TEXT,
    "userAgent" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AdminLoginOtp_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "AdminLoginOtp_userId_verifiedAt_expiresAt_idx" ON "AdminLoginOtp"("userId", "verifiedAt", "expiresAt");
CREATE INDEX IF NOT EXISTS "AdminLoginOtp_createdAt_idx" ON "AdminLoginOtp"("createdAt");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'AdminLoginOtp_userId_fkey'
  ) THEN
    ALTER TABLE "AdminLoginOtp"
      ADD CONSTRAINT "AdminLoginOtp_userId_fkey"
      FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;
