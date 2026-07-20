'use client'

import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { clientFetchApi, clientPatchApi, clientPostApi } from '@/lib/client-api'
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
  key: 'FREE' | 'PRO' | 'ENTERPRISE'
  name: string
  amountUgx: number
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
  subscriptionStatus: 'ACTIVE' | 'PENDING_PAYMENT' | 'SKIPPED'
  pendingPlan: string | null
  paidUntil: string | null
  checkout: SubscriptionCheckoutState
}

const PLAN_CARD_META: Record<string, { price: string; desc: string; color: string; badge?: string }> = {
  FREE: { price: 'UGX 0 / Month', desc: 'Perfect for testing and small operations starting out.', color: '#64748b' },
  PRO: {
    price: 'UGX 20,000 / Month',
    desc: 'For growing ISPs wanting lower fees and branding control.',
    color: 'var(--green)',
    badge: 'Recommended',
  },
  ENTERPRISE: {
    price: 'UGX 70,000 / Month',
    desc: 'For professional, large-scale networks and operators.',
    color: '#8b5cf6',
  },
}

const tabs = ['Business Profile', 'Appearance', 'Payment & Fees', 'Withdrawals', 'Router & Portal', 'Voucher Printing', 'Password', 'Security', 'Subscription Plan'] as const
const tabLabels: Record<(typeof tabs)[number], string> = {
  'Business Profile': 'Profile',
  Appearance: 'Themes',
  'Payment & Fees': 'Payment',
  Withdrawals: 'Withdrawals',
  'Router & Portal': 'Router & Portal',
  'Voucher Printing': 'Voucher Printing',
  Password: 'Password',
  Security: 'Security',
  'Subscription Plan': 'Plan',
}
const tabDescriptions: Record<(typeof tabs)[number], string> = {
  'Business Profile': 'Business identity, branding, and support contacts.',
  Appearance: 'Dashboard appearance and customer WiFi login page themes.',
  'Payment & Fees': 'Payment methods, collection routes, and applicable fees.',
  Withdrawals: 'Payout limits, fees, approval rules, and safety controls.',
  'Router & Portal': 'Router connection behavior and customer portal defaults.',
  'Voucher Printing': 'Default voucher layout and redemption behavior.',
  Password: 'Change your account password and close other remembered sessions.',
  Security: 'Account email, device binding, verification, and operating terms.',
  'Subscription Plan': 'View or change the plan for this business.',
}
const providerOptions = ['MTN_MOMO_DIRECT', 'AIRTEL_MONEY_DIRECT', 'AGGREGATOR']
const portalTemplates = ['classic']
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
      startPolling()
    } catch (caught) {
      setCheckoutLoading(false)
      setCheckoutError(caught instanceof Error ? caught.message : 'Unable to start payment.')
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

  useEffect(() => {
    const requestedTab = searchParams.get('tab')
    if (tabs.includes(requestedTab as (typeof tabs)[number])) {
      setActiveTab(requestedTab as (typeof tabs)[number])
    }
  }, [searchParams])

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
      if (activeTab === 'Business Profile') {
        Object.assign(payload, {
          businessName: stringValue(form, 'businessName'),
          logoUrl: stringValue(form, 'logoUrl'),
          brandColor: stringValue(form, 'brandColor'),
          portalTemplate: stringValue(form, 'portalTemplate'),
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
      setMessage('Business settings saved and audit logged.')
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
              <p style={{ color: 'var(--text-3)', fontSize: 13, lineHeight: 1.5, margin: '0 0 18px' }}>
                Choose one accent for the public website, sign-in pages, and dashboard.
              </p>
              <ThemeToggle />
            </div>

            <div className="card">
              <div className="card-header">
                <span className="card-title">WiFi Login Page Theme</span>
                <span className="badge badge-success">Customer portal</span>
              </div>
              <p style={{ color: 'var(--text-3)', fontSize: 13, lineHeight: 1.5, margin: '0 0 18px' }}>
                Select the captive portal theme customers see when buying access, redeeming vouchers, logging in, or checking session usage.
              </p>
              <Link href="/admin/settings/templates" className="btn btn-primary">
                Open WiFi Login Page Themes
              </Link>
            </div>
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
                  <Input name="proMobileMoneyFeePercent" label="Mobile Money Fee %" defaultValue={platformForm.proMobileMoneyFeePercent} />
                  <Input name="proVoucherFeePercent" label="Voucher Fee %" defaultValue={platformForm.proVoucherFeePercent} />
                  <FormSubheading text="Enterprise Plan Commission" />
                  <Input name="enterpriseMobileMoneyFeePercent" label="Mobile Money Fee %" defaultValue={platformForm.enterpriseMobileMoneyFeePercent} />
                  <Input name="enterpriseVoucherFeePercent" label="Voucher Fee %" defaultValue={platformForm.enterpriseVoucherFeePercent} />
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
                  <FormSubheading text="Disbursement Routes" />
                  <Select name="mtnDisbursementProvider" label="MTN Disbursement Route" defaultValue={platformForm.mtnDisbursementProvider} options={providerOptions} />
                  <Select name="airtelDisbursementProvider" label="Airtel Disbursement Route" defaultValue={platformForm.airtelDisbursementProvider} options={providerOptions} />
                  <FormSubheading text="Approval Rules" />
                  <Input name="requireApprovalAboveAmountUgx" label="Review Withdrawals Above UGX" defaultValue={platformForm.requireApprovalAboveAmountUgx ?? ''} />
                  <Check name="instantWithdrawalsEnabled" label="Instant withdrawals enabled by default" defaultChecked={platformForm.instantWithdrawalsEnabled} />
                  <Check name="requireApprovalForFirstWithdrawal" label="Review first withdrawal" defaultChecked={platformForm.requireApprovalForFirstWithdrawal} />
                  <Check name="payoutNumberChangeRequiresApproval" label="Payout number changes require approval" defaultChecked={platformForm.payoutNumberChangeRequiresApproval} />
                  <Check name="requireWithdrawalApproval" label="Force review for every withdrawal" defaultChecked={platformForm.requireWithdrawalApproval} />
                  <FormSubheading text="Security Limits" />
                  <Input name="failedSecretAttemptsBeforeLock" label="Failed Secret Attempts Before Lock" defaultValue={platformForm.failedSecretAttemptsBeforeLock} />
                  <Input name="withdrawalLockMinutes" label="Withdrawal Lock Minutes" defaultValue={platformForm.withdrawalLockMinutes} />
                </>
              )}
              {activeTab === 'Router & Portal' && (
                <>
                  <Check name="routerAutoConnectEnabled" label="Enable router auto-connect after payment" defaultChecked={platformForm.routerAutoConnectEnabled} />
                  <TextArea name="captivePortalFallbackMessage" label="Captive Portal Fallback Message" defaultValue={platformForm.captivePortalFallbackMessage} />
                  <FormSubheading text="Router Limits by Plan" />
                  <Input name="freeRouterLimit" label="Starter Router Limit" defaultValue={platformForm.freeRouterLimit} />
                  <Input name="proRouterLimit" label="Pro Router Limit" defaultValue={platformForm.proRouterLimit} />
                  <Input name="enterpriseRouterLimit" label="Enterprise Router Limit (blank = unlimited)" defaultValue={platformForm.enterpriseRouterLimit ?? ''} />
                  <FormSubheading text="Analytics History Window by Plan (days)" />
                  <Input name="freeAnalyticsHistoryDays" label="Starter History (days)" defaultValue={platformForm.freeAnalyticsHistoryDays} />
                  <Input name="proAnalyticsHistoryDays" label="Pro History (days)" defaultValue={platformForm.proAnalyticsHistoryDays} />
                  <Input name="enterpriseAnalyticsHistoryDays" label="Enterprise History (days, blank = unlimited)" defaultValue={platformForm.enterpriseAnalyticsHistoryDays ?? ''} />
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
                  <Input name="logoUrl" label="Logo URL" defaultValue={tenantForm.logoUrl ?? tenant?.tenant.logoUrl ?? ''} />
                  <Input name="brandColor" label="Brand Color" defaultValue={tenantForm.brandColor ?? tenant?.tenant.brandColor ?? ''} />
                  <Select name="portalTemplate" label="Portal Template" defaultValue={tenantForm.portalTemplate ?? tenant?.tenant.portalTemplate ?? 'classic'} options={portalTemplates} />
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
                <ReadOnly label="Withdrawal Safety" value="Registered payout number, secret key, balance, minimum amount, and approval policy are enforced by the backend." />
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
                <p style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
                  {checkoutLoading || subStatus.checkout.status === 'PENDING' || subStatus.checkout.status === 'INITIATED'
                    ? 'Waiting for mobile money confirmation on your phone...'
                    : subStatus.checkout.statusMessage || subStatus.checkout.status}
                </p>
              ) : (
                <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'flex-end' }}>
                  <label className="form-group" style={{ flex: 1, minWidth: 180 }}>
                    <span className="form-label">Mobile Money Number</span>
                    <PhoneNumberField
                      value={planPhoneNumber}
                      onChange={setPlanPhoneNumber}
                      required
                      ugandaOnly
                      mobileOnly
                    />
                  </label>
                  <button type="button" className="btn btn-primary" disabled={checkoutLoading || !planPhoneNumber} onClick={handlePayNow}>
                    {checkoutLoading ? 'Sending prompt...' : 'Pay Now'}
                  </button>
                  <button type="button" className="btn btn-ghost" disabled={checkoutLoading} onClick={handleSkipPayment}>
                    Cancel
                  </button>
                </div>
              )}
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
              const isActivePlan = subStatus?.selectedPlan === plan.key
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
                      <span style={{ fontSize: 20, fontWeight: 900, color: meta.color }}>{meta.price}</span>
                    </div>
                    <p style={{ fontSize: 12.5, color: 'var(--text-secondary)', lineHeight: 1.4, marginBottom: 14 }}>
                      {meta.desc}
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
                      disabled={planSaving || isActivePlan || isPendingThisPlan}
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
                        cursor: isActivePlan ? 'default' : 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: 6
                      }}
                    >
                      {isActivePlan
                        ? 'Active Plan ✓'
                        : isPendingThisPlan
                          ? 'Awaiting payment...'
                          : planSaving
                            ? 'Updating...'
                            : `Select ${plan.name}`}
                    </button>
                  )}
                </div>
              )
            })}
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
        {options.map((option) => <option key={option} value={option}>{option.replace(/_/g, ' ')}</option>)}
      </select>
    </label>
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
