'use client'

import { FormEvent, useEffect, useMemo, useState } from 'react'
import FormProcessStatus from '@/components/FormProcessStatus'
import { DurationInput } from '@/components/DurationInput'
import { PackageCatalogResponse, TenantOverviewResponse } from '@/lib/admin-types'
import { clientDeleteApi, clientFetchApi, clientPatchApi, clientPostApi } from '@/lib/client-api'
import { formatCurrency, formatDuration } from '@/lib/format'

type PackageItem = PackageCatalogResponse['items'][number]
type PackageView = 'internet' | 'multi' | 'tv'

type PackageFormState = {
  tenantId: string
  name: string
  code: string
  description: string
  durationMinutes: string
  isTrialEnabled: boolean
  dataLimitMb: string
  deviceLimit: string
  downloadSpeedKbps: string
  uploadSpeedKbps: string
  initialPriceUgx: string
  isFeatured: boolean
}

type TvActivationFormState = {
  macAddress: string
  customerName: string
  phoneNumber: string
}

const initialFormState: PackageFormState = {
  tenantId: '',
  name: '',
  code: '',
  description: '',
  durationMinutes: '60',
  isTrialEnabled: false,
  dataLimitMb: '',
  deviceLimit: '1',
  downloadSpeedKbps: '',
  uploadSpeedKbps: '',
  initialPriceUgx: '1000',
  isFeatured: false,
}

function parseOptionalInt(value: string) {
  if (!value.trim()) return undefined
  const parsed = Number.parseInt(value, 10)
  return Number.isFinite(parsed) ? parsed : undefined
}

function packageSearchText(item: PackageItem) {
  return `${item.name} ${item.code} ${item.description ?? ''}`.toLowerCase()
}

function isTvPackage(item: PackageItem) {
  const haystack = packageSearchText(item)
  return haystack.includes('tv') || haystack.includes('smart') || haystack.includes('stream')
}

function isMultiDevicePackage(item: PackageItem) {
  return !isTvPackage(item) && Number(item.deviceLimit ?? 1) > 1
}

function formatSpeed(item: PackageItem) {
  if (!item.downloadSpeedKbps && !item.uploadSpeedKbps) return 'Unlimited'
  const down = item.downloadSpeedKbps ? `${Math.round(item.downloadSpeedKbps / 1024)} Mbps` : 'Unlimited'
  const up = item.uploadSpeedKbps ? `${Math.round(item.uploadSpeedKbps / 1024)} Mbps` : 'Unlimited'
  return `${down} ↓ / ${up} ↑`
}

