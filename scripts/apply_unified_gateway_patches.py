#!/usr/bin/env python3
"""Apply the single-platform-gateway architecture after the legacy ioTec patch.

The first patch script keeps old installations buildable. This second guarded
phase upgrades that generated source to one Platform Admin gateway selection:
Yo! Uganda, ioTec Pay, Pesapal, or direct MTN/Airtel APIs.
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


def replace_all(path: str, old: str, new: str) -> None:
    text = read(path)
    if old not in text:
        return
    write(path, text.replace(old, new))


def regex_once(path: str, pattern: str, replacement: str, *, sentinel: str | None = None) -> None:
    text = read(path)
    if sentinel and sentinel in text:
        return
    updated, count = re.subn(pattern, replacement, text, count=1, flags=re.S)
    if count != 1:
        raise RuntimeError(f"{path}: expected one regex match, found {count}: {pattern[:140]!r}")
    write(path, updated)


def insert_before(path: str, marker: str, block: str, sentinel: str) -> None:
    text = read(path)
    if sentinel in text:
        return
    count = text.count(marker)
    if count != 1:
        raise RuntimeError(f"{path}: expected one marker, found {count}: {marker!r}")
    write(path, text.replace(marker, block + marker, 1))


# ---------------------------------------------------------------------------
# Prisma schema and migration
# ---------------------------------------------------------------------------
schema = "apps/api/prisma/schema.prisma"
regex_once(
    schema,
    r"enum PaymentProvider \{.*?\}",
    """enum PaymentProvider {
  MTN_MOMO_DIRECT
  AIRTEL_MONEY_DIRECT
  AGGREGATOR
  YO_UGANDA
  PESAPAL
  IOTEC_PAY
}

enum PlatformPaymentGateway {
  YO_UGANDA
  IOTEC_PAY
  PESAPAL
  DIRECT_MNO
}""",
    sentinel="enum PlatformPaymentGateway {",
)
replace_once(
    schema,
    "  allowedPaymentNetworks     PaymentNetwork[] @default([MTN])\n",
    "  allowedPaymentNetworks     PaymentNetwork[] @default([MTN])\n  paymentGateway             PlatformPaymentGateway @default(YO_UGANDA)\n",
    sentinel="paymentGateway             PlatformPaymentGateway",
)

migration = ROOT / "apps/api/prisma/migrations/20260807020000_add_iotec_pay_and_pro_fee/migration.sql"
migration.write_text(
    '''ALTER TYPE "PaymentProvider" ADD VALUE IF NOT EXISTS 'YO_UGANDA';
ALTER TYPE "PaymentProvider" ADD VALUE IF NOT EXISTS 'IOTEC_PAY';
ALTER TYPE "PaymentProvider" ADD VALUE IF NOT EXISTS 'PESAPAL';

DO $$
BEGIN
  CREATE TYPE "PlatformPaymentGateway" AS ENUM (
    'YO_UGANDA',
    'IOTEC_PAY',
    'PESAPAL',
    'DIRECT_MNO'
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE "PlatformSetting"
  ADD COLUMN IF NOT EXISTS "paymentGateway" "PlatformPaymentGateway" NOT NULL DEFAULT 'YO_UGANDA';

UPDATE "PlatformSetting"
SET "paymentGateway" = CASE
  WHEN "mtnCollectionProvider"::text = 'IOTEC_PAY'
    OR "airtelCollectionProvider"::text = 'IOTEC_PAY'
    OR "mtnDisbursementProvider"::text = 'IOTEC_PAY'
    OR "airtelDisbursementProvider"::text = 'IOTEC_PAY'
    THEN 'IOTEC_PAY'::"PlatformPaymentGateway"
  WHEN "mtnCollectionProvider"::text = 'MTN_MOMO_DIRECT'
    AND "airtelCollectionProvider"::text = 'AIRTEL_MONEY_DIRECT'
    AND "mtnDisbursementProvider"::text = 'MTN_MOMO_DIRECT'
    AND "airtelDisbursementProvider"::text = 'AIRTEL_MONEY_DIRECT'
    THEN 'DIRECT_MNO'::"PlatformPaymentGateway"
  ELSE 'YO_UGANDA'::"PlatformPaymentGateway"
END
WHERE "id" = 'global';

ALTER TABLE "PlatformSetting"
  ALTER COLUMN "proMobileMoneyFeeBps" SET DEFAULT 400;

UPDATE "PlatformSetting"
SET "proMobileMoneyFeeBps" = 400
WHERE "id" = 'global'
  AND "proMobileMoneyFeeBps" = 300;
'''
)

# ---------------------------------------------------------------------------
# Platform settings API: one global gateway instead of four route selectors.
# ---------------------------------------------------------------------------
system = "apps/api/src/modules/system/system.service.ts"
replace_once(
    system,
    "  PaymentProvider,\n  PackageStatus,",
    "  PaymentProvider,\n  PlatformPaymentGateway,\n  PackageStatus,",
)
replace_once(
    system,
    "    if (dto.allowedPaymentNetworks !== undefined) data.allowedPaymentNetworks = this.sanitizeNetworks(dto.allowedPaymentNetworks)\n",
    """    if (dto.allowedPaymentNetworks !== undefined) data.allowedPaymentNetworks = this.sanitizeNetworks(dto.allowedPaymentNetworks)
    if (dto.paymentGateway !== undefined) {
      if (dto.paymentGateway === PlatformPaymentGateway.PESAPAL) {
        throw new BadRequestException(
          'Pesapal can collect payments, but universal activation is blocked until an approved Pesapal arbitrary payout API is configured for withdrawals.',
        )
      }
      data.paymentGateway = dto.paymentGateway
      const legacyRoutes = this.legacyProvidersForGateway(dto.paymentGateway)
      data.mtnCollectionProvider = legacyRoutes.mtnCollectionProvider
      data.airtelCollectionProvider = legacyRoutes.airtelCollectionProvider
      data.mtnDisbursementProvider = legacyRoutes.mtnDisbursementProvider
      data.airtelDisbursementProvider = legacyRoutes.airtelDisbursementProvider
    }
