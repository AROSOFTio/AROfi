#!/usr/bin/env python3
"""Apply guarded source patches required by the ioTec and clean-admin branch.

The production Docker build copies source after dependency installation, so this
script runs immediately after COPY and before Prisma generation. Every change is
idempotent and fails loudly if the expected source shape has drifted.
"""

from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def read(path: str) -> str:
    return (ROOT / path).read_text()


def write(path: str, text: str) -> None:
    (ROOT / path).write_text(text)


def replace_once(path: str, old: str, new: str, *, sentinel: str | None = None) -> None:
    text = read(path)
    if sentinel and sentinel in text:
        return
    if new in text:
        return
    count = text.count(old)
    if count != 1:
        raise RuntimeError(f"{path}: expected one match, found {count}: {old[:120]!r}")
    write(path, text.replace(old, new, 1))


def insert_before(path: str, marker: str, block: str, sentinel: str) -> None:
    text = read(path)
    if sentinel in text:
        return
    count = text.count(marker)
    if count != 1:
        raise RuntimeError(f"{path}: expected one insertion marker, found {count}: {marker!r}")
    write(path, text.replace(marker, block + marker, 1))


# Prisma provider enum and Pro fee default.
replace_once(
    "apps/api/prisma/schema.prisma",
    """enum PaymentProvider {
  MTN_MOMO_DIRECT
  AIRTEL_MONEY_DIRECT
  AGGREGATOR
}""",
    """enum PaymentProvider {
  MTN_MOMO_DIRECT
  AIRTEL_MONEY_DIRECT
  AGGREGATOR
  IOTEC_PAY
}""",
    sentinel="  IOTEC_PAY\n}",
)
replace_once(
    "apps/api/prisma/schema.prisma",
    "  proMobileMoneyFeeBps       Int      @default(300)",
    "  proMobileMoneyFeeBps       Int      @default(400)",
)

migration_dir = ROOT / "apps/api/prisma/migrations/20260807020000_add_iotec_pay_and_pro_fee"
migration_dir.mkdir(parents=True, exist_ok=True)
(migration_dir / "migration.sql").write_text(
    """ALTER TYPE \"PaymentProvider\" ADD VALUE IF NOT EXISTS 'IOTEC_PAY';

ALTER TABLE \"PlatformSetting\"
  ALTER COLUMN \"proMobileMoneyFeeBps\" SET DEFAULT 400;

UPDATE \"PlatformSetting\"
SET \"proMobileMoneyFeeBps\" = 400
WHERE \"id\" = 'global'
  AND \"proMobileMoneyFeeBps\" = 300;
"""
)

