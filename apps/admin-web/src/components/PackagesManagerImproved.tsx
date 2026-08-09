'use client'

import { FormEvent, useEffect, useMemo, useState } from 'react'
import Modal from './Modal'
import { PackageCatalogResponse, TenantOverviewResponse } from '@/lib/admin-types'
import { clientDeleteApi, clientFetchApi, clientPatchApi, clientPostApi } from '@/lib/client-api'
import { formatCurrency, formatDuration } from '@/lib/format'

type PackageItem = PackageCatalogResponse['items'][number]
type PackageView = 'internet' | 'multi' | 'tv'
type PackageKind = 'INTERNET' | 'MULTI' | 'TV'
type PackageForm = {
  tenantId: string
  name: string
  code: string
  description: string
  durationMinutes: string
  dataLimitMb: string
  deviceLimit: string
  downloadSpeedKbps: string
  uploadSpeedKbps: string
  priceUgx: string
  isFeatured: boolean
}

const emptyForm: PackageForm = {
  tenantId: '',
  name: '',
  code: '',
  description: '',
  durationMinutes: '60',
  dataLimitMb: '',
  deviceLimit: '1',
  downloadSpeedKbps: '',
  uploadSpeedKbps: '',
  priceUgx: '1000',
  isFeatured: false,
}

function optionalInt(value: string) {
  const parsed = Number.parseInt(value, 10)
  return value.trim() && Number.isFinite(parsed) ? parsed : undefined
}

function searchText(item: PackageItem) {
  return `${item.name} ${item.code} ${item.description ?? ''}`.toLowerCase()
}

function isTrial(item: PackageItem) {
  return item.isTrialEnabled || /free[\s-]?trial|trial/i.test(`${item.name} ${item.code}`)
}

function isTv(item: PackageItem) {
  const value = searchText(item)
  return !isTrial(item) && (value.includes('tv') || value.includes('smart') || value.includes('stream'))
}

function isMulti(item: PackageItem) {
  return !isTrial(item) && !isTv(item) && Number(item.deviceLimit ?? 1) > 1
}

function categoryOf(item: PackageItem): PackageView {
  return isTv(item) ? 'tv' : isMulti(item) ? 'multi' : 'internet'
}

function speedLabel(item: PackageItem) {
  if (!item.downloadSpeedKbps && !item.uploadSpeedKbps) return 'Unlimited'
  const down = item.downloadSpeedKbps ? `${Math.round(item.downloadSpeedKbps / 1024)} Mbps` : 'Unlimited'
  const up = item.uploadSpeedKbps ? `${Math.round(item.uploadSpeedKbps / 1024)} Mbps` : 'Unlimited'
  return `${down} ↓ / ${up} ↑`
}