""",
    sentinel="legacyProvidersForGateway(dto.paymentGateway)",
)
replace_once(
    system,
    "        collectionMode: 'AUTOMATIC',\n",
    "        collectionMode: 'AUTOMATIC',\n        gateway: platformSettings.paymentGateway,\n",
    sentinel="gateway: platformSettings.paymentGateway",
)
replace_once(
    system,
    "    allowedPaymentNetworks: PaymentNetwork[]\n",
    "    allowedPaymentNetworks: PaymentNetwork[]\n    paymentGateway: PlatformPaymentGateway\n",
    sentinel="paymentGateway: PlatformPaymentGateway",
)
insert_before(
    system,
    "  private sanitizeProvider(provider: PaymentProvider) {",
    """  private legacyProvidersForGateway(gateway: PlatformPaymentGateway) {
    if (gateway === PlatformPaymentGateway.IOTEC_PAY) {
      return {
        mtnCollectionProvider: PaymentProvider.IOTEC_PAY,
        airtelCollectionProvider: PaymentProvider.IOTEC_PAY,
        mtnDisbursementProvider: PaymentProvider.IOTEC_PAY,
        airtelDisbursementProvider: PaymentProvider.IOTEC_PAY,
      }
    }
    if (gateway === PlatformPaymentGateway.PESAPAL) {
      return {
        mtnCollectionProvider: PaymentProvider.PESAPAL,
        airtelCollectionProvider: PaymentProvider.PESAPAL,
        mtnDisbursementProvider: PaymentProvider.PESAPAL,
        airtelDisbursementProvider: PaymentProvider.PESAPAL,
      }
    }
    if (gateway === PlatformPaymentGateway.DIRECT_MNO) {
      return {
        mtnCollectionProvider: PaymentProvider.MTN_MOMO_DIRECT,
        airtelCollectionProvider: PaymentProvider.AIRTEL_MONEY_DIRECT,
        mtnDisbursementProvider: PaymentProvider.MTN_MOMO_DIRECT,
        airtelDisbursementProvider: PaymentProvider.AIRTEL_MONEY_DIRECT,
      }
    }
    return {
      mtnCollectionProvider: PaymentProvider.YO_UGANDA,
      airtelCollectionProvider: PaymentProvider.YO_UGANDA,
      mtnDisbursementProvider: PaymentProvider.YO_UGANDA,
      airtelDisbursementProvider: PaymentProvider.YO_UGANDA,
    }
  }