# Main customer payment flow: selected provider is read from PlatformSetting,
# persisted on the transaction, and reused for status checks and callbacks.
payments = "apps/api/src/modules/payments/payments.service.ts"
replace_once(
    payments,
    "    const readiness = this.paymentRouterService.getProviderReadiness()",
    "    const readiness = this.paymentRouterService.getProviderReadiness(platformSettings)",
)
replace_once(
    payments,
    """    const network = dto.network
    const provider = this.paymentRouterService.providerFor(network, 'COLLECTION')
    const method = PaymentMethod.MOBILE_MONEY""",
    """    const network = dto.network
    const platformSettings = await this.prisma.platformSetting.upsert({
      where: { id: PLATFORM_SETTINGS_ID },
      update: {},
      create: { id: PLATFORM_SETTINGS_ID },
    })
    const configuredProvider =
      network === PaymentNetwork.MTN
        ? platformSettings.mtnCollectionProvider
        : platformSettings.airtelCollectionProvider
    const collectionProvider = this.paymentRouterService.resolveCollection(network, configuredProvider)
    const provider = collectionProvider.provider
    const method = PaymentMethod.MOBILE_MONEY""",
    sentinel="const configuredProvider =\n      network === PaymentNetwork.MTN",
)
replace_once(
    payments,
    """    try {
      const collectionProvider = this.paymentRouterService.resolveCollection(network)
      const gatewayResponse = await collectionProvider.collectPayment({""",
    """    try {
      const gatewayResponse = await collectionProvider.collectPayment({""",
)
replace_once(
    payments,
    """    const gatewayResponse = await this.paymentRouterService
      .resolveCollection(payment.network)
      .getPaymentStatus(referenceId)""",
    """    const gatewayResponse = await this.paymentRouterService
      .resolveCollection(payment.network, payment.provider)
      .getPaymentStatus(referenceId)""",
    sentinel=".resolveCollection(payment.network, payment.provider)",
)
replace_once(
    payments,
    """  private resolveWebhookSecretEnvVar(provider: PaymentProvider, direction: 'collection' | 'disbursement') {
    if (provider === PaymentProvider.MTN_MOMO_DIRECT) {""",
    """  private resolveWebhookSecretEnvVar(provider: PaymentProvider, direction: 'collection' | 'disbursement') {
    if (provider === PaymentProvider.IOTEC_PAY) {
      return 'IOTEC_WEBHOOK_SECRET'
    }
    if (provider === PaymentProvider.MTN_MOMO_DIRECT) {""",
    sentinel="provider === PaymentProvider.IOTEC_PAY",
)
replace_once(
    payments,
    """        provider,
        network,
        eventType: PaymentEventType.WEBHOOK_RECEIVED,""",
    """        provider,
        network: payment?.network ?? network,
        eventType: PaymentEventType.WEBHOOK_RECEIVED,""",
)
replace_once(
    payments,
    "    if (payment.provider !== provider || payment.network !== network) {",
    """    if (
      payment.provider !== provider ||
      (network !== PaymentNetwork.UNKNOWN && payment.network !== network)
    ) {""",
)
replace_once(
    payments,
    """    if (providerStatus === 'FAILED') {
      return PaymentStatus.FAILED
    }

    if (providerStatus === 'CANCELLED') {""",
    """    if (['FAILED', 'ROLLEDBACK', 'REJECTED', 'DECLINED'].includes(providerStatus)) {
      return PaymentStatus.FAILED
    }

    if (providerStatus === 'CANCELLED') {""",
)
replace_once(
    payments,
    """    if (providerStatus === 'PENDING') {
      return PaymentStatus.PENDING
    }""",
    """    if (['PENDING', 'SENTTOVENDOR', 'AWAITINGAPPROVAL', 'SCHEDULED', 'INITIATED', 'PROCESSING'].includes(providerStatus)) {
      return PaymentStatus.PENDING
    }""",
)
replace_once(
    payments,
    """        'providerReference',
        'order_tracking_id',
        'OrderTrackingId',
      ])?.toString(),""",
    """        'providerReference',
        'id',
        'vendorTransactionId',
        'order_tracking_id',
        'OrderTrackingId',
      ])?.toString(),""",
    sentinel="'vendorTransactionId',\n        'order_tracking_id'",
)
replace_once(
    payments,
    """          'ExternalReference',
          'externalReference',
          'external_ref',""",
    """          'ExternalReference',
          'externalReference',
          'externalId',
          'external_ref',""",
    sentinel="'externalId',\n          'external_ref'",
)
replace_once(
    payments,
    """          'providerReference',
          'order_tracking_id',
          'OrderTrackingId',
          'orderTrackingId',""",
    """          'providerReference',
          'id',
          'vendorTransactionId',
          'order_tracking_id',
          'OrderTrackingId',
          'orderTrackingId',""",
    sentinel="'vendorTransactionId',\n          'order_tracking_id'",
)

controller = "apps/api/src/modules/payments/payments.controller.ts"
insert_before(
    controller,
    "  @Post('webhooks/yo-uganda')",
    """  @Post('webhooks/iotec/collection')
  handleIotecCollectionWebhook(
    @Body() payload: Record<string, unknown>,
    @Headers() headers: Record<string, string | string[] | undefined>,
    @Query('secret') secret?: string,
  ) {
    return this.paymentsService.handleProviderWebhook(
      PaymentProvider.IOTEC_PAY,
      PaymentNetwork.UNKNOWN,
      { ...payload, secret },
      headers,
      'collection',
    )
  }

""",
    "webhooks/iotec/collection",
)

