#!/usr/bin/env python3
"""Harden live ioTec/Yo gateway activation after the existing gateway patches.

This runs after hide_pesapal_gateway.py. It adds a safe live-wallet health test,
provider/callback readiness in Platform Settings, and a two-button universal
gateway selector. No credentials or wallet identifiers are written to source.
"""

from pathlib import Path
import re

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
        raise RuntimeError(f"{path}: expected one match, found {count}: {old[:140]!r}")
    write(path, text.replace(old, new, 1))


def regex_once(path: str, pattern: str, replacement: str, *, sentinel: str | None = None) -> None:
    text = read(path)
    if sentinel and sentinel in text:
        return
    updated, count = re.subn(pattern, replacement, text, count=1, flags=re.S)
    if count != 1:
        raise RuntimeError(f"{path}: expected one regex match, found {count}: {pattern[:140]!r}")
    write(path, updated)


# ---------------------------------------------------------------------------
# ioTec: verify OAuth credentials and the configured live wallet safely.
# ---------------------------------------------------------------------------
iotec = "apps/api/src/modules/payments/iotec-pay.service.ts"
replace_once(
    iotec,
    """type IotecTransaction = {
  id?: string""",
    """type IotecWalletBalance = {
  id?: string
  name?: string | null
  currency?: string
  actualBalance?: number
  availableBalance?: number
  message?: string | null
  code?: string | null
}

type IotecTransaction = {
  id?: string""",
    sentinel="type IotecWalletBalance =",
)
replace_once(
    iotec,
    "  async collectPayment(input: CollectPaymentInput): Promise<PaymentProviderResult> {",
    """  async testLiveWallet() {
    const walletId = this.required('IOTEC_WALLET_ID')
    const token = await this.createAccessToken()
    const response = await fetch(
      `${this.payBaseUrl()}/api/wallet-balance/${encodeURIComponent(walletId)}`,
      { headers: { Authorization: `Bearer ${token}` } },
    )
    const raw = await response.text()
    const wallet = this.parseJson<IotecWalletBalance>(raw)

    if (!response.ok || !wallet.id) {
      throw new ServiceUnavailableException(
        wallet.message || wallet.code || `ioTec wallet verification failed with HTTP ${response.status}`,
      )
    }

    return {
      gateway: 'IOTEC_PAY' as const,
      connected: true,
      walletConfigured: true,
      walletName: this.stringValue(wallet.name) || 'ioTec Pay wallet',
      currency: this.stringValue(wallet.currency) || 'UGX',
      availableBalance:
        wallet.availableBalance == null || !Number.isFinite(Number(wallet.availableBalance))
          ? null
          : Number(wallet.availableBalance),
      checkedAt: new Date().toISOString(),
      message: 'ioTec credentials and live wallet were verified successfully.',
    }
  }

  async collectPayment(input: CollectPaymentInput): Promise<PaymentProviderResult> {""",
    sentinel="async testLiveWallet()",
)

