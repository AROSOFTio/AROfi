'use client'
import { useEffect, useState } from 'react'
import { clientFetchApi, clientPatchApi } from '@/lib/client-api'

type GlobalRates = {
  freeMobileMoneyFeePercent: number | null
  freeVoucherFeePercent: number | null
  proMobileMoneyFeePercent: number | null
  proVoucherFeePercent: number | null
  referralCommissionPercent: number | null
}

type TenantRate = {
  id: string
  name: string
  subscriptionPlan: string
  overrideMobileMoneyFeePercent: number | null
  overrideVoucherFeePercent: number | null
  effectiveMobileMoneyFeePercent: number | null
  effectiveVoucherFeePercent: number | null
}

type CommissionRatesResponse = {
  globalRates: GlobalRates
  tenants: TenantRate[]
}

const RATE_FIELDS: Array<{ key: keyof GlobalRates; label: string }> = [
  { key: 'freeMobileMoneyFeePercent', label: 'Free - Mobile Money Fee' },
  { key: 'freeVoucherFeePercent', label: 'Free - Voucher Fee' },
  { key: 'proMobileMoneyFeePercent', label: 'Pro - Mobile Money Fee' },
  { key: 'proVoucherFeePercent', label: 'Pro - Voucher Fee' },
  { key: 'referralCommissionPercent', label: 'Pro Referral Commission' },
]

