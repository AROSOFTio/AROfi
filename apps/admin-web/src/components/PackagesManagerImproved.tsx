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
  tenantId: '', name: '', code: '', description: '', durationMinutes: '60', dataLimitMb: '', deviceLimit: '1',
  downloadSpeedKbps: '', uploadSpeedKbps: '', priceUgx: '1000', isFeatured: false,
}

function optionalInt(value: string) {
  const parsed = Number.parseInt(value, 10)
  return value.trim() && Number.isFinite(parsed) ? parsed : undefined
}
function searchText(item: PackageItem) { return `${item.name} ${item.code} ${item.description ?? ''}`.toLowerCase() }
function isTrial(item: PackageItem) { return item.isTrialEnabled || /free[\s-]?trial|trial/i.test(`${item.name} ${item.code}`) }
function isTv(item: PackageItem) { const value = searchText(item); return !isTrial(item) && (value.includes('tv') || value.includes('smart') || value.includes('stream')) }
function isMulti(item: PackageItem) { return !isTrial(item) && !isTv(item) && Number(item.deviceLimit ?? 1) > 1 }
function categoryOf(item: PackageItem): PackageView { return isTv(item) ? 'tv' : isMulti(item) ? 'multi' : 'internet' }
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
  const [trialDuration, setTrialDuration] = useState('5')
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
  const visibleItems = useMemo(() => regularItems.filter((item) => categoryOf(item) === view && (!query.trim() || searchText(item).includes(query.trim().toLowerCase()))), [regularItems, view, query])

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
    setForm((current) => ({ ...current, deviceLimit: next === 'MULTI' ? (Number(current.deviceLimit) > 1 ? current.deviceLimit : '2') : '1' }))
  }

  async function savePackage(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const durationMinutes = Number.parseInt(form.durationMinutes, 10)
    const priceUgx = Number.parseInt(form.priceUgx, 10)
    if (!form.tenantId || !form.name.trim() || !form.code.trim() || durationMinutes < 1 || priceUgx < 0) {
      setError('Complete the business, name, code, duration, and price.')
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
        await clientPostApi('/packages', { ...payload, tenantId: form.tenantId, code: form.code.trim().toUpperCase(), initialPriceUgx: priceUgx, status: 'ACTIVE' })
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
    } catch (caught) { setError(caught instanceof Error ? caught.message : 'Unable to change package status') }
  }

  async function saveTrial(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!trial) return
    const durationMinutes = Number.parseInt(trialDuration, 10)
    if (!Number.isFinite(durationMinutes) || durationMinutes < 1) { setError('Enter a valid free trial duration.'); return }
    try {
      setSaving(true)
      setError(null)
      await clientPatchApi(`/packages/${trial.id}`, { durationMinutes })
      setTrialOpen(false)
      setSuccess('Free trial duration updated.')
      await loadData()
    } catch (caught) { setError(caught instanceof Error ? caught.message : 'Unable to update free trial') }
    finally { setSaving(false) }
  }

  async function removePackage(id: string) {
    try {
      setSaving(true)
      setError(null)
      await clientDeleteApi(`/packages/${id}`)
      setDeleteId(null)
      setSuccess('Package deleted.')
      await loadData()
    } catch (caught) { setError(caught instanceof Error ? caught.message : 'Unable to delete package') }
    finally { setSaving(false) }
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
      setTvPackage(null); setTvMac(''); setTvCustomer(''); setTvPhone('')
      setSuccess('Smart TV activated. Reconnect the TV to WiFi once.')
    } catch (caught) { setError(caught instanceof Error ? caught.message : 'Unable to activate Smart TV') }
    finally { setSaving(false) }
  }

  return (
    <div className="clean-packages-page">
      <style>{`
        .clean-packages-header{display:flex;justify-content:space-between;align-items:flex-start;gap:18px;margin-bottom:18px}
        .clean-packages-header p{max-width:720px}
        .trial-control{display:flex;justify-content:space-between;align-items:center;gap:18px;padding:18px;border:1px solid #bfdbfe;background:#eff6ff;border-radius:16px;margin-bottom:16px}
        .trial-control h2{font-size:16px;margin:0 0 5px;color:#1e3a8a}.trial-control p{font-size:12px;line-height:1.5;margin:0;color:#475569}
        .package-toolbar{display:flex;justify-content:space-between;align-items:center;gap:12px;margin-bottom:12px;flex-wrap:wrap}
        .package-tabs{display:flex;gap:5px;padding:4px;border:1px solid var(--border);background:var(--surface);border-radius:12px}
        .package-tab{border:0;background:transparent;padding:9px 14px;border-radius:9px;font-weight:800;color:var(--text-2);cursor:pointer}.package-tab.active{background:var(--brand);color:#fff}
        .package-tab span{font-size:11px;margin-left:5px;opacity:.8}.package-tools{display:flex;gap:8px}.package-tools input{min-width:250px}
        .package-list{display:grid;gap:9px}.package-row{display:grid;grid-template-columns:minmax(180px,1.3fr) 120px 110px 100px 150px auto;gap:12px;align-items:center;padding:14px 16px;border:1px solid var(--border);border-radius:14px;background:var(--surface)}
        .package-row strong{color:var(--text-primary)}.package-row small{display:block;color:var(--text-muted);margin-top:3px}.package-row-actions{display:flex;justify-content:flex-end;gap:6px;flex-wrap:wrap}
        .package-switch{width:48px;height:28px;border:0;border-radius:999px;background:#cbd5e1;position:relative;cursor:pointer}.package-switch span{position:absolute;width:22px;height:22px;top:3px;left:3px;border-radius:50%;background:#fff;transition:.18s}.package-switch.on{background:#16a34a}.package-switch.on span{transform:translateX(20px)}
        .package-kind-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px}.package-kind{padding:17px;border:1px solid var(--border);border-radius:14px;background:var(--surface);text-align:left;cursor:pointer}.package-kind.active{border-color:var(--brand);box-shadow:0 0 0 2px rgba(37,99,235,.1)}.package-kind strong{display:block;margin-bottom:5px}.package-kind span{font-size:12px;color:var(--text-2);line-height:1.45}
        .package-form-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:14px}.package-form-full{grid-column:1/-1}.package-form-actions{display:flex;justify-content:space-between;gap:10px;margin-top:20px;padding-top:16px;border-top:1px solid var(--border)}
        @media(max-width:980px){.package-row{grid-template-columns:1fr 1fr 1fr}.package-row-actions{justify-content:flex-start}.package-tools{width:100%}.package-tools input{flex:1}}
        @media(max-width:700px){.clean-packages-header,.trial-control{display:block}.clean-packages-header .btn,.trial-control .btn{width:100%;margin-top:14px}.package-tabs{width:100%;overflow:auto}.package-tab{flex:1}.package-tools{display:grid;grid-template-columns:1fr}.package-tools input{min-width:0;width:100%}.package-row{grid-template-columns:1fr 1fr}.package-row>div:first-child,.package-row-actions{grid-column:1/-1}.package-kind-grid,.package-form-grid{grid-template-columns:1fr}.package-form-full{grid-column:auto}}
      `}</style>

      <div className="clean-packages-header">
        <div><h1 className="page-title">Internet plans</h1><p className="page-subtitle">Manage one package category at a time. Creation and editing happen in popup forms, not inside the page.</p></div>
        <button type="button" className="btn btn-primary" onClick={createPackage}>Create package</button>
      </div>

      <section className="trial-control">
        <div>
          <h2>Included free trial</h2>
          <p>{trial ? `${formatDuration(trial.durationMinutes)} · ${trial.status === 'ACTIVE' ? 'On' : 'Off'}. This default trial cannot be created or deleted here.` : 'The default free trial has not been provisioned. Contact the platform administrator.'}</p>
        </div>
        {trial && <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button type="button" className={`package-switch ${trial.status === 'ACTIVE' ? 'on' : ''}`} onClick={() => void toggle(trial)} aria-label="Toggle free trial"><span /></button>
          <button type="button" className="btn btn-ghost" onClick={() => { setTrialDuration(String(trial.durationMinutes)); setTrialOpen(true) }}>Adjust duration</button>
        </div>}
      </section>

      {error && <p style={{ color: 'var(--danger-fg)', fontWeight: 700 }}>{error}</p>}
      {success && <p style={{ color: 'var(--success-fg)', fontWeight: 700 }}>{success}</p>}

      <div className="package-toolbar">
        <div className="package-tabs">
          {([['internet','Internet'],['multi','Multi-device'],['tv','TV / Smart TV']] as const).map(([key,label]) => <button type="button" key={key} className={`package-tab ${view === key ? 'active' : ''}`} onClick={() => setView(key)}>{label}<span>{counts[key]}</span></button>)}
        </div>
        <div className="package-tools"><input className="form-input" placeholder="Search this category…" value={query} onChange={(event) => setQuery(event.target.value)} /><button type="button" className="btn btn-primary" onClick={createPackage}>+ Add {view === 'multi' ? 'multi-device' : view === 'tv' ? 'TV' : 'internet'} package</button></div>
      </div>

      <div className="package-list">
        {loading && <div className="card">Loading packages…</div>}
        {!loading && visibleItems.length === 0 && <div className="card"><div className="empty-state"><p>No packages in this category.</p></div></div>}
        {visibleItems.map((item) => <div className="package-row" key={item.id}>
          <div><strong>{item.name}</strong><small>{item.code}{item.description ? ` · ${item.description}` : ''}</small></div>
          <div><small>Price</small><strong>{formatCurrency(item.activePriceUgx)}</strong></div>
          <div><small>Duration</small><strong>{formatDuration(item.durationMinutes)}</strong></div>
          <div><small>Devices</small><strong>{item.deviceLimit ?? 1}</strong></div>
          <div><small>Speed</small><strong>{speedLabel(item)}</strong></div>
          <div className="package-row-actions">
            <button type="button" className={`package-switch ${item.status === 'ACTIVE' ? 'on' : ''}`} onClick={() => void toggle(item)} aria-label={`Toggle ${item.name}`}><span /></button>
            {view === 'tv' && <button type="button" className="btn btn-primary btn-sm" onClick={() => setTvPackage(item)}>Connect TV</button>}
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => editPackage(item)}>Edit</button>
            {deleteId === item.id ? <><button type="button" className="btn btn-sm" onClick={() => void removePackage(item.id)} disabled={saving}>Confirm delete</button><button type="button" className="btn btn-ghost btn-sm" onClick={() => setDeleteId(null)}>Cancel</button></> : <button type="button" className="btn btn-ghost btn-sm" style={{ color: 'var(--danger-fg)' }} onClick={() => setDeleteId(item.id)}>Delete</button>}
          </div>
        </div>)}
      </div>

      <Modal open={formOpen} title={editing ? `Edit ${editing.name}` : 'Create internet package'} onClose={() => !saving && setFormOpen(false)} width={820}>
        <form onSubmit={savePackage}>
          {!editing && formStep === 0 && <>
            <p style={{ marginTop: 0, color: 'var(--text-2)' }}>Choose the package type first. The next screen shows only fields relevant to that type.</p>
            <div className="package-kind-grid">
              {([['INTERNET','Internet','One-device standard access'],['MULTI','Multi-device','Shared access for two or more devices'],['TV','TV / Smart TV','Access bound to a television MAC address']] as const).map(([value,title,description]) => <button type="button" key={value} className={`package-kind ${kind === value ? 'active' : ''}`} onClick={() => applyKind(value)}><strong>{title}</strong><span>{description}</span></button>)}
            </div>
            <div className="package-form-actions"><button type="button" className="btn btn-ghost" onClick={() => setFormOpen(false)}>Cancel</button><button type="button" className="btn btn-primary" onClick={() => setFormStep(1)}>Continue</button></div>
          </>}

          {(editing || formStep === 1) && <>
            <div className="package-form-grid">
              <div className="form-group package-form-full"><label className="form-label">Business</label><select className="form-input" value={form.tenantId} onChange={(event) => setForm((current) => ({ ...current, tenantId: event.target.value }))} disabled={Boolean(editing)}><option value="">Select business</option>{tenants.map((tenant) => <option value={tenant.id} key={tenant.id}>{tenant.name}</option>)}</select></div>
              <div className="form-group"><label className="form-label">Package name</label><input className="form-input" value={form.name} onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))} required /></div>
              <div className="form-group"><label className="form-label">Package code</label><input className="form-input" value={form.code} onChange={(event) => setForm((current) => ({ ...current, code: event.target.value.toUpperCase() }))} disabled={Boolean(editing)} required /></div>
              <div className="form-group"><label className="form-label">Price UGX</label><input className="form-input" type="number" min={0} value={form.priceUgx} onChange={(event) => setForm((current) => ({ ...current, priceUgx: event.target.value }))} required /></div>
              <div className="form-group"><label className="form-label">Duration minutes</label><input className="form-input" type="number" min={1} value={form.durationMinutes} onChange={(event) => setForm((current) => ({ ...current, durationMinutes: event.target.value }))} required /></div>
              {kind === 'MULTI' && <div className="form-group"><label className="form-label">Number of devices</label><input className="form-input" type="number" min={2} value={form.deviceLimit} onChange={(event) => setForm((current) => ({ ...current, deviceLimit: event.target.value }))} /></div>}
              <div className="form-group"><label className="form-label">Data limit MB (blank = unlimited)</label><input className="form-input" type="number" min={1} value={form.dataLimitMb} onChange={(event) => setForm((current) => ({ ...current, dataLimitMb: event.target.value }))} /></div>
              <div className="form-group"><label className="form-label">Download speed Kbps</label><input className="form-input" type="number" min={1} value={form.downloadSpeedKbps} onChange={(event) => setForm((current) => ({ ...current, downloadSpeedKbps: event.target.value }))} /></div>
              <div className="form-group"><label className="form-label">Upload speed Kbps</label><input className="form-input" type="number" min={1} value={form.uploadSpeedKbps} onChange={(event) => setForm((current) => ({ ...current, uploadSpeedKbps: event.target.value }))} /></div>
              <div className="form-group package-form-full"><label className="form-label">Description</label><textarea className="form-input" rows={3} value={form.description} onChange={(event) => setForm((current) => ({ ...current, description: event.target.value }))} /></div>
              <label className="package-form-full" style={{ display: 'flex', alignItems: 'center', gap: 9 }}><input type="checkbox" checked={form.isFeatured} onChange={(event) => setForm((current) => ({ ...current, isFeatured: event.target.checked }))} /> Feature this package on the customer portal</label>
            </div>
            <div className="package-form-actions"><button type="button" className="btn btn-ghost" onClick={() => !editing ? setFormStep(0) : setFormOpen(false)}>{editing ? 'Cancel' : 'Back'}</button><button type="submit" className="btn btn-primary" disabled={saving}>{saving ? 'Saving…' : editing ? 'Save changes' : 'Create package'}</button></div>
          </>}
        </form>
      </Modal>

      <Modal open={trialOpen} title="Adjust included free trial" onClose={() => !saving && setTrialOpen(false)} width={520}>
        <form onSubmit={saveTrial}><p style={{ color: 'var(--text-2)' }}>The free trial is provisioned by the platform. You may only turn it on or off and adjust its duration.</p><div className="form-group"><label className="form-label">Trial duration minutes</label><input className="form-input" type="number" min={1} value={trialDuration} onChange={(event) => setTrialDuration(event.target.value)} required /></div><div className="package-form-actions"><button type="button" className="btn btn-ghost" onClick={() => setTrialOpen(false)}>Cancel</button><button type="submit" className="btn btn-primary" disabled={saving}>{saving ? 'Saving…' : 'Save duration'}</button></div></form>
      </Modal>

      <Modal open={Boolean(tvPackage)} title={`Connect Smart TV${tvPackage ? ` · ${tvPackage.name}` : ''}`} onClose={() => !saving && setTvPackage(null)} width={560}>
        <form onSubmit={activateTv}><div className="form-group"><label className="form-label">TV wireless MAC address</label><input className="form-input" placeholder="AA:BB:CC:DD:EE:FF" value={tvMac} onChange={(event) => setTvMac(event.target.value)} required /></div><div className="form-group"><label className="form-label">Customer name (optional)</label><input className="form-input" value={tvCustomer} onChange={(event) => setTvCustomer(event.target.value)} /></div><div className="form-group"><label className="form-label">Phone number (optional)</label><input className="form-input" value={tvPhone} onChange={(event) => setTvPhone(event.target.value)} /></div><div className="package-form-actions"><button type="button" className="btn btn-ghost" onClick={() => setTvPackage(null)}>Cancel</button><button type="submit" className="btn btn-primary" disabled={saving}>{saving ? 'Connecting…' : 'Activate TV'}</button></div></form>
      </Modal>
    </div>
  )
}