# ---------------------------------------------------------------------------
# Router: align the fallback env name, expose safe readiness, and test gateway.
# ---------------------------------------------------------------------------
router = "apps/api/src/modules/payments/payment-router.service.ts"
regex_once(
    router,
    r"  getProviderReadiness\(settings\?: GatewaySettings\) \{.*?\n  \}\n\n  private defaultGateway\(\): PlatformPaymentGateway \{",
    """  getProviderReadiness(settings?: GatewaySettings) {
    const gateway = settings?.paymentGateway ?? this.defaultGateway()
    const mtnCollectionProvider = this.providerFor(PaymentNetwork.MTN, 'COLLECTION', gateway)
    const airtelCollectionProvider = this.providerFor(PaymentNetwork.AIRTEL, 'COLLECTION', gateway)
    const mtnDisbursementProvider = this.providerFor(PaymentNetwork.MTN, 'DISBURSEMENT', gateway)
    const airtelDisbursementProvider = this.providerFor(PaymentNetwork.AIRTEL, 'DISBURSEMENT', gateway)

    const mtnCollectionReady = this.isConfigured(mtnCollectionProvider, 'COLLECTION')
    const airtelCollectionReady = this.isConfigured(airtelCollectionProvider, 'COLLECTION')
    const mtnDisbursementReady = this.isConfigured(mtnDisbursementProvider, 'DISBURSEMENT')
    const airtelDisbursementReady = this.isConfigured(airtelDisbursementProvider, 'DISBURSEMENT')
    const cardReady =
      gateway === PlatformPaymentGateway.IOTEC_PAY
        ? this.isConfigured(PaymentProvider.IOTEC_PAY, 'COLLECTION')
        : gateway === PlatformPaymentGateway.PESAPAL
          ? this.isConfigured(PaymentProvider.PESAPAL, 'COLLECTION')
          : false

    const configuredValue = (key: string) => {
      const value = this.configService.get<string>(key)?.trim()
      return Boolean(value && !value.startsWith('CHANGE_ME') && !value.startsWith('replace_with'))
    }
    const missing = (keys: string[]) => keys.filter((key) => !configuredValue(key))
    const appBaseUrl = (
      this.configService.get<string>('APP_BASE_URL') ||
      this.configService.get<string>('ADMIN_BASE_URL') ||
      'https://arofi.net'
    ).replace(/\/$/, '')

    const providers = {
      IOTEC_PAY: {
        label: 'ioTec Pay',
        configured: missing(['IOTEC_CLIENT_ID', 'IOTEC_CLIENT_SECRET', 'IOTEC_WALLET_ID']).length === 0,
        webhookConfigured: configuredValue('IOTEC_WEBHOOK_SECRET'),
        liveWalletConfigured: configuredValue('IOTEC_WALLET_ID'),
        missingConfiguration: missing([
          'IOTEC_CLIENT_ID',
          'IOTEC_CLIENT_SECRET',
          'IOTEC_WALLET_ID',
          'IOTEC_WEBHOOK_SECRET',
        ]),
        collectionCallbackUrl: `${appBaseUrl}/api/payments/webhooks/iotec/collection`,
        disbursementCallbackUrl: `${appBaseUrl}/api/wallets/webhooks/iotec/disbursement`,
      },
      YO_UGANDA: {
        label: 'Yo! Uganda',
        configured: missing(['YO_UGANDA_USERNAME', 'YO_UGANDA_PASSWORD']).length === 0,
        webhookConfigured:
          configuredValue('YO_UGANDA_COLLECTION_WEBHOOK_SECRET') &&
          configuredValue('YO_UGANDA_WEBHOOK_SECRET'),
        liveWalletConfigured: true,
        missingConfiguration: missing([
          'YO_UGANDA_USERNAME',
          'YO_UGANDA_PASSWORD',
          'YO_UGANDA_COLLECTION_WEBHOOK_SECRET',
          'YO_UGANDA_WEBHOOK_SECRET',
        ]),
        collectionCallbackUrl: `${appBaseUrl}/api/payments/webhooks/yo-uganda`,
        disbursementCallbackUrl: `${appBaseUrl}/api/payments/webhooks/yo-uganda/disbursement`,
      },
    }

    const activeConfiguration =
      gateway === PlatformPaymentGateway.IOTEC_PAY
        ? providers.IOTEC_PAY
        : gateway === PlatformPaymentGateway.YO_UGANDA
          ? providers.YO_UGANDA
          : null
    const universalReady =
      mtnCollectionReady &&
      airtelCollectionReady &&
      mtnDisbursementReady &&
      airtelDisbursementReady
    const webhookReady =
      activeConfiguration?.webhookConfigured ??
      (gateway === PlatformPaymentGateway.DIRECT_MNO
        ? missing([
            'MTN_MOMO_COLLECTION_WEBHOOK_SECRET',
            'MTN_MOMO_DISBURSEMENT_WEBHOOK_SECRET',
            'AIRTEL_MONEY_COLLECTION_WEBHOOK_SECRET',
            'AIRTEL_MONEY_DISBURSEMENT_WEBHOOK_SECRET',
          ]).length === 0
        : false)

    return {
      gateway,
      gatewayLabel:
        gateway === PlatformPaymentGateway.IOTEC_PAY
          ? 'ioTec Pay'
          : gateway === PlatformPaymentGateway.YO_UGANDA
            ? 'Yo! Uganda'
            : gateway === PlatformPaymentGateway.DIRECT_MNO
              ? 'Direct MTN + Airtel'
              : 'Pesapal',
      universalReady,
      webhookReady,
      productionReady: universalReady && webhookReady,
      missingConfiguration: activeConfiguration?.missingConfiguration ?? [],
      providers,
      callbackUrls: activeConfiguration
        ? {
            collection: activeConfiguration.collectionCallbackUrl,
            disbursement: activeConfiguration.disbursementCallbackUrl,
          }
        : null,
      paymentMethods: cardReady ? ['MOBILE_MONEY', 'CARD'] : ['MOBILE_MONEY'],
      collection: {
        MTN: { provider: mtnCollectionProvider, ready: mtnCollectionReady },
        AIRTEL: { provider: airtelCollectionProvider, ready: airtelCollectionReady },
        CARD: {
          provider:
            gateway === PlatformPaymentGateway.IOTEC_PAY
              ? PaymentProvider.IOTEC_PAY
              : gateway === PlatformPaymentGateway.PESAPAL
                ? PaymentProvider.PESAPAL
                : null,
          ready: cardReady,
          currency: 'UGX',
        },
      },
      disbursement: {
        MTN: { provider: mtnDisbursementProvider, ready: mtnDisbursementReady },
        AIRTEL: { provider: airtelDisbursementProvider, ready: airtelDisbursementReady },
      },
      warning:
        !universalReady
          ? 'The selected gateway credentials are incomplete.'
          : !webhookReady
            ? 'The selected gateway callback security secret is not configured.'
            : gateway === PlatformPaymentGateway.PESAPAL
              ? 'Pesapal cannot be used for universal withdrawals.'
              : null,
    }
  }

  async testGateway(settings?: GatewaySettings) {
    const readiness = this.getProviderReadiness(settings)
    if (!readiness.productionReady) {
      throw new ServiceUnavailableException(
        readiness.missingConfiguration.length
          ? `Gateway is not production-ready. Missing: ${readiness.missingConfiguration.join(', ')}`
          : readiness.warning || 'Gateway is not production-ready',
      )
    }

    if (readiness.gateway === PlatformPaymentGateway.IOTEC_PAY) {
      return {
        ...readiness,
        ...(await this.iotecPay.testLiveWallet()),
      }
    }

    return {
      ...readiness,
      connected: true,
      checkedAt: new Date().toISOString(),
      message:
        readiness.gateway === PlatformPaymentGateway.YO_UGANDA
          ? 'Yo! Uganda credentials and callback configuration are loaded. Complete a controlled low-value transaction for final verification.'
          : 'Gateway configuration is loaded. Complete a controlled low-value transaction for final verification.',
    }
  }

  private defaultGateway(): PlatformPaymentGateway {""",
    sentinel="async testGateway(settings?: GatewaySettings)",
)
replace_once(
    router,
    """    const configured = (this.configService.get<string>('PAYMENT_GATEWAY') || 'YO_UGANDA').toUpperCase()""",
    """    const configured = (
      this.configService.get<string>('PLATFORM_PAYMENT_GATEWAY') ||
      this.configService.get<string>('PAYMENT_GATEWAY') ||
      'YO_UGANDA'
    ).toUpperCase()""",
    sentinel="this.configService.get<string>('PLATFORM_PAYMENT_GATEWAY')",
)