export default function PackagesManagerImproved() {
  const [catalog, setCatalog] = useState<PackageCatalogResponse | null>(null)
  const [tenants, setTenants] = useState<TenantOverviewResponse['items']>([])
  const [view, setView] = useState<PackageView>('internet')
  const [query, setQuery] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [formOpen, setFormOpen] = useState(false)
  const [formStep, setFormStep] = useState(0)
  const [kind, setKind] = useState<PackageKind>('INTERNET')
  const [editing, setEditing] = useState<PackageItem | null>(null)
  const [form, setForm] = useState<PackageForm>(emptyForm)
  const [trialOpen, setTrialOpen] = useState(false)
  const [trialDuration, setTrialDuration] = useState('10')
  const [tvPackage, setTvPackage] = useState<PackageItem | null>(null)
  const [tvMac, setTvMac] = useState('')
  const [tvCustomer, setTvCustomer] = useState('')
  const [tvPhone, setTvPhone] = useState('')
  const [deleteId, setDeleteId] = useState<string | null>(null)

  useEffect(() => { void loadData() }, [])

  async function loadData() {
    try {
      setLoading(true)
      setError(null)
      const [catalogData, tenantData] = await Promise.all([
        clientFetchApi<PackageCatalogResponse>('/packages'),
        clientFetchApi<TenantOverviewResponse>('/tenants'),
      ])
      setCatalog(catalogData)
      setTenants(tenantData.items)
      setForm((current) => ({ ...current, tenantId: current.tenantId || tenantData.items[0]?.id || '' }))
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Unable to load packages')
    } finally {
      setLoading(false)
    }
  }

  const items = catalog?.items ?? []
  const trial = items.find(isTrial) ?? null
  const regularItems = items.filter((item) => !isTrial(item))
  const counts = useMemo(() => ({
    internet: regularItems.filter((item) => categoryOf(item) === 'internet').length,
    multi: regularItems.filter((item) => categoryOf(item) === 'multi').length,
    tv: regularItems.filter((item) => categoryOf(item) === 'tv').length,
  }), [regularItems])
  const visibleItems = useMemo(
    () => regularItems.filter((item) => categoryOf(item) === view && (!query.trim() || searchText(item).includes(query.trim().toLowerCase()))),
    [regularItems, view, query],
  )

  function createPackage() {
    setEditing(null)
    setKind(view === 'multi' ? 'MULTI' : view === 'tv' ? 'TV' : 'INTERNET')
    setForm({
      ...emptyForm,
      tenantId: form.tenantId || tenants[0]?.id || '',
      deviceLimit: view === 'multi' ? '2' : '1',
      durationMinutes: view === 'tv' ? '1440' : '60',
      name: view === 'multi' ? 'Family Package' : view === 'tv' ? 'Smart TV Package' : '',
      code: view === 'multi' ? 'FAMILY' : view === 'tv' ? 'TV-DAILY' : '',
      downloadSpeedKbps: view === 'tv' ? '8192' : '',
      uploadSpeedKbps: view === 'tv' ? '2048' : '',
    })
    setFormStep(0)
    setError(null)
    setFormOpen(true)
  }

  function editPackage(item: PackageItem) {
    setEditing(item)
    setKind(categoryOf(item) === 'multi' ? 'MULTI' : categoryOf(item) === 'tv' ? 'TV' : 'INTERNET')
    setForm({
      tenantId: item.tenant.id,
      name: item.name,
      code: item.code,
      description: item.description ?? '',
      durationMinutes: String(item.durationMinutes),
      dataLimitMb: item.dataLimitMb == null ? '' : String(item.dataLimitMb),
      deviceLimit: String(item.deviceLimit ?? 1),
      downloadSpeedKbps: item.downloadSpeedKbps == null ? '' : String(item.downloadSpeedKbps),
      uploadSpeedKbps: item.uploadSpeedKbps == null ? '' : String(item.uploadSpeedKbps),
      priceUgx: String(item.activePriceUgx),
      isFeatured: item.isFeatured,
    })
    setFormStep(1)
    setError(null)
    setFormOpen(true)
  }

  function applyKind(next: PackageKind) {
    setKind(next)
    setForm((current) => ({
      ...current,
      deviceLimit: next === 'MULTI' ? (Number(current.deviceLimit) > 1 ? current.deviceLimit : '2') : '1',
    }))
  }

  async function savePackage(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const durationMinutes = Number.parseInt(form.durationMinutes, 10)
    const priceUgx = Number.parseInt(form.priceUgx, 10)
    if (!form.tenantId || !form.name.trim() || !form.code.trim() || durationMinutes < 1 || priceUgx < 0) {
      setError('Complete the required fields.')
      return
    }

    try {
      setSaving(true)
      setError(null)
      const payload = {
        name: form.name.trim(),
        description: form.description.trim() || undefined,
        durationMinutes,
        isTrialEnabled: false,
        dataLimitMb: optionalInt(form.dataLimitMb),
        deviceLimit: kind === 'MULTI' ? Math.max(2, optionalInt(form.deviceLimit) ?? 2) : 1,
        downloadSpeedKbps: optionalInt(form.downloadSpeedKbps),
        uploadSpeedKbps: optionalInt(form.uploadSpeedKbps),
        isFeatured: form.isFeatured,
      }

      if (editing) {
        await clientPatchApi(`/packages/${editing.id}`, { ...payload, priceUgx })
      } else {
        await clientPostApi('/packages', {
          ...payload,
          tenantId: form.tenantId,
          code: form.code.trim().toUpperCase(),
          initialPriceUgx: priceUgx,
          status: 'ACTIVE',
        })
      }

      setSuccess(editing ? 'Package updated.' : 'Package created.')
      setFormOpen(false)
      await loadData()
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Unable to save package')
    } finally {
      setSaving(false)
    }
  }

  async function toggle(item: PackageItem) {
    try {
      setError(null)
      await clientPatchApi(`/packages/${item.id}`, { status: item.status === 'ACTIVE' ? 'DRAFT' : 'ACTIVE' })
      await loadData()
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Unable to change package status')
    }
  }

  async function saveTrial(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!trial) return
    const durationMinutes = Number.parseInt(trialDuration, 10)
    if (!Number.isFinite(durationMinutes) || durationMinutes < 1) {
      setError('Enter a valid duration.')
      return
    }

    try {
      setSaving(true)
      setError(null)
      await clientPatchApi(`/packages/${trial.id}`, { durationMinutes })
      setTrialOpen(false)
      setSuccess('Free trial updated.')
      await loadData()
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Unable to update free trial')
    } finally {
      setSaving(false)
    }
  }

  async function removePackage(id: string) {
    try {
      setSaving(true)
      setError(null)
      await clientDeleteApi(`/packages/${id}`)
      setDeleteId(null)
      setSuccess('Package deleted.')
      await loadData()
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Unable to delete package')
    } finally {
      setSaving(false)
    }
  }

  async function activateTv(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!tvPackage || !tvMac.trim()) return

    try {
      setSaving(true)
      setError(null)
      await clientPostApi(`/packages/${tvPackage.id}/tv-activations`, {
        tenantId: tvPackage.tenant.id,
        macAddress: tvMac.trim(),
        customerName: tvCustomer.trim() || undefined,
        phoneNumber: tvPhone.trim() || undefined,
      })
      setTvPackage(null)
      setTvMac('')
      setTvCustomer('')
      setTvPhone('')
      setSuccess('Smart TV activated.')
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Unable to activate Smart TV')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="clean-packages-page">
      <style>{`
        .clean-packages-header{display:flex;justify-content:space-between;align-items:center;gap:12px;margin-bottom:14px}
        .trial-control{display:flex;justify-content:space-between;align-items:center;gap:12px;padding:12px 14px;border:1px solid var(--border);background:var(--bg-card);border-radius:10px;margin-bottom:14px}
        .trial-control-main{display:flex;align-items:center;gap:10px;min-width:0}
        .trial-control h2{font-size:14px;line-height:1.2;font-weight:650;margin:0;color:var(--text-primary)}
        .trial-meta{font-size:12.5px;color:var(--text-muted);white-space:nowrap}
        .trial-actions{display:flex;align-items:center;gap:8px;flex-wrap:wrap}
        .package-toolbar{display:flex;justify-content:space-between;align-items:center;gap:10px;margin-bottom:10px;flex-wrap:wrap}
        .package-tabs{display:inline-flex;gap:3px;padding:3px;border:1px solid var(--border);background:var(--bg-card);border-radius:10px}
        .package-tab{height:34px;border:0;background:transparent;padding:0 13px;border-radius:7px;font:600 13px var(--ui-font);color:var(--text-2);cursor:pointer}
        .package-tab:hover{background:var(--bg-hover);color:var(--text-primary)}
        .package-tab.active{background:var(--brand);color:#fff}
        .package-tab span{font-size:11px;margin-left:5px;opacity:.8}
        .package-tools{display:flex;gap:8px}.package-tools input{min-width:230px}
        .package-list{display:grid;gap:7px}
        .package-row{display:grid;grid-template-columns:minmax(180px,1.35fr) 110px 95px 80px 140px auto;gap:12px;align-items:center;padding:11px 13px;border:1px solid var(--border);border-radius:10px;background:var(--bg-card)}
        .package-row strong{display:block;color:var(--text-primary);font-size:13.5px;font-weight:650;line-height:1.25}
        .package-row small{display:block;color:var(--text-muted);font-size:11.5px;line-height:1.35;margin-top:2px}
        .package-row-actions{display:flex;align-items:center;justify-content:flex-end;gap:5px;flex-wrap:nowrap}
        .package-switch{width:36px!important;min-width:36px!important;max-width:36px!important;height:20px!important;min-height:20px!important;border:1px solid #cbd5e1!important;border-radius:999px!important;background:#e2e8f0!important;position:relative!important;cursor:pointer;flex:0 0 36px!important;padding:0!important;box-shadow:inset 0 1px 2px rgba(15,23,42,.08)!important;vertical-align:middle}
        .package-switch span{position:absolute!important;width:14px!important;height:14px!important;top:2px!important;left:2px!important;border-radius:50%!important;background:#fff!important;transition:transform .16s ease,box-shadow .16s ease!important;box-shadow:0 1px 3px rgba(15,23,42,.22)!important}
        .package-switch.on{background:#16a34a!important;border-color:#15803d!important}.package-switch.on span{transform:translateX(16px)!important}
        .package-kind-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px}
        .package-kind{height:48px;padding:0 12px;border:1px solid var(--border);border-radius:8px;background:var(--bg-card);text-align:left;cursor:pointer;font:600 13px var(--ui-font);color:var(--text-2)}
        .package-kind.active{border-color:var(--brand);background:var(--green-light);color:var(--brand)}
        .package-form-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:13px}
        .package-form-full{grid-column:1/-1}
        .package-form-actions{display:flex;justify-content:space-between;gap:10px;margin-top:18px;padding-top:14px;border-top:1px solid var(--border)}
        .package-feedback{margin:0 0 10px;font-size:12.5px;font-weight:600}
        @media(max-width:1100px){.package-row{grid-template-columns:minmax(180px,1fr) repeat(4,minmax(75px,.45fr));}.package-row-actions{grid-column:1/-1;justify-content:flex-end;border-top:1px solid var(--border-soft);padding-top:8px}}
        @media(max-width:760px){.clean-packages-header{align-items:center}.trial-control{align-items:flex-start}.trial-control-main{display:block}.trial-meta{white-space:normal;margin-top:3px}.package-toolbar{align-items:stretch}.package-tabs{display:grid;grid-template-columns:repeat(3,1fr);width:100%}.package-tab{padding:0 7px}.package-tools{width:100%;display:grid;grid-template-columns:1fr auto}.package-tools input{min-width:0}.package-row{grid-template-columns:1fr 1fr;padding:12px}.package-row>div:first-child,.package-row-actions{grid-column:1/-1}.package-row-actions{justify-content:flex-start}.package-kind-grid,.package-form-grid{grid-template-columns:1fr}.package-form-full{grid-column:auto}}
        @media(max-width:480px){.clean-packages-header{align-items:flex-start}.clean-packages-header .btn{white-space:nowrap}.trial-control{display:block}.trial-actions{margin-top:10px}.trial-actions .btn{flex:1;justify-content:center}.package-tools{grid-template-columns:1fr}.package-row-actions{display:grid;grid-template-columns:auto 1fr 1fr}.package-row-actions .package-switch{margin-right:4px}.package-row-actions .btn{width:100%}}
      `}</style>

      <div className="clean-packages-header">
        <h1 className="page-title">Internet plans</h1>
        <button type="button" className="btn btn-primary" onClick={createPackage}>Create package</button>
      </div>

      <section className="trial-control">
        <div className="trial-control-main">
          <h2>Free trial</h2>
          <span className="trial-meta">
            {trial ? `${formatDuration(trial.durationMinutes)} · ${trial.status === 'ACTIVE' ? 'Active' : 'Off'}` : 'Creating default 10-minute trial…'}
          </span>
        </div>
        {trial && (
          <div className="trial-actions">
            <button type="button" className={`package-switch ${trial.status === 'ACTIVE' ? 'on' : ''}`} onClick={() => void toggle(trial)} aria-label="Toggle free trial"><span /></button>
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => { setTrialDuration(String(trial.durationMinutes)); setTrialOpen(true) }}>Duration</button>
          </div>
        )}
      </section>

      {error && <p className="package-feedback" style={{ color: 'var(--danger-fg)' }}>{error}</p>}
      {success && <p className="package-feedback" style={{ color: 'var(--success-fg)' }}>{success}</p>}

      <div className="package-toolbar">
        <div className="package-tabs">
          {([['internet', 'Internet'], ['multi', 'Multi-device'], ['tv', 'TV / Smart TV']] as const).map(([key, label]) => (
            <button type="button" key={key} className={`package-tab ${view === key ? 'active' : ''}`} onClick={() => setView(key)}>
              {label}<span>{counts[key]}</span>
            </button>
          ))}
        </div>
        <div className="package-tools">
          <input className="form-input" placeholder="Search plans" value={query} onChange={(event) => setQuery(event.target.value)} />
          <button type="button" className="btn btn-primary" onClick={createPackage}>Add plan</button>
        </div>
      </div>

      <div className="package-list">
        {loading && <div className="card" style={{ padding: 16 }}>Loading…</div>}
        {!loading && visibleItems.length === 0 && <div className="card" style={{ padding: 16 }}>No plans found.</div>}
        {visibleItems.map((item) => (
          <div className="package-row" key={item.id}>
            <div>
              <strong>{item.name}</strong>
              <small>{item.code}{item.description ? ` · ${item.description}` : ''}</small>
            </div>
            <div><small>Price</small><strong>{formatCurrency(item.activePriceUgx)}</strong></div>
            <div><small>Duration</small><strong>{formatDuration(item.durationMinutes)}</strong></div>
            <div><small>Devices</small><strong>{item.deviceLimit ?? 1}</strong></div>
            <div><small>Speed</small><strong>{speedLabel(item)}</strong></div>
            <div className="package-row-actions">
              <button type="button" className={`package-switch ${item.status === 'ACTIVE' ? 'on' : ''}`} onClick={() => void toggle(item)} aria-label={`Toggle ${item.name}`}><span /></button>
              {view === 'tv' && <button type="button" className="btn btn-primary btn-sm" onClick={() => setTvPackage(item)}>Connect TV</button>}
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => editPackage(item)}>Edit</button>
              {deleteId === item.id ? (
                <>
                  <button type="button" className="btn btn-sm" onClick={() => void removePackage(item.id)} disabled={saving}>Delete now</button>
                  <button type="button" className="btn btn-ghost btn-sm" onClick={() => setDeleteId(null)}>Cancel</button>
                </>
              ) : (
                <button type="button" className="btn btn-ghost btn-sm" style={{ color: 'var(--danger-fg)' }} onClick={() => setDeleteId(item.id)}>Delete</button>
              )}
            </div>
          </div>
        ))}
      </div>

      <Modal open={formOpen} title={editing ? `Edit ${editing.name}` : 'Create package'} onClose={() => !saving && setFormOpen(false)} width={760}>
        <form onSubmit={savePackage}>
          {!editing && formStep === 0 && (
            <>
              <div className="package-kind-grid">
                {([['INTERNET', 'Internet'], ['MULTI', 'Multi-device'], ['TV', 'TV / Smart TV']] as const).map(([value, title]) => (
                  <button type="button" key={value} className={`package-kind ${kind === value ? 'active' : ''}`} onClick={() => applyKind(value)}>{title}</button>
                ))}
              </div>
              <div className="package-form-actions">
                <button type="button" className="btn btn-ghost" onClick={() => setFormOpen(false)}>Cancel</button>
                <button type="button" className="btn btn-primary" onClick={() => setFormStep(1)}>Continue</button>
              </div>
            </>
          )}

          {(editing || formStep === 1) && (
            <>
              <div className="package-form-grid">
                <div className="form-group package-form-full">
                  <label className="form-label">Business</label>
                  <select className="form-input" value={form.tenantId} onChange={(event) => setForm((current) => ({ ...current, tenantId: event.target.value }))} disabled={Boolean(editing)}>
                    <option value="">Select business</option>
                    {tenants.map((tenant) => <option value={tenant.id} key={tenant.id}>{tenant.name}</option>)}
                  </select>
                </div>
                <div className="form-group"><label className="form-label">Name</label><input className="form-input" value={form.name} onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))} required /></div>
                <div className="form-group"><label className="form-label">Code</label><input className="form-input" value={form.code} onChange={(event) => setForm((current) => ({ ...current, code: event.target.value.toUpperCase() }))} disabled={Boolean(editing)} required /></div>
                <div className="form-group"><label className="form-label">Price (UGX)</label><input className="form-input" type="number" min={0} value={form.priceUgx} onChange={(event) => setForm((current) => ({ ...current, priceUgx: event.target.value }))} required /></div>
                <div className="form-group"><label className="form-label">Duration (minutes)</label><input className="form-input" type="number" min={1} value={form.durationMinutes} onChange={(event) => setForm((current) => ({ ...current, durationMinutes: event.target.value }))} required /></div>
                {kind === 'MULTI' && <div className="form-group"><label className="form-label">Devices</label><input className="form-input" type="number" min={2} value={form.deviceLimit} onChange={(event) => setForm((current) => ({ ...current, deviceLimit: event.target.value }))} /></div>}
                <div className="form-group"><label className="form-label">Data limit (MB)</label><input className="form-input" type="number" min={1} value={form.dataLimitMb} onChange={(event) => setForm((current) => ({ ...current, dataLimitMb: event.target.value }))} placeholder="Unlimited" /></div>
                <div className="form-group"><label className="form-label">Download (Kbps)</label><input className="form-input" type="number" min={1} value={form.downloadSpeedKbps} onChange={(event) => setForm((current) => ({ ...current, downloadSpeedKbps: event.target.value }))} placeholder="Unlimited" /></div>
                <div className="form-group"><label className="form-label">Upload (Kbps)</label><input className="form-input" type="number" min={1} value={form.uploadSpeedKbps} onChange={(event) => setForm((current) => ({ ...current, uploadSpeedKbps: event.target.value }))} placeholder="Unlimited" /></div>
                <div className="form-group package-form-full"><label className="form-label">Description</label><textarea className="form-input" rows={3} value={form.description} onChange={(event) => setForm((current) => ({ ...current, description: event.target.value }))} /></div>
                <label className="package-form-full" style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13 }}>
                  <input type="checkbox" checked={form.isFeatured} onChange={(event) => setForm((current) => ({ ...current, isFeatured: event.target.checked }))} /> Featured on portal
                </label>
              </div>
              <div className="package-form-actions">
                <button type="button" className="btn btn-ghost" onClick={() => !editing ? setFormStep(0) : setFormOpen(false)}>{editing ? 'Cancel' : 'Back'}</button>
                <button type="submit" className="btn btn-primary" disabled={saving}>{saving ? 'Saving…' : editing ? 'Save changes' : 'Create package'}</button>
              </div>
            </>
          )}
        </form>
      </Modal>

      <Modal open={trialOpen} title="Free trial duration" onClose={() => !saving && setTrialOpen(false)} width={460}>
        <form onSubmit={saveTrial}>
          <div className="form-group">
            <label className="form-label">Duration (minutes)</label>
            <input className="form-input" type="number" min={1} value={trialDuration} onChange={(event) => setTrialDuration(event.target.value)} required />
          </div>
          <div className="package-form-actions">
            <button type="button" className="btn btn-ghost" onClick={() => setTrialOpen(false)}>Cancel</button>
            <button type="submit" className="btn btn-primary" disabled={saving}>{saving ? 'Saving…' : 'Save'}</button>
          </div>
        </form>
      </Modal>

      <Modal open={Boolean(tvPackage)} title={tvPackage ? `Connect ${tvPackage.name}` : 'Connect Smart TV'} onClose={() => !saving && setTvPackage(null)} width={520}>
        <form onSubmit={activateTv}>
          <div className="package-form-grid">
            <div className="form-group package-form-full"><label className="form-label">TV wireless MAC address</label><input className="form-input" placeholder="AA:BB:CC:DD:EE:FF" value={tvMac} onChange={(event) => setTvMac(event.target.value)} required /></div>
            <div className="form-group"><label className="form-label">Customer name</label><input className="form-input" value={tvCustomer} onChange={(event) => setTvCustomer(event.target.value)} /></div>
            <div className="form-group"><label className="form-label">Phone number</label><input className="form-input" value={tvPhone} onChange={(event) => setTvPhone(event.target.value)} /></div>
          </div>
          <div className="package-form-actions">
            <button type="button" className="btn btn-ghost" onClick={() => setTvPackage(null)}>Cancel</button>
            <button type="submit" className="btn btn-primary" disabled={saving}>{saving ? 'Connecting…' : 'Activate TV'}</button>
          </div>
        </form>
      </Modal>
    </div>
  )
}
