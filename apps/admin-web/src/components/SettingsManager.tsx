'use client'

import { useMemo, useState, type FormEvent } from 'react'
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

const tabs = ['Business Profile', 'Payment & Fees', 'Withdrawals', 'Router & Portal', 'Voucher Printing', 'Security'] as const
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
  const isDevAdmin = user.permissions.includes('ALL')
  const [activeTab, setActiveTab] = useState<(typeof tabs)[number]>('Business Profile')
  const [platform, setPlatform] = useState(initialPlatformSettings)
  const [tenant, setTenant] = useState(initialTenantSettings)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  const effectiveMobileFee = tenant?.settings.tenantMobileMoneyFeePercent ?? platform?.mobileMoneyFeePercent ?? 7
  const effectiveVoucherFee = tenant?.settings.tenantVoucherFeePercent ?? platform?.voucherFeePercent ?? 2

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
        {isDevAdmin && platformForm && (
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

        {tenantForm && (
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