# ---------------------------------------------------------------------------
# API: authenticated Dev Admin health test and readiness in Settings response.
# ---------------------------------------------------------------------------
payments_service = "apps/api/src/modules/payments/payments.service.ts"
replace_once(
    payments_service,
    "  async exportPaymentsCsv(tenantId?: string, from?: string, to?: string) {",
    """  async testConfiguredGateway() {
    const settings = await this.prisma.platformSetting.upsert({
      where: { id: 'global' },
      update: {},
      create: { id: 'global' },
    })
    return this.paymentRouterService.testGateway(settings)
  }

  async exportPaymentsCsv(tenantId?: string, from?: string, to?: string) {""",
    sentinel="async testConfiguredGateway()",
)

payments_controller = "apps/api/src/modules/payments/payments.controller.ts"
replace_once(
    payments_controller,
    "import { Body, Controller, Get, Headers, Param, Post, Query, Res, UseGuards } from '@nestjs/common'",
    "import { Body, Controller, ForbiddenException, Get, Headers, Param, Post, Query, Res, UseGuards } from '@nestjs/common'",
)
replace_once(
    payments_controller,
    """  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePermissions(PERMISSIONS.paymentsRead)
  @Get(':paymentId')""",
    """  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePermissions(PERMISSIONS.settingsManage)
  @Post('gateway/test')
  testGateway(@CurrentUser() user: AuthenticatedAdminUser) {
    if (!this.accessScope.isSuperAdmin(user)) {
      throw new ForbiddenException('Only Dev Admin can test the platform payment gateway')
    }
    return this.paymentsService.testConfiguredGateway()
  }

  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePermissions(PERMISSIONS.paymentsRead)
  @Get(':paymentId')""",
    sentinel="@Post('gateway/test')",
)

