'use client'

import { useEffect, useMemo, useRef, useState, type ChangeEvent, type FormEvent } from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { clientFetchApi, clientPatchApi, clientPostApi } from '@/lib/client-api'
import { formatCurrency, formatDate, getStatusBadgeClass } from '@/lib/format'
import EmailChangeRequestCard from './EmailChangeRequestCard'
import PasswordChangeCard from './PasswordChangeCard'
import SupportContactChangePanel from './SupportContactChangePanel'
import ThemeToggle from './ThemeToggle'
import { PhoneNumberField, validatePhoneNumber } from './PhoneNumberField'

type AdminUser = {
  permissions: string[]
  tenantId?: string | null
}

type PlatformSettings = {
  mobileMoneyFeePercent: number
  voucherFeePercent: number
  proMobileMoneyFeePercent: number
  proVoucherFeePercent: number
  proSubscriptionPriceUgx: number
  proSubscriptionDurationDays: number
  proPlanEnabled: boolean
  proRenewalRule: string
  proGracePeriodDays: number
  subscriptionExpiryNotificationDays: string
  freePlanDescription: string
  proPlanDescription: string
  freePlanBenefits: string
  proPlanBenefits: string
  referralProgramEnabled: boolean
  resellerRegistrationEnabled: boolean
  referralCommissionPercent: number
  referralHoldingPeriodDays: number
  enterpriseMobileMoneyFeePercent: number
  enterpriseVoucherFeePercent: number
  freeRouterLimit: number
  proRouterLimit: number
  enterpriseRouterLimit?: number | null
  freeAnalyticsHistoryDays: number
  proAnalyticsHistoryDays: number
  enterpriseAnalyticsHistoryDays?: number | null
  minimumWithdrawalUgx: number
  withdrawalFeePercent: number
  withdrawalFlatFeeUgx: number
  requireWithdrawalApproval: boolean
  instantWithdrawalsEnabled: boolean
  requireApprovalForFirstWithdrawal: boolean
  requireApprovalAboveAmountUgx?: number | null
  failedSecretAttemptsBeforeLock: number
  withdrawalLockMinutes: number
  payoutNumberChangeRequiresApproval: boolean
  maxPayoutNumbers: number
  allowedPaymentNetworks: string[]
  mtnCollectionProvider: string
  airtelCollectionProvider: string
  mtnDisbursementProvider: string
  airtelDisbursementProvider: string
  routerAutoConnectEnabled: boolean
  captivePortalFallbackMessage: string
  supportPhone?: string | null
  supportEmail?: string | null
  supportUrl?: string | null
  voucherTemplateDefaultStyle: string
  auditLoggingEnabled: boolean
}

type TenantSettings = {
  tenant: {
    id: string
    name: string
    logoUrl?: string | null
    brandColor?: string | null
    portalTemplate?: string | null
    supportPhone?: string | null
    supportEmail?: string | null
  }
  settings: {
    tenantMobileMoneyFeePercent?: number | null
    tenantVoucherFeePercent?: number | null
    businessName?: string | null
    supportPhone?: string | null
    supportEmail?: string | null
    logoUrl?: string | null
    brandColor?: string | null
    portalTemplate?: string | null
    routerAutoConnectEnabled?: boolean | null
    voucherPrintDefaultTemplate?: string | null
    redeemableWhenGenerated: boolean
    allowDeviceReset: boolean
    maxResetsPerActivation: number
    supportText?: string | null
    kycCompleted?: boolean
    accountActive?: boolean
    fraudHold?: boolean
    termsAcceptedAt?: string | null
  }
  payment?: {
    acceptedNetworks: string[]
    collectionMode: 'AUTOMATIC'
    effectiveMobileMoneyFeePercent: number
    effectiveVoucherFeePercent: number
  }
}

type SubscriptionPlanCatalogItem = {
  key: 'FREE' | 'PRO'
  name: string
  amountUgx: number
  durationDays?: number
  enabled?: boolean
  description?: string
  renewalRule?: string
  gracePeriodDays?: number
  expiryNotificationDays?: string
  routerLimit: string
  features: string[]
  commissionSummary: string
}

type SubscriptionCheckoutState = {
  status: string
  statusMessage?: string | null
  amountUgx: number
  plan: string
} | null

type SubscriptionStatus = {
  selectedPlan: string
  currentPlan?: string
  planSelectionConfirmed: boolean
  subscriptionStatus: 'ACTIVE' | 'PENDING_PAYMENT' | 'SKIPPED'
  pendingPlan: string | null
  paidUntil: string | null
  remainingDays?: number | null
  downgradeScheduledAt?: string | null
  downgradeEffectiveAt?: string | null
  lastPaymentPhoneNumber?: string | null
  checkout: SubscriptionCheckoutState
  payments?: Array<{
    id: string
    plan: string
    status: string
    amountUgx: number
    durationDays: number
    network: string
    phoneNumber: string
    externalReference: string
    providerReference?: string | null
    statusMessage?: string | null
    initiatedAt: string
    completedAt?: string | null
    failedAt?: string | null
    createdAt: string
  }>
}

const PLAN_CARD_META: Record<string, { price: string; desc: string; color: string; badge?: string }> = {
  FREE: { price: 'UGX 0 / Month', desc: 'Perfect for testing and small operations starting out.', color: '#64748b' },
  PRO: {
    price: 'UGX 20,000 / Month',
    desc: 'For growing ISPs wanting lower fees and branding control.',
    color: 'var(--green)',
    badge: 'Recommended',
  },
}

function planPriceLabel(plan: SubscriptionPlanCatalogItem) {
  if (plan.amountUgx <= 0) return 'No subscription payment'
  return `${formatCurrency(plan.amountUgx)} / ${plan.durationDays ?? 30} days`
}

const tabs = ['Business Profile', 'Appearance', 'Payment & Fees', 'Withdrawals', 'Router & Portal', 'Voucher Printing', 'Password', 'Security', 'Subscription Plan'] as const
const tabLabels: Record<(typeof tabs)[number], string> = {
  'Business Profile': 'Business Info',
  Appearance: 'Appearance',
  'Payment & Fees': 'Payments & Fees',
  Withdrawals: 'Withdrawals',
  'Router & Portal': 'Router & Portal',
  'Voucher Printing': 'Voucher Printing',
  Password: 'Password',
  Security: 'Account Safety',
  'Subscription Plan': 'My Plan',
}
const tabDescriptions: Record<(typeof tabs)[number], string> = {
  'Business Profile': 'Your business name, logo, and customer support contact.',
  Appearance: 'Dashboard appearance and WiFi login page look.',
  'Payment & Fees': 'See what customers can pay with and the service fees applied.',
  Withdrawals: 'Platform payout limits, review rules, and safety controls.',
  'Router & Portal': 'Router connection and customer portal defaults.',
  'Voucher Printing': 'Voucher print format and redemption defaults.',
  Password: 'Change the password used to sign in.',
  Security: 'Protect your account, email, devices, and business terms.',
  'Subscription Plan': 'See or change the plan for this business.',
}
const vendorTabs: Array<(typeof tabs)[number]> = ['Business Profile', 'Appearance', 'Payment & Fees', 'Password', 'Security', 'Subscription Plan']
const providerOptions = ['MTN_MOMO_DIRECT', 'AIRTEL_MONEY_DIRECT', 'AGGREGATOR']
const renewalRuleOptions = ['MANUAL_RENEWAL', 'AUTO_RENEWAL_WHEN_AVAILABLE', 'DISABLED']
const portalTemplates = ['classic', 'fresh', 'sunrise']
const brandColorOptions = ['#2563EB', '#15803D', '#B7791F', '#F97316', '#0F172A', 'custom']
const optionLabels: Record<string, string> = {
  classic: 'Blue',
  fresh: 'Green',
  sunrise: 'Gold',
  '#2563EB': 'Blue',
  '#15803D': 'Green',
  '#B7791F': 'Gold',
  '#F97316': 'Orange',
  '#0F172A': 'Navy',
  custom: 'Custom hex code',
}
const voucherTemplates = ['signal', 'wave', 'receipt', 'agent', 'thermal']

