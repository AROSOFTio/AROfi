-- CreateEnum
CREATE TYPE "PackageStatus" AS ENUM ('DRAFT', 'ACTIVE', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "PricingStrategy" AS ENUM ('FIXED');

-- CreateEnum
CREATE TYPE "VoucherBatchStatus" AS ENUM ('DRAFT', 'ACTIVE', 'EXHAUSTED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "VoucherStatus" AS ENUM ('GENERATED', 'PRINTED', 'SOLD', 'REDEEMED', 'EXPIRED', 'VOID', 'VOIDED');

-- CreateEnum
CREATE TYPE "BillingChannel" AS ENUM ('MOBILE_MONEY', 'VOUCHER', 'WALLET_ADJUSTMENT', 'FLOAT_TRANSFER', 'COMMISSION', 'DISBURSEMENT', 'SYSTEM');

-- CreateEnum
CREATE TYPE "BillingTransactionType" AS ENUM ('MOBILE_MONEY_SALE', 'VOUCHER_SALE', 'VOUCHER_REDEMPTION', 'WALLET_ADJUSTMENT', 'AGENT_FLOAT_TOPUP', 'AGENT_FLOAT_RETURN', 'AGENT_COMMISSION', 'AGENT_DISBURSEMENT');

-- CreateEnum
CREATE TYPE "BillingTransactionStatus" AS ENUM ('PENDING', 'COMPLETED', 'FAILED', 'REVERSED');

-- CreateEnum
CREATE TYPE "PaymentProvider" AS ENUM ('MTN_MOMO_DIRECT', 'AIRTEL_MONEY_DIRECT', 'AGGREGATOR');

-- CreateEnum
CREATE TYPE "PaymentMethod" AS ENUM ('MOBILE_MONEY', 'CARD');

-- CreateEnum
CREATE TYPE "PaymentNetwork" AS ENUM ('MTN', 'AIRTEL', 'UNKNOWN');

-- CreateEnum
CREATE TYPE "PaymentStatus" AS ENUM ('INITIATED', 'PENDING', 'COMPLETED', 'FAILED', 'INDETERMINATE', 'CANCELLED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "PaymentEventType" AS ENUM ('REQUESTED', 'STATUS_CHECK', 'WEBHOOK_RECEIVED', 'WEBHOOK_PROCESSED', 'WEBHOOK_REJECTED', 'STATE_TRANSITION', 'ACTIVATION_POSTED', 'ACTIVATION_FAILED');

-- CreateEnum
CREATE TYPE "RouterVendor" AS ENUM ('MIKROTIK');

-- CreateEnum
CREATE TYPE "RouterConnectionMode" AS ENUM ('ROUTEROS_API', 'ROUTEROS_API_SSL');

-- CreateEnum
CREATE TYPE "RouterStatus" AS ENUM ('PENDING', 'HEALTHY', 'DEGRADED', 'OFFLINE');

-- CreateEnum
CREATE TYPE "RadiusClientStatus" AS ENUM ('ACTIVE', 'DISABLED');

-- CreateEnum
CREATE TYPE "RadiusEventType" AS ENUM ('ACCESS_REQUEST', 'ACCESS_ACCEPT', 'ACCESS_REJECT', 'ACCOUNTING_START', 'ACCOUNTING_INTERIM', 'ACCOUNTING_STOP', 'COA_REQUEST', 'DISCONNECT_REQUEST');

-- CreateEnum
CREATE TYPE "SessionStatus" AS ENUM ('ACTIVE', 'CLOSED', 'STALE');

-- CreateEnum
CREATE TYPE "WalletOwnerType" AS ENUM ('TENANT', 'AGENT');

-- CreateEnum
CREATE TYPE "LedgerDirection" AS ENUM ('DEBIT', 'CREDIT');

-- CreateEnum
CREATE TYPE "LedgerTransactionType" AS ENUM ('SALE', 'WALLET_ADJUSTMENT', 'REDEMPTION', 'FLOAT_TRANSFER', 'COMMISSION', 'DISBURSEMENT');

-- CreateEnum
CREATE TYPE "AgentType" AS ENUM ('FIELD_AGENT', 'RESELLER');

-- CreateEnum
CREATE TYPE "AgentStatus" AS ENUM ('ACTIVE', 'SUSPENDED', 'DISABLED');

-- CreateEnum
CREATE TYPE "CommissionStatus" AS ENUM ('ACCRUED', 'SETTLED', 'REVERSED');

-- CreateEnum
CREATE TYPE "SettlementStatus" AS ENUM ('DRAFT', 'READY', 'PROCESSING', 'COMPLETED', 'FAILED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "DisbursementMethod" AS ENUM ('MOBILE_MONEY', 'BANK_TRANSFER', 'CASH', 'MANUAL');

-- CreateEnum
CREATE TYPE "DisbursementStatus" AS ENUM ('PENDING', 'PROCESSING', 'COMPLETED', 'FAILED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "PackageActivationSource" AS ENUM ('MOBILE_MONEY', 'VOUCHER');

-- CreateEnum
CREATE TYPE "PackageActivationStatus" AS ENUM ('PENDING', 'ACTIVE', 'EXPIRED', 'FAILED', 'REVOKED', 'SUSPENDED');

-- CreateEnum
CREATE TYPE "RouterVerificationStatus" AS ENUM ('SCRIPT_GENERATED', 'OPERATOR_APPLIED', 'VERIFIED', 'FAILED');

-- CreateEnum
CREATE TYPE "RouterOnboardingStatus" AS ENUM ('NOT_STARTED', 'SCRIPT_GENERATED', 'WAITING_FOR_ROUTER', 'RADIUS_SEEN', 'ACCOUNTING_SEEN', 'VERIFIED_ONLINE', 'CONFIG_ERROR');

-- CreateEnum
CREATE TYPE "RouterScriptMode" AS ENUM ('SAFE_EXISTING_ROUTER', 'FRESH_FULL_HOTSPOT');

-- CreateEnum
CREATE TYPE "RadiusCredentialStatus" AS ENUM ('ACTIVE', 'DISABLED', 'EXPIRED', 'REVOKED');

-- CreateEnum
CREATE TYPE "DeviceBindingResetStatus" AS ENUM ('COMPLETED', 'REJECTED');

-- CreateEnum
CREATE TYPE "ReconnectionStatus" AS ENUM ('ALLOWED', 'DENIED', 'STALE_SESSION_CLEARED', 'LOGIN_PAYLOAD_ISSUED');

-- CreateEnum
CREATE TYPE "SuspiciousAccessAttemptType" AS ENUM ('SECOND_DEVICE', 'CONCURRENT_SESSION', 'MISSING_MAC');

-- CreateEnum
CREATE TYPE "AuditSeverity" AS ENUM ('INFO', 'WARNING', 'ERROR', 'CRITICAL');

-- CreateEnum
CREATE TYPE "FeatureLimitCategory" AS ENUM ('CATALOG', 'NETWORK', 'SALES', 'SUPPORT', 'OPERATIONS');

-- CreateEnum
CREATE TYPE "SupportTicketStatus" AS ENUM ('OPEN', 'IN_PROGRESS', 'PENDING_CUSTOMER', 'RESOLVED', 'CLOSED');

-- CreateEnum
CREATE TYPE "SupportTicketPriority" AS ENUM ('LOW', 'NORMAL', 'HIGH', 'CRITICAL');

-- CreateEnum
CREATE TYPE "SupportTicketChannel" AS ENUM ('PORTAL', 'EMAIL', 'PHONE', 'INTERNAL');

-- CreateTable
CREATE TABLE "Tenant" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "domain" TEXT,
    "logoUrl" TEXT,
    "brandColor" TEXT,
    "supportPhone" TEXT,
    "supportEmail" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Tenant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Role" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "permissions" TEXT[],

    CONSTRAINT "Role_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "password" TEXT NOT NULL,
    "firstName" TEXT,
    "lastName" TEXT,
    "roleId" TEXT NOT NULL,
    "tenantId" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Agent" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "phoneNumber" TEXT NOT NULL,
    "email" TEXT,
    "type" "AgentType" NOT NULL DEFAULT 'FIELD_AGENT',
    "status" "AgentStatus" NOT NULL DEFAULT 'ACTIVE',
    "territory" TEXT,
    "commissionRateBps" INTEGER NOT NULL DEFAULT 500,
    "floatLimitUgx" INTEGER NOT NULL DEFAULT 0,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Agent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Hotspot" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "nasIpAddress" TEXT,
    "secret" TEXT,
    "tenantId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Hotspot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RouterGroup" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "description" TEXT,
    "region" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RouterGroup_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Router" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "groupId" TEXT,
    "hotspotId" TEXT,
    "name" TEXT NOT NULL,
    "identity" TEXT,
    "vendor" "RouterVendor" NOT NULL DEFAULT 'MIKROTIK',
    "host" TEXT NOT NULL,
    "apiPort" INTEGER NOT NULL DEFAULT 8728,
    "connectionMode" "RouterConnectionMode" NOT NULL DEFAULT 'ROUTEROS_API',
    "username" TEXT NOT NULL,
    "passwordCiphertext" TEXT NOT NULL,
    "sharedSecretCiphertext" TEXT NOT NULL,
    "siteLabel" TEXT,
    "model" TEXT,
    "serialNumber" TEXT,
    "routerOsVersion" TEXT,
    "status" "RouterStatus" NOT NULL DEFAULT 'PENDING',
    "healthMessage" TEXT,
    "lastSeenAt" TIMESTAMP(3),
    "lastHealthCheckAt" TIMESTAMP(3),
    "lastLatencyMs" INTEGER,
    "activeSessionCount" INTEGER NOT NULL DEFAULT 0,
    "lastProvisionedAt" TIMESTAMP(3),
    "verificationStatus" "RouterVerificationStatus" NOT NULL DEFAULT 'SCRIPT_GENERATED',
    "onboardingStatus" "RouterOnboardingStatus" NOT NULL DEFAULT 'NOT_STARTED',
    "lastScriptMode" "RouterScriptMode" NOT NULL DEFAULT 'SAFE_EXISTING_ROUTER',
    "registrationKey" TEXT NOT NULL,
    "verifiedAt" TIMESTAMP(3),
    "scriptGeneratedAt" TIMESTAMP(3),
    "lastRadiusSignalAt" TIMESTAMP(3),
    "lastAccountingSignalAt" TIMESTAMP(3),
    "lastAuthSignalAt" TIMESTAMP(3),
    "radiusNasIpAddress" TEXT,
    "hotspotServerName" TEXT,
    "portalWalledGardenHosts" TEXT[],
    "ttlAntiTetheringEnabled" BOOLEAN NOT NULL DEFAULT false,
    "tags" TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Router_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RouterHealthCheck" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "routerId" TEXT NOT NULL,
    "status" "RouterStatus" NOT NULL,
    "latencyMs" INTEGER,
    "message" TEXT,
    "cpuUsagePercent" INTEGER,
    "memoryUsagePercent" INTEGER,
    "activeUsers" INTEGER,
    "rawPayload" JSONB,
    "checkedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RouterHealthCheck_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RadiusClient" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "routerId" TEXT NOT NULL,
    "shortName" TEXT NOT NULL,
    "ipAddress" TEXT NOT NULL,
    "secretCiphertext" TEXT NOT NULL,
    "status" "RadiusClientStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RadiusClient_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RadiusEvent" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "routerId" TEXT,
    "hotspotId" TEXT,
    "sessionId" TEXT,
    "eventType" "RadiusEventType" NOT NULL,
    "username" TEXT,
    "customerReference" TEXT,
    "phoneNumber" TEXT,
    "macAddress" TEXT,
    "ipAddress" TEXT,
    "nasIpAddress" TEXT,
    "authMethod" TEXT,
    "responseCode" TEXT,
    "message" TEXT,
    "payload" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RadiusEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NetworkSession" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "routerId" TEXT,
    "hotspotId" TEXT,
    "activationId" TEXT,
    "voucherRedemptionId" TEXT,
    "radiusSessionId" TEXT NOT NULL,
    "status" "SessionStatus" NOT NULL DEFAULT 'ACTIVE',
    "username" TEXT NOT NULL,
    "customerReference" TEXT,
    "phoneNumber" TEXT,
    "macAddress" TEXT,
    "ipAddress" TEXT,
    "nasIpAddress" TEXT,
    "packageName" TEXT,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endedAt" TIMESTAMP(3),
    "sessionTimeSeconds" INTEGER NOT NULL DEFAULT 0,
    "inputOctets" BIGINT NOT NULL DEFAULT 0,
    "outputOctets" BIGINT NOT NULL DEFAULT 0,
    "lastAccountingAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "NetworkSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Package" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "description" TEXT,
    "durationMinutes" INTEGER NOT NULL,
    "dataLimitMb" INTEGER,
    "deviceLimit" INTEGER,
    "downloadSpeedKbps" INTEGER,
    "uploadSpeedKbps" INTEGER,
    "isFeatured" BOOLEAN NOT NULL DEFAULT false,
    "status" "PackageStatus" NOT NULL DEFAULT 'DRAFT',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Package_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PackagePrice" (
    "id" TEXT NOT NULL,
    "packageId" TEXT NOT NULL,
    "amountUgx" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'UGX',
    "strategy" "PricingStrategy" NOT NULL DEFAULT 'FIXED',
    "isDefault" BOOLEAN NOT NULL DEFAULT true,
    "startsAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endsAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PackagePrice_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VoucherTemplate" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "packageId" TEXT,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "prefix" TEXT NOT NULL,
    "defaultQuantity" INTEGER NOT NULL DEFAULT 100,
    "faceValueUgx" INTEGER,
    "expiresAfterDays" INTEGER,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "VoucherTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VoucherBatch" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "packageId" TEXT NOT NULL,
    "templateId" TEXT,
    "generatedByUserId" TEXT,
    "batchNumber" TEXT NOT NULL,
    "prefix" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "faceValueUgx" INTEGER NOT NULL,
    "expiresAt" TIMESTAMP(3),
    "status" "VoucherBatchStatus" NOT NULL DEFAULT 'ACTIVE',
    "notes" TEXT,
    "lastPrintedAt" TIMESTAMP(3),
    "exportedAt" TIMESTAMP(3),
    "printCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "VoucherBatch_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Voucher" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "batchId" TEXT NOT NULL,
    "packageId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "serialNumber" TEXT NOT NULL,
    "faceValueUgx" INTEGER NOT NULL,
    "status" "VoucherStatus" NOT NULL DEFAULT 'GENERATED',
    "soldAt" TIMESTAMP(3),
    "redeemedAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3),
    "soldToReference" TEXT,
    "customerReference" TEXT,
    "printCount" INTEGER NOT NULL DEFAULT 0,
    "lastPrintedAt" TIMESTAMP(3),
    "exportedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Voucher_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Wallet" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "ownerType" "WalletOwnerType" NOT NULL DEFAULT 'TENANT',
    "ownerReference" TEXT NOT NULL,
    "agentId" TEXT,
    "currency" TEXT NOT NULL DEFAULT 'UGX',
    "balanceUgx" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Wallet_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BillingTransaction" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "walletId" TEXT,
    "agentId" TEXT,
    "packageId" TEXT,
    "voucherId" TEXT,
    "ledgerTransactionId" TEXT,
    "channel" "BillingChannel" NOT NULL,
    "type" "BillingTransactionType" NOT NULL,
    "status" "BillingTransactionStatus" NOT NULL DEFAULT 'COMPLETED',
    "grossAmountUgx" INTEGER NOT NULL,
    "feeAmountUgx" INTEGER NOT NULL DEFAULT 0,
    "netAmountUgx" INTEGER NOT NULL DEFAULT 0,
    "customerReference" TEXT,
    "externalReference" TEXT,
    "paymentProvider" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BillingTransaction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LedgerTransaction" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT,
    "walletId" TEXT,
    "reference" TEXT NOT NULL,
    "type" "LedgerTransactionType" NOT NULL,
    "channel" "BillingChannel" NOT NULL,
    "description" TEXT NOT NULL,
    "grossAmountUgx" INTEGER NOT NULL DEFAULT 0,
    "feeAmountUgx" INTEGER NOT NULL DEFAULT 0,
    "netAmountUgx" INTEGER NOT NULL DEFAULT 0,
    "sourceType" TEXT,
    "sourceId" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LedgerTransaction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LedgerEntry" (
    "id" TEXT NOT NULL,
    "ledgerTransactionId" TEXT NOT NULL,
    "tenantId" TEXT,
    "walletId" TEXT,
    "accountCode" TEXT NOT NULL,
    "direction" "LedgerDirection" NOT NULL,
    "amountUgx" INTEGER NOT NULL,
    "memo" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LedgerEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VoucherRedemption" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "voucherId" TEXT NOT NULL,
    "packageId" TEXT NOT NULL,
    "redeemedByUserId" TEXT,
    "hotspotId" TEXT,
    "customerReference" TEXT,
    "sessionReference" TEXT,
    "boundMacAddress" TEXT,
    "firstSeenIp" TEXT,
    "firstSeenAt" TIMESTAMP(3),
    "userAgent" TEXT,
    "routerId" TEXT,
    "hotspotServerName" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "VoucherRedemption_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Payment" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "packageId" TEXT NOT NULL,
    "billingTransactionId" TEXT,
    "provider" "PaymentProvider" NOT NULL DEFAULT 'MTN_MOMO_DIRECT',
    "method" "PaymentMethod" NOT NULL DEFAULT 'MOBILE_MONEY',
    "network" "PaymentNetwork" NOT NULL DEFAULT 'UNKNOWN',
    "status" "PaymentStatus" NOT NULL DEFAULT 'INITIATED',
    "amountUgx" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'UGX',
    "phoneNumber" TEXT NOT NULL,
    "customerReference" TEXT,
    "externalReference" TEXT NOT NULL,
    "providerReference" TEXT,
    "idempotencyKey" TEXT NOT NULL,
    "statusToken" TEXT,
    "providerStatus" TEXT,
    "statusMessage" TEXT,
    "requestPayload" JSONB,
    "responsePayload" JSONB,
    "metadata" JSONB,
    "initiatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),
    "failedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Payment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PaymentWebhook" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT,
    "paymentId" TEXT,
    "provider" "PaymentProvider" NOT NULL DEFAULT 'MTN_MOMO_DIRECT',
    "eventType" "PaymentEventType" NOT NULL,
    "externalReference" TEXT,
    "providerReference" TEXT,
    "verificationStatus" TEXT,
    "headers" JSONB NOT NULL,
    "payload" JSONB NOT NULL,
    "notes" TEXT,
    "isProcessed" BOOLEAN NOT NULL DEFAULT false,
    "processedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PaymentWebhook_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PackageActivation" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "packageId" TEXT NOT NULL,
    "paymentId" TEXT,
    "voucherRedemptionId" TEXT,
    "hotspotId" TEXT,
    "source" "PackageActivationSource" NOT NULL,
    "status" "PackageActivationStatus" NOT NULL DEFAULT 'ACTIVE',
    "customerReference" TEXT,
    "accessPhoneNumber" TEXT,
    "durationMinutes" INTEGER NOT NULL,
    "dataLimitMb" INTEGER,
    "deviceLimit" INTEGER,
    "downloadSpeedKbps" INTEGER,
    "uploadSpeedKbps" INTEGER,
    "radiusUsername" TEXT,
    "radiusPassword" TEXT,
    "boundMacAddress" TEXT,
    "firstSeenIp" TEXT,
    "firstSeenAt" TIMESTAMP(3),
    "routerId" TEXT,
    "hotspotServerName" TEXT,
    "lastReconnectAt" TIMESTAMP(3),
    "deviceResetCount" INTEGER NOT NULL DEFAULT 0,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endsAt" TIMESTAMP(3) NOT NULL,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PackageActivation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RadiusCredential" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "activationId" TEXT NOT NULL,
    "username" TEXT NOT NULL,
    "password" TEXT NOT NULL,
    "status" "RadiusCredentialStatus" NOT NULL DEFAULT 'ACTIVE',
    "boundMacAddress" TEXT,
    "routerId" TEXT,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RadiusCredential_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DeviceBindingReset" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "activationId" TEXT NOT NULL,
    "adminUserId" TEXT,
    "oldMacAddress" TEXT,
    "newMacAddress" TEXT,
    "reason" TEXT NOT NULL,
    "status" "DeviceBindingResetStatus" NOT NULL DEFAULT 'COMPLETED',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DeviceBindingReset_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReconnectionLog" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "activationId" TEXT,
    "routerId" TEXT,
    "macAddress" TEXT,
    "ipAddress" TEXT,
    "status" "ReconnectionStatus" NOT NULL,
    "message" TEXT,
    "payload" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ReconnectionLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SuspiciousAccessAttempt" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "activationId" TEXT,
    "type" "SuspiciousAccessAttemptType" NOT NULL,
    "username" TEXT,
    "expectedMacAddress" TEXT,
    "observedMacAddress" TEXT,
    "routerId" TEXT,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "message" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SuspiciousAccessAttempt_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VoucherPrintLog" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "batchId" TEXT NOT NULL,
    "format" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "actorUserId" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "VoucherPrintLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TenantSetting" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "redeemableWhenGenerated" BOOLEAN NOT NULL DEFAULT true,
    "allowDeviceReset" BOOLEAN NOT NULL DEFAULT false,
    "maxResetsPerActivation" INTEGER NOT NULL DEFAULT 0,
    "supportText" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TenantSetting_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "radcheck" (
    "id" SERIAL NOT NULL,
    "username" VARCHAR(64) NOT NULL,
    "attribute" VARCHAR(64) NOT NULL,
    "op" VARCHAR(2) NOT NULL DEFAULT ':=',
    "value" VARCHAR(253) NOT NULL,

    CONSTRAINT "radcheck_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "radreply" (
    "id" SERIAL NOT NULL,
    "username" VARCHAR(64) NOT NULL,
    "attribute" VARCHAR(64) NOT NULL,
    "op" VARCHAR(2) NOT NULL DEFAULT '=',
    "value" VARCHAR(253) NOT NULL,

    CONSTRAINT "radreply_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "radacct" (
    "radacctid" BIGSERIAL NOT NULL,
    "acctsessionid" VARCHAR(64) NOT NULL,
    "acctuniqueid" VARCHAR(32) NOT NULL,
    "username" VARCHAR(64),
    "groupname" VARCHAR(64),
    "realm" VARCHAR(64),
    "nasipaddress" INET,
    "nasportid" VARCHAR(32),
    "nasporttype" VARCHAR(32),
    "acctstarttime" TIMESTAMP(3),
    "acctupdatetime" TIMESTAMP(3),
    "acctstoptime" TIMESTAMP(3),
    "acctinterval" INTEGER,
    "acctsessiontime" INTEGER,
    "acctauthentic" VARCHAR(32),
    "connectinfo_start" VARCHAR(128),
    "connectinfo_stop" VARCHAR(128),
    "acctinputoctets" BIGINT,
    "acctoutputoctets" BIGINT,
    "calledstationid" VARCHAR(50),
    "callingstationid" VARCHAR(50),
    "acctterminatecause" VARCHAR(32),
    "servicetype" VARCHAR(32),
    "framedprotocol" VARCHAR(32),
    "framedipaddress" INET,
    "framedipv6address" INET,
    "framedipv6prefix" INET,
    "framedinterfaceid" VARCHAR(44),
    "delegatedipv6prefix" INET,
    "class" VARCHAR(64),

    CONSTRAINT "radacct_pkey" PRIMARY KEY ("radacctid")
);

-- CreateTable
CREATE TABLE "radpostauth" (
    "id" SERIAL NOT NULL,
    "username" VARCHAR(64) NOT NULL,
    "pass" VARCHAR(64),
    "reply" VARCHAR(32),
    "authdate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "class" VARCHAR(64),

    CONSTRAINT "radpostauth_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AgentCommission" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "agentId" TEXT NOT NULL,
    "walletId" TEXT,
    "sourceTransactionId" TEXT NOT NULL,
    "payoutTransactionId" TEXT,
    "settlementId" TEXT,
    "status" "CommissionStatus" NOT NULL DEFAULT 'ACCRUED',
    "basisAmountUgx" INTEGER NOT NULL,
    "rateBps" INTEGER NOT NULL,
    "amountUgx" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AgentCommission_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Settlement" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "agentId" TEXT NOT NULL,
    "walletId" TEXT NOT NULL,
    "reference" TEXT NOT NULL,
    "status" "SettlementStatus" NOT NULL DEFAULT 'DRAFT',
    "periodStart" TIMESTAMP(3) NOT NULL,
    "periodEnd" TIMESTAMP(3) NOT NULL,
    "openingFloatUgx" INTEGER NOT NULL DEFAULT 0,
    "closingFloatUgx" INTEGER NOT NULL DEFAULT 0,
    "grossSalesUgx" INTEGER NOT NULL DEFAULT 0,
    "commissionsUgx" INTEGER NOT NULL DEFAULT 0,
    "payableAmountUgx" INTEGER NOT NULL DEFAULT 0,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Settlement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Disbursement" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "agentId" TEXT NOT NULL,
    "settlementId" TEXT,
    "walletId" TEXT NOT NULL,
    "billingTransactionId" TEXT,
    "reference" TEXT NOT NULL,
    "method" "DisbursementMethod" NOT NULL DEFAULT 'MOBILE_MONEY',
    "status" "DisbursementStatus" NOT NULL DEFAULT 'PENDING',
    "amountUgx" INTEGER NOT NULL,
    "destinationReference" TEXT,
    "providerReference" TEXT,
    "notes" TEXT,
    "metadata" JSONB,
    "initiatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),
    "failedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Disbursement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FeatureLimit" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "category" "FeatureLimitCategory" NOT NULL,
    "description" TEXT,
    "unit" TEXT,
    "isEnabled" BOOLEAN NOT NULL DEFAULT true,
    "limitValue" INTEGER,
    "warningThresholdPct" INTEGER NOT NULL DEFAULT 80,
    "hardLimit" BOOLEAN NOT NULL DEFAULT false,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FeatureLimit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SupportTicket" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "reference" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "priority" "SupportTicketPriority" NOT NULL DEFAULT 'NORMAL',
    "status" "SupportTicketStatus" NOT NULL DEFAULT 'OPEN',
    "channel" "SupportTicketChannel" NOT NULL DEFAULT 'PORTAL',
    "customerReference" TEXT,
    "phoneNumber" TEXT,
    "email" TEXT,
    "openedBy" TEXT,
    "assignedTo" TEXT,
    "latestResponseAt" TIMESTAMP(3),
    "resolvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SupportTicket_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SupportTicketMessage" (
    "id" TEXT NOT NULL,
    "ticketId" TEXT NOT NULL,
    "authorName" TEXT NOT NULL,
    "authorRole" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "isInternal" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SupportTicketMessage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT,
    "userId" TEXT,
    "actorName" TEXT,
    "actorEmail" TEXT,
    "action" TEXT NOT NULL,
    "entity" TEXT NOT NULL,
    "entityId" TEXT,
    "severity" "AuditSeverity" NOT NULL DEFAULT 'INFO',
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "details" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Tenant_domain_key" ON "Tenant"("domain");

-- CreateIndex
CREATE UNIQUE INDEX "Role_name_key" ON "Role"("name");

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE INDEX "Agent_tenantId_status_idx" ON "Agent"("tenantId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "Agent_tenantId_code_key" ON "Agent"("tenantId", "code");

-- CreateIndex
CREATE UNIQUE INDEX "Agent_tenantId_phoneNumber_key" ON "Agent"("tenantId", "phoneNumber");

-- CreateIndex
CREATE INDEX "RouterGroup_tenantId_name_idx" ON "RouterGroup"("tenantId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "RouterGroup_tenantId_code_key" ON "RouterGroup"("tenantId", "code");

-- CreateIndex
CREATE UNIQUE INDEX "Router_registrationKey_key" ON "Router"("registrationKey");

-- CreateIndex
CREATE INDEX "Router_tenantId_status_idx" ON "Router"("tenantId", "status");

-- CreateIndex
CREATE INDEX "Router_groupId_idx" ON "Router"("groupId");

-- CreateIndex
CREATE UNIQUE INDEX "Router_tenantId_host_key" ON "Router"("tenantId", "host");

-- CreateIndex
CREATE INDEX "RouterHealthCheck_tenantId_checkedAt_idx" ON "RouterHealthCheck"("tenantId", "checkedAt");

-- CreateIndex
CREATE INDEX "RouterHealthCheck_routerId_checkedAt_idx" ON "RouterHealthCheck"("routerId", "checkedAt");

-- CreateIndex
CREATE UNIQUE INDEX "RadiusClient_routerId_key" ON "RadiusClient"("routerId");

-- CreateIndex
CREATE INDEX "RadiusClient_tenantId_status_idx" ON "RadiusClient"("tenantId", "status");

-- CreateIndex
CREATE INDEX "RadiusEvent_tenantId_createdAt_idx" ON "RadiusEvent"("tenantId", "createdAt");

-- CreateIndex
CREATE INDEX "RadiusEvent_routerId_createdAt_idx" ON "RadiusEvent"("routerId", "createdAt");

-- CreateIndex
CREATE INDEX "RadiusEvent_sessionId_createdAt_idx" ON "RadiusEvent"("sessionId", "createdAt");

-- CreateIndex
CREATE INDEX "NetworkSession_tenantId_status_startedAt_idx" ON "NetworkSession"("tenantId", "status", "startedAt");

-- CreateIndex
CREATE INDEX "NetworkSession_routerId_status_idx" ON "NetworkSession"("routerId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "NetworkSession_tenantId_radiusSessionId_key" ON "NetworkSession"("tenantId", "radiusSessionId");

-- CreateIndex
CREATE INDEX "Package_tenantId_status_idx" ON "Package"("tenantId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "Package_tenantId_code_key" ON "Package"("tenantId", "code");

-- CreateIndex
CREATE INDEX "PackagePrice_packageId_startsAt_idx" ON "PackagePrice"("packageId", "startsAt");

-- CreateIndex
CREATE INDEX "VoucherTemplate_tenantId_isActive_idx" ON "VoucherTemplate"("tenantId", "isActive");

-- CreateIndex
CREATE UNIQUE INDEX "VoucherTemplate_tenantId_code_key" ON "VoucherTemplate"("tenantId", "code");

-- CreateIndex
CREATE UNIQUE INDEX "VoucherBatch_batchNumber_key" ON "VoucherBatch"("batchNumber");

-- CreateIndex
CREATE INDEX "VoucherBatch_tenantId_createdAt_idx" ON "VoucherBatch"("tenantId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Voucher_code_key" ON "Voucher"("code");

-- CreateIndex
CREATE UNIQUE INDEX "Voucher_serialNumber_key" ON "Voucher"("serialNumber");

-- CreateIndex
CREATE INDEX "Voucher_tenantId_status_idx" ON "Voucher"("tenantId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "Wallet_agentId_key" ON "Wallet"("agentId");

-- CreateIndex
CREATE INDEX "Wallet_agentId_idx" ON "Wallet"("agentId");

-- CreateIndex
CREATE UNIQUE INDEX "Wallet_tenantId_ownerType_ownerReference_key" ON "Wallet"("tenantId", "ownerType", "ownerReference");

-- CreateIndex
CREATE UNIQUE INDEX "BillingTransaction_ledgerTransactionId_key" ON "BillingTransaction"("ledgerTransactionId");

-- CreateIndex
CREATE UNIQUE INDEX "BillingTransaction_externalReference_key" ON "BillingTransaction"("externalReference");

-- CreateIndex
CREATE INDEX "BillingTransaction_tenantId_createdAt_idx" ON "BillingTransaction"("tenantId", "createdAt");

-- CreateIndex
CREATE INDEX "BillingTransaction_type_status_idx" ON "BillingTransaction"("type", "status");

-- CreateIndex
CREATE INDEX "BillingTransaction_agentId_createdAt_idx" ON "BillingTransaction"("agentId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "LedgerTransaction_reference_key" ON "LedgerTransaction"("reference");

-- CreateIndex
CREATE INDEX "LedgerTransaction_tenantId_createdAt_idx" ON "LedgerTransaction"("tenantId", "createdAt");

-- CreateIndex
CREATE INDEX "LedgerEntry_tenantId_createdAt_idx" ON "LedgerEntry"("tenantId", "createdAt");

-- CreateIndex
CREATE INDEX "LedgerEntry_walletId_createdAt_idx" ON "LedgerEntry"("walletId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "VoucherRedemption_voucherId_key" ON "VoucherRedemption"("voucherId");

-- CreateIndex
CREATE INDEX "VoucherRedemption_tenantId_createdAt_idx" ON "VoucherRedemption"("tenantId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Payment_billingTransactionId_key" ON "Payment"("billingTransactionId");

-- CreateIndex
CREATE UNIQUE INDEX "Payment_externalReference_key" ON "Payment"("externalReference");

-- CreateIndex
CREATE UNIQUE INDEX "Payment_providerReference_key" ON "Payment"("providerReference");

-- CreateIndex
CREATE UNIQUE INDEX "Payment_idempotencyKey_key" ON "Payment"("idempotencyKey");

-- CreateIndex
CREATE UNIQUE INDEX "Payment_statusToken_key" ON "Payment"("statusToken");

-- CreateIndex
CREATE INDEX "Payment_tenantId_createdAt_idx" ON "Payment"("tenantId", "createdAt");

-- CreateIndex
CREATE INDEX "Payment_status_createdAt_idx" ON "Payment"("status", "createdAt");

-- CreateIndex
CREATE INDEX "PaymentWebhook_paymentId_createdAt_idx" ON "PaymentWebhook"("paymentId", "createdAt");

-- CreateIndex
CREATE INDEX "PaymentWebhook_externalReference_createdAt_idx" ON "PaymentWebhook"("externalReference", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "PackageActivation_paymentId_key" ON "PackageActivation"("paymentId");

-- CreateIndex
CREATE UNIQUE INDEX "PackageActivation_voucherRedemptionId_key" ON "PackageActivation"("voucherRedemptionId");

-- CreateIndex
CREATE UNIQUE INDEX "PackageActivation_radiusUsername_key" ON "PackageActivation"("radiusUsername");

-- CreateIndex
CREATE INDEX "PackageActivation_tenantId_status_endsAt_idx" ON "PackageActivation"("tenantId", "status", "endsAt");

-- CreateIndex
CREATE INDEX "PackageActivation_accessPhoneNumber_status_idx" ON "PackageActivation"("accessPhoneNumber", "status");

-- CreateIndex
CREATE INDEX "PackageActivation_tenantId_boundMacAddress_status_idx" ON "PackageActivation"("tenantId", "boundMacAddress", "status");

-- CreateIndex
CREATE INDEX "PackageActivation_routerId_boundMacAddress_idx" ON "PackageActivation"("routerId", "boundMacAddress");

-- CreateIndex
CREATE UNIQUE INDEX "RadiusCredential_activationId_key" ON "RadiusCredential"("activationId");

-- CreateIndex
CREATE UNIQUE INDEX "RadiusCredential_username_key" ON "RadiusCredential"("username");

-- CreateIndex
CREATE INDEX "RadiusCredential_tenantId_status_expiresAt_idx" ON "RadiusCredential"("tenantId", "status", "expiresAt");

-- CreateIndex
CREATE INDEX "RadiusCredential_boundMacAddress_status_idx" ON "RadiusCredential"("boundMacAddress", "status");

-- CreateIndex
CREATE INDEX "DeviceBindingReset_tenantId_createdAt_idx" ON "DeviceBindingReset"("tenantId", "createdAt");

-- CreateIndex
CREATE INDEX "DeviceBindingReset_activationId_createdAt_idx" ON "DeviceBindingReset"("activationId", "createdAt");

-- CreateIndex
CREATE INDEX "ReconnectionLog_tenantId_createdAt_idx" ON "ReconnectionLog"("tenantId", "createdAt");

-- CreateIndex
CREATE INDEX "ReconnectionLog_activationId_createdAt_idx" ON "ReconnectionLog"("activationId", "createdAt");

-- CreateIndex
CREATE INDEX "ReconnectionLog_routerId_macAddress_idx" ON "ReconnectionLog"("routerId", "macAddress");

-- CreateIndex
CREATE INDEX "SuspiciousAccessAttempt_tenantId_createdAt_idx" ON "SuspiciousAccessAttempt"("tenantId", "createdAt");

-- CreateIndex
CREATE INDEX "SuspiciousAccessAttempt_activationId_createdAt_idx" ON "SuspiciousAccessAttempt"("activationId", "createdAt");

-- CreateIndex
CREATE INDEX "VoucherPrintLog_tenantId_createdAt_idx" ON "VoucherPrintLog"("tenantId", "createdAt");

-- CreateIndex
CREATE INDEX "VoucherPrintLog_batchId_createdAt_idx" ON "VoucherPrintLog"("batchId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "TenantSetting_tenantId_key" ON "TenantSetting"("tenantId");

-- CreateIndex
CREATE INDEX "radcheck_username_idx" ON "radcheck"("username");

-- CreateIndex
CREATE INDEX "radreply_username_idx" ON "radreply"("username");

-- CreateIndex
CREATE UNIQUE INDEX "radacct_acctuniqueid_key" ON "radacct"("acctuniqueid");

-- CreateIndex
CREATE INDEX "radacct_username_idx" ON "radacct"("username");

-- CreateIndex
CREATE INDEX "radacct_acctsessionid_idx" ON "radacct"("acctsessionid");

-- CreateIndex
CREATE INDEX "radacct_acctstoptime_idx" ON "radacct"("acctstoptime");

-- CreateIndex
CREATE INDEX "radacct_callingstationid_idx" ON "radacct"("callingstationid");

-- CreateIndex
CREATE INDEX "radpostauth_username_idx" ON "radpostauth"("username");

-- CreateIndex
CREATE INDEX "radpostauth_authdate_idx" ON "radpostauth"("authdate");

-- CreateIndex
CREATE UNIQUE INDEX "AgentCommission_sourceTransactionId_key" ON "AgentCommission"("sourceTransactionId");

-- CreateIndex
CREATE UNIQUE INDEX "AgentCommission_payoutTransactionId_key" ON "AgentCommission"("payoutTransactionId");

-- CreateIndex
CREATE INDEX "AgentCommission_tenantId_createdAt_idx" ON "AgentCommission"("tenantId", "createdAt");

-- CreateIndex
CREATE INDEX "AgentCommission_agentId_status_idx" ON "AgentCommission"("agentId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "Settlement_reference_key" ON "Settlement"("reference");

-- CreateIndex
CREATE INDEX "Settlement_tenantId_createdAt_idx" ON "Settlement"("tenantId", "createdAt");

-- CreateIndex
CREATE INDEX "Settlement_agentId_status_idx" ON "Settlement"("agentId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "Disbursement_billingTransactionId_key" ON "Disbursement"("billingTransactionId");

-- CreateIndex
CREATE UNIQUE INDEX "Disbursement_reference_key" ON "Disbursement"("reference");

-- CreateIndex
CREATE INDEX "Disbursement_tenantId_createdAt_idx" ON "Disbursement"("tenantId", "createdAt");

-- CreateIndex
CREATE INDEX "Disbursement_agentId_status_idx" ON "Disbursement"("agentId", "status");

-- CreateIndex
CREATE INDEX "FeatureLimit_tenantId_category_idx" ON "FeatureLimit"("tenantId", "category");

-- CreateIndex
CREATE UNIQUE INDEX "FeatureLimit_tenantId_code_key" ON "FeatureLimit"("tenantId", "code");

-- CreateIndex
CREATE INDEX "SupportTicket_tenantId_status_createdAt_idx" ON "SupportTicket"("tenantId", "status", "createdAt");

-- CreateIndex
CREATE INDEX "SupportTicket_priority_createdAt_idx" ON "SupportTicket"("priority", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "SupportTicket_tenantId_reference_key" ON "SupportTicket"("tenantId", "reference");

-- CreateIndex
CREATE INDEX "SupportTicketMessage_ticketId_createdAt_idx" ON "SupportTicketMessage"("ticketId", "createdAt");

-- CreateIndex
CREATE INDEX "AuditLog_tenantId_createdAt_idx" ON "AuditLog"("tenantId", "createdAt");

-- CreateIndex
CREATE INDEX "AuditLog_entity_createdAt_idx" ON "AuditLog"("entity", "createdAt");

-- CreateIndex
CREATE INDEX "AuditLog_severity_createdAt_idx" ON "AuditLog"("severity", "createdAt");

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "Role"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Agent" ADD CONSTRAINT "Agent_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Hotspot" ADD CONSTRAINT "Hotspot_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RouterGroup" ADD CONSTRAINT "RouterGroup_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Router" ADD CONSTRAINT "Router_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Router" ADD CONSTRAINT "Router_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "RouterGroup"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Router" ADD CONSTRAINT "Router_hotspotId_fkey" FOREIGN KEY ("hotspotId") REFERENCES "Hotspot"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RouterHealthCheck" ADD CONSTRAINT "RouterHealthCheck_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RouterHealthCheck" ADD CONSTRAINT "RouterHealthCheck_routerId_fkey" FOREIGN KEY ("routerId") REFERENCES "Router"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RadiusClient" ADD CONSTRAINT "RadiusClient_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RadiusClient" ADD CONSTRAINT "RadiusClient_routerId_fkey" FOREIGN KEY ("routerId") REFERENCES "Router"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RadiusEvent" ADD CONSTRAINT "RadiusEvent_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RadiusEvent" ADD CONSTRAINT "RadiusEvent_routerId_fkey" FOREIGN KEY ("routerId") REFERENCES "Router"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RadiusEvent" ADD CONSTRAINT "RadiusEvent_hotspotId_fkey" FOREIGN KEY ("hotspotId") REFERENCES "Hotspot"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RadiusEvent" ADD CONSTRAINT "RadiusEvent_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "NetworkSession"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NetworkSession" ADD CONSTRAINT "NetworkSession_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NetworkSession" ADD CONSTRAINT "NetworkSession_routerId_fkey" FOREIGN KEY ("routerId") REFERENCES "Router"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NetworkSession" ADD CONSTRAINT "NetworkSession_hotspotId_fkey" FOREIGN KEY ("hotspotId") REFERENCES "Hotspot"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NetworkSession" ADD CONSTRAINT "NetworkSession_activationId_fkey" FOREIGN KEY ("activationId") REFERENCES "PackageActivation"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NetworkSession" ADD CONSTRAINT "NetworkSession_voucherRedemptionId_fkey" FOREIGN KEY ("voucherRedemptionId") REFERENCES "VoucherRedemption"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Package" ADD CONSTRAINT "Package_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PackagePrice" ADD CONSTRAINT "PackagePrice_packageId_fkey" FOREIGN KEY ("packageId") REFERENCES "Package"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VoucherTemplate" ADD CONSTRAINT "VoucherTemplate_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VoucherTemplate" ADD CONSTRAINT "VoucherTemplate_packageId_fkey" FOREIGN KEY ("packageId") REFERENCES "Package"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VoucherBatch" ADD CONSTRAINT "VoucherBatch_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VoucherBatch" ADD CONSTRAINT "VoucherBatch_packageId_fkey" FOREIGN KEY ("packageId") REFERENCES "Package"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VoucherBatch" ADD CONSTRAINT "VoucherBatch_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "VoucherTemplate"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VoucherBatch" ADD CONSTRAINT "VoucherBatch_generatedByUserId_fkey" FOREIGN KEY ("generatedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Voucher" ADD CONSTRAINT "Voucher_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Voucher" ADD CONSTRAINT "Voucher_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "VoucherBatch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Voucher" ADD CONSTRAINT "Voucher_packageId_fkey" FOREIGN KEY ("packageId") REFERENCES "Package"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Wallet" ADD CONSTRAINT "Wallet_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Wallet" ADD CONSTRAINT "Wallet_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "Agent"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BillingTransaction" ADD CONSTRAINT "BillingTransaction_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BillingTransaction" ADD CONSTRAINT "BillingTransaction_walletId_fkey" FOREIGN KEY ("walletId") REFERENCES "Wallet"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BillingTransaction" ADD CONSTRAINT "BillingTransaction_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "Agent"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BillingTransaction" ADD CONSTRAINT "BillingTransaction_packageId_fkey" FOREIGN KEY ("packageId") REFERENCES "Package"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BillingTransaction" ADD CONSTRAINT "BillingTransaction_voucherId_fkey" FOREIGN KEY ("voucherId") REFERENCES "Voucher"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BillingTransaction" ADD CONSTRAINT "BillingTransaction_ledgerTransactionId_fkey" FOREIGN KEY ("ledgerTransactionId") REFERENCES "LedgerTransaction"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LedgerTransaction" ADD CONSTRAINT "LedgerTransaction_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LedgerTransaction" ADD CONSTRAINT "LedgerTransaction_walletId_fkey" FOREIGN KEY ("walletId") REFERENCES "Wallet"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LedgerEntry" ADD CONSTRAINT "LedgerEntry_ledgerTransactionId_fkey" FOREIGN KEY ("ledgerTransactionId") REFERENCES "LedgerTransaction"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LedgerEntry" ADD CONSTRAINT "LedgerEntry_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LedgerEntry" ADD CONSTRAINT "LedgerEntry_walletId_fkey" FOREIGN KEY ("walletId") REFERENCES "Wallet"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VoucherRedemption" ADD CONSTRAINT "VoucherRedemption_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VoucherRedemption" ADD CONSTRAINT "VoucherRedemption_voucherId_fkey" FOREIGN KEY ("voucherId") REFERENCES "Voucher"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VoucherRedemption" ADD CONSTRAINT "VoucherRedemption_packageId_fkey" FOREIGN KEY ("packageId") REFERENCES "Package"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VoucherRedemption" ADD CONSTRAINT "VoucherRedemption_redeemedByUserId_fkey" FOREIGN KEY ("redeemedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VoucherRedemption" ADD CONSTRAINT "VoucherRedemption_hotspotId_fkey" FOREIGN KEY ("hotspotId") REFERENCES "Hotspot"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_packageId_fkey" FOREIGN KEY ("packageId") REFERENCES "Package"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_billingTransactionId_fkey" FOREIGN KEY ("billingTransactionId") REFERENCES "BillingTransaction"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentWebhook" ADD CONSTRAINT "PaymentWebhook_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentWebhook" ADD CONSTRAINT "PaymentWebhook_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "Payment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PackageActivation" ADD CONSTRAINT "PackageActivation_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PackageActivation" ADD CONSTRAINT "PackageActivation_packageId_fkey" FOREIGN KEY ("packageId") REFERENCES "Package"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PackageActivation" ADD CONSTRAINT "PackageActivation_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "Payment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PackageActivation" ADD CONSTRAINT "PackageActivation_voucherRedemptionId_fkey" FOREIGN KEY ("voucherRedemptionId") REFERENCES "VoucherRedemption"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PackageActivation" ADD CONSTRAINT "PackageActivation_hotspotId_fkey" FOREIGN KEY ("hotspotId") REFERENCES "Hotspot"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RadiusCredential" ADD CONSTRAINT "RadiusCredential_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RadiusCredential" ADD CONSTRAINT "RadiusCredential_activationId_fkey" FOREIGN KEY ("activationId") REFERENCES "PackageActivation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DeviceBindingReset" ADD CONSTRAINT "DeviceBindingReset_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DeviceBindingReset" ADD CONSTRAINT "DeviceBindingReset_activationId_fkey" FOREIGN KEY ("activationId") REFERENCES "PackageActivation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReconnectionLog" ADD CONSTRAINT "ReconnectionLog_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReconnectionLog" ADD CONSTRAINT "ReconnectionLog_activationId_fkey" FOREIGN KEY ("activationId") REFERENCES "PackageActivation"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SuspiciousAccessAttempt" ADD CONSTRAINT "SuspiciousAccessAttempt_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SuspiciousAccessAttempt" ADD CONSTRAINT "SuspiciousAccessAttempt_activationId_fkey" FOREIGN KEY ("activationId") REFERENCES "PackageActivation"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VoucherPrintLog" ADD CONSTRAINT "VoucherPrintLog_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VoucherPrintLog" ADD CONSTRAINT "VoucherPrintLog_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "VoucherBatch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TenantSetting" ADD CONSTRAINT "TenantSetting_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgentCommission" ADD CONSTRAINT "AgentCommission_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgentCommission" ADD CONSTRAINT "AgentCommission_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "Agent"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgentCommission" ADD CONSTRAINT "AgentCommission_walletId_fkey" FOREIGN KEY ("walletId") REFERENCES "Wallet"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgentCommission" ADD CONSTRAINT "AgentCommission_sourceTransactionId_fkey" FOREIGN KEY ("sourceTransactionId") REFERENCES "BillingTransaction"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgentCommission" ADD CONSTRAINT "AgentCommission_payoutTransactionId_fkey" FOREIGN KEY ("payoutTransactionId") REFERENCES "BillingTransaction"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgentCommission" ADD CONSTRAINT "AgentCommission_settlementId_fkey" FOREIGN KEY ("settlementId") REFERENCES "Settlement"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Settlement" ADD CONSTRAINT "Settlement_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Settlement" ADD CONSTRAINT "Settlement_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "Agent"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Settlement" ADD CONSTRAINT "Settlement_walletId_fkey" FOREIGN KEY ("walletId") REFERENCES "Wallet"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Disbursement" ADD CONSTRAINT "Disbursement_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Disbursement" ADD CONSTRAINT "Disbursement_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "Agent"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Disbursement" ADD CONSTRAINT "Disbursement_settlementId_fkey" FOREIGN KEY ("settlementId") REFERENCES "Settlement"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Disbursement" ADD CONSTRAINT "Disbursement_walletId_fkey" FOREIGN KEY ("walletId") REFERENCES "Wallet"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Disbursement" ADD CONSTRAINT "Disbursement_billingTransactionId_fkey" FOREIGN KEY ("billingTransactionId") REFERENCES "BillingTransaction"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FeatureLimit" ADD CONSTRAINT "FeatureLimit_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupportTicket" ADD CONSTRAINT "SupportTicket_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupportTicketMessage" ADD CONSTRAINT "SupportTicketMessage_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES "SupportTicket"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE SET NULL ON UPDATE CASCADE;