system_module = "apps/api/src/modules/system/system.module.ts"
replace_once(
    system_module,
    "import { MailModule } from '../mail/mail.module'",
    "import { MailModule } from '../mail/mail.module'\nimport { PaymentsModule } from '../payments/payments.module'",
)
replace_once(
    system_module,
    "  imports: [AuthModule, MailModule],",
    "  imports: [AuthModule, MailModule, PaymentsModule],",
)

system_service = "apps/api/src/modules/system/system.service.ts"
replace_once(
    system_service,
    "import { PrismaService } from '../../prisma.service'",
    "import { PrismaService } from '../../prisma.service'\nimport { PaymentRouterService } from '../payments/payment-router.service'",
)
replace_once(
    system_service,
    """  constructor(
    private readonly prisma: PrismaService,
    private readonly mailService: MailService,
  ) {}""",
    """  constructor(
    private readonly prisma: PrismaService,
    private readonly mailService: MailService,
    private readonly paymentRouterService: PaymentRouterService,
  ) {}""",
    sentinel="private readonly paymentRouterService: PaymentRouterService",
)
replace_once(
    system_service,
    "    return this.presentPlatformSettings(settings)\n  }\n\n  async updatePlatformSettings",
    """    return {
      ...this.presentPlatformSettings(settings),
      gatewayReadiness: this.paymentRouterService.getProviderReadiness(settings),
    }
  }

  async updatePlatformSettings""",
    sentinel="gatewayReadiness: this.paymentRouterService.getProviderReadiness(settings)",
)
replace_once(
    system_service,
    """  async updatePlatformSettings(dto: UpdatePlatformSettingsDto, actor: AuthenticatedAdminUser) {
    const data: Prisma.PlatformSettingUpdateInput = {}
""",
    """  async updatePlatformSettings(dto: UpdatePlatformSettingsDto, actor: AuthenticatedAdminUser) {
    const data: Prisma.PlatformSettingUpdateInput = {}

    if (dto.paymentGateway !== undefined) {
      const readiness = this.paymentRouterService.getProviderReadiness({ paymentGateway: dto.paymentGateway })
      if (!readiness.productionReady) {
        throw new BadRequestException(
          readiness.missingConfiguration.length
            ? `Cannot activate ${readiness.gatewayLabel}. Missing: ${readiness.missingConfiguration.join(', ')}`
            : readiness.warning || `${readiness.gatewayLabel} is not production-ready`,
        )
      }
    }
""",
    sentinel="Cannot activate ${readiness.gatewayLabel}",
)
# The second return is the update response; the first one was already replaced.
text = read(system_service)
old_update_return = "    return this.presentPlatformSettings(settings)\n  }\n\n  async getCommissionRates"
new_update_return = """    return {
      ...this.presentPlatformSettings(settings),
      gatewayReadiness: this.paymentRouterService.getProviderReadiness(settings),
    }
  }

  async getCommissionRates"""
if old_update_return in text:
    text = text.replace(old_update_return, new_update_return, 1)
elif new_update_return not in text:
    raise RuntimeError('system.service.ts: update settings return target not found')
write(system_service, text)