export default function SettingsManager({
  user,
  isVendor,
  initialPlatformSettings,
  initialTenantSettings,
  initialSubscriptionPlans,
  initialSubscriptionStatus,
}: {
  user: AdminUser
  isVendor: boolean
  initialPlatformSettings: PlatformSettings | null
  initialTenantSettings: TenantSettings | null
  initialSubscriptionPlans: SubscriptionPlanCatalogItem[]
  initialSubscriptionStatus: SubscriptionStatus | null
}) {
  const searchParams = useSearchParams()
  const isDevAdmin = user.permissions.includes('ALL')
  const [activeTab, setActiveTab] = useState<(typeof tabs)[number]>('Business Profile')
  const [platform, setPlatform] = useState(initialPlatformSettings)
  const [tenant, setTenant] = useState(initialTenantSettings)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const [subscriptionPlans] = useState(initialSubscriptionPlans)
  const [subStatus, setSubStatus] = useState(initialSubscriptionStatus)
  const [planSaving, setPlanSaving] = useState(false)
  const [planPhoneNumber, setPlanPhoneNumber] = useState('')
  const [planPaymentModalOpen, setPlanPaymentModalOpen] = useState(false)
  const [checkoutLoading, setCheckoutLoading] = useState(false)
  const [checkoutError, setCheckoutError] = useState('')
  const pollRef = useRef<number | null>(null)

  useEffect(() => {
    return () => {
      if (pollRef.current) window.clearInterval(pollRef.current)
    }
  }, [])

  function stopPolling() {
    if (pollRef.current) {
      window.clearInterval(pollRef.current)
      pollRef.current = null
    }
  }

  function startPolling() {
    stopPolling()
    pollRef.current = window.setInterval(async () => {
      try {
        const statusResponse = await clientFetchApi<SubscriptionStatus>('/subscription/checkout/status')
        setSubStatus(statusResponse)

        const checkoutPaymentStatus = statusResponse.checkout?.status
        if (statusResponse.subscriptionStatus === 'ACTIVE' && !statusResponse.checkout) {
          stopPolling()
          setCheckoutLoading(false)
          setMessage(`Payment confirmed! You're now on the ${statusResponse.selectedPlan} plan.`)
        } else if (statusResponse.subscriptionStatus === 'PENDING_PAYMENT' && !statusResponse.checkout) {
          stopPolling()
          setCheckoutLoading(false)
          setCheckoutError('Payment was not completed. Retry with the same number or enter a different Mobile Money number.')
        } else if (checkoutPaymentStatus === 'FAILED' || checkoutPaymentStatus === 'CANCELLED' || checkoutPaymentStatus === 'EXPIRED') {
          stopPolling()
          setCheckoutLoading(false)
          setCheckoutError(statusResponse.checkout?.statusMessage || 'Payment was not completed. Please try again.')
        }
      } catch {
        // transient network errors are common while waiting on a mobile money prompt - keep polling
      }
    }, 4000)
  }

  useEffect(() => {
    const status = subStatus?.checkout?.status
    if (!isVendor || !status) return
    if (status === 'PENDING' || status === 'INITIATED' || status === 'INDETERMINATE') {
      setCheckoutLoading(true)
      startPolling()
    }
  }, [isVendor, subStatus?.checkout?.status])

  async function handleSelectPlan(planKey: string) {
    setPlanSaving(true)
    setCheckoutError('')
    setMessage('')
    setError('')
    try {
      const statusResponse = await clientPostApi<SubscriptionStatus>('/subscription/select', { plan: planKey })
      setSubStatus(statusResponse)
      if (planKey === 'FREE') {
        setMessage('Switched to the Starter (Free) plan.')
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not change plan')
    } finally {
      setPlanSaving(false)
    }
  }

  async function handlePayNow() {
    setCheckoutError('')
    const phoneError = validatePhoneNumber(planPhoneNumber, true, true)
    if (phoneError) {
      setCheckoutError(phoneError)
      return
    }
    setCheckoutLoading(true)
    try {
      const statusResponse = await clientPostApi<SubscriptionStatus>('/subscription/checkout', { phoneNumber: planPhoneNumber })
      setSubStatus(statusResponse)
      setPlanPaymentModalOpen(false)
      startPolling()
    } catch (caught) {
      setCheckoutLoading(false)
      setCheckoutError(caught instanceof Error ? caught.message : 'Unable to start payment.')
    }
  }

  async function handleRefreshCheckoutStatus() {
    setCheckoutError('')
    setCheckoutLoading(true)
    try {
      const statusResponse = await clientFetchApi<SubscriptionStatus>('/subscription/checkout/status')
      setSubStatus(statusResponse)
      if (statusResponse.subscriptionStatus === 'ACTIVE' && !statusResponse.checkout) {
        setMessage(`Payment confirmed! You're now on the ${statusResponse.selectedPlan} plan.`)
        stopPolling()
      } else if (statusResponse.subscriptionStatus === 'PENDING_PAYMENT' && !statusResponse.checkout) {
        setCheckoutError('Payment was not completed. Retry with the same number or enter a different Mobile Money number.')
        stopPolling()
      }
    } catch (caught) {
      setCheckoutError(caught instanceof Error ? caught.message : 'Unable to check payment status.')
    } finally {
      setCheckoutLoading(false)
    }
  }

  async function handleSkipPayment() {
    setCheckoutError('')
    try {
      const statusResponse = await clientPostApi<SubscriptionStatus>('/subscription/skip', {})
      setSubStatus(statusResponse)
    } catch (caught) {
      setCheckoutError(caught instanceof Error ? caught.message : 'Unable to cancel checkout.')
    }
  }

  const effectiveMobileFee =
    tenant?.payment?.effectiveMobileMoneyFeePercent ??
    tenant?.settings.tenantMobileMoneyFeePercent ??
    platform?.mobileMoneyFeePercent ??
    7
  const effectiveVoucherFee =
    tenant?.payment?.effectiveVoucherFeePercent ??
    tenant?.settings.tenantVoucherFeePercent ??
    platform?.voucherFeePercent ??
    2
  const visibleTabs = isDevAdmin ? tabs : vendorTabs

  useEffect(() => {
    const requestedTab = searchParams.get('tab')
    const normalizedTab = requestedTab === 'Themes' ? 'Appearance' : requestedTab
    const nextTab = tabs.includes(normalizedTab as (typeof tabs)[number])
      ? normalizedTab as (typeof tabs)[number]
      : 'Business Profile'
    if (visibleTabs.includes(nextTab)) {
      setActiveTab(nextTab)
    } else {
      setActiveTab('Business Profile')
    }
  }, [searchParams, visibleTabs])

  async function savePlatform(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!platform) return
    setSaving(true)
    setMessage('')
    setError('')
    try {
      const form = new FormData(event.currentTarget)
      // Only the active tab's inputs are mounted in this form. Scoping the
      // payload to that same tab (instead of reading every key unconditionally)
      // stops a save on e.g. "Withdrawals" from sending mobileMoneyFeePercent: 0
      // for fields that simply aren't rendered right now, which would silently
      // zero out the other tabs' settings.
      const payload: Record<string, unknown> = {}
      if (activeTab === 'Payment & Fees') {
        Object.assign(payload, {
          mobileMoneyFeePercent: numberValue(form, 'mobileMoneyFeePercent'),
          voucherFeePercent: numberValue(form, 'voucherFeePercent'),
          proMobileMoneyFeePercent: numberValue(form, 'proMobileMoneyFeePercent'),
          proVoucherFeePercent: numberValue(form, 'proVoucherFeePercent'),
          proSubscriptionPriceUgx: numberValue(form, 'proSubscriptionPriceUgx'),
          proSubscriptionDurationDays: numberValue(form, 'proSubscriptionDurationDays'),
          proPlanEnabled: form.get('proPlanEnabled') === 'on',
          proRenewalRule: stringValue(form, 'proRenewalRule'),
          proGracePeriodDays: numberValue(form, 'proGracePeriodDays'),
          subscriptionExpiryNotificationDays: stringValue(form, 'subscriptionExpiryNotificationDays'),
          freePlanDescription: stringValue(form, 'freePlanDescription'),
          proPlanDescription: stringValue(form, 'proPlanDescription'),
          freePlanBenefits: stringValue(form, 'freePlanBenefits'),
          proPlanBenefits: stringValue(form, 'proPlanBenefits'),
          referralProgramEnabled: form.get('referralProgramEnabled') === 'on',
          resellerRegistrationEnabled: form.get('resellerRegistrationEnabled') === 'on',
          referralCommissionPercent: numberValue(form, 'referralCommissionPercent'),
          referralHoldingPeriodDays: numberValue(form, 'referralHoldingPeriodDays'),
          enterpriseMobileMoneyFeePercent: numberValue(form, 'enterpriseMobileMoneyFeePercent'),
          enterpriseVoucherFeePercent: numberValue(form, 'enterpriseVoucherFeePercent'),
          mtnCollectionProvider: stringValue(form, 'mtnCollectionProvider'),
          airtelCollectionProvider: stringValue(form, 'airtelCollectionProvider'),
          allowedPaymentNetworks: ['MTN', 'AIRTEL'].filter((network) => form.get(`network-${network}`) === 'on'),
        })
      }
      if (activeTab === 'Withdrawals') {
        Object.assign(payload, {
          minimumWithdrawalUgx: numberValue(form, 'minimumWithdrawalUgx'),
          withdrawalFeePercent: numberValue(form, 'withdrawalFeePercent'),
          withdrawalFlatFeeUgx: numberValue(form, 'withdrawalFlatFeeUgx'),
          requireWithdrawalApproval: form.get('requireWithdrawalApproval') === 'on',
          instantWithdrawalsEnabled: form.get('instantWithdrawalsEnabled') === 'on',
          requireApprovalForFirstWithdrawal: form.get('requireApprovalForFirstWithdrawal') === 'on',
          requireApprovalAboveAmountUgx: nullableNumberValue(form, 'requireApprovalAboveAmountUgx'),
          failedSecretAttemptsBeforeLock: numberValue(form, 'failedSecretAttemptsBeforeLock'),
          withdrawalLockMinutes: numberValue(form, 'withdrawalLockMinutes'),
          payoutNumberChangeRequiresApproval: form.get('payoutNumberChangeRequiresApproval') === 'on',
          maxPayoutNumbers: numberValue(form, 'maxPayoutNumbers'),
          mtnDisbursementProvider: stringValue(form, 'mtnDisbursementProvider'),
          airtelDisbursementProvider: stringValue(form, 'airtelDisbursementProvider'),
        })
      }
      if (activeTab === 'Router & Portal') {
        Object.assign(payload, {
          routerAutoConnectEnabled: form.get('routerAutoConnectEnabled') === 'on',
          captivePortalFallbackMessage: stringValue(form, 'captivePortalFallbackMessage'),
          freeRouterLimit: numberValue(form, 'freeRouterLimit'),
          proRouterLimit: numberValue(form, 'proRouterLimit'),
          enterpriseRouterLimit: nullableNumberValue(form, 'enterpriseRouterLimit'),
          freeAnalyticsHistoryDays: numberValue(form, 'freeAnalyticsHistoryDays'),
          proAnalyticsHistoryDays: numberValue(form, 'proAnalyticsHistoryDays'),
          enterpriseAnalyticsHistoryDays: nullableNumberValue(form, 'enterpriseAnalyticsHistoryDays'),
        })
      }
      if (activeTab === 'Voucher Printing') {
        Object.assign(payload, {
          voucherTemplateDefaultStyle: stringValue(form, 'voucherTemplateDefaultStyle'),
        })
      }
      if (activeTab === 'Security') {
        Object.assign(payload, {
          auditLoggingEnabled: form.get('auditLoggingEnabled') === 'on',
        })
      }
      if (activeTab === 'Business Profile') {
        Object.assign(payload, {
          supportPhone: stringValue(form, 'supportPhone'),
          supportEmail: stringValue(form, 'supportEmail'),
          supportUrl: stringValue(form, 'supportUrl'),
        })
      }
      const saved = await clientPatchApi<PlatformSettings>('/system/settings', payload)
      setPlatform(saved)
      setMessage('Platform settings saved and audit logged.')
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not save settings')
    } finally {
      setSaving(false)
    }
  }

  async function saveTenant(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!tenant) return
    setSaving(true)
    setMessage('')
    setError('')
    try {
      const form = new FormData(event.currentTarget)
      // Same reasoning as savePlatform: only the active tab's inputs are
      // mounted, so the payload must be scoped to that tab or saving one tab
      // would silently blank out every other tab's vendor settings.
      const payload: Record<string, unknown> = {}
      if (activeTab === 'Appearance') {
        Object.assign(payload, {
          portalTemplate: stringValue(form, 'portalTemplate'),
        })
      }
      if (activeTab === 'Business Profile') {
        Object.assign(payload, {
          businessName: stringValue(form, 'businessName'),
          logoUrl: stringValue(form, 'logoUrl'),
          brandColor: stringValue(form, 'brandColor'),
          // Support phone/email are Dev-Admin-only here — vendors request
          // changes via SupportContactChangePanel instead (see below).
          ...(isDevAdmin
            ? {
                supportPhone: stringValue(form, 'supportPhone'),
                supportEmail: stringValue(form, 'supportEmail'),
              }
            : {}),
        })
      }
      if (activeTab === 'Payment & Fees' && isDevAdmin) {
        Object.assign(payload, {
          tenantMobileMoneyFeePercent: nullableNumberValue(form, 'tenantMobileMoneyFeePercent'),
          tenantVoucherFeePercent: nullableNumberValue(form, 'tenantVoucherFeePercent'),
        })
      }
      if (activeTab === 'Router & Portal') {
        Object.assign(payload, {
          routerAutoConnectEnabled: form.get('routerAutoConnectEnabled') === 'on',
          supportText: stringValue(form, 'supportText'),
        })
      }
      if (activeTab === 'Voucher Printing') {
        Object.assign(payload, {
          voucherPrintDefaultTemplate: stringValue(form, 'voucherPrintDefaultTemplate'),
          redeemableWhenGenerated: form.get('redeemableWhenGenerated') === 'on',
        })
      }
      if (activeTab === 'Security') {
        Object.assign(payload, {
          allowDeviceReset: form.get('allowDeviceReset') === 'on',
          maxResetsPerActivation: numberValue(form, 'maxResetsPerActivation'),
          termsAccepted: form.get('termsAccepted') === 'on',
          ...(isDevAdmin
            ? {
                kycCompleted: form.get('kycCompleted') === 'on',
                accountActive: form.get('accountActive') === 'on',
                fraudHold: form.get('fraudHold') === 'on',
              }
            : {}),
        })
      }
      const tenantQuery = isDevAdmin ? `?tenantId=${tenant.tenant.id}` : ''
      const saved = await clientPatchApi<TenantSettings>(`/system/tenant-settings${tenantQuery}`, payload)
      setTenant(saved)
      setMessage(activeTab === 'Appearance' ? 'Customer login theme saved.' : 'Business settings saved and audit logged.')
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not save settings')
    } finally {
      setSaving(false)
    }
  }

  const platformForm = useMemo(() => platform, [platform])
  const tenantForm = useMemo(() => tenant?.settings, [tenant])

  return (
    <>
      <div className="page-header">
        <div>
          <h1 className="page-title">Settings / {tabLabels[activeTab]}</h1>
          <p className="page-subtitle">{tabDescriptions[activeTab]}</p>
        </div>
      </div>

      {message && <div className="badge badge-success" style={{ marginBottom: 14 }}>{message}</div>}
      {error && <div className="badge badge-danger" style={{ marginBottom: 14 }}>{error}</div>}

      <div className="settings-grid">
        {activeTab === 'Appearance' && (
          <>
            <div className="card">
              <div className="card-header">
                <span className="card-title">Theme</span>
                <span className="badge badge-info">This device</span>
              </div>
              <div className="settings-card-body">
                <p style={{ color: 'var(--text-3)', fontSize: 13, lineHeight: 1.5, margin: '0 0 20px' }}>
                  Choose one accent for the public website, sign-in pages, and dashboard.
                </p>
                <ThemeToggle />
              </div>
            </div>

            <div className="card">
              <div className="card-header">
                <span className="card-title">WiFi Login Page Designer</span>
                <span className="badge badge-success">Customer portal</span>
              </div>
              <div className="settings-card-body">
                <p style={{ color: 'var(--text-3)', fontSize: 13, lineHeight: 1.5, margin: '0 0 20px' }}>
                  Edit the full customer login page customers see when buying access, redeeming vouchers, logging in, or checking session usage.
                </p>
                <Link href="/admin/settings/templates" className="btn btn-primary">
                  Open WiFi Login Page Designer
                </Link>
              </div>
            </div>

            {tenantForm && (
              <form className="card" onSubmit={saveTenant}>
                <div className="card-header">
                  <span className="card-title">Customer Login Page Theme</span>
                  <span className="badge badge-success">Every plan</span>
                </div>
                <div className="settings-card-body">
                  <p style={{ color: 'var(--text-3)', fontSize: 13, lineHeight: 1.5, margin: '0 0 18px' }}>
                    Choose the simple preset customers see on the WiFi login page. This is separate from your business profile and is not locked to Pro.
                  </p>
                  <div className="form-grid">
                    <Select name="portalTemplate" label="Customer Login Theme" defaultValue={tenantForm.portalTemplate ?? tenant?.tenant.portalTemplate ?? 'classic'} options={portalTemplates} />
                  </div>
                  <button className="btn btn-primary" disabled={saving} style={{ marginTop: 18 }}>{saving ? 'Saving...' : 'Save Customer Login Theme'}</button>
                </div>
              </form>
            )}
          </>
        )}

        {isDevAdmin && platformForm && activeTab !== 'Subscription Plan' && activeTab !== 'Appearance' && activeTab !== 'Password' && (
          <form className="card" onSubmit={savePlatform}>
            <div className="card-header">
              <span className="card-title">Dev Admin Platform Controls</span>
              <span className="badge badge-info">Global defaults</span>
            </div>
            <div className="form-grid">
              {activeTab === 'Payment & Fees' && (
                <>
                  <FormSubheading text="Starter Plan Commission (applies to every business by default)" />
                  <Input name="mobileMoneyFeePercent" label="Mobile Money Fee %" defaultValue={platformForm.mobileMoneyFeePercent} />
                  <Input name="voucherFeePercent" label="Voucher Fee %" defaultValue={platformForm.voucherFeePercent} />
                  <FormSubheading text="Pro Plan Commission" />
                  <Check name="proPlanEnabled" label="Pro plan enabled" defaultChecked={platformForm.proPlanEnabled} />
                  <Input name="proMobileMoneyFeePercent" label="Mobile Money Fee %" defaultValue={platformForm.proMobileMoneyFeePercent} />
                  <Input name="proVoucherFeePercent" label="Voucher Fee %" defaultValue={platformForm.proVoucherFeePercent} />
                  <Input name="proSubscriptionPriceUgx" label="Subscription Price UGX" defaultValue={platformForm.proSubscriptionPriceUgx} />
                  <Input name="proSubscriptionDurationDays" label="Subscription Duration Days" defaultValue={platformForm.proSubscriptionDurationDays} />
                  <Select name="proRenewalRule" label="Renewal Rule" defaultValue={platformForm.proRenewalRule} options={renewalRuleOptions} />
                  <Input name="proGracePeriodDays" label="Grace Period Days" defaultValue={platformForm.proGracePeriodDays} />
                  <Input name="subscriptionExpiryNotificationDays" label="Expiry Notice Days" defaultValue={platformForm.subscriptionExpiryNotificationDays} />
                  <TextArea name="freePlanDescription" label="Starter Description" defaultValue={platformForm.freePlanDescription} />
                  <TextArea name="proPlanDescription" label="Pro Description" defaultValue={platformForm.proPlanDescription} />
                  <TextArea name="freePlanBenefits" label="Starter Benefits (use | between benefits)" defaultValue={platformForm.freePlanBenefits} />
                  <TextArea name="proPlanBenefits" label="Pro Benefits (use | between benefits)" defaultValue={platformForm.proPlanBenefits} />
                  <FormSubheading text="Referral Programme" />
                  <Check name="referralProgramEnabled" label="Enable referral programme" defaultChecked={platformForm.referralProgramEnabled} />
                  <Check name="resellerRegistrationEnabled" label="Allow reseller account registration" defaultChecked={platformForm.resellerRegistrationEnabled} />
                  <Input name="referralCommissionPercent" label="Referral Commission %" defaultValue={platformForm.referralCommissionPercent} />
                  <Input name="referralHoldingPeriodDays" label="Referral Holding Period Days" defaultValue={platformForm.referralHoldingPeriodDays} />
                  <FormSubheading text="Collection Routes" />
                  <Select name="mtnCollectionProvider" label="MTN Collection Route" defaultValue={platformForm.mtnCollectionProvider} options={providerOptions} />
                  <Select name="airtelCollectionProvider" label="Airtel Collection Route" defaultValue={platformForm.airtelCollectionProvider} options={providerOptions} />
                  <FormSubheading text="Customer Portal Networks" />
                  <Check name="network-MTN" label="Allow MTN on customer portal" defaultChecked={platformForm.allowedPaymentNetworks.includes('MTN')} />
                  <Check name="network-AIRTEL" label="Allow Airtel on customer portal" defaultChecked={platformForm.allowedPaymentNetworks.includes('AIRTEL')} />
                </>
              )}
              {activeTab === 'Withdrawals' && (
                <>
                  <FormSubheading text="Fees & Minimum" />
                  <Input name="minimumWithdrawalUgx" label="Minimum Withdrawal UGX" defaultValue={platformForm.minimumWithdrawalUgx} />
                  <Input name="withdrawalFeePercent" label="Withdrawal Fee %" defaultValue={platformForm.withdrawalFeePercent} />
                  <Input name="withdrawalFlatFeeUgx" label="Withdrawal Flat Fee UGX" defaultValue={platformForm.withdrawalFlatFeeUgx} />
                  <Input name="maxPayoutNumbers" label="Max Payout Numbers" defaultValue={platformForm.maxPayoutNumbers} />
                  <FormSubheading text="Withdrawal Routes" />
                  <Select name="mtnDisbursementProvider" label="MTN Withdrawal Route" defaultValue={platformForm.mtnDisbursementProvider} options={providerOptions} />
                  <Select name="airtelDisbursementProvider" label="Airtel Withdrawal Route" defaultValue={platformForm.airtelDisbursementProvider} options={providerOptions} />
                  <FormSubheading text="Automatic Payout Safety" />
                  <Input name="requireApprovalAboveAmountUgx" label="Hold only withdrawals above UGX" defaultValue={platformForm.requireApprovalAboveAmountUgx ?? ''} />
                  <Check name="instantWithdrawalsEnabled" label="Pay verified withdrawals automatically" defaultChecked={platformForm.instantWithdrawalsEnabled} />
                  <Check name="requireApprovalForFirstWithdrawal" label="Hold first withdrawal for safety check" defaultChecked={platformForm.requireApprovalForFirstWithdrawal} />
                  <Check name="payoutNumberChangeRequiresApproval" label="Payout number changes require approval" defaultChecked={platformForm.payoutNumberChangeRequiresApproval} />
                  <Check name="requireWithdrawalApproval" label="Emergency mode: hold every withdrawal" defaultChecked={platformForm.requireWithdrawalApproval} />
                  <FormSubheading text="Security Limits" />
                  <Input name="failedSecretAttemptsBeforeLock" label="Failed Withdrawal Code Attempts Before Lock" defaultValue={platformForm.failedSecretAttemptsBeforeLock} />
                  <Input name="withdrawalLockMinutes" label="Withdrawal Lock Minutes" defaultValue={platformForm.withdrawalLockMinutes} />
                </>
              )}
              {activeTab === 'Router & Portal' && (
                <>
                  <Check name="routerAutoConnectEnabled" label="Enable router auto-connect after payment" defaultChecked={platformForm.routerAutoConnectEnabled} />
                  <TextArea name="captivePortalFallbackMessage" label="Captive Portal Fallback Message" defaultValue={platformForm.captivePortalFallbackMessage} />
                  <FormSubheading text="Router Policy by Plan" />
                  <input type="hidden" name="freeRouterLimit" value={platformForm.freeRouterLimit} />
                  <input type="hidden" name="proRouterLimit" value={platformForm.proRouterLimit} />
                  <ReadOnly label="Starter Routers" value="Unlimited" />
                  <ReadOnly label="Pro Routers" value="Unlimited" />
                  <FormSubheading text="Analytics History Window by Plan (days)" />
                  <Input name="freeAnalyticsHistoryDays" label="Starter History (days)" defaultValue={platformForm.freeAnalyticsHistoryDays} />
                  <Input name="proAnalyticsHistoryDays" label="Pro History (days)" defaultValue={platformForm.proAnalyticsHistoryDays} />
                </>
              )}
              {activeTab === 'Voucher Printing' && (
                <Select name="voucherTemplateDefaultStyle" label="Default Voucher Style" defaultValue={platformForm.voucherTemplateDefaultStyle === 'signal-card' ? 'signal' : platformForm.voucherTemplateDefaultStyle} options={voucherTemplates} />
              )}
              {activeTab === 'Security' && (
                <>
                  <FormSubheading text="Audit" />
                  <Check name="auditLoggingEnabled" label="Audit logging enabled" defaultChecked={platformForm.auditLoggingEnabled} />
                </>
              )}
              {activeTab === 'Business Profile' && (
                <>
                  <Input name="supportPhone" label="Platform Support Phone" defaultValue={platformForm.supportPhone ?? ''} />
                  <Input name="supportEmail" label="Platform Support Email" defaultValue={platformForm.supportEmail ?? ''} />
                  <Input name="supportUrl" label="Platform Support URL" defaultValue={platformForm.supportUrl ?? ''} />
                </>
              )}
            </div>
            <button className="btn btn-primary" disabled={saving} style={{ marginTop: 18 }}>{saving ? 'Saving...' : 'Save Platform Settings'}</button>
          </form>
        )}

        {tenantForm && activeTab === 'Payment & Fees' && !isDevAdmin && (
          <div className="card">
            <div className="card-header">
              <span className="card-title">Customer Payment Setup</span>
              <span className="badge badge-success">Connected</span>
            </div>
            <p style={{ color: 'var(--text-2)', fontSize: 13, lineHeight: 1.55, margin: '0 0 18px' }}>
              AROFi collects customer payments automatically and activates internet access after confirmation.
              Payment provider routes are securely managed by AROFi, so there is nothing to configure here.
            </p>
            <div className="form-grid">
              <ReadOnly label="MTN Mobile Money" value={tenant?.payment?.acceptedNetworks.includes('MTN') ? 'Enabled' : 'Unavailable'} />
              <ReadOnly label="Airtel Money" value={tenant?.payment?.acceptedNetworks.includes('AIRTEL') ? 'Enabled' : 'Unavailable'} />
              <ReadOnly label="Mobile Money Service Fee" value={String(effectiveMobileFee) + '% per successful payment'} />
              <ReadOnly label="Voucher Service Fee" value={String(effectiveVoucherFee) + '% per redeemed voucher'} />
            </div>
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 18 }}>
              <Link href="/transactions" className="btn btn-primary">View Transactions</Link>
              <Link href="/settings?tab=Subscription%20Plan" className="btn btn-ghost">View Plan Details</Link>
            </div>
          </div>
        )}

        {tenantForm && activeTab !== 'Subscription Plan' && activeTab !== 'Appearance' && activeTab !== 'Password' && (activeTab !== 'Payment & Fees' || isDevAdmin) && (
          <form className="card" onSubmit={saveTenant}>
            <div className="card-header">
              <span className="card-title">Business Settings</span>
              <span className="badge badge-success">Persisted</span>
            </div>
            <div className="form-grid">
              {activeTab === 'Business Profile' && (
                <>
                  <Input name="businessName" label="Business Name" defaultValue={tenantForm.businessName ?? tenant?.tenant.name ?? ''} />
                  {isDevAdmin ? (
                    <>
                      <Input name="supportPhone" label="Support Phone" defaultValue={tenantForm.supportPhone ?? tenant?.tenant.supportPhone ?? ''} />
                      <Input name="supportEmail" label="Support Email" defaultValue={tenantForm.supportEmail ?? tenant?.tenant.supportEmail ?? ''} />
                    </>
                  ) : (
                    <>
                      <ReadOnly label="Support Phone" value={tenantForm.supportPhone ?? tenant?.tenant.supportPhone ?? 'Not set'} />
                      <ReadOnly label="Support Email" value={tenantForm.supportEmail ?? tenant?.tenant.supportEmail ?? 'Not set'} />
                    </>
                  )}
                  <LogoUploadField defaultValue={tenantForm.logoUrl ?? tenant?.tenant.logoUrl ?? ''} />
                  <BrandColorField defaultValue={tenantForm.brandColor ?? tenant?.tenant.brandColor ?? '#2563EB'} />
                </>
              )}
              {activeTab === 'Payment & Fees' && (
                <>
                  <ReadOnly label="Effective Mobile Money Fee" value={`${effectiveMobileFee}%`} />
                  <ReadOnly label="Effective Voucher Fee" value={`${effectiveVoucherFee}%`} />
                  {isDevAdmin && <Input name="tenantMobileMoneyFeePercent" label="Business Mobile Money Override %" defaultValue={tenantForm.tenantMobileMoneyFeePercent ?? ''} />}
                  {isDevAdmin && <Input name="tenantVoucherFeePercent" label="Business Voucher Override %" defaultValue={tenantForm.tenantVoucherFeePercent ?? ''} />}
                </>
              )}
              {activeTab === 'Router & Portal' && (
                <>
                  <Check name="routerAutoConnectEnabled" label="Auto-connect after payment or voucher redemption" defaultChecked={tenantForm.routerAutoConnectEnabled ?? true} />
                  <TextArea name="supportText" label="Portal Support Text" defaultValue={tenantForm.supportText ?? ''} />
                </>
              )}
              {activeTab === 'Voucher Printing' && (
                <>
                  <Select name="voucherPrintDefaultTemplate" label="Default Voucher Template" defaultValue={tenantForm.voucherPrintDefaultTemplate ?? 'signal'} options={voucherTemplates} />
                  <Check name="redeemableWhenGenerated" label="Generated vouchers can be redeemed before sale posting" defaultChecked={tenantForm.redeemableWhenGenerated} />
                </>
              )}
              {activeTab === 'Security' && (
                <>
                  <FormSubheading text="Device Resets" />
                  <Check name="allowDeviceReset" label="Allow device binding resets" defaultChecked={tenantForm.allowDeviceReset} />
                  <Input name="maxResetsPerActivation" label="Max resets per activation" defaultValue={tenantForm.maxResetsPerActivation ?? 0} />
                  {isDevAdmin && (
                    <>
                      <FormSubheading text="Dev Admin Account Controls" />
                      <Check name="kycCompleted" label="Business verification complete" defaultChecked={tenantForm.kycCompleted ?? true} />
                      <Check name="accountActive" label="Business account active" defaultChecked={tenantForm.accountActive ?? true} />
                      <Check name="fraudHold" label="Put business withdrawals on fraud hold" defaultChecked={tenantForm.fraudHold ?? false} />
                    </>
                  )}
                  <FormSubheading text="Terms" />
                  <Check name="termsAccepted" label="Accept current business operating terms" defaultChecked={Boolean(tenantForm.termsAcceptedAt)} />
                </>
              )}
              {activeTab === 'Withdrawals' && (
                <ReadOnly label="Automatic Withdrawal Safety" value="Verified payout number, withdrawal code, wallet balance, minimum amount, and safety holds are checked before payout." />
              )}
            </div>
            <button className="btn btn-primary" disabled={saving} style={{ marginTop: 18 }}>{saving ? 'Saving...' : 'Save Business Settings'}</button>
          </form>
        )}
      </div>

      {activeTab === 'Password' && <PasswordChangeCard />}

      {activeTab === 'Security' && <EmailChangeRequestCard />}

      {activeTab === 'Business Profile' && !isDevAdmin && tenant && (
        <SupportContactChangePanel
          currentEmail={tenant.settings.supportEmail ?? tenant.tenant.supportEmail ?? ''}
          currentPhone={tenant.settings.supportPhone ?? tenant.tenant.supportPhone ?? ''}
        />
      )}

      {activeTab === 'Subscription Plan' && tenant && (
        <div className="card" style={{ padding: '24px 32px', animation: 'fadeIn 0.2s ease-out' }}>
          <div style={{ marginBottom: 24 }}>
            <h2 style={{ fontSize: 18, fontWeight: 800, color: 'var(--text-primary, #0f172a)' }}>Choose Your Platform Plan</h2>
            <p style={{ fontSize: 13, color: 'var(--text-secondary, #64748b)', marginTop: 4 }}>
              Select a billing tier that matches your network scale. Commission rates are set by AROFi and apply the moment payment confirms.
            </p>
            {!isVendor && (
              <p style={{ fontSize: 12.5, color: 'var(--text-muted)', marginTop: 8 }}>
                Viewing this business&apos;s plan as DevAdmin. Plan changes and payment must be initiated by the business owner from their own dashboard.
              </p>
            )}
          </div>

          {isVendor && subStatus?.subscriptionStatus === 'PENDING_PAYMENT' && subStatus.pendingPlan && (
            <div style={{
              border: '1px solid var(--border)',
              borderRadius: 12,
              padding: 18,
              marginBottom: 24,
              background: 'var(--bg-muted, #f8fafc)'
            }}>
              <h3 style={{ fontSize: 14, fontWeight: 700, marginBottom: 6 }}>
                Complete payment for the {subStatus.pendingPlan} plan
              </h3>
              {checkoutError && (
                <div className="badge badge-danger" style={{ marginBottom: 10 }}>{checkoutError}</div>
              )}
              {subStatus.checkout ? (
                <div style={{ display: 'grid', gap: 10 }}>
                  <p style={{ fontSize: 13, color: 'var(--text-secondary)', margin: 0 }}>
                    {checkoutLoading || subStatus.checkout.status === 'PENDING' || subStatus.checkout.status === 'INITIATED'
                      ? 'Waiting for mobile money confirmation on your phone...'
                      : subStatus.checkout.statusMessage || subStatus.checkout.status}
                  </p>
                  <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                    <button type="button" className="btn btn-primary" disabled={checkoutLoading} onClick={handleRefreshCheckoutStatus}>
                      {checkoutLoading ? 'Checking...' : 'Check Status'}
                    </button>
                    <button type="button" className="btn btn-ghost" disabled={checkoutLoading} onClick={() => setSubStatus({ ...subStatus, checkout: null })}>
                      Change Number
                    </button>
                  </div>
                </div>
              ) : (
                <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
                  <button type="button" className="btn btn-primary" disabled={checkoutLoading} onClick={() => setPlanPaymentModalOpen(true)}>
                    {checkoutLoading ? 'Sending prompt...' : 'Pay Now'}
                  </button>
                  <button type="button" className="btn btn-ghost" disabled={checkoutLoading} onClick={handleSkipPayment}>
                    Cancel
                  </button>
                </div>
              )}
            </div>
          )}

          {subStatus && (
            <div className="form-grid" style={{ marginBottom: 24 }}>
              <ReadOnly label="Current Plan" value={subStatus.currentPlan ?? subStatus.selectedPlan ?? 'FREE'} />
              <ReadOnly label="Status" value={subStatus.subscriptionStatus.replace(/_/g, ' ')} />
              <ReadOnly label="Expiry Date" value={subStatus.paidUntil ? formatDate(subStatus.paidUntil) : 'No paid expiry'} />
              <ReadOnly label="Days Remaining" value={subStatus.remainingDays === null || subStatus.remainingDays === undefined ? 'Not applicable' : String(subStatus.remainingDays)} />
              <ReadOnly label="Payment Number" value={subStatus.lastPaymentPhoneNumber ?? 'Not saved yet'} />
              <ReadOnly label="Downgrade Date" value={subStatus.downgradeEffectiveAt ? formatDate(subStatus.downgradeEffectiveAt) : 'Not scheduled'} />
            </div>
          )}

          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
            gap: 20,
            marginBottom: 24
          }}>
            {subscriptionPlans.map((plan) => {
              const meta = PLAN_CARD_META[plan.key] ?? PLAN_CARD_META.FREE
              const isActivePlan = (subStatus?.currentPlan ?? subStatus?.selectedPlan) === plan.key
              const isPendingThisPlan = subStatus?.pendingPlan === plan.key
              return (
                <div
                  key={plan.key}
                  style={{
                    border: isActivePlan ? `2px solid ${meta.color}` : '1px solid var(--border)',
                    borderRadius: 12,
                    padding: 20,
                    background: isActivePlan ? 'var(--bg-muted, #f8fafc)' : 'var(--bg-card, #ffffff)',
                    position: 'relative',
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'space-between',
                    boxShadow: isActivePlan ? '0 10px 25px -5px rgba(0, 0, 0, 0.1), var(--shadow-md)' : 'none',
                    transition: 'all 0.2s ease-in-out'
                  }}
                >
                  {meta.badge && (
                    <span style={{
                      position: 'absolute',
                      top: -12,
                      left: '50%',
                      transform: 'translateX(-50%)',
                      background: meta.color,
                      color: '#fff',
                      padding: '4px 10px',
                      borderRadius: 12,
                      fontSize: 10,
                      fontWeight: 800,
                      textTransform: 'uppercase',
                      letterSpacing: '0.05em'
                    }}>
                      {meta.badge}
                    </span>
                  )}

                  <div>
                    <h3 style={{ fontSize: 16, fontWeight: 800, color: 'var(--text-1)' }}>{plan.name}</h3>
                    <div style={{ margin: '12px 0' }}>
                      <span style={{ fontSize: 20, fontWeight: 900, color: meta.color }}>{planPriceLabel(plan)}</span>
                    </div>
                    <p style={{ fontSize: 12.5, color: 'var(--text-secondary)', lineHeight: 1.4, marginBottom: 14 }}>
                      {plan.description || meta.desc}
                    </p>

                    <div style={{ borderTop: '1px solid var(--border)', paddingTop: 12, marginBottom: 14 }}>
                      <div style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: 6 }}>
                        COMMISSION RATES
                      </div>
                      <div style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--text-1)' }}>{plan.commissionSummary}</div>
                    </div>

                    <div style={{ borderTop: '1px solid var(--border)', paddingTop: 12, marginBottom: 14 }}>
                      <div style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: 6 }}>
                        ROUTER LIMIT
                      </div>
                      <div style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--text-1)' }}>{plan.routerLimit}</div>
                    </div>

                    <div style={{ borderTop: '1px solid var(--border)', paddingTop: 12, marginBottom: 16 }}>
                      <div style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: 6 }}>
                        INCLUDED FEATURES
                      </div>
                      <ul style={{ margin: 0, paddingLeft: 16, fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.5 }}>
                        {plan.features.map((f, i) => (
                          <li key={i}>{f}</li>
                        ))}
                      </ul>
                    </div>
                  </div>

                  {isVendor && (
                    <button
                      type="button"
                      disabled={planSaving || plan.enabled === false}
                      onClick={() => handleSelectPlan(plan.key)}
                      className="btn"
                      style={{
                        width: '100%',
                        padding: '10px 14px',
                        borderRadius: 8,
                        fontSize: 13,
                        fontWeight: 600,
                        backgroundColor: isActivePlan ? meta.color : 'transparent',
                        color: isActivePlan ? '#fff' : 'var(--text-1)',
                        border: isActivePlan ? 'none' : '1px solid var(--border)',
                        cursor: plan.enabled === false ? 'not-allowed' : 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: 6
                      }}
                    >
                      {isActivePlan
                        ? plan.key === 'PRO' && subStatus?.downgradeEffectiveAt ? 'Keep Pro' : plan.key === 'PRO' ? 'Renew Pro' : 'Active Plan'
                        : isPendingThisPlan
                          ? 'Pay Pro'
                          : plan.enabled === false
                            ? 'Unavailable'
                          : planSaving
                            ? 'Updating...'
                            : `Select ${plan.name}`}
                    </button>
                  )}
                </div>
              )
            })}
          </div>

          {subStatus?.downgradeEffectiveAt && (
            <div className="badge badge-warning" style={{ marginBottom: 18 }}>
              Downgrade to Starter is scheduled for {formatDate(subStatus.downgradeEffectiveAt)}. Paid Pro days remain active until then.
            </div>
          )}

          <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
            <div className="card-header" style={{ padding: '16px 18px' }}>
              <span className="card-title">Payment History</span>
              <span className="badge badge-info">{subStatus?.payments?.length ?? 0} records</span>
            </div>
            <div style={{ overflowX: 'auto' }}>
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Plan</th>
                    <th>Status</th>
                    <th>Amount</th>
                    <th>Phone</th>
                    <th>Reference</th>
                    <th>Started</th>
                    <th>Completed</th>
                  </tr>
                </thead>
                <tbody>
                  {(subStatus?.payments ?? []).map((payment) => (
                    <tr key={payment.id}>
                      <td>{payment.plan}</td>
                      <td><span className={getStatusBadgeClass(payment.status)}>{payment.status.replace(/_/g, ' ')}</span></td>
                      <td>{formatCurrency(payment.amountUgx)}</td>
                      <td>{payment.phoneNumber}</td>
                      <td>{payment.providerReference ?? payment.externalReference}</td>
                      <td>{formatDate(payment.initiatedAt)}</td>
                      <td>{payment.completedAt ? formatDate(payment.completedAt) : payment.failedAt ? formatDate(payment.failedAt) : '-'}</td>
                    </tr>
                  ))}
                  {(!subStatus?.payments || subStatus.payments.length === 0) && (
                    <tr>
                      <td colSpan={7} style={{ color: 'var(--text-muted)', textAlign: 'center', padding: 18 }}>No subscription payments yet.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {planPaymentModalOpen && subStatus?.pendingPlan && (
        <div className="modal-overlay" onClick={() => !checkoutLoading && setPlanPaymentModalOpen(false)}>
          <div className="modal-card" style={{ width: 'min(520px, calc(100vw - 32px))' }} onClick={(event) => event.stopPropagation()}>
            <div style={{ display: 'grid', gap: 4, borderBottom: '1px solid var(--border)', paddingBottom: 14, marginBottom: 16 }}>
              <h3 style={{ margin: 0, fontSize: 18, fontWeight: 800 }}>Pay {subStatus.pendingPlan} plan</h3>
              <p style={{ margin: 0, fontSize: 13, color: 'var(--text-secondary)' }}>Enter the Mobile Money number that should receive the approval prompt.</p>
            </div>
            {checkoutError && <div className="badge badge-danger" style={{ marginBottom: 12 }}>{checkoutError}</div>}
            <label className="form-group">
              <span className="form-label">Mobile Money Number</span>
              <PhoneNumberField
                value={planPhoneNumber}
                onChange={setPlanPhoneNumber}
                required
                ugandaOnly
                mobileOnly
                autoFocus
              />
            </label>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 18 }}>
              <button type="button" className="btn btn-ghost" disabled={checkoutLoading} onClick={() => setPlanPaymentModalOpen(false)}>Cancel</button>
              <button type="button" className="btn btn-primary" disabled={checkoutLoading || !planPhoneNumber} onClick={handlePayNow}>
                {checkoutLoading ? 'Sending prompt...' : 'Send Payment Prompt'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}

function Input({ name, label, defaultValue }: { name: string; label: string; defaultValue: string | number }) {
  if (name.toLowerCase().includes('phone')) {
    return (
      <label className="form-group">
        <span className="form-label">{label}</span>
        <PhoneNumberField name={name} defaultValue={String(defaultValue)} />
      </label>
    )
  }
  return (
    <label className="form-group">
      <span className="form-label">{label}</span>
      <input className="form-input" name={name} defaultValue={defaultValue} />
    </label>
  )
}

function TextArea({ name, label, defaultValue }: { name: string; label: string; defaultValue: string }) {
  return (
    <label className="form-group">
      <span className="form-label">{label}</span>
      <textarea className="form-input" name={name} defaultValue={defaultValue} rows={4} />
    </label>
  )
}

function Select({ name, label, defaultValue, options }: { name: string; label: string; defaultValue: string; options: string[] }) {
  return (
    <label className="form-group">
      <span className="form-label">{label}</span>
      <select className="form-input" name={name} defaultValue={defaultValue}>
        {options.map((option) => <option key={option} value={option}>{optionLabels[option] ?? option.replace(/_/g, ' ')}</option>)}
      </select>
    </label>
  )
}

function LogoUploadField({ defaultValue }: { defaultValue: string }) {
  const [logoValue, setLogoValue] = useState(defaultValue)
  const [fileName, setFileName] = useState('')

  function handleLogoFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    if (!file) return
    setFileName(file.name)
    const reader = new FileReader()
    reader.onload = () => setLogoValue(typeof reader.result === 'string' ? reader.result : '')
    reader.readAsDataURL(file)
  }

  return (
    <div className="form-group">
      <span className="form-label">Upload Logo</span>
      <input type="hidden" name="logoUrl" value={logoValue} />
      <label className="upload-box">
        <input type="file" accept="image/png,image/jpeg,image/webp,image/svg+xml" onChange={handleLogoFile} />
        <span className="upload-box-title">{fileName || (logoValue ? 'Logo selected' : 'Choose logo file')}</span>
        <span className="upload-box-hint">PNG, JPG, WebP or SVG. Recommended square logo.</span>
      </label>
      {logoValue && (
        <div className="brand-preview-row">
          <img src={logoValue} alt="Uploaded business logo preview" />
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => { setLogoValue(''); setFileName('') }}>
            Remove
          </button>
        </div>
      )}
    </div>
  )
}