# Wallet collections and withdrawals use the platform-selected route, while an
# existing transaction always keeps the provider chosen when it was created.
wallets = "apps/api/src/modules/wallets/wallets.service.ts"
replace_once(wallets, "  PaymentNetwork,\n  Prisma,", "  PaymentNetwork,\n  PaymentProvider,\n  Prisma,")
replace_once(
    wallets,
    "import { BadRequestException, Injectable, Logger, NotFoundException, ServiceUnavailableException } from '@nestjs/common'",
    "import { BadRequestException, ForbiddenException, Injectable, Logger, NotFoundException, ServiceUnavailableException } from '@nestjs/common'",
)
replace_once(wallets, "import { randomUUID } from 'crypto'", "import { randomUUID, timingSafeEqual } from 'crypto'")
replace_once(
    wallets,
    """    const provider = this.paymentRouterService.resolveDisbursement(payoutNumber.network)
    const reference =""",
    """    const configuredProvider =
      payoutNumber.network === PaymentNetwork.MTN
        ? platformSettings.mtnDisbursementProvider
        : platformSettings.airtelDisbursementProvider
    const provider = this.paymentRouterService.resolveDisbursement(
      payoutNumber.network,
      configuredProvider,
    )
    const reference =""",
    sentinel="platformSettings.mtnDisbursementProvider",
)
replace_once(
    wallets,
    """    const provider = this.paymentRouterService.resolveDisbursement(disbursement.network)

    try {""",
    """    const platformSettings = await this.getPlatformSettings()
    const configuredProvider = disbursement.provider ?? (
      disbursement.network === PaymentNetwork.MTN
        ? platformSettings.mtnDisbursementProvider
        : platformSettings.airtelDisbursementProvider
    )
    const provider = this.paymentRouterService.resolveDisbursement(
      disbursement.network,
      configuredProvider,
    )
    if (!disbursement.provider) {
      await this.prisma.disbursement.update({
        where: { id: disbursement.id },
        data: { provider: provider.provider },
      })
    }

    try {""",
    sentinel="const configuredProvider = disbursement.provider ??",
)
replace_once(
    wallets,
    """  async initiateTopup(tenantId: string, dto: TopUpWalletDto) {
    const wallet = await this.findTenantWallet(tenantId)
    if (!wallet) {""",
    """  async initiateTopup(tenantId: string, dto: TopUpWalletDto) {
    const [wallet, platformSettings] = await Promise.all([
      this.findTenantWallet(tenantId),
      this.getPlatformSettings(),
    ])
    if (!wallet) {""",
    sentinel="const [wallet, platformSettings] = await Promise.all",
)
replace_once(
    wallets,
    """    const network = this.phoneNumberService.resolveNetwork(dto.phoneNumber)
    const provider = this.paymentRouterService.resolveCollection(network)

    try {""",
    """    const network = this.phoneNumberService.resolveNetwork(dto.phoneNumber)
    const configuredProvider =
      network === PaymentNetwork.MTN
        ? platformSettings.mtnCollectionProvider
        : platformSettings.airtelCollectionProvider
    const provider = this.paymentRouterService.resolveCollection(network, configuredProvider)

    try {""",
    sentinel="platformSettings.mtnCollectionProvider",
)
replace_once(
    wallets,
    """          metadata: {
            providerReference: response.transactionReference || undefined,
          },""",
    """          metadata: {
            provider: provider.provider,
            providerReference: response.transactionReference || undefined,
          },""",
    sentinel="provider: provider.provider,\n            providerReference",
)
replace_once(
    wallets,
    """    const network = this.phoneNumberService.resolveNetwork(txRecord.customerReference || '')
    const provider = this.paymentRouterService.resolveCollection(network)
    const metadata = (txRecord.metadata || {}) as Record<string, any>
    const providerReference = metadata.providerReference || txRecord.externalReference""",
    """    const network = this.phoneNumberService.resolveNetwork(txRecord.customerReference || '')
    const metadata = (txRecord.metadata || {}) as Record<string, any>
    const configuredProvider = Object.values(PaymentProvider).includes(metadata.provider)
      ? metadata.provider as PaymentProvider
      : undefined
    const provider = this.paymentRouterService.resolveCollection(network, configuredProvider)
    const providerReference = metadata.providerReference || txRecord.externalReference""",
    sentinel="Object.values(PaymentProvider).includes(metadata.provider)",
)

