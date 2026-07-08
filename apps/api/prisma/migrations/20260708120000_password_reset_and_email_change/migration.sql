-- Password reset tokens (forgot-password flow) and email change requests
-- (user-initiated, platform-admin approved).

CREATE TABLE IF NOT EXISTS "PasswordResetToken" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "tokenHash" TEXT NOT NULL,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "usedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "PasswordResetToken_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "PasswordResetToken_tokenHash_key" ON "PasswordResetToken"("tokenHash");
CREATE INDEX IF NOT EXISTS "PasswordResetToken_userId_usedAt_idx" ON "PasswordResetToken"("userId", "usedAt");

ALTER TABLE "PasswordResetToken"
  ADD CONSTRAINT "PasswordResetToken_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'EmailChangeRequestStatus') THEN
    CREATE TYPE "EmailChangeRequestStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS "EmailChangeRequest" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "currentEmail" TEXT NOT NULL,
  "requestedEmail" TEXT NOT NULL,
  "reason" TEXT NOT NULL,
  "status" "EmailChangeRequestStatus" NOT NULL DEFAULT 'PENDING',
  "reviewedBy" TEXT,
  "reviewedAt" TIMESTAMP(3),
  "reviewNote" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "EmailChangeRequest_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "EmailChangeRequest_status_createdAt_idx" ON "EmailChangeRequest"("status", "createdAt");
CREATE INDEX IF NOT EXISTS "EmailChangeRequest_userId_idx" ON "EmailChangeRequest"("userId");

ALTER TABLE "EmailChangeRequest"
  ADD CONSTRAINT "EmailChangeRequest_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
