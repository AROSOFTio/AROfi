CREATE TYPE "AccountType" AS ENUM ('WIFI_VENDOR', 'RESELLER');
CREATE TYPE "ReferralProfileStatus" AS ENUM ('ACTIVE', 'SUSPENDED', 'DISABLED');
CREATE TYPE "ReferralRelationshipStatus" AS ENUM ('PENDING', 'QUALIFIED', 'REJECTED', 'SUSPICIOUS');
CREATE TYPE "ReferralCommissionStatus" AS ENUM ('PENDING', 'APPROVED', 'AVAILABLE', 'REVERSED');
CREATE TYPE "ReferralWalletTransactionType" AS ENUM ('PENDING_COMMISSION', 'APPROVED_COMMISSION', 'AVAILABLE_COMMISSION', 'WITHDRAWAL_REQUEST', 'WITHDRAWAL_PROCESSING', 'PAID_WITHDRAWAL', 'FAILED_WITHDRAWAL', 'REJECTED_WITHDRAWAL', 'REVERSED_COMMISSION', 'ADMIN_ADJUSTMENT');
CREATE TYPE "ReferralWalletTransactionStatus" AS ENUM ('PENDING', 'APPROVED', 'AVAILABLE', 'PROCESSING', 'PAID', 'FAILED', 'REJECTED', 'REVERSED', 'CANCELLED');

ALTER TABLE "PlatformSetting"
  ADD COLUMN IF NOT EXISTS "referralProgramEnabled" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS "resellerRegistrationEnabled" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS "referralCommissionBps" INTEGER NOT NULL DEFAULT 3000,
  ADD COLUMN IF NOT EXISTS "referralCommissionBasis" TEXT NOT NULL DEFAULT 'PRO_SUBSCRIPTION_PAYMENT',
  ADD COLUMN IF NOT EXISTS "referralQualifyingEvent" TEXT NOT NULL DEFAULT 'PRO_SUBSCRIPTION_PAYMENT_CONFIRMED',
  ADD COLUMN IF NOT EXISTS "referralHoldingPeriodDays" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "referralMinimumWithdrawalUgx" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "referralMaximumWithdrawalUgx" INTEGER,
  ADD COLUMN IF NOT EXISTS "referralWithdrawalFeeBps" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "referralWithdrawalFlatFeeUgx" INTEGER NOT NULL DEFAULT 0;

ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "accountType" "AccountType" NOT NULL DEFAULT 'WIFI_VENDOR';