""",
    "private legacyProvidersForGateway(",
)

# ---------------------------------------------------------------------------
# Customer package payments and card checkout.
# ---------------------------------------------------------------------------
payments = "apps/api/src/modules/payments/payments.service.ts"
replace_once(
    payments,
    "      paymentNetworks: availablePaymentNetworks,\n",
    """      paymentNetworks: availablePaymentNetworks,
      paymentGateway: readiness.gateway,
      paymentMethods: readiness.paymentMethods,
      paymentGatewayWarning: readiness.warning,
""",
    sentinel="paymentGateway: readiness.gateway",
)
regex_once(
    payments,
    r"    const network = dto\.network\n.*?    const phoneNumber = this\.phoneNumberService\.normalizeForNetwork\(dto\.phoneNumber, network\)\n",
    """    const network = dto.network
    const method = dto.paymentMethod ?? PaymentMethod.MOBILE_MONEY
    const platformSettings = await this.prisma.platformSetting.upsert({
      where: { id: PLATFORM_SETTINGS_ID },
      update: {},
      create: { id: PLATFORM_SETTINGS_ID },
    })
    const readiness = this.paymentRouterService.getProviderReadiness(platformSettings)
    if (method === PaymentMethod.CARD && !readiness.paymentMethods.includes(PaymentMethod.CARD)) {
      throw new BadRequestException('Card payment is not enabled for the selected platform gateway')
    }
    if (method === PaymentMethod.CARD && !dto.emailAddress?.trim()) {
      throw new BadRequestException('Enter an email address for secure card checkout')
    }
    const collectionProvider = this.paymentRouterService.resolveCollection(
      network,
      platformSettings.paymentGateway,
    )
    const provider = collectionProvider.provider
    const phoneNumber = this.phoneNumberService.normalizeForNetwork(dto.phoneNumber, network)