export default function PackagesManagerImproved() {
  const [catalog, setCatalog] = useState<PackageCatalogResponse | null>(null)
  const [tenants, setTenants] = useState<TenantOverviewResponse['items']>([])
  const [formState, setFormState] = useState<PackageFormState>(initialFormState)
  const [packageView, setPackageView] = useState<PackageView>('internet')
  const [filterQuery, setFilterQuery] = useState('')
  const [formVersion, setFormVersion] = useState(0)
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [statusUpdatingId, setStatusUpdatingId] = useState<string | null>(null)
  const [processText, setProcessText] = useState('')
  const [formError, setFormError] = useState<string | null>(null)
  const [createOpen, setCreateOpen] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null)
  const [tvActivationPackage, setTvActivationPackage] = useState<PackageItem | null>(null)
  const [tvActivationForm, setTvActivationForm] = useState<TvActivationFormState>({
    macAddress: '',
    customerName: '',
    phoneNumber: '',
  })
  const [activatingTv, setActivatingTv] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  useEffect(() => {
    void loadData()
  }, [])

  async function loadData() {
    try {
      setLoading(true)
      const [catalogData, tenantData] = await Promise.all([
        clientFetchApi<PackageCatalogResponse>('/packages'),
        clientFetchApi<TenantOverviewResponse>('/tenants'),
      ])
      setCatalog(catalogData)
      setTenants(tenantData.items)
      if (tenantData.items[0]) {
        setFormState((previous) => previous.tenantId
          ? previous
          : { ...previous, tenantId: tenantData.items[0].id })
      }
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Unable to load package data')
    } finally {
      setLoading(false)
    }
  }

  function openForm(nextState: PackageFormState, editingPackageId: string | null) {
    setError(null)
    setFormError(null)
    setSuccess(null)
    setProcessText('')
    setEditingId(editingPackageId)
    setFormState(nextState)
    setFormVersion((version) => version + 1)
    setCreateOpen(true)
  }

  function startEdit(item: PackageItem) {
    openForm({
      tenantId: item.tenant.id,
      name: item.name,
      code: item.code,
      description: item.description ?? '',
      durationMinutes: String(item.durationMinutes),
      isTrialEnabled: item.isTrialEnabled,
      dataLimitMb: item.dataLimitMb != null ? String(item.dataLimitMb) : '',
      deviceLimit: item.deviceLimit != null ? String(item.deviceLimit) : '1',
      downloadSpeedKbps: item.downloadSpeedKbps != null ? String(item.downloadSpeedKbps) : '',
      uploadSpeedKbps: item.uploadSpeedKbps != null ? String(item.uploadSpeedKbps) : '',
      initialPriceUgx: String(item.activePriceUgx),
      isFeatured: item.isFeatured,
    }, item.id)
  }

  function startCreate() {
    setPackageView('internet')
    openForm({ ...initialFormState, tenantId: formState.tenantId }, null)
  }

  function startCreateMultiDevicePackage() {
    setPackageView('multi')
    openForm({
      ...initialFormState,
      tenantId: formState.tenantId,
      name: 'Family 2 Devices',
      code: 'FAMILY-2',
      description: 'Shared internet package for two devices.',
      durationMinutes: String(24 * 60),
      deviceLimit: '2',
      initialPriceUgx: '1500',
    }, null)
  }

  function startCreateTvPackage() {
    setPackageView('tv')
    openForm({
      ...initialFormState,
      tenantId: formState.tenantId,
      name: 'Smart TV Daily',
      code: 'TV-DAILY',
      description: 'Smart TV streaming access. Connect the TV once, then keep access bound to that TV.',
      durationMinutes: String(24 * 60),
      isTrialEnabled: false,
      deviceLimit: '1',
      downloadSpeedKbps: '8192',
      uploadSpeedKbps: '2048',
      initialPriceUgx: '1000',
      isFeatured: true,
    }, null)
  }

  function startCreateTrialPackage() {
    setPackageView('internet')
    openForm({
      ...initialFormState,
      tenantId: formState.tenantId,
      name: 'Free Trial',
      code: 'FREE-TRIAL',
      description: 'One-time free trial for a new device.',
      durationMinutes: '5',
      isTrialEnabled: true,
      deviceLimit: '1',
      initialPriceUgx: '0',
    }, null)
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError(null)
    setFormError(null)
    setSuccess(null)

    if (!formState.tenantId) {
      const failure = 'Select a business before saving the package'
      setError(failure)
      setFormError(failure)
      return
    }

    const durationMinutes = Number.parseInt(formState.durationMinutes, 10)
    if (!Number.isFinite(durationMinutes) || durationMinutes < 1) {
      const failure = 'Enter a valid package duration'
      setError(failure)
      setFormError(failure)
      return
    }

    setSubmitting(true)
    setProcessText(editingId ? 'Saving package changes.' : 'Creating package.')

    const commonPayload = {
      name: formState.name.trim(),
      description: formState.description.trim() || undefined,
      durationMinutes,
      isTrialEnabled: formState.isTrialEnabled,
      dataLimitMb: formState.isTrialEnabled ? undefined : parseOptionalInt(formState.dataLimitMb),
      deviceLimit: formState.isTrialEnabled ? 1 : parseOptionalInt(formState.deviceLimit),
      downloadSpeedKbps: formState.isTrialEnabled ? undefined : parseOptionalInt(formState.downloadSpeedKbps),
      uploadSpeedKbps: formState.isTrialEnabled ? undefined : parseOptionalInt(formState.uploadSpeedKbps),
      isFeatured: formState.isFeatured,
    }

    try {
      if (editingId) {
        await clientPatchApi(`/packages/${editingId}`, {
          ...commonPayload,
          priceUgx: formState.isTrialEnabled ? 0 : Number.parseInt(formState.initialPriceUgx, 10),
        })
      } else {
        await clientPostApi('/packages', {
          ...commonPayload,
          tenantId: formState.tenantId,
          code: formState.code.trim().toUpperCase(),
          initialPriceUgx: formState.isTrialEnabled ? 0 : Number.parseInt(formState.initialPriceUgx, 10),
          status: 'ACTIVE',
        })
      }

      setProcessText('Refreshing package catalog.')
      setSuccess(editingId ? 'Package updated successfully' : 'Package created successfully')
      setCreateOpen(false)
      setEditingId(null)
      setFormState({ ...initialFormState, tenantId: formState.tenantId })
      await loadData()
    } catch (requestError) {
      const failure = requestError instanceof Error
        ? requestError.message
        : editingId
          ? 'Unable to update package'
          : 'Unable to create package'
      setError(failure)
      setFormError(failure)
    } finally {
      setSubmitting(false)
      setProcessText('')
    }
  }

  async function handleStatusToggle(item: PackageItem) {
    const nextStatus = item.status === 'ACTIVE' ? 'DRAFT' : 'ACTIVE'
    setStatusUpdatingId(item.id)
    setError(null)
    setSuccess(null)

    try {
      await clientPatchApi(`/packages/${item.id}`, { status: nextStatus })
      setCatalog((previous) => {
        if (!previous) return previous
        const activeDelta = nextStatus === 'ACTIVE' ? 1 : -1
        return {
          ...previous,
          summary: {
            ...previous.summary,
            activePackages: Math.max(0, previous.summary.activePackages + activeDelta),
          },
          items: previous.items.map((candidate) => candidate.id === item.id
            ? { ...candidate, status: nextStatus }
            : candidate),
        }
      })
      setSuccess(`${item.name} is now ${nextStatus === 'ACTIVE' ? 'ON and visible to customers' : 'OFF and hidden from customers'}.`)
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Unable to change package status')
    } finally {
      setStatusUpdatingId(null)
    }
  }

  async function handleDelete(packageId: string) {
    setDeleting(true)
    setError(null)
    setSuccess(null)
    try {
      await clientDeleteApi(`/packages/${packageId}`)
      setSuccess('Package deleted successfully')
      setDeleteConfirmId(null)
      await loadData()
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Unable to delete package')
      setDeleteConfirmId(null)
    } finally {
      setDeleting(false)
    }
  }

  function startTvActivation(item: PackageItem) {
    setError(null)
    setSuccess(null)
    setTvActivationPackage(item)
    setTvActivationForm({ macAddress: '', customerName: '', phoneNumber: '' })
  }

  async function handleTvActivation(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!tvActivationPackage) return

    setActivatingTv(true)
    setError(null)
    setSuccess(null)
    try {
      await clientPostApi(`/packages/${tvActivationPackage.id}/tv-activations`, {
        tenantId: tvActivationPackage.tenant.id,
        macAddress: tvActivationForm.macAddress.trim(),
        customerName: tvActivationForm.customerName.trim() || undefined,
        phoneNumber: tvActivationForm.phoneNumber.trim() || undefined,
      })
      setSuccess('Smart TV activated. Turn the TV WiFi off and on once to connect.')
      setTvActivationPackage(null)
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Unable to activate this TV')
    } finally {
      setActivatingTv(false)
    }
  }

  const items = catalog?.items ?? []
  const sectionCounts = useMemo(() => ({
    internet: items.filter((item) => !isTvPackage(item) && !isMultiDevicePackage(item)).length,
    multi: items.filter(isMultiDevicePackage).length,
    tv: items.filter(isTvPackage).length,
  }), [items])

  const visibleItems = useMemo(() => {
    const query = filterQuery.trim().toLowerCase()
    return items.filter((item) => {
      const inSection = packageView === 'tv'
        ? isTvPackage(item)
        : packageView === 'multi'
          ? isMultiDevicePackage(item)
          : !isTvPackage(item) && !isMultiDevicePackage(item)
      return inSection && (!query || packageSearchText(item).includes(query))
    })
  }, [items, packageView, filterQuery])

  function renderStatusToggle(item: PackageItem) {
    const active = item.status === 'ACTIVE'
    const updating = statusUpdatingId === item.id
    return (
      <div className="package-status-control">
        <button
          type="button"
          className={`package-status-switch ${active ? 'on' : ''}`}
          onClick={() => void handleStatusToggle(item)}
          disabled={updating}
          aria-label={`${active ? 'Turn off' : 'Turn on'} ${item.name}`}
          aria-pressed={active}
          title={`${active ? 'Turn off' : 'Turn on'} ${item.name}`}
        >
          <span />
        </button>
        <strong>{updating ? 'Saving…' : active ? 'On' : 'Off'}</strong>
      </div>
    )
  }

  function renderActions(item: PackageItem) {
    if (deleteConfirmId === item.id) {
      return (
        <div className="package-row-actions delete-confirm">
          <span>Delete this package?</span>
          <button
            type="button"
            className="btn btn-sm package-danger-button"
            onClick={() => void handleDelete(item.id)}
            disabled={deleting}
          >
            {deleting ? 'Deleting…' : 'Yes, delete'}
          </button>
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => setDeleteConfirmId(null)} disabled={deleting}>
            Cancel
          </button>
        </div>
      )
    }

    return (
      <div className="package-row-actions">
        {packageView === 'tv' && (
          <button type="button" className="btn btn-primary btn-sm" onClick={() => startTvActivation(item)}>
            Connect TV
          </button>
        )}
        <button type="button" className="btn btn-ghost btn-sm" onClick={() => startEdit(item)}>Edit</button>
        <button
          type="button"
          className="btn btn-ghost btn-sm package-delete-button"
          onClick={() => {
            setDeleteConfirmId(item.id)
            setError(null)
            setSuccess(null)
          }}
        >
          Delete
        </button>
      </div>
    )
  }

  return (
    <>
      <style>{`
        .packages-page .page-header { margin-bottom: 16px; }
        .packages-toolbar { display: flex; justify-content: space-between; align-items: center; gap: 14px; flex-wrap: wrap; margin-bottom: 14px; }
        .packages-toolbar-left, .packages-toolbar-actions { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
        .package-tabs { display: inline-flex; align-items: center; gap: 4px; padding: 4px; border: 1px solid var(--border); border-radius: 12px; background: var(--surface); }
        .package-tab { appearance: none; border: 0; background: transparent; color: var(--text-2); font: inherit; font-weight: 700; padding: 9px 14px; border-radius: 9px; cursor: pointer; white-space: nowrap; }
        .package-tab.active { background: var(--brand); color: #fff; box-shadow: 0 4px 12px rgba(37, 99, 235, .2); }
        .package-tab-count { display: inline-flex; min-width: 20px; height: 20px; align-items: center; justify-content: center; margin-left: 5px; padding: 0 5px; border-radius: 999px; background: rgba(148, 163, 184, .18); font-size: 11px; }
        .package-tab.active .package-tab-count { background: rgba(255, 255, 255, .2); }
        .packages-search { width: min(280px, 100%); min-height: 44px; }
        .package-modal-card { width: min(1080px, calc(100vw - 32px)); max-height: calc(100dvh - 32px); overflow-y: auto; overscroll-behavior: contain; }
        .package-form-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 16px 20px; margin-bottom: 16px; }
        .package-form-grid .form-group { min-width: 0; }
        .package-form-full { grid-column: 1 / -1; }
        .package-trial-notice { grid-column: 1 / -1; display: flex; gap: 12px; align-items: flex-start; padding: 14px 16px; border: 1px solid #bfdbfe; border-radius: 12px; background: #eff6ff; color: #1e3a8a; }
        .package-trial-notice strong { display: block; margin-bottom: 3px; }
        .package-trial-notice p { margin: 0; font-size: 13px; line-height: 1.45; }
        .package-form-actions { display: flex; justify-content: flex-end; align-items: center; gap: 10px; flex-wrap: wrap; margin-top: 16px; }
        .packages-table-shell { overflow-x: auto; }
        .packages-table { min-width: 1040px; }
        .package-status-control { display: inline-flex; align-items: center; gap: 8px; }
        .package-status-control strong { min-width: 25px; font-size: 12px; color: var(--text-2); }
        .package-status-switch { position: relative; width: 52px; height: 30px; flex: 0 0 52px; padding: 0; border: 0; border-radius: 999px; background: #cbd5e1; cursor: pointer; transition: background .18s ease; }
        .package-status-switch span { position: absolute; top: 3px; left: 3px; width: 24px; height: 24px; border-radius: 50%; background: #fff; box-shadow: 0 1px 4px rgba(15, 23, 42, .28); transition: transform .18s ease; }
        .package-status-switch.on { background: #16a34a; }
        .package-status-switch.on span { transform: translateX(22px); }
        .package-status-switch:disabled { cursor: wait; opacity: .6; }
        .package-row-actions { display: flex; align-items: center; justify-content: flex-end; gap: 7px; flex-wrap: wrap; }
        .package-row-actions.delete-confirm { color: var(--danger-fg); font-size: 12px; }
        .package-delete-button { color: var(--danger-fg) !important; }
        .package-danger-button { background: var(--danger-fg) !important; color: #fff !important; border: 0 !important; }
        .package-name { color: var(--text-primary); font-weight: 700; }
        .package-sub-label { margin-top: 4px; font-size: 12px; color: var(--brand-fg); font-weight: 700; }
        .packages-mobile-list { display: none; }
        .package-mobile-card { border: 1px solid var(--border); border-radius: 14px; background: var(--surface); padding: 15px; box-shadow: 0 2px 10px rgba(15, 23, 42, .04); }
        .package-mobile-card + .package-mobile-card { margin-top: 10px; }
        .package-mobile-head { display: flex; justify-content: space-between; align-items: flex-start; gap: 12px; }
        .package-mobile-title { font-size: 17px; font-weight: 800; color: var(--text-primary); }
        .package-mobile-code { margin-top: 3px; font-size: 11px; color: var(--text-muted); }
        .package-mobile-price { font-size: 16px; font-weight: 800; color: var(--brand-fg); white-space: nowrap; }
        .package-mobile-meta { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px; margin-top: 14px; }
        .package-mobile-meta div { padding: 9px 10px; border-radius: 10px; background: var(--surface-2, #f8fafc); min-width: 0; }
        .package-mobile-meta span { display: block; margin-bottom: 3px; font-size: 10px; color: var(--text-muted); text-transform: uppercase; letter-spacing: .05em; }
        .package-mobile-meta strong { display: block; font-size: 13px; color: var(--text-primary); overflow-wrap: anywhere; }
        .package-mobile-footer { display: flex; justify-content: space-between; align-items: center; gap: 12px; margin-top: 14px; padding-top: 12px; border-top: 1px solid var(--border); }
        .package-mobile-footer .package-row-actions { justify-content: flex-end; }
        .package-section-info { margin-bottom: 12px; }
        @media (max-width: 900px) {
          .packages-toolbar { align-items: stretch; }
          .packages-toolbar-left, .packages-toolbar-actions { width: 100%; }
          .packages-toolbar-left { display: grid; grid-template-columns: 1fr; }
          .package-tabs { width: 100%; overflow-x: auto; }
          .package-tab { flex: 1; }
          .packages-search { width: 100%; }
          .packages-toolbar-actions { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); }
          .packages-toolbar-actions .btn { width: 100%; min-height: 44px; }
        }
        @media (max-width: 760px) {
          .packages-page .page-title { font-size: 25px; line-height: 1.15; }
          .packages-page .page-subtitle { font-size: 13px; line-height: 1.45; }
          .package-modal-card { width: calc(100vw - 12px) !important; max-width: none !important; max-height: calc(100dvh - 12px); padding: 20px 14px 18px !important; border-radius: 16px !important; }
          .package-modal-card .modal-close { top: 12px; right: 12px; }
          .package-modal-card .modal-title { padding-right: 54px; font-size: 24px; }
          .package-form-grid { grid-template-columns: 1fr; gap: 14px; }
          .package-form-full, .package-trial-notice { grid-column: auto; }
          .package-form-grid .form-input { min-height: 48px; font-size: 16px; color: var(--text-primary); background: var(--surface); }
          .package-form-actions { display: grid; grid-template-columns: 1fr; }
          .package-form-actions .btn { width: 100%; min-height: 46px; }
          .packages-desktop-table { display: none; }
          .packages-mobile-list { display: block; }
          .package-mobile-footer { align-items: flex-start; flex-direction: column; }
          .package-mobile-footer .package-row-actions { width: 100%; display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); }
          .package-mobile-footer .package-row-actions .btn { width: 100%; min-height: 42px; }
          .package-mobile-footer .package-row-actions.delete-confirm { grid-template-columns: 1fr; }
          .package-mobile-footer .package-row-actions.delete-confirm span { grid-column: 1 / -1; }
        }
        @media (max-width: 430px) {
          .package-tabs { display: grid; grid-template-columns: 1fr; }
          .package-tab { width: 100%; }
          .packages-toolbar-actions { grid-template-columns: 1fr; }
          .package-mobile-meta { grid-template-columns: 1fr; }
        }
      `}</style>

      <div className="packages-page">
        <div className="page-header">
          <div>
            <h1 className="page-title">Manage Packages</h1>
            <p className="page-subtitle">Create and manage internet, multi-device, free-trial, and Smart TV access packages.</p>
          </div>
        </div>

        {createOpen && (
          <div className="modal-overlay" role="dialog" aria-modal="true" onClick={() => !submitting && setCreateOpen(false)}>
            <div className="modal-card wide package-modal-card" onClick={(event) => event.stopPropagation()}>
              <button type="button" className="modal-close" onClick={() => setCreateOpen(false)} disabled={submitting}>Close</button>
              <div className="modal-kicker">Package catalog</div>
              <h2 className="modal-title">
                {editingId ? 'Edit Package' : formState.isTrialEnabled ? 'Create Free Trial' : 'Create Package'}
              </h2>
              <form onSubmit={handleSubmit} style={{ marginTop: 18 }}>
                <div className="package-form-grid">
                  <div className="form-group">
                    <label className="form-label">Business</label>
                    <select
                      className="form-input"
                      value={formState.tenantId}
                      onChange={(event) => setFormState((previous) => ({ ...previous, tenantId: event.target.value }))}
                      required
                      disabled={Boolean(editingId)}
                    >
                      <option value="">Select business</option>
                      {tenants.map((tenant) => <option key={tenant.id} value={tenant.id}>{tenant.name}</option>)}
                    </select>
                  </div>

                  <div className="form-group">
                    <label className="form-label">Package Name</label>
                    <input
                      className="form-input"
                      value={formState.name}
                      onChange={(event) => setFormState((previous) => ({ ...previous, name: event.target.value }))}
                      placeholder="Starter 2 Hours"
                      required
                    />
                  </div>

                  {!formState.isTrialEnabled && (
                    <div className="form-group">
                      <label className="form-label">Code</label>
                      <input
                        className="form-input"
                        value={formState.code}
                        onChange={(event) => setFormState((previous) => ({ ...previous, code: event.target.value.toUpperCase() }))}
                        placeholder="STARTER-2H"
                        required
                        disabled={Boolean(editingId)}
                      />
                    </div>
                  )}

                  <div className="form-group">
                    <label className="form-label">Duration</label>
                    <DurationInput
                      key={formVersion}
                      valueMinutes={formState.durationMinutes}
                      onChangeMinutes={(minutes) => setFormState((previous) => ({ ...previous, durationMinutes: minutes }))}
                      inputClassName="form-input"
                      selectClassName="form-input"
                    />
                  </div>

                  {formState.isTrialEnabled && (
                    <div className="package-trial-notice">
                      <span aria-hidden="true">✨</span>
                      <div>
                        <strong>Dedicated free-trial package</strong>
                        <p>This package is always free and limited to one use per device. Normal paid packages can no longer be accidentally changed into trials.</p>
                      </div>
                    </div>
                  )}

                  {!formState.isTrialEnabled && (
                    <>
                      <div className="form-group">
                        <label className="form-label">Price (UGX)</label>
                        <input
                          className="form-input"
                          type="number"
                          inputMode="numeric"
                          min={1}
                          value={formState.initialPriceUgx}
                          onChange={(event) => setFormState((previous) => ({ ...previous, initialPriceUgx: event.target.value }))}
                          required
                        />
                      </div>

                      <div className="form-group">
                        <label className="form-label">Maximum devices</label>
                        <select
                          className="form-input"
                          value={formState.deviceLimit}
                          onChange={(event) => setFormState((previous) => ({ ...previous, deviceLimit: event.target.value }))}
                        >
                          <option value="1">1 device — individual package</option>
                          <option value="2">2 devices — couple / family</option>
                          <option value="3">3 devices</option>
                          <option value="4">4 devices</option>
                          <option value="5">5 devices — maximum</option>
                        </select>
                        {Number(formState.deviceLimit) > 1 && (
                          <p style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 5, lineHeight: 1.45 }}>
                            This package will automatically appear under the Multi-device section.
                          </p>
                        )}
                      </div>

                      <div className="form-group">
                        <label className="form-label">Data Limit MB (optional)</label>
                        <input
                          className="form-input"
                          type="number"
                          inputMode="numeric"
                          min={1}
                          value={formState.dataLimitMb}
                          onChange={(event) => setFormState((previous) => ({ ...previous, dataLimitMb: event.target.value }))}
                          placeholder="Unlimited"
                        />
                      </div>

                      <div className="form-group">
                        <label className="form-label">Download Kbps (optional)</label>
                        <input
                          className="form-input"
                          type="number"
                          inputMode="numeric"
                          min={1}
                          value={formState.downloadSpeedKbps}
                          onChange={(event) => setFormState((previous) => ({ ...previous, downloadSpeedKbps: event.target.value }))}
                          placeholder="Unlimited"
                        />
                      </div>

                      <div className="form-group">
                        <label className="form-label">Upload Kbps (optional)</label>
                        <input
                          className="form-input"
                          type="number"
                          inputMode="numeric"
                          min={1}
                          value={formState.uploadSpeedKbps}
                          onChange={(event) => setFormState((previous) => ({ ...previous, uploadSpeedKbps: event.target.value }))}
                          placeholder="Unlimited"
                        />
                      </div>
                    </>
                  )}

                  <div className="form-group package-form-full">
                    <label className="form-label">Description</label>
                    <input
                      className="form-input"
                      value={formState.description}
                      onChange={(event) => setFormState((previous) => ({ ...previous, description: event.target.value }))}
                      placeholder="Fast daily hotspot access for customers."
                    />
                  </div>
                </div>

                <label style={{ fontSize: 13, color: 'var(--text-2)', display: 'inline-flex', gap: 8, alignItems: 'center' }}>
                  <input
                    type="checkbox"
                    checked={formState.isFeatured}
                    onChange={(event) => setFormState((previous) => ({ ...previous, isFeatured: event.target.checked }))}
                  />
                  Mark as featured
                </label>

                <div className="package-form-actions">
                  <button type="button" className="btn btn-ghost" onClick={() => setCreateOpen(false)} disabled={submitting}>Cancel</button>
                  <button type="submit" className="btn btn-primary" disabled={submitting}>
                    {submitting ? 'Saving…' : editingId ? 'Save Changes' : formState.isTrialEnabled ? 'Create Free Trial' : 'Create Package'}
                  </button>
                </div>

                <div style={{ marginTop: 12 }}>
                  <FormProcessStatus
                    busy={submitting}
                    error={formError}
                    success={success}
                    text={processText || 'Package changes are applied after AROFi saves them.'}
                  />
                </div>
              </form>
            </div>
          </div>
        )}

        {tvActivationPackage && (
          <div className="modal-overlay" role="dialog" aria-modal="true" onClick={() => !activatingTv && setTvActivationPackage(null)}>
            <div className="modal-card package-modal-card" onClick={(event) => event.stopPropagation()}>
              <button type="button" className="modal-close" onClick={() => setTvActivationPackage(null)} disabled={activatingTv}>Close</button>
              <div className="modal-kicker">Smart TV access</div>
              <h2 className="modal-title">Connect TV to {tvActivationPackage.name}</h2>
              <p className="page-subtitle" style={{ marginTop: 6 }}>
                Enter the TV wireless MAC address, then reconnect the TV to WiFi.
              </p>
              <form onSubmit={handleTvActivation} style={{ marginTop: 18 }}>
                <div className="package-form-grid">
                  <div className="form-group package-form-full">
                    <label className="form-label">TV MAC Address</label>
                    <input
                      className="form-input"
                      value={tvActivationForm.macAddress}
                      onChange={(event) => setTvActivationForm((previous) => ({ ...previous, macAddress: event.target.value }))}
                      placeholder="AA:BB:CC:DD:EE:FF"
                      autoFocus
                      required
                    />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Customer / Room Name</label>
                    <input
                      className="form-input"
                      value={tvActivationForm.customerName}
                      onChange={(event) => setTvActivationForm((previous) => ({ ...previous, customerName: event.target.value }))}
                      placeholder="Room 12 TV"
                    />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Phone (optional)</label>
                    <input
                      className="form-input"
                      inputMode="tel"
                      value={tvActivationForm.phoneNumber}
                      onChange={(event) => setTvActivationForm((previous) => ({ ...previous, phoneNumber: event.target.value }))}
                      placeholder="0771 234 567"
                    />
                  </div>
                </div>
                <div className="info-panel">
                  <strong>Find the TV MAC:</strong> Settings → Network → WiFi → Advanced or Status. Use the Wireless MAC, not Bluetooth MAC.
                </div>
                <div className="package-form-actions">
                  <button type="button" className="btn btn-ghost" onClick={() => setTvActivationPackage(null)} disabled={activatingTv}>Cancel</button>
                  <button type="submit" className="btn btn-primary" disabled={activatingTv}>
                    {activatingTv ? 'Activating…' : 'Activate TV'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {error && !formError && <p style={{ color: 'var(--danger-fg)', fontSize: 13, marginBottom: 10 }}>{error}</p>}
        {success && !submitting && <p style={{ color: 'var(--success-fg)', fontSize: 13, marginBottom: 10 }}>{success}</p>}

        <div className="packages-toolbar">
          <div className="packages-toolbar-left">
            <div className="package-tabs" role="tablist" aria-label="Package type">
              <button type="button" className={`package-tab ${packageView === 'internet' ? 'active' : ''}`} onClick={() => setPackageView('internet')}>
                Internet <span className="package-tab-count">{sectionCounts.internet}</span>
              </button>
              <button type="button" className={`package-tab ${packageView === 'multi' ? 'active' : ''}`} onClick={() => setPackageView('multi')}>
                Multi-device <span className="package-tab-count">{sectionCounts.multi}</span>
              </button>
              <button type="button" className={`package-tab ${packageView === 'tv' ? 'active' : ''}`} onClick={() => setPackageView('tv')}>
                TV / Smart TV <span className="package-tab-count">{sectionCounts.tv}</span>
              </button>
            </div>
            <input
              className="form-input packages-search"
              value={filterQuery}
              onChange={(event) => setFilterQuery(event.target.value)}
              placeholder="Search packages…"
              aria-label="Search packages"
            />
          </div>

          <div className="packages-toolbar-actions">
            <button type="button" className="btn btn-ghost" onClick={startCreateTrialPackage}>+ Free Trial</button>
            <button type="button" className="btn btn-ghost" onClick={startCreateMultiDevicePackage}>+ Multi-device</button>
            <button type="button" className="btn btn-ghost" onClick={startCreateTvPackage}>+ TV Package</button>
            <button type="button" className="btn btn-primary" onClick={startCreate}>+ Internet Package</button>
          </div>
        </div>

        <div className="card">
          {packageView === 'multi' && (
            <div className="info-panel package-section-info">
              <strong>Multi-device packages:</strong> plans for two to five devices are kept here so the main Internet list stays clean.
            </div>
          )}
          {packageView === 'tv' && (
            <div className="info-panel package-section-info">
              <strong>TV connection:</strong> choose a TV package, click Connect TV, enter its wireless MAC address, then reconnect the TV.
            </div>
          )}

          <div className="packages-desktop-table packages-table-shell">
            <table className="packages-table">
              <thead>
                <tr>
                  <th>Package</th>
                  <th>Price</th>
                  <th>Duration</th>
                  <th>Devices</th>
                  <th>Speed</th>
                  <th>Data</th>
                  <th>Status</th>
                  <th style={{ textAlign: 'right' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {loading && (
                  <tr><td colSpan={8}><div className="empty-state"><p>Loading package catalog…</p></div></td></tr>
                )}
                {!loading && visibleItems.length === 0 && (
                  <tr>
                    <td colSpan={8}>
                      <div className="empty-state">
                        <p>{filterQuery ? 'No packages match your search.' : packageView === 'tv' ? 'No TV packages yet.' : packageView === 'multi' ? 'No multi-device packages yet.' : 'No internet packages yet.'}</p>
                      </div>
                    </td>
                  </tr>
                )}
                {visibleItems.map((item) => (
                  <tr key={item.id}>
                    <td>
                      <div className="package-name">{item.name}</div>
                      <div style={{ marginTop: 3, fontSize: 11, color: 'var(--text-muted)' }}>{item.code}</div>
                      {item.isTrialEnabled && <div className="package-sub-label">Free trial</div>}
                    </td>
                    <td style={{ color: 'var(--text-primary)', fontWeight: 700 }}>{formatCurrency(item.activePriceUgx)}</td>
                    <td>{formatDuration(item.durationMinutes)}</td>
                    <td>{item.deviceLimit ?? 1}</td>
                    <td>{formatSpeed(item)}</td>
                    <td>{item.dataLimitMb ? `${item.dataLimitMb} MB` : 'Unlimited'}</td>
                    <td>{renderStatusToggle(item)}</td>
                    <td>{renderActions(item)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="packages-mobile-list">
            {loading && <div className="empty-state"><p>Loading package catalog…</p></div>}
            {!loading && visibleItems.length === 0 && (
              <div className="empty-state"><p>{filterQuery ? 'No packages match your search.' : 'No packages in this section yet.'}</p></div>
            )}
            {visibleItems.map((item) => (
              <article className="package-mobile-card" key={item.id}>
                <div className="package-mobile-head">
                  <div>
                    <div className="package-mobile-title">{item.name}</div>
                    <div className="package-mobile-code">{item.code}{item.isTrialEnabled ? ' · FREE TRIAL' : ''}</div>
                  </div>
                  <div className="package-mobile-price">{formatCurrency(item.activePriceUgx)}</div>
                </div>
                <div className="package-mobile-meta">
                  <div><span>Duration</span><strong>{formatDuration(item.durationMinutes)}</strong></div>
                  <div><span>Devices</span><strong>{item.deviceLimit ?? 1}</strong></div>
                  <div><span>Speed</span><strong>{formatSpeed(item)}</strong></div>
                  <div><span>Data</span><strong>{item.dataLimitMb ? `${item.dataLimitMb} MB` : 'Unlimited'}</strong></div>
                </div>
                <div className="package-mobile-footer">
                  {renderStatusToggle(item)}
                  {renderActions(item)}
                </div>
              </article>
            ))}
          </div>
        </div>
      </div>
    </>
  )
}