CREATE TABLE IF NOT EXISTS "ReferralProfile" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "tenantId" TEXT,
  "code" TEXT NOT NULL,
  "status" "ReferralProfileStatus" NOT NULL DEFAULT 'ACTIVE',
  "referralPrivilegesSuspendedAt" TIMESTAMP(3),
  "suspensionReason" TEXT,
  "availableBalanceUgx" INTEGER NOT NULL DEFAULT 0,
  "pendingBalanceUgx" INTEGER NOT NULL DEFAULT 0,
  "withdrawnAmountUgx" INTEGER NOT NULL DEFAULT 0,
  "registeredPayoutPhone" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ReferralProfile_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ReferralProfile_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE IF NOT EXISTS "ReferralRelationship" (
  "id" TEXT NOT NULL,
  "referrerProfileId" TEXT NOT NULL,
  "referredTenantId" TEXT,
  "referredUserId" TEXT,
  "referralCode" TEXT NOT NULL,
  "status" "ReferralRelationshipStatus" NOT NULL DEFAULT 'PENDING',
  "source" TEXT,
  "ipAddress" TEXT,
  "userAgent" TEXT,
  "suspiciousReason" TEXT,
  "qualifiedAt" TIMESTAMP(3),
  "rejectedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ReferralRelationship_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ReferralRelationship_referrerProfileId_fkey" FOREIGN KEY ("referrerProfileId") REFERENCES "ReferralProfile"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "ReferralRelationship_referredTenantId_fkey" FOREIGN KEY ("referredTenantId") REFERENCES "Tenant"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "ReferralRelationship_referredUserId_fkey" FOREIGN KEY ("referredUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE TABLE IF NOT EXISTS "ReferralCommission" (
  "id" TEXT NOT NULL,
  "referrerProfileId" TEXT NOT NULL,
  "relationshipId" TEXT NOT NULL,
  "subscriptionPaymentId" TEXT,
  "status" "ReferralCommissionStatus" NOT NULL DEFAULT 'PENDING',
  "basisType" TEXT NOT NULL,
  "basisAmountUgx" INTEGER NOT NULL,
  "rateBps" INTEGER NOT NULL,
  "amountUgx" INTEGER NOT NULL,
  "holdUntil" TIMESTAMP(3),
  "approvedAt" TIMESTAMP(3),
  "availableAt" TIMESTAMP(3),
  "reversedAt" TIMESTAMP(3),
  "reversalReason" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ReferralCommission_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ReferralCommission_referrerProfileId_fkey" FOREIGN KEY ("referrerProfileId") REFERENCES "ReferralProfile"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "ReferralCommission_relationshipId_fkey" FOREIGN KEY ("relationshipId") REFERENCES "ReferralRelationship"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE TABLE IF NOT EXISTS "ReferralWalletTransaction" (
  "id" TEXT NOT NULL,
  "referrerProfileId" TEXT NOT NULL,
  "relationshipId" TEXT,
  "commissionId" TEXT,
  "type" "ReferralWalletTransactionType" NOT NULL,
  "status" "ReferralWalletTransactionStatus" NOT NULL,
  "amountUgx" INTEGER NOT NULL,
  "previousBalanceUgx" INTEGER NOT NULL,
  "newBalanceUgx" INTEGER NOT NULL,
  "description" TEXT NOT NULL,
  "adminUserId" TEXT,
  "metadata" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ReferralWalletTransaction_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ReferralWalletTransaction_referrerProfileId_fkey" FOREIGN KEY ("referrerProfileId") REFERENCES "ReferralProfile"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "ReferralWalletTransaction_relationshipId_fkey" FOREIGN KEY ("relationshipId") REFERENCES "ReferralRelationship"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "ReferralWalletTransaction_commissionId_fkey" FOREIGN KEY ("commissionId") REFERENCES "ReferralCommission"("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS "ReferralProfile_userId_key" ON "ReferralProfile"("userId");
CREATE UNIQUE INDEX IF NOT EXISTS "ReferralProfile_code_key" ON "ReferralProfile"("code");
CREATE INDEX IF NOT EXISTS "ReferralProfile_tenantId_idx" ON "ReferralProfile"("tenantId");
CREATE INDEX IF NOT EXISTS "ReferralProfile_status_createdAt_idx" ON "ReferralProfile"("status", "createdAt");
CREATE UNIQUE INDEX IF NOT EXISTS "ReferralRelationship_referredTenantId_key" ON "ReferralRelationship"("referredTenantId");
CREATE UNIQUE INDEX IF NOT EXISTS "ReferralRelationship_referredUserId_key" ON "ReferralRelationship"("referredUserId");
CREATE INDEX IF NOT EXISTS "ReferralRelationship_referrerProfileId_status_idx" ON "ReferralRelationship"("referrerProfileId", "status");
CREATE INDEX IF NOT EXISTS "ReferralRelationship_referralCode_createdAt_idx" ON "ReferralRelationship"("referralCode", "createdAt");
CREATE UNIQUE INDEX IF NOT EXISTS "ReferralCommission_subscriptionPaymentId_key" ON "ReferralCommission"("subscriptionPaymentId");
CREATE INDEX IF NOT EXISTS "ReferralCommission_referrerProfileId_status_idx" ON "ReferralCommission"("referrerProfileId", "status");
CREATE INDEX IF NOT EXISTS "ReferralCommission_relationshipId_status_idx" ON "ReferralCommission"("relationshipId", "status");
CREATE INDEX IF NOT EXISTS "ReferralWalletTransaction_referrerProfileId_createdAt_idx" ON "ReferralWalletTransaction"("referrerProfileId", "createdAt");
CREATE INDEX IF NOT EXISTS "ReferralWalletTransaction_type_status_createdAt_idx" ON "ReferralWalletTransaction"("type", "status", "createdAt");