insert_before(
    wallets,
    "  private async writeAudit(input: {",
    """  async handleIotecDisbursementWebhook(
    payload: Record<string, unknown>,
    headers: Record<string, string | string[] | undefined>,
    querySecret?: string,
  ) {
    this.assertIotecWebhookSecret(payload, headers, querySecret)

    const externalReference = String(payload.externalId ?? payload.externalReference ?? '').trim()
    const providerReference = String(payload.id ?? payload.vendorTransactionId ?? payload.providerReference ?? '').trim()
    const status = String(payload.status ?? payload.transactionStatus ?? 'Pending').trim().toUpperCase()

    const disbursement = await this.prisma.disbursement.findFirst({
      where: {
        provider: PaymentProvider.IOTEC_PAY,
        OR: [
          ...(externalReference ? [{ reference: externalReference }] : []),
          ...(providerReference ? [{ providerReference }] : []),
        ],
      },
      include: { billingTransaction: true, wallet: true },
    })

    if (!disbursement) {
      return { received: true, matched: false, processed: false }
    }

    if (['SUCCESS', 'SUCCESSFUL', 'COMPLETED', 'SUCCEEDED'].includes(status)) {
      if (disbursement.status !== DisbursementStatus.COMPLETED) {
        await this.prisma.$transaction(async (tx) => {
          if (disbursement.billingTransactionId) {
            await tx.billingTransaction.update({
              where: { id: disbursement.billingTransactionId },
              data: { status: BillingTransactionStatus.COMPLETED },
            })
          }
          await tx.disbursement.update({
            where: { id: disbursement.id },
            data: {
              status: DisbursementStatus.COMPLETED,
              providerReference: providerReference || disbursement.providerReference,
              completedAt: new Date(),
              notes: 'Withdrawal confirmed by ioTec Pay.',
              metadata: this.toJsonValue({
                ...this.objectMetadata(disbursement.metadata),
                iotecCallback: payload,
              }),
            },
          })
        })
        void this.notifyWithdrawalEmail({
          tenantId: disbursement.tenantId,
          status: 'COMPLETED',
          amountUgx: disbursement.amountUgx,
          reference: disbursement.reference,
        })
      }
      return { received: true, matched: true, processed: true, status: 'COMPLETED' }
    }

    if (['FAILED', 'ROLLEDBACK', 'CANCELLED', 'REJECTED', 'DECLINED'].includes(status)) {
      if (!disbursement.walletId || !disbursement.billingTransactionId) {
        throw new BadRequestException('ioTec withdrawal reserve is incomplete')
      }
      await this.releaseFailedWithdrawalReserve({
        tenantId: disbursement.tenantId,
        walletId: disbursement.walletId,
        billingTransactionId: disbursement.billingTransactionId,
        disbursementId: disbursement.id,
        amountUgx: disbursement.amountUgx,
        totalDebitUgx: disbursement.billingTransaction?.grossAmountUgx ?? disbursement.amountUgx,
        reference: disbursement.reference,
        errorMessage: String(payload.statusMessage ?? payload.message ?? `ioTec Pay reported ${status}`),
      })
      return { received: true, matched: true, processed: true, status: 'FAILED' }
    }

    await this.prisma.disbursement.update({
      where: { id: disbursement.id },
      data: {
        status: DisbursementStatus.PROCESSING,
        providerReference: providerReference || disbursement.providerReference,
        notes: `ioTec Pay status: ${status}`,
        metadata: this.toJsonValue({
          ...this.objectMetadata(disbursement.metadata),
          iotecCallback: payload,
        }),
      },
    })

    return { received: true, matched: true, processed: true, status: 'PROCESSING' }
  }

  private assertIotecWebhookSecret(
    payload: Record<string, unknown>,
    headers: Record<string, string | string[] | undefined>,
    querySecret?: string,
  ) {
    const configured = process.env.IOTEC_WEBHOOK_SECRET?.trim()
    if (!configured) {
      if (process.env.NODE_ENV === 'production') {
        throw new ForbiddenException('ioTec webhook authorization is not configured')
      }
      this.logger.warn('IOTEC_WEBHOOK_SECRET is not configured; accepting callback outside production')
      return
    }

    const rawHeader = headers['x-webhook-secret'] ?? headers['X-Webhook-Secret']
    const incoming = String(
      payload.secret ?? querySecret ?? (Array.isArray(rawHeader) ? rawHeader[0] : rawHeader) ?? '',
    )
    const incomingBuffer = Buffer.from(incoming)
    const configuredBuffer = Buffer.from(configured)
    if (
      incomingBuffer.length !== configuredBuffer.length ||
      !timingSafeEqual(incomingBuffer, configuredBuffer)
    ) {
      throw new ForbiddenException('Invalid ioTec webhook authorization secret')
    }
  }

""",
    "handleIotecDisbursementWebhook(",
)