function BrandColorField({ defaultValue }: { defaultValue: string }) {
  const isPreset = brandColorOptions.includes(defaultValue)
  const [mode, setMode] = useState(isPreset ? defaultValue : 'custom')
  const [customColor, setCustomColor] = useState(isPreset ? '#2563EB' : defaultValue)
  const value = mode === 'custom' ? customColor : mode

  return (
    <div className="form-group">
      <span className="form-label">Brand Colour</span>
      <input type="hidden" name="brandColor" value={value} />
      <div className="brand-color-grid">
        <select className="form-input" value={mode} onChange={(event) => setMode(event.target.value)}>
          {brandColorOptions.map((option) => <option key={option} value={option}>{optionLabels[option]}</option>)}
        </select>
        <input className="form-input" type="color" value={value} onChange={(event) => { setMode('custom'); setCustomColor(event.target.value) }} />
      </div>
      {mode === 'custom' && (
        <input
          className="form-input"
          value={customColor}
          onChange={(event) => setCustomColor(event.target.value)}
          placeholder="#2563EB"
          pattern="^#[0-9A-Fa-f]{6}$"
          style={{ marginTop: 10 }}
        />
      )}
    </div>
  )
}

function Check({ name, label, defaultChecked }: { name: string; label: string; defaultChecked: boolean }) {
  return (
    <label className="check-card">
      <input type="checkbox" name={name} defaultChecked={defaultChecked} />
      <span>{label}</span>
    </label>
  )
}

function FormSubheading({ text }: { text: string }) {
  return <div className="form-subheading">{text}</div>
}

function ReadOnly({ label, value }: { label: string; value: string }) {
  return (
    <div className="metric-card">
      <div className="metric-label">{label}</div>
      <div className="metric-value">{value}</div>
    </div>
  )
}

function stringValue(form: FormData, key: string) {
  return String(form.get(key) ?? '').trim()
}

function numberValue(form: FormData, key: string) {
  return Number(form.get(key) ?? 0)
}

function nullableNumberValue(form: FormData, key: string) {
  const value = String(form.get(key) ?? '').trim()
  return value ? Number(value) : null
}
