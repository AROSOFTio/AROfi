'use client'

import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { useSearchParams } from 'next/navigation'
import { clientPatchApi } from '@/lib/client-api'

type AdminUser = {
  permissions: string[]
  tenantId?: string | null
}

type PlatformSettings = {
  mobileMoneyFeePercent: number
  voucherFeePercent: number
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
}

const tabs = ['Business Profile', 'Payment & Fees', 'Withdrawals', 'Router & Portal', 'Voucher Printing', 'Security', 'Subscription Plan'] as const
const providerOptions = ['MTN_MOMO_DIRECT', 'AIRTEL_MONEY_DIRECT', 'AGGREGATOR']
const portalTemplates = ['classic', 'fresh', 'midnight', 'sunrise', 'minimal']
const voucherTemplates = ['signal', 'wave', 'receipt', 'agent', 'thermal']

export default function SettingsManager({
  user,
  initialPlatformSettings,
  initialTenantSettings,
}: {
  user: AdminUser
  initialPlatformSettings: PlatformSettings | null
  initialTenantSettings: TenantSettings | null
}) {
  const searchParams = useSearchParams()
  const isDevAdmin = user.permissions.includes('ALL')
  const [activeTab, setActiveTab] = useState<(typeof tabs)[number]>('Business Profile')
  const [platform, setPlatform] = useState(initialPlatformSettings)
  const [tenant, setTenant] = useState(initialTenantSettings)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const [selectedPlan, setSelectedPlan] = useState<string>('FREE')

  useEffect(() => {
    if (tenant?.settings?.routerOnboardingPreferences) {
      const prefs = tenant.settings.routerOnboardingPreferences as Record<string, any>
      if (prefs.selectedPlan) {
        setSelectedPlan(prefs.selectedPlan)
      }
    }
  }, [tenant])

  async function changePlan(planKey: string) {
    if (!tenant) return
    setSaving(true)
    setMessage('')
    setError('')
    try {
      const payload = {
        routerOnboardingPreferences: {
          ...(tenant.settings.routerOnboardingPreferences as Record<string, any>),
          selectedPlan: planKey
        }
      }
      const tenantQuery = isDevAdmin ? `?tenantId=${tenant.tenant.id}` : ''
      const saved = await clientPatchApi<TenantSettings>(`/system/tenant-settings${tenantQuery}`, payload)
      setTenant(saved)
      setSelectedPlan(planKey)
      setMessage(`Successfully switched to the ${planKey} plan!`)
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not change plan')
    } finally {
      setSaving(false)
    }
  }

  const effectiveMobileFee = tenant?.settings.tenantMobileMoneyFeePercent ?? platform?.mobileMoneyFeePercent ?? 7
  const effectiveVoucherFee = tenant?.settings.tenantVoucherFeePercent ?? platform?.voucherFeePercent ?? 2

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
      const payload = {
        mobileMoneyFeePercent: numberValue(form, 'mobileMoneyFeePercent'),
        voucherFeePercent: numberValue(form, 'voucherFeePercent'),
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
        allowedPaymentNetworks: ['MTN', 'AIRTEL'].filter((network) => form.get(`network-${network}`) === 'on'),
        mtnCollectionProvider: stringValue(form, 'mtnCollectionProvider'),
        airtelCollectionProvider: stringValue(form, 'airtelCollectionProvider'),
        mtnDisbursementProvider: stringValue(form, 'mtnDisbursementProvider'),
        airtelDisbursementProvider: stringValue(form, 'airtelDisbursementProvider'),
        routerAutoConnectEnabled: form.get('routerAutoConnectEnabled') === 'on',
        captivePortalFallbackMessage: stringValue(form, 'captivePortalFallbackMessage'),
        supportPhone: stringValue(form, 'supportPhone'),
        supportEmail: stringValue(form, 'supportEmail'),
        supportUrl: stringValue(form, 'supportUrl'),
        voucherTemplateDefaultStyle: stringValue(form, 'voucherTemplateDefaultStyle'),
        auditLoggingEnabled: form.get('auditLoggingEnabled') === 'on',
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
      const payload = {
        businessName: stringValue(form, 'businessName'),
        supportPhone: stringValue(form, 'supportPhone'),
        supportEmail: stringValue(form, 'supportEmail'),
        logoUrl: stringValue(form, 'logoUrl'),
        brandColor: stringValue(form, 'brandColor'),
        portalTemplate: stringValue(form, 'portalTemplate'),
        routerAutoConnectEnabled: form.get('routerAutoConnectEnabled') === 'on',
        voucherPrintDefaultTemplate: stringValue(form, 'voucherPrintDefaultTemplate'),
        redeemableWhenGenerated: form.get('redeemableWhenGenerated') === 'on',
        allowDeviceReset: form.get('allowDeviceReset') === 'on',
        maxResetsPerActivation: numberValue(form, 'maxResetsPerActivation'),
        supportText: stringValue(form, 'supportText'),
        termsAccepted: form.get('termsAccepted') === 'on',
        ...(isDevAdmin
          ? {
              tenantMobileMoneyFeePercent: nullableNumberValue(form, 'tenantMobileMoneyFeePercent'),
              tenantVoucherFeePercent: nullableNumberValue(form, 'tenantVoucherFeePercent'),
              kycCompleted: form.get('kycCompleted') === 'on',
              accountActive: form.get('accountActive') === 'on',
              fraudHold: form.get('fraudHold') === 'on',
            }
          : {}),
      }
      const tenantQuery = isDevAdmin ? `?tenantId=${tenant.tenant.id}` : ''
      const saved = await clientPatchApi<TenantSettings>(`/system/tenant-settings${tenantQuery}`, payload)
      setTenant(saved)
      setMessage('Vendor settings saved and audit logged.')
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
          <h1 className="page-title">Settings</h1>
          <p className="page-subtitle">Audited platform and vendor configuration for fees, withdrawals, router auto-connect, and voucher printing.</p>
        </div>
      </div>

      <div className="tabs-bar" style={{ marginBottom: 18 }}>
        {tabs.map((tab) => (
          <button key={tab} type="button" className={`tab-button ${activeTab === tab ? 'active' : ''}`} onClick={() => setActiveTab(tab)}>
            {tab}
          </button>
        ))}
      </div>

      {message && <div className="badge badge-success" style={{ marginBottom: 14 }}>{message}</div>}
      {error && <div className="badge badge-danger" style={{ marginBottom: 14 }}>{error}</div>}

      <div className="settings-grid">
        {isDevAdmin && platformForm && activeTab !== 'Subscription Plan' && (
          <form className="card" onSubmit={savePlatform}>
            <div className="card-header">
              <span className="card-title">Dev Admin Platform Controls</span>
              <span className="badge badge-info">Global defaults</span>
            </div>
            <div className="form-grid">
              {activeTab === 'Payment & Fees' && (
                <>
                  <Input name="mobileMoneyFeePercent" label="Mobile Money Fee %" defaultValue={platformForm.mobileMoneyFeePercent} />
                  <Input name="voucherFeePercent" label="Voucher Fee %" defaultValue={platformForm.voucherFeePercent} />
                  <Select name="mtnCollectionProvider" label="MTN Collection Route" defaultValue={platformForm.mtnCollectionProvider} options={providerOptions} />
                  <Select name="airtelCollectionProvider" label="Airtel Collection Route" defaultValue={platformForm.airtelCollectionProvider} options={providerOptions} />
                  <Check name="network-MTN" label="Allow MTN on customer portal" defaultChecked={platformForm.allowedPaymentNetworks.includes('MTN')} />
                  <Check name="network-AIRTEL" label="Allow Airtel on customer portal when route is ready" defaultChecked={platformForm.allowedPaymentNetworks.includes('AIRTEL')} />
                </>
              )}
              {activeTab === 'Withdrawals' && (
                <>
                  <Input name="minimumWithdrawalUgx" label="Minimum Withdrawal UGX" defaultValue={platformForm.minimumWithdrawalUgx} />
                  <Input name="withdrawalFeePercent" label="Withdrawal Fee %" defaultValue={platformForm.withdrawalFeePercent} />
                  <Input name="withdrawalFlatFeeUgx" label="Withdrawal Flat Fee UGX" defaultValue={platformForm.withdrawalFlatFeeUgx} />
                  <Input name="maxPayoutNumbers" label="Max Payout Numbers" defaultValue={platformForm.maxPayoutNumbers} />
                  <Input name="requireApprovalAboveAmountUgx" label="Review Withdrawals Above UGX" defaultValue={platformForm.requireApprovalAboveAmountUgx ?? ''} />
                  <Input name="failedSecretAttemptsBeforeLock" label="Failed Secret Attempts Before Lock" defaultValue={platformForm.failedSecretAttemptsBeforeLock} />
                  <Input name="withdrawalLockMinutes" label="Withdrawal Lock Minutes" defaultValue={platformForm.withdrawalLockMinutes} />
                  <Select name="mtnDisbursementProvider" label="MTN Disbursement Route" defaultValue={platformForm.mtnDisbursementProvider} options={providerOptions} />
                  <Select name="airtelDisbursementProvider" label="Airtel Disbursement Route" defaultValue={platformForm.airtelDisbursementProvider} options={providerOptions} />
                  <Check name="instantWithdrawalsEnabled" label="Instant withdrawals enabled by default" defaultChecked={platformForm.instantWithdrawalsEnabled} />
                  <Check name="requireApprovalForFirstWithdrawal" label="Review first withdrawal" defaultChecked={platformForm.requireApprovalForFirstWithdrawal} />
                  <Check name="payoutNumberChangeRequiresApproval" label="Payout number changes require approval" defaultChecked={platformForm.payoutNumberChangeRequiresApproval} />
                  <Check name="requireWithdrawalApproval" label="Force review for every withdrawal" defaultChecked={platformForm.requireWithdrawalApproval} />
                </>
              )}
              {activeTab === 'Router & Portal' && (
                <>
                  <Check name="routerAutoConnectEnabled" label="Enable router auto-connect after payment" defaultChecked={platformForm.routerAutoConnectEnabled} />
                  <TextArea name="captivePortalFallbackMessage" label="Captive Portal Fallback Message" defaultValue={platformForm.captivePortalFallbackMessage} />
                </>
              )}
              {activeTab === 'Voucher Printing' && (
                <Select name="voucherTemplateDefaultStyle" label="Default Voucher Style" defaultValue={platformForm.voucherTemplateDefaultStyle === 'signal-card' ? 'signal' : platformForm.voucherTemplateDefaultStyle} options={voucherTemplates} />
              )}
              {activeTab === 'Security' && (
                <Check name="auditLoggingEnabled" label="Audit logging enabled" defaultChecked={platformForm.auditLoggingEnabled} />
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

        {tenantForm && activeTab !== 'Subscription Plan' && (
          <form className="card" onSubmit={saveTenant}>
            <div className="card-header">
              <span className="card-title">Vendor Settings</span>
              <span className="badge badge-success">Persisted</span>
            </div>
            <div className="form-grid">
              {activeTab === 'Business Profile' && (
                <>
                  <Input name="businessName" label="Business Name" defaultValue={tenantForm.businessName ?? tenant?.tenant.name ?? ''} />
                  <Input name="supportPhone" label="Support Phone" defaultValue={tenantForm.supportPhone ?? tenant?.tenant.supportPhone ?? ''} />
                  <Input name="supportEmail" label="Support Email" defaultValue={tenantForm.supportEmail ?? tenant?.tenant.supportEmail ?? ''} />
                  <Input name="logoUrl" label="Logo URL" defaultValue={tenantForm.logoUrl ?? tenant?.tenant.logoUrl ?? ''} />
                  <Input name="brandColor" label="Brand Color" defaultValue={tenantForm.brandColor ?? tenant?.tenant.brandColor ?? ''} />
                  <Select name="portalTemplate" label="Portal Template" defaultValue={tenantForm.portalTemplate ?? tenant?.tenant.portalTemplate ?? 'classic'} options={portalTemplates} />
                </>
              )}
              {activeTab === 'Payment & Fees' && (
                <>
                  <ReadOnly label="Effective Mobile Money Fee" value={`${effectiveMobileFee}%`} />
                  <ReadOnly label="Effective Voucher Fee" value={`${effectiveVoucherFee}%`} />
                  {isDevAdmin && <Input name="tenantMobileMoneyFeePercent" label="Tenant Mobile Money Override %" defaultValue={tenantForm.tenantMobileMoneyFeePercent ?? ''} />}
                  {isDevAdmin && <Input name="tenantVoucherFeePercent" label="Tenant Voucher Override %" defaultValue={tenantForm.tenantVoucherFeePercent ?? ''} />}
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
                  <Check name="allowDeviceReset" label="Allow device binding resets" defaultChecked={tenantForm.allowDeviceReset} />
                  <Input name="maxResetsPerActivation" label="Max resets per activation" defaultValue={tenantForm.maxResetsPerActivation ?? 0} />
                  {isDevAdmin && <Check name="kycCompleted" label="Vendor KYC complete" defaultChecked={tenantForm.kycCompleted ?? true} />}
                  {isDevAdmin && <Check name="accountActive" label="Vendor account active" defaultChecked={tenantForm.accountActive ?? true} />}
                  {isDevAdmin && <Check name="fraudHold" label="Put vendor withdrawals on fraud hold" defaultChecked={tenantForm.fraudHold ?? false} />}
                  <Check name="termsAccepted" label="Accept current vendor operating terms" defaultChecked={Boolean(tenantForm.termsAcceptedAt)} />
                </>
              )}
              {activeTab === 'Withdrawals' && (
                <ReadOnly label="Withdrawal Safety" value="Registered payout number, secret key, balance, minimum amount, and approval policy are enforced by the backend." />
              )}
            </div>
            <button className="btn btn-primary" disabled={saving} style={{ marginTop: 18 }}>{saving ? 'Saving...' : 'Save Vendor Settings'}</button>
          </form>
        )}
      </div>

      {activeTab === 'Subscription Plan' && tenant && (
        <div className="card" style={{ padding: '24px 32px', animation: 'fadeIn 0.2s ease-out' }}>
          <div style={{ marginBottom: 24 }}>
            <h2 style={{ fontSize: 18, fontWeight: 800, color: 'var(--text-primary, #0f172a)' }}>Choose Your Platform Plan</h2>
            <p style={{ fontSize: 13, color: 'var(--text-secondary, #64748b)', marginTop: 4 }}>
              Select a billing tier that matches your network scale. Transition from commissions to fixed subscriptions as your ISP grows.
            </p>
          </div>

          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
            gap: 20,
            marginBottom: 24
          }}>
            {[
              {
                key: 'FREE',
                name: 'Starter (Free)',
                price: 'UGX 0 / Month',
                desc: 'Perfect for testing and small operations starting out.',
                commission: '8% Mobile Money / 2% Voucher',
                routers: 'Up to 5 Routers',
                features: ['Cloud WinBox Tunnels', 'Free Analytics', 'AROFi branding'],
                color: '#64748b'
              },
              {
                key: 'PRO',
                name: 'Pro Plan',
                price: 'UGX 20,000 / Month',
                desc: 'For growing ISPs wanting lower fees and branding control.',
                commission: '4% Mobile Money / 0% Voucher',
                routers: 'Up to 10 Routers',
                features: ['Cloud WinBox Tunnels', 'Custom Branding', '30-day analytics history'],
                color: '#3b82f6',
                badge: 'Recommended'
              },
              {
                key: 'ENTERPRISE',
                name: 'Enterprise Plan',
                price: 'UGX 70,000 / Month',
                desc: 'For professional, large-scale networks and operators.',
                commission: '1.6% mm gateway fee / 0% platform fee',
                routers: 'Unlimited Routers',
                features: ['Cloud WinBox Tunnels', 'Custom Domains & SSL', 'Custom SMS Gateway API', 'Priority Support'],
                color: '#8b5cf6'
              }
            ].map((plan) => {
              const isActivePlan = selectedPlan === plan.key
              return (
                <div
                  key={plan.key}
                  style={{
                    border: isActivePlan ? `2px solid ${plan.color}` : '1px solid var(--border)',
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
                  {plan.badge && (
                    <span style={{
                      position: 'absolute',
                      top: -12,
                      left: '50%',
                      transform: 'translateX(-50%)',
                      background: plan.color,
                      color: '#fff',
                      padding: '4px 10px',
                      borderRadius: 12,
                      fontSize: 10,
                      fontWeight: 800,
                      textTransform: 'uppercase',
                      letterSpacing: '0.05em'
                    }}>
                      {plan.badge}
                    </span>
                  )}

                  <div>
                    <h3 style={{ fontSize: 16, fontWeight: 800, color: 'var(--text-1)' }}>{plan.name}</h3>
                    <div style={{ margin: '12px 0' }}>
                      <span style={{ fontSize: 20, fontWeight: 900, color: plan.color }}>{plan.price}</span>
                    </div>
                    <p style={{ fontSize: 12.5, color: 'var(--text-secondary)', lineHeight: 1.4, marginBottom: 14 }}>
                      {plan.desc}
                    </p>

                    <div style={{ borderTop: '1px solid var(--border)', paddingTop: 12, marginBottom: 14 }}>
                      <div style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: 6 }}>
                        COMMISSION RATES
                      </div>
                      <div style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--text-1)' }}>{plan.commission}</div>
                    </div>

                    <div style={{ borderTop: '1px solid var(--border)', paddingTop: 12, marginBottom: 14 }}>
                      <div style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: 6 }}>
                        ROUTER LIMIT
                      </div>
                      <div style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--text-1)' }}>{plan.routers}</div>
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

                  <button
                    type="button"
                    disabled={saving || isActivePlan}
                    onClick={() => changePlan(plan.key)}
                    className="btn"
                    style={{
                      width: '100%',
                      padding: '10px 14px',
                      borderRadius: 8,
                      fontSize: 13,
                      fontWeight: 600,
                      backgroundColor: isActivePlan ? plan.color : 'transparent',
                      color: isActivePlan ? '#fff' : 'var(--text-1)',
                      border: isActivePlan ? 'none' : '1px solid var(--border)',
                      cursor: isActivePlan ? 'default' : 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: 6
                    }}
                  >
                    {isActivePlan ? 'Active Plan ✓' : saving ? 'Updating...' : `Select ${plan.name}`}
                  </button>
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
    <label style={{ display: 'flex', gap: 10, alignItems: 'center', color: 'var(--text-2)', fontWeight: 700 }}>
      <input type="checkbox" name={name} defaultChecked={defaultChecked} />
      {label}
    </label>
  )
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