# Subscription plan checkout must use the same route selected by Platform Admin.
subscription = "apps/api/src/modules/subscription/subscription.service.ts"
replace_once(
    subscription,
    "import { AuditSeverity, NotificationAudience, PaymentNetwork, PaymentStatus, Prisma, SubscriptionPlanTier } from '@prisma/client'",
    "import { AuditSeverity, NotificationAudience, PaymentNetwork, PaymentProvider, PaymentStatus, Prisma, SubscriptionPlanTier } from '@prisma/client'",
)
replace_once(
    subscription,
    """  providerReference?: string
  status: PaymentStatus""",
    """  provider?: PaymentProvider
  providerReference?: string
  status: PaymentStatus""",
)
replace_once(
    subscription,
    """    const collectionProvider = this.paymentRouterService.resolveCollection(network)
    const gatewayResponse = await collectionProvider.collectPayment({""",
    """    const platformSettings = await this.prisma.platformSetting.upsert({
      where: { id: PLATFORM_SETTINGS_ID },
      update: {},
      create: { id: PLATFORM_SETTINGS_ID },
    })
    const configuredProvider =
      network === PaymentNetwork.MTN
        ? platformSettings.mtnCollectionProvider
        : platformSettings.airtelCollectionProvider
    const collectionProvider = this.paymentRouterService.resolveCollection(network, configuredProvider)
    const gatewayResponse = await collectionProvider.collectPayment({""",
    sentinel="platformSettings.mtnCollectionProvider",
)
replace_once(
    subscription,
    """          externalReference,
          network,
        } as Prisma.InputJsonValue,""",
    """          externalReference,
          network,
          provider: collectionProvider.provider,
        } as Prisma.InputJsonValue,""",
)
replace_once(
    subscription,
    """      externalReference,
      providerReference: gatewayResponse.transactionReference,
      status,""",
    """      externalReference,
      provider: collectionProvider.provider,
      providerReference: gatewayResponse.transactionReference,
      status,""",
)
replace_once(
    subscription,
    """    const gatewayResponse = await this.paymentRouterService
      .resolveCollection(payment.network)
      .getPaymentStatus(referenceId)""",
    """    const gatewayResponse = await this.paymentRouterService
      .resolveCollection(payment.network, payment.provider)
      .getPaymentStatus(referenceId)""",
)