""",
    sentinel="platformSettings.paymentGateway,\n    )\n    const provider = collectionProvider.provider",
)
replace_once(
    payments,
    "        customerReference: dto.customerReference,\n        narrative: `${pkg.name} internet package`,",
    """        customerReference: dto.customerReference,
        payerName: dto.payerName,
        emailAddress: dto.emailAddress,
        method,
        narrative: `${pkg.name} internet package`,""",
    sentinel="emailAddress: dto.emailAddress",
)

# ---------------------------------------------------------------------------
# Wallet top-ups and every withdrawal use the same selected platform gateway.
# ---------------------------------------------------------------------------
wallets = "apps/api/src/modules/wallets/wallets.service.ts"
replace_all(
    wallets,
    """    const configuredProvider =
      payoutNumber.network === PaymentNetwork.MTN
        ? platformSettings.mtnDisbursementProvider
        : platformSettings.airtelDisbursementProvider
    const provider = this.paymentRouterService.resolveDisbursement(
      payoutNumber.network,
      configuredProvider,
    )""",
    """    const provider = this.paymentRouterService.resolveDisbursement(
      payoutNumber.network,
      platformSettings.paymentGateway,
    )""",
)
replace_all(
    wallets,
    """    const configuredProvider = disbursement.provider ?? (
      disbursement.network === PaymentNetwork.MTN
        ? platformSettings.mtnDisbursementProvider
        : platformSettings.airtelDisbursementProvider
    )""",
    "    const configuredProvider = disbursement.provider ?? platformSettings.paymentGateway",
)
replace_all(
    wallets,
    """    const configuredProvider =
      network === PaymentNetwork.MTN
        ? platformSettings.mtnCollectionProvider
        : platformSettings.airtelCollectionProvider
    const provider = this.paymentRouterService.resolveCollection(network, configuredProvider)""",
    "    const provider = this.paymentRouterService.resolveCollection(network, platformSettings.paymentGateway)",
)

# ---------------------------------------------------------------------------
# Pro subscriptions and SMS-credit purchases use the same gateway.
# ---------------------------------------------------------------------------
subscription = "apps/api/src/modules/subscription/subscription.service.ts"
replace_all(
    subscription,
    """    const configuredProvider =
      network === PaymentNetwork.MTN
        ? platformSettings.mtnCollectionProvider
        : platformSettings.airtelCollectionProvider
    const collectionProvider = this.paymentRouterService.resolveCollection(network, configuredProvider)""",
    "    const collectionProvider = this.paymentRouterService.resolveCollection(network, platformSettings.paymentGateway)",
)

sms = "apps/api/src/modules/sms/sms.service.ts"
replace_all(
    sms,
    """    const configuredProvider =
      network === PaymentNetwork.MTN
        ? platformSettings.mtnCollectionProvider
        : platformSettings.airtelCollectionProvider
    const provider = this.paymentRouterService.resolveCollection(network, configuredProvider)""",
    "    const provider = this.paymentRouterService.resolveCollection(network, platformSettings.paymentGateway)",
)

# Explicit provider identities replace the old generic AGGREGATOR label.
replace_all(
    "apps/api/src/modules/payments/yo-uganda-collection.service.ts",
    "readonly provider = PaymentProvider.AGGREGATOR",
    "readonly provider = PaymentProvider.YO_UGANDA",
)
replace_all(
    "apps/api/src/modules/payments/yo-uganda-disbursement.service.ts",
    "readonly provider = PaymentProvider.AGGREGATOR",
    "readonly provider = PaymentProvider.YO_UGANDA",
)

# ---------------------------------------------------------------------------
# Platform Admin UI: exactly four choices, one selector.
# ---------------------------------------------------------------------------
settings = "apps/admin-web/src/components/SettingsManager.tsx"
replace_once(
    settings,
    "  allowedPaymentNetworks: string[]\n",
    "  allowedPaymentNetworks: string[]\n  paymentGateway: 'YO_UGANDA' | 'IOTEC_PAY' | 'PESAPAL' | 'DIRECT_MNO'\n",
    sentinel="paymentGateway: 'YO_UGANDA'",
)
regex_once(
    settings,
    r"const providerOptions = \[[^\n]+\]",
    "const gatewayOptions = ['YO_UGANDA', 'IOTEC_PAY', 'PESAPAL', 'DIRECT_MNO']",
    sentinel="const gatewayOptions =",
)
replace_once(
    settings,
    "  IOTEC_PAY: 'ioTec Pay',\n  AGGREGATOR: 'Yo! Uganda / configured aggregator',\n  MTN_MOMO_DIRECT: 'MTN MoMo direct',\n  AIRTEL_MONEY_DIRECT: 'Airtel Money direct',\n",
    "  YO_UGANDA: 'Yo! Uganda',\n  IOTEC_PAY: 'ioTec Pay',\n  PESAPAL: 'Pesapal',\n  DIRECT_MNO: 'Direct MTN + Airtel',\n",
    sentinel="DIRECT_MNO: 'Direct MTN + Airtel'",
)
replace_once(
    settings,
    """          mtnCollectionProvider: stringValue(form, 'mtnCollectionProvider'),
          airtelCollectionProvider: stringValue(form, 'airtelCollectionProvider'),
          allowedPaymentNetworks:""",
    """          paymentGateway: stringValue(form, 'paymentGateway'),
          allowedPaymentNetworks:""",
    sentinel="paymentGateway: stringValue(form, 'paymentGateway')",
)
replace_all(
    settings,
    "          mtnDisbursementProvider: stringValue(form, 'mtnDisbursementProvider'),\n          airtelDisbursementProvider: stringValue(form, 'airtelDisbursementProvider'),\n",
    "",
)
replace_once(
    settings,
    """                  <FormSubheading text="Collection Routes" />
                  <Select name="mtnCollectionProvider" label="MTN Collection Route" defaultValue={platformForm.mtnCollectionProvider} options={providerOptions} />
                  <Select name="airtelCollectionProvider" label="Airtel Collection Route" defaultValue={platformForm.airtelCollectionProvider} options={providerOptions} />""",
    """                  <FormSubheading text="Platform Payment Gateway" />
                  <Select name="paymentGateway" label="Use one gateway for collections, card checkout, and withdrawals" defaultValue={platformForm.paymentGateway} options={gatewayOptions} />
                  <div className="form-group" style={{ gridColumn: '1 / -1' }}>
                    <div className="form-help">
                      Yo! Uganda, ioTec Pay, Pesapal, or Direct MTN + Airtel. The selected gateway is applied automatically to new package payments, subscriptions, wallet top-ups, and withdrawals. ioTec Pay also enables UGX Visa/Mastercard checkout. Pesapal cannot be activated as universal until its approved payout API is configured.
                    </div>
                  </div>""",
    sentinel="Use one gateway for collections, card checkout, and withdrawals",
)
replace_once(
    settings,
    """                  <FormSubheading text="Withdrawal Routes" />
                  <Select name="mtnDisbursementProvider" label="MTN Withdrawal Route" defaultValue={platformForm.mtnDisbursementProvider} options={providerOptions} />
                  <Select name="airtelDisbursementProvider" label="Airtel Withdrawal Route" defaultValue={platformForm.airtelDisbursementProvider} options={providerOptions} />""",
    """                  <FormSubheading text="Withdrawal Gateway" />
                  <ReadOnly label="Active Platform Gateway" value={optionLabels[platformForm.paymentGateway] ?? platformForm.paymentGateway} />""",
    sentinel="<ReadOnly label=\"Active Platform Gateway\"",
)
replace_all(settings, "providerOptions", "gatewayOptions")

# ---------------------------------------------------------------------------
# Customer portal: show card only when the active gateway supports it.
# ---------------------------------------------------------------------------
portal = "apps/portal-web/src/components/PortalCheckout.tsx"
replace_once(
    portal,
    "type MobileMoneyNetwork = 'MTN' | 'AIRTEL'\n",
    "type MobileMoneyNetwork = 'MTN' | 'AIRTEL'\ntype CheckoutPaymentMethod = 'MOBILE_MONEY' | 'CARD'\n",
    sentinel="type CheckoutPaymentMethod =",
)
replace_once(
    portal,
    "  const [selectedNetwork, setSelectedNetwork] = useState<MobileMoneyNetwork>('MTN')\n  const [phoneNumber, setPhoneNumber] = useState('')\n",
    "  const [selectedNetwork, setSelectedNetwork] = useState<MobileMoneyNetwork>('MTN')\n  const [selectedPaymentMethod, setSelectedPaymentMethod] = useState<CheckoutPaymentMethod>('MOBILE_MONEY')\n  const [emailAddress, setEmailAddress] = useState('')\n  const [phoneNumber, setPhoneNumber] = useState('')\n",
    sentinel="setSelectedPaymentMethod",
)
replace_once(
    portal,
    "  const availableNetworks = (context?.paymentNetworks?.length ? context.paymentNetworks : ['MTN']) as MobileMoneyNetwork[]\n",
    "  const availableNetworks = (context?.paymentNetworks?.length ? context.paymentNetworks : ['MTN']) as MobileMoneyNetwork[]\n  const availablePaymentMethods = (context?.paymentMethods?.length ? context.paymentMethods : ['MOBILE_MONEY']) as CheckoutPaymentMethod[]\n",
    sentinel="const availablePaymentMethods =",
)
replace_once(
    portal,
    """    if (!availableNetworks.includes(selectedNetwork)) {
      setErrorMessage(`${selectedNetwork === 'AIRTEL' ? 'Airtel' : 'MTN'} is not available for this portal right now.`)
      return
    }