export default function CommissionRatesPage() {
  const [data, setData] = useState<CommissionRatesResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [globalForm, setGlobalForm] = useState<Record<string, string>>({})
  const [savingGlobal, setSavingGlobal] = useState(false)
  const [editingTenantId, setEditingTenantId] = useState<string | null>(null)
  const [tenantForm, setTenantForm] = useState<{ mm: string; voucher: string }>({ mm: '', voucher: '' })
  const [savingTenant, setSavingTenant] = useState(false)

  const load = async () => {
    try {
      setLoading(true)
      const res = await clientFetchApi<CommissionRatesResponse>('/system/commission-rates')
      setData(res)
      const form: Record<string, string> = {}
      for (const { key } of RATE_FIELDS) {
        form[key] = res.globalRates[key] != null ? String(res.globalRates[key]) : ''
      }
      setGlobalForm(form)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load commission rates')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { void load() }, [])

  const saveGlobal = async () => {
    setSavingGlobal(true)
    setError(null)
    setSuccess(null)
    try {
      const payload: Record<string, number> = {}
      for (const { key } of RATE_FIELDS) {
        const val = globalForm[key]
        if (val !== undefined && val !== '') {
          const num = parseFloat(val)
          if (!Number.isNaN(num)) payload[key] = num
        }
      }
      await clientPatchApi('/system/settings', payload)
      setSuccess('Commission settings saved successfully.')
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save commission settings')
    } finally {
      setSavingGlobal(false)
    }
  }

  const startEditTenant = (tenant: TenantRate) => {
    setEditingTenantId(tenant.id)
    setTenantForm({
      mm: tenant.overrideMobileMoneyFeePercent != null ? String(tenant.overrideMobileMoneyFeePercent) : '',
      voucher: tenant.overrideVoucherFeePercent != null ? String(tenant.overrideVoucherFeePercent) : '',
    })
    setError(null)
    setSuccess(null)
  }

  const saveTenantOverride = async (tenantId: string) => {
    setSavingTenant(true)
    setError(null)
    setSuccess(null)
    try {
      const mmVal = tenantForm.mm.trim()
      const voucherVal = tenantForm.voucher.trim()
      await clientPatchApi(`/system/tenant-settings?tenantId=${tenantId}`, {
        tenantMobileMoneyFeePercent: mmVal === '' ? null : parseFloat(mmVal),
        tenantVoucherFeePercent: voucherVal === '' ? null : parseFloat(voucherVal),
      })
      setSuccess('Override saved.')
      setEditingTenantId(null)
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save override')
    } finally {
      setSavingTenant(false)
    }
  }

  const clearTenantOverride = async (tenantId: string) => {
    setSavingTenant(true)
    setError(null)
    setSuccess(null)
    try {
      await clientPatchApi(`/system/tenant-settings?tenantId=${tenantId}`, {
        tenantMobileMoneyFeePercent: null,
        tenantVoucherFeePercent: null,
      })
      setSuccess('Override cleared - business will use global tier rate.')
      setEditingTenantId(null)
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to clear override')
    } finally {
      setSavingTenant(false)
    }
  }

  const tierPill = (plan: string) => {
    const color = plan === 'PRO' ? 'var(--arofi-theme-accent)' : '#6b7280'
    const bg = plan === 'PRO' ? 'var(--arofi-theme-accent-soft)' : 'rgba(107,114,128,0.1)'
    return (
      <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 99, background: bg, color, textTransform: 'uppercase' }}>
        {plan}
      </span>
    )
  }

  if (loading) return <div style={{ padding: 32, color: 'var(--text-2)' }}>Loading commission rates...</div>

  return (
    <>
      <div className="page-header">
        <div>
          <h1 className="page-title">Commission Rates</h1>
          <p className="page-subtitle">Set global fee percentages by plan tier, plus the referral commission paid only when a referred business pays for Pro.</p>
        </div>
      </div>

      {error && (
        <div style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: 8, padding: '10px 14px', marginBottom: 16, color: '#dc2626', fontSize: 13 }}>
          {error}
        </div>
      )}
      {success && (
        <div style={{ background: 'var(--arofi-theme-accent-soft)', border: '1px solid var(--arofi-theme-accent-border)', borderRadius: 8, padding: '10px 14px', marginBottom: 16, color: 'var(--arofi-theme-accent-text)', fontSize: 13 }}>
          {success}
        </div>
      )}

      <div className="card" style={{ marginBottom: 24 }}>
        <div className="card-header">
          <span className="card-title">Pro Referral Commission</span>
          <span style={{ fontSize: 12, color: 'var(--text-3)' }}>Paid to referral partners only after a referred business pays for Pro</span>
        </div>
        <div style={{ padding: '0 20px 20px' }}>
          <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--text-2)', marginBottom: 6 }}>Pro Referral Commission</label>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <input
              type="number"
              className="form-input"
              min="0"
              max="100"
              step="0.1"
              placeholder="0"
              value={globalForm.referralCommissionPercent ?? ''}
              onChange={(e) => setGlobalForm((prev) => ({ ...prev, referralCommissionPercent: e.target.value }))}
              style={{ width: 100 }}
            />
            <span style={{ color: 'var(--text-2)', fontSize: 14, fontWeight: 600 }}>%</span>
          </div>
          <p style={{ marginTop: 8, fontSize: 12, color: 'var(--text-3)' }}>
            Example: 30% means a UGX 20,000 Pro payment gives UGX 6,000 to the referrer and UGX 14,000 to the platform wallet.
          </p>
        </div>
      </div>

      <div className="card" style={{ marginBottom: 24 }}>
        <div className="card-header">
          <span className="card-title">Global Default Rates</span>
          <span style={{ fontSize: 12, color: 'var(--text-3)' }}>Applied to all businesses unless overridden below</span>
        </div>
        <div style={{ padding: '0 20px 20px' }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 20 }}>
            {RATE_FIELDS.filter((field) => field.key !== 'referralCommissionPercent').map(({ key, label }) => (
              <div key={key}>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--text-2)', marginBottom: 6 }}>{label}</label>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <input
                    type="number"
                    className="form-input"
                    min="0"
                    max="100"
                    step="0.1"
                    placeholder="0"
                    value={globalForm[key] ?? ''}
                    onChange={(e) => setGlobalForm((prev) => ({ ...prev, [key]: e.target.value }))}
                    style={{ width: 100 }}
                  />
                  <span style={{ color: 'var(--text-2)', fontSize: 14, fontWeight: 600 }}>%</span>
                </div>
              </div>
            ))}
          </div>
          <div style={{ marginTop: 20 }}>
            <button type="button" className="btn btn-primary" onClick={() => void saveGlobal()} disabled={savingGlobal}>
              {savingGlobal ? 'Saving...' : 'Save Global Rates'}
            </button>
          </div>
        </div>
      </div>

      <div className="card">
        <div className="card-header">
          <span className="card-title">Per-Business Overrides</span>
          <span style={{ fontSize: 12, color: 'var(--text-3)' }}>Negotiated rates that override the global defaults</span>
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Business</th>
                <th>Plan</th>
                <th>MM Fee %</th>
                <th>Voucher Fee %</th>
                <th style={{ width: 60 }}></th>
                <th style={{ width: 120 }}></th>
              </tr>
            </thead>
            <tbody>
              {(data?.tenants ?? []).length === 0 && (
                <tr>
                  <td colSpan={6}>
                    <div className="empty-state" style={{ padding: 24 }}><p>No businesses onboarded yet.</p></div>
                  </td>
                </tr>
              )}
              {(data?.tenants ?? []).map((tenant) => (
                <tr key={tenant.id}>
                  <td style={{ fontWeight: 600 }}>{tenant.name}</td>
                  <td>{tierPill(tenant.subscriptionPlan)}</td>
                  {editingTenantId === tenant.id ? (
                    <>
                      <td>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                          <input
                            type="number"
                            className="form-input"
                            min="0" max="100" step="0.1"
                            placeholder="use global"
                            value={tenantForm.mm}
                            onChange={(e) => setTenantForm((p) => ({ ...p, mm: e.target.value }))}
                            style={{ width: 90 }}
                          />
                          <span style={{ fontSize: 12, color: 'var(--text-3)' }}>%</span>
                        </div>
                      </td>
                      <td>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                          <input
                            type="number"
                            className="form-input"
                            min="0" max="100" step="0.1"
                            placeholder="use global"
                            value={tenantForm.voucher}
                            onChange={(e) => setTenantForm((p) => ({ ...p, voucher: e.target.value }))}
                            style={{ width: 90 }}
                          />
                          <span style={{ fontSize: 12, color: 'var(--text-3)' }}>%</span>
                        </div>
                      </td>
                      <td colSpan={2}>
                        <span style={{ display: 'inline-flex', gap: 6 }}>
                          <button type="button" className="btn btn-primary btn-sm" onClick={() => void saveTenantOverride(tenant.id)} disabled={savingTenant}>
                            {savingTenant ? '...' : 'Save'}
                          </button>
                          <button type="button" className="btn btn-ghost btn-sm" onClick={() => setEditingTenantId(null)} disabled={savingTenant}>
                            Cancel
                          </button>
                        </span>
                      </td>
                    </>
                  ) : (
                    <>
                      <td style={{ fontSize: 13 }}>
                        <span>{tenant.effectiveMobileMoneyFeePercent != null ? `${tenant.effectiveMobileMoneyFeePercent}%` : '—'}</span>
                        {tenant.overrideMobileMoneyFeePercent != null && (
                          <span style={{ marginLeft: 6, fontSize: 10, color: 'var(--green)', fontWeight: 700 }}>CUSTOM</span>
                        )}
                      </td>
                      <td style={{ fontSize: 13 }}>
                        <span>{tenant.effectiveVoucherFeePercent != null ? `${tenant.effectiveVoucherFeePercent}%` : '—'}</span>
                        {tenant.overrideVoucherFeePercent != null && (
                          <span style={{ marginLeft: 6, fontSize: 10, color: 'var(--green)', fontWeight: 700 }}>CUSTOM</span>
                        )}
                      </td>
                      <td>
                        {(tenant.overrideMobileMoneyFeePercent != null || tenant.overrideVoucherFeePercent != null) && (
                          <button type="button" className="btn btn-ghost btn-sm" style={{ color: '#ef4444', fontSize: 12 }} onClick={() => void clearTenantOverride(tenant.id)} disabled={savingTenant}>
                            Clear
                          </button>
                        )}
                      </td>
                      <td>
                        <button type="button" className="btn btn-ghost btn-sm" onClick={() => startEditTenant(tenant)}>
                          {(tenant.overrideMobileMoneyFeePercent != null || tenant.overrideVoucherFeePercent != null) ? 'Edit Override' : 'Set Override'}
                        </button>
                      </td>
                    </>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </>
  )
}