# SMS credit purchases also follow the platform collection route and retain it.
sms = "apps/api/src/modules/sms/sms.service.ts"
replace_once(
    sms,
    "import { PaymentStatus, Prisma, SmsCreditLedgerType, SmsMessageStatus, SmsProvider, SubscriptionPlanTier } from '@prisma/client'",
    "import { PaymentNetwork, PaymentProvider, PaymentStatus, Prisma, SmsCreditLedgerType, SmsMessageStatus, SmsProvider, SubscriptionPlanTier } from '@prisma/client'",
)
replace_once(
    sms,
    """    const provider = this.paymentRouterService.resolveCollection(network)
    const gatewayResponse = await provider.collectPayment({""",
    """    const platformSettings = await this.prisma.platformSetting.upsert({
      where: { id: 'global' },
      update: {},
      create: { id: 'global' },
    })
    const configuredProvider =
      network === PaymentNetwork.MTN
        ? platformSettings.mtnCollectionProvider
        : platformSettings.airtelCollectionProvider
    const provider = this.paymentRouterService.resolveCollection(network, configuredProvider)
    const gatewayResponse = await provider.collectPayment({""",
    sentinel="platformSettings.mtnCollectionProvider",
)
replace_once(
    sms,
    "requestPayload: { smsQuantity, amountUgx, phoneNumber: normalizedPhone, externalReference, network } as Prisma.InputJsonValue,",
    "requestPayload: { smsQuantity, amountUgx, phoneNumber: normalizedPhone, externalReference, network, provider: provider.provider } as Prisma.InputJsonValue,",
)
replace_once(
    sms,
    """    const referenceId = purchase.providerReference ?? purchase.externalReference
    const gatewayResponse = await this.paymentRouterService.resolveCollection(purchase.network).getPaymentStatus(referenceId)""",
    """    const referenceId = purchase.providerReference ?? purchase.externalReference
    const requestPayload = purchase.requestPayload && typeof purchase.requestPayload === 'object' && !Array.isArray(purchase.requestPayload)
      ? purchase.requestPayload as Record<string, unknown>
      : {}
    const configuredProvider = Object.values(PaymentProvider).includes(requestPayload.provider as PaymentProvider)
      ? requestPayload.provider as PaymentProvider
      : undefined
    const gatewayResponse = await this.paymentRouterService
      .resolveCollection(purchase.network, configuredProvider)
      .getPaymentStatus(referenceId)""",
    sentinel="requestPayload.provider as PaymentProvider",
)

# Human-readable admin gateway selection and safe fee fallbacks.
settings = "apps/admin-web/src/components/SettingsManager.tsx"
replace_once(
    settings,
    "const providerOptions = ['MTN_MOMO_DIRECT', 'AIRTEL_MONEY_DIRECT', 'AGGREGATOR']",
    "const providerOptions = ['IOTEC_PAY', 'AGGREGATOR', 'MTN_MOMO_DIRECT', 'AIRTEL_MONEY_DIRECT']",
)
replace_once(
    settings,
    """  custom: 'Custom hex code',
}""",
    """  custom: 'Custom hex code',
  IOTEC_PAY: 'ioTec Pay',
  AGGREGATOR: 'Yo! Uganda / configured aggregator',
  MTN_MOMO_DIRECT: 'MTN MoMo direct',
  AIRTEL_MONEY_DIRECT: 'Airtel Money direct',
}""",
    sentinel="IOTEC_PAY: 'ioTec Pay'",
)
replace_once(
    settings,
    """    platform?.mobileMoneyFeePercent ??
    7""",
    """    platform?.mobileMoneyFeePercent ??
    8""",
)

# Environment templates contain placeholders only. Live credentials stay in
# Coolify and are never written to source control.
env_block = """
# ioTec Pay (use rotated credentials; never commit live secrets)
IOTEC_CLIENT_ID=replace_with_iotec_client_id
IOTEC_CLIENT_SECRET=replace_with_rotated_iotec_client_secret
IOTEC_WALLET_ID=replace_with_iotec_live_or_test_wallet_id
IOTEC_IDENTITY_BASE_URL=https://id.iotec.io
IOTEC_PAY_BASE_URL=https://pay.iotec.io
IOTEC_WEBHOOK_SECRET=replace_with_long_random_webhook_secret
"""
for env_path in [".env.example", ".env.vps.example"]:
    text = read(env_path)
    if "IOTEC_CLIENT_ID=" not in text:
        write(env_path, text.rstrip() + "\n" + env_block)

print("ioTec/admin source patches applied.")