# ---------------------------------------------------------------------------
# SaaS Settings: two explicit buttons, safe status, callbacks, and health test.
# ---------------------------------------------------------------------------
settings = "apps/admin-web/src/components/SettingsManager.tsx"
replace_once(
    settings,
    "type PlatformSettings = {",
    """type GatewayProviderReadiness = {
  label: string
  configured: boolean
  webhookConfigured: boolean
  liveWalletConfigured: boolean
  missingConfiguration: string[]
  collectionCallbackUrl: string
  disbursementCallbackUrl: string
}

type GatewayReadiness = {
  gateway: 'YO_UGANDA' | 'IOTEC_PAY' | 'PESAPAL' | 'DIRECT_MNO'
  gatewayLabel: string
  universalReady: boolean
  webhookReady: boolean
  productionReady: boolean
  missingConfiguration: string[]
  providers: {
    IOTEC_PAY: GatewayProviderReadiness
    YO_UGANDA: GatewayProviderReadiness
  }
  callbackUrls?: { collection: string; disbursement: string } | null
  warning?: string | null
}

type PlatformSettings = {""",
    sentinel="type GatewayReadiness =",
)
replace_once(
    settings,
    "  paymentGateway: 'YO_UGANDA' | 'IOTEC_PAY' | 'PESAPAL' | 'DIRECT_MNO'\n",
    "  paymentGateway: 'YO_UGANDA' | 'IOTEC_PAY' | 'PESAPAL' | 'DIRECT_MNO'\n  gatewayReadiness?: GatewayReadiness\n",
    sentinel="gatewayReadiness?: GatewayReadiness",
)
replace_once(
    settings,
    "const gatewayOptions = ['YO_UGANDA', 'IOTEC_PAY', 'DIRECT_MNO']",
    "const gatewayOptions = ['YO_UGANDA', 'IOTEC_PAY']",
)
replace_once(
    settings,
    "  const [platform, setPlatform] = useState(initialPlatformSettings)\n",
    """  const [platform, setPlatform] = useState(initialPlatformSettings)
  const [selectedGateway, setSelectedGateway] = useState<'YO_UGANDA' | 'IOTEC_PAY'>(
    initialPlatformSettings?.paymentGateway === 'IOTEC_PAY' ? 'IOTEC_PAY' : 'YO_UGANDA',
  )
  const [gatewayTesting, setGatewayTesting] = useState(false)
  const [gatewayTestMessage, setGatewayTestMessage] = useState('')
""",
    sentinel="const [selectedGateway, setSelectedGateway]",
)
replace_once(
    settings,
    "  async function savePlatform(event: FormEvent<HTMLFormElement>) {",
    """  async function testActiveGateway() {
    setGatewayTesting(true)
    setGatewayTestMessage('')
    setError('')
    try {
      const result = await clientPostApi<{
        connected: boolean
        gatewayLabel?: string
        walletName?: string
        currency?: string
        availableBalance?: number | null
        message?: string
      }>('/payments/gateway/test', {})
      const balance =
        result.availableBalance == null
          ? ''
          : ` Available balance: ${formatCurrency(result.availableBalance)}.`
      setGatewayTestMessage(`${result.message || `${result.gatewayLabel || 'Gateway'} connected.`}${balance}`)
      const refreshed = await clientFetchApi<PlatformSettings>('/system/settings')
      setPlatform(refreshed)
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Gateway test failed')
    } finally {
      setGatewayTesting(false)
    }
  }

  async function savePlatform(event: FormEvent<HTMLFormElement>) {""",
    sentinel="async function testActiveGateway()",
)
replace_once(
    settings,
    """                  <FormSubheading text="Platform Payment Gateway" />
                  <Select name="paymentGateway" label="Use one gateway for collections, card checkout, and withdrawals" defaultValue={platformForm.paymentGateway} options={gatewayOptions} />
                  <div className="form-group" style={{ gridColumn: '1 / -1' }}>
                    <div className="form-help">
                      Choose Yo! Uganda, ioTec Pay, or Direct MTN + Airtel. The selected gateway is applied automatically to new package payments, subscriptions, wallet top-ups, and withdrawals. ioTec Pay also enables UGX Visa/Mastercard checkout.
                    </div>
                  </div>""",
    """                  <FormSubheading text="Platform Payment Gateway" />
                  <div className="form-group" style={{ gridColumn: '1 / -1' }}>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(230px,1fr))', gap: 10 }}>
                      {(['IOTEC_PAY', 'YO_UGANDA'] as const).map((gateway) => {
                        const readiness = platformForm.gatewayReadiness?.providers[gateway]
                        const active = selectedGateway === gateway
                        return (
                          <label
                            key={gateway}
                            style={{
                              display: 'block',
                              border: `2px solid ${active ? 'var(--brand)' : 'var(--border)'}`,
                              borderRadius: 12,
                              padding: 14,
                              cursor: 'pointer',
                              background: active ? 'var(--green-light)' : 'var(--bg-card)',
                            }}
                          >
                            <input
                              type="radio"
                              name="paymentGateway"
                              value={gateway}
                              checked={active}
                              onChange={() => setSelectedGateway(gateway)}
                              style={{ marginRight: 8 }}
                            />
                            <strong>{gateway === 'IOTEC_PAY' ? 'ioTec Pay' : 'Yo! Uganda'}</strong>
                            <div className="form-help" style={{ marginTop: 7 }}>
                              {gateway === 'IOTEC_PAY'
                                ? 'Mobile Money collections, withdrawals, and UGX Visa/Mastercard checkout.'
                                : 'Mobile Money collections and withdrawals through Yo! Uganda.'}
                            </div>
                            <div style={{ marginTop: 9, fontSize: 12, fontWeight: 700, color: readiness?.configured && readiness?.webhookConfigured ? 'var(--green)' : '#b45309' }}>
                              {readiness?.configured && readiness?.webhookConfigured
                                ? 'Ready for production testing'
                                : `Setup required${readiness?.missingConfiguration?.length ? `: ${readiness.missingConfiguration.join(', ')}` : ''}`}
                            </div>
                          </label>
                        )
                      })}
                    </div>
                    <div className="form-help" style={{ marginTop: 10 }}>
                      The saved gateway is used for new portal package payments, subscriptions, SMS-credit purchases, wallet top-ups, and withdrawals. Existing pending transactions keep their original provider.
                    </div>
                    {platformForm.gatewayReadiness?.providers[selectedGateway] ? (
                      <div style={{ marginTop: 12, padding: 12, border: '1px solid var(--border)', borderRadius: 10, background: 'var(--bg-subtle)' }}>
                        <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 5 }}>Callback URLs to register with {selectedGateway === 'IOTEC_PAY' ? 'ioTec Pay' : 'Yo! Uganda'}</div>
                        <div className="form-help" style={{ overflowWrap: 'anywhere' }}>Collection: {platformForm.gatewayReadiness.providers[selectedGateway].collectionCallbackUrl}</div>
                        <div className="form-help" style={{ overflowWrap: 'anywhere' }}>Disbursement: {platformForm.gatewayReadiness.providers[selectedGateway].disbursementCallbackUrl}</div>
                        {selectedGateway === 'IOTEC_PAY' ? <div className="form-help" style={{ marginTop: 5 }}>Security header: X-Webhook-Secret (use the same value stored as IOTEC_WEBHOOK_SECRET in Coolify).</div> : null}
                      </div>
                    ) : null}
                    <button type="button" className="btn btn-secondary" onClick={() => void testActiveGateway()} disabled={gatewayTesting || platformForm.paymentGateway !== selectedGateway} style={{ marginTop: 12 }}>
                      {gatewayTesting ? 'Testing gateway…' : 'Test active gateway'}
                    </button>
                    {platformForm.paymentGateway !== selectedGateway ? <div className="form-help" style={{ marginTop: 5 }}>Save this tab before testing the newly selected gateway.</div> : null}
                    {gatewayTestMessage ? <div style={{ marginTop: 8, color: 'var(--green)', fontSize: 12.5, fontWeight: 650 }}>{gatewayTestMessage}</div> : null}
                  </div>""",
    sentinel="Callback URLs to register with",
)

print('Live gateway activation checks applied.')