""",
    """    if (selectedPaymentMethod === 'MOBILE_MONEY' && !availableNetworks.includes(selectedNetwork)) {
      setErrorMessage(`${selectedNetwork === 'AIRTEL' ? 'Airtel' : 'MTN'} is not available for this portal right now.`)
      return
    }
    if (selectedPaymentMethod === 'CARD' && !availablePaymentMethods.includes('CARD')) {
      setErrorMessage('Card payment is not enabled for the active payment gateway.')
      return
    }
    if (selectedPaymentMethod === 'CARD' && !emailAddress.trim()) {
      setErrorMessage('Enter your email address to continue to secure card payment.')
      return
    }
""",
    sentinel="Card payment is not enabled for the active payment gateway.",
)
replace_once(
    portal,
    "      const detectedNetwork = detectNetwork(normalizedPhone) ?? selectedNetwork\n",
    "      const detectedNetwork = detectNetwork(normalizedPhone) ?? selectedNetwork\n",
)
replace_once(
    portal,
    """          network: detectedNetwork,
          idempotencyKey:""",
    """          network: detectedNetwork,
          paymentMethod: selectedPaymentMethod,
          emailAddress: selectedPaymentMethod === 'CARD' ? emailAddress.trim() : undefined,
          payerName: customerReference || undefined,
          idempotencyKey:""",
    sentinel="paymentMethod: selectedPaymentMethod",
)
replace_once(
    portal,
    """      if (payment.status === 'FAILED') {
        setErrorMessage(sanitizeUserMessage(payment.statusMessage) || 'Payment request failed. Please try again.')
        return
      }

      // Yo! Uganda sends a direct USSD push""",
    """      if (payment.status === 'FAILED') {
        setErrorMessage(sanitizeUserMessage(payment.statusMessage) || 'Payment request failed. Please try again.')
        return
      }

      const checkoutUrl = extractCheckoutUrl(payment)
      if (checkoutUrl) {
        if (typeof window !== 'undefined') {
          window.localStorage.setItem(paymentReturnStorageKey, JSON.stringify({
            paymentId: payment.id,
            statusToken: payment.statusToken,
            phoneNumber: payment.phoneNumber,
            hotspotParams,
          }))
          window.location.assign(checkoutUrl)
        }
        return
      }

      // Push-based Mobile Money gateways do not require a hosted redirect.""",
    sentinel="window.location.assign(checkoutUrl)",
)
replace_once(
    portal,
    "    setStatusMessage('Payment request submitted. Check your phone to approve.')\n",
    "    setStatusMessage('Payment submitted. Confirming with the selected gateway…')\n",
)
replace_all(portal, "Select a package and pay with Mobile Money", "Select a package and choose a payment method")
replace_once(
    portal,
    """                    <div className="mt-3 flex flex-wrap items-center justify-center gap-3">
                      {(nets as MobileMoneyNetwork[]).map(n => <NetworkIcon key={n} network={n} />)}
                    </div>""",
    """                    <div className="mt-3 flex flex-wrap items-center justify-center gap-3">
                      {(nets as MobileMoneyNetwork[]).map(n => <NetworkIcon key={n} network={n} />)}
                      {availablePaymentMethods.includes('CARD') && (
                        <span className="inline-flex items-center justify-center rounded-xl bg-white px-3 py-2 text-xs font-black text-slate-800 shadow-sm ring-1 ring-slate-300">Visa / Mastercard · UGX</span>
                      )}
                    </div>""",
    sentinel="Visa / Mastercard · UGX",
)
replace_once(
    portal,
    """                    <form onSubmit={handlePaymentSubmit} className="mt-4 space-y-3">
                      {selectedIsTvPackage && (""",
    """                    <form onSubmit={handlePaymentSubmit} className="mt-4 space-y-3">
                      {availablePaymentMethods.includes('CARD') && (
                        <div className="grid grid-cols-2 gap-2 rounded-lg bg-slate-100 p-1">
                          <button type="button" onClick={() => setSelectedPaymentMethod('MOBILE_MONEY')} className={`rounded-md px-3 py-2 text-xs font-extrabold ${selectedPaymentMethod === 'MOBILE_MONEY' ? 'bg-white text-slate-950 shadow-sm' : 'text-slate-500'}`}>Mobile Money</button>
                          <button type="button" onClick={() => setSelectedPaymentMethod('CARD')} className={`rounded-md px-3 py-2 text-xs font-extrabold ${selectedPaymentMethod === 'CARD' ? 'bg-white text-slate-950 shadow-sm' : 'text-slate-500'}`}>Visa / Mastercard</button>
                        </div>
                      )}
                      {selectedIsTvPackage && (""",
    sentinel="setSelectedPaymentMethod('CARD')",
)
replace_once(
    portal,
    """                      {/* Network auto-detected by Yo! Uganda — selector hidden */}
                      <label className="block text-sm font-bold text-slate-700">
                        Mobile Money Number""",
    """                      {selectedPaymentMethod === 'CARD' && (
                        <label className="block text-sm font-bold text-slate-700">
                          Email for secure card checkout
                          <input type="email" value={emailAddress} onChange={(event) => setEmailAddress(event.target.value)} required className={`mt-2 w-full rounded-lg border bg-white px-3 py-3 text-base text-slate-950 outline-none focus:ring-2 ${portalStyle.input}`} placeholder="you@example.com" />
                        </label>
                      )}
                      <label className="block text-sm font-bold text-slate-700">
                        {selectedPaymentMethod === 'CARD' ? 'Phone number for internet access' : 'Mobile Money Number'}""",
    sentinel="Email for secure card checkout",
)
replace_once(
    portal,
    """                            onChange={(val) => {
                              setPhoneNumber(val)
                              const detected = detectNetwork(val)
                              if (detected) setSelectedNetwork(detected)
                            }}""",
    """                            onChange={(val) => {
                              setPhoneNumber(val)
                              const detected = detectNetwork(val)
                              if (detected) setSelectedNetwork(detected)
                            }}""",
)
replace_once(
    portal,
    """                          {detectNetwork(phoneNumber) && (
                            <div className="mt-2 flex justify-end">""",
    """                          {selectedPaymentMethod === 'MOBILE_MONEY' && detectNetwork(phoneNumber) && (
                            <div className="mt-2 flex justify-end">""",
    sentinel="selectedPaymentMethod === 'MOBILE_MONEY' && detectNetwork",
)
replace_once(
    portal,
    """                        ) : (
                          <><ArrowRight className="h-4 w-4" /> Pay with Mobile Money</>
                        )}""",
    """                        ) : selectedPaymentMethod === 'CARD' ? (
                          <><ArrowRight className="h-4 w-4" /> Continue to secure card payment</>
                        ) : (
                          <><ArrowRight className="h-4 w-4" /> Pay with Mobile Money</>
                        )}""",
    sentinel="Continue to secure card payment",
)

# Deployment configuration: one optional fallback environment value.
for env_path in [".env.example", ".env.vps.example"]:
    text = read(env_path)
    if "PAYMENT_GATEWAY=" not in text:
        text = text.rstrip() + "\n\n# Global gateway fallback; Platform Admin selection in the database takes precedence.\nPAYMENT_GATEWAY=YO_UGANDA\n"
    write(env_path, text)

print('Unified payment gateway and card checkout patches applied.')
