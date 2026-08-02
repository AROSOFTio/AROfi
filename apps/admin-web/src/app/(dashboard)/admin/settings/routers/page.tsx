'use client'

import { useEffect, useState, useMemo } from 'react'
import { createPortal } from 'react-dom'
import { useSearchParams } from 'next/navigation'
import { clientDeleteApi, clientFetchApi, clientPatchApi, clientPostApi } from '@/lib/client-api'
import { useRealtimeRefresh } from '@/lib/realtime'
import type { 
  RouterOverviewResponse, 
  RouterCompensationOverview,
  RouterSetupResponse,
  HotspotOverviewResponse, 
  TenantOverviewResponse,
  AdminSessionResponse 
} from '@/lib/admin-types'
import {
  Settings,
  Plus, 
  MoreVertical, 
  RefreshCw, 
  AlertCircle,
  Edit2,
  Trash2,
  Lock,
  Globe,
  Radio,
  FileCode,
  Check,
  Copy,
  PlayCircle
} from 'lucide-react'
import FormProcessStatus from '@/components/FormProcessStatus'
import { formatDate } from '@/lib/format'
import { PhoneNumberField } from '@/components/PhoneNumberField'
import { buildRemoteAccessInstallCommand } from '@/lib/mikrotik-commands'

export default function SettingsRoutersPage() {
  const [loading, setLoading] = useState(true)
  const [overview, setOverview] = useState<RouterOverviewResponse | null>(null)
  const [hotspots, setHotspots] = useState<HotspotOverviewResponse | null>(null)
  const [tenants, setTenants] = useState<any[]>([])
  const [session, setSession] = useState<AdminSessionResponse | null>(null)
  const [error, setError] = useState<string | null>(null)

  // Modals & Menu active states
  const [addModalOpen, setAddModalOpen] = useState(false)
  const [activeMenuId, setActiveMenuId] = useState<string | null>(null)
  // Viewport-fixed coordinates for the actions dropdown, since it's rendered
  // via a portal -- it used to be position:absolute inside a <td>, which got
  // silently clipped by .table-wrap's overflow-x (overflow-x: auto on one
  // axis makes the other axis "auto" too per the CSS spec, so any dropdown
  // overflowing the table's box just vanished instead of showing).
  const [menuPosition, setMenuPosition] = useState<{ top?: number; bottom?: number; right: number } | null>(null)
  const [configModalOpen, setConfigModalOpen] = useState<any | null>(null)
  const [renameModalOpen, setRenameModalOpen] = useState<any | null>(null)
  const [passwordModalOpen, setPasswordModalOpen] = useState<any | null>(null)

  // Forms states
  const [submitting, setSubmitting] = useState(false)
  const [processText, setProcessText] = useState('')
  const [formError, setFormError] = useState('')
  const [routerForm, setRouterForm] = useState({
    tenantId: '',
    groupId: '',
    hotspotId: '',
    name: '',
    siteLabel: '',
    locationText: '',
    ispName: '',
    managerName: '',
    managerPhone: '',
    host: '',
    connectionMode: 'ROUTEROS_API' as 'ROUTEROS_API' | 'ROUTEROS_API_SSL',
    apiPort: '8728',
    username: 'admin',
    password: '',
    sharedSecret: '',
    model: 'RB951Ui-2HnD',
    routerOsVersion: '7.x',
    hotspotServerName: 'hs-AroFi',
    portalWalledGardenHosts: '',
    ttlAntiTetheringEnabled: false,
    scriptMode: 'FRESH_FULL_CAPTIVE_WIFI' as 'SAFE_EXISTING_ROUTER' | 'FRESH_FULL_CAPTIVE_WIFI',
  })

  // Action states
  const [renameName, setRenameName] = useState('')
  const [adminPassword, setAdminPassword] = useState('')
  const [copiedId, setCopiedId] = useState<string | null>(null)
  const [scriptModal, setScriptModal] = useState<{ router: any; command: string; remoteCommand?: string; postRegister?: boolean } | null>(null)
  const [scriptCopied, setScriptCopied] = useState(false)
  const [remoteScriptCopied, setRemoteScriptCopied] = useState(false)
  const [loadingScript, setLoadingScript] = useState<string | null>(null)
  const [compensationModal, setCompensationModal] = useState<{ router: any; overview: RouterCompensationOverview } | null>(null)
  const [loadingCompensation, setLoadingCompensation] = useState<string | null>(null)
  const [remoteAction, setRemoteAction] = useState<string | null>(null)
  const [actionNotice, setActionNotice] = useState<{ tone: 'success' | 'error' | 'info'; message: string } | null>(null)
  const [deleteModalRouter, setDeleteModalRouter] = useState<any | null>(null)
  const [deleting, setDeleting] = useState(false)
  const [deleteError, setDeleteError] = useState('')
  // Create Group modal
  const [groupModalOpen, setGroupModalOpen] = useState(false)
  const [groupForm, setGroupForm] = useState({ name: '', code: '', description: '', region: '' })
  const [groupSubmitting, setGroupSubmitting] = useState(false)
  const [groupError, setGroupError] = useState('')
  // Rename / password actually call APIs
  const [renameSubmitting, setRenameSubmitting] = useState(false)
  const [renameError, setRenameError] = useState('')
  const [passwordSubmitting, setPasswordSubmitting] = useState(false)
  const [passwordError, setPasswordError] = useState('')

  const loadData = async (silent = false) => {
    try {
      if (!silent) setLoading(true)
      const [overviewData, hotspotData, tenantData, sessionData] = await Promise.all([
        clientFetchApi<RouterOverviewResponse>('/routers/overview'),
        clientFetchApi<HotspotOverviewResponse>('/hotspots/overview'),
        clientFetchApi<TenantOverviewResponse>('/tenants'),
        clientFetchApi<AdminSessionResponse>('/auth/me'),
      ])

      setOverview(overviewData)
      setHotspots(hotspotData)
      setTenants(tenantData.items)
      setSession(sessionData)

      // Set default tenant ID in form
      const isVendor = sessionData.user.permissions.includes('ALL') ? false : true
      const defaultTenantId = isVendor 
        ? sessionData.user.tenantId ?? '' 
        : tenantData.items[0]?.id ?? ''
      
      setRouterForm(prev => ({ ...prev, tenantId: defaultTenantId }))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load configuration data')
    } finally {
      setLoading(false)
    }
  }

  const searchParams = useSearchParams()

  // Primary update path: realtime router/session events flip the
  // online/offline dot within ~0.5s. The 20s interval is only a fallback.
  useRealtimeRefresh(() => void loadData(true), [
    'router.heartbeat',
    'router.online',
    'router.stale',
    'router.offline',
    'session.started',
    'session.stopped',
  ])

  useEffect(() => {
    loadData()
    const timer = setInterval(() => { void loadData(true) }, 20_000)
    return () => clearInterval(timer)
  }, [])

  useEffect(() => {
    if (searchParams.get('add') === 'true') {
      setAddModalOpen(true)
    }
  }, [searchParams])

  const groupsForTenant = useMemo(() => {
    if (!overview || !routerForm.tenantId) return []
    return overview.groups.filter((g) => g.tenant.id === routerForm.tenantId)
  }, [overview, routerForm.tenantId])

  const hotspotsForTenant = useMemo(() => {
    if (!hotspots || !routerForm.tenantId) return []
    return hotspots.items.filter((h) => h.tenant?.id === routerForm.tenantId)
  }, [hotspots, routerForm.tenantId])

  // Register Router
  const handleRegisterRouter = async (e: React.FormEvent) => {
    e.preventDefault()
    setFormError('')
    setProcessText('Registering router on AROFi cloud and generating installation script...')
    setSubmitting(true)

    try {
      const apiPort = Number.parseInt(routerForm.apiPort, 10)
      const portalWalledGardenHosts = routerForm.portalWalledGardenHosts
        .split(',')
        .map((host) => host.trim())
        .filter(Boolean)
        .slice(0, 12)

      const setup = await clientPostApi<RouterSetupResponse>('/routers', {
        ...routerForm,
        locationText: routerForm.locationText || undefined,
        ispName: routerForm.ispName || undefined,
        managerName: routerForm.managerName || undefined,
        managerPhone: routerForm.managerPhone || undefined,
        groupId: routerForm.groupId || undefined,
        hotspotId: routerForm.hotspotId || undefined,
        host: routerForm.host || '',
        apiPort: Number.isFinite(apiPort) ? apiPort : undefined,
        portalWalledGardenHosts: portalWalledGardenHosts.length > 0 ? portalWalledGardenHosts : undefined,
      })
      
      setAddModalOpen(false)
      setScriptModal({
        router: setup.router,
        command: setup.oneRunCommand ?? setup.provisioningScript ?? 'Script unavailable - please contact support.',
        remoteCommand: buildRemoteInstallCommand(setup.router),
        postRegister: true,
      })
      // Reset form
      setRouterForm(prev => ({
        ...prev,
        name: '',
        siteLabel: '',
        password: '',
        sharedSecret: '',
      }))
      await loadData()
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Failed to register router')
    } finally {
      setSubmitting(false)
      setProcessText('')
    }
  }

  // Action: Reboot router (fire-and-forget via health-check — actual reboot needs RouterOS API)
  const handleReboot = async (router: any) => {
    setActiveMenuId(null)
    try {
      await clientPostApi(`/routers/${router.id}/health-check`, {})
    } catch { /* ignore */ }
  }

  // Action: Test connection
  const handleTestConnection = async (routerId: string) => {
    try {
      setActiveMenuId(null)
      await clientPostApi(`/routers/${routerId}/health-check`, {})
      setActionNotice({ tone: 'success', message: 'Router health check queued. Status will refresh automatically.' })
      await loadData()
    } catch (err) {
      setActionNotice({ tone: 'error', message: err instanceof Error ? err.message : 'Test connection failed' })
    }
  }

  // Action: Rename router
  const handleRenameSubmit = async () => {
    if (!renameModalOpen || !renameName.trim()) return
    setRenameError('')
    setRenameSubmitting(true)
    try {
      await clientPatchApi(`/routers/${renameModalOpen.id}`, { name: renameName.trim() })
      setRenameModalOpen(null)
      setRenameName('')
      await loadData()
    } catch (err) {
      setRenameError(err instanceof Error ? err.message : 'Rename failed')
    } finally {
      setRenameSubmitting(false)
    }
  }

  // Action: Update admin password
  const handleUpdatePassword = async (router: any) => {
    if (!adminPassword.trim()) return
    setPasswordError('')
    setPasswordSubmitting(true)
    try {
      await clientPatchApi(`/routers/${router.id}`, { password: adminPassword })
      setPasswordModalOpen(null)
      setAdminPassword('')
    } catch (err) {
      setPasswordError(err instanceof Error ? err.message : 'Failed to update password')
    } finally {
      setPasswordSubmitting(false)
    }
  }

  // Action: Delete router
  const handleDeleteRouter = async () => {
    if (!deleteModalRouter) return
    setDeleteError('')
    setDeleting(true)
    try {
      await clientDeleteApi(`/routers/${deleteModalRouter.id}`)
      setDeleteModalRouter(null)
      await loadData()
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : 'Delete failed')
    } finally {
      setDeleting(false)
    }
  }

  // Action: Create Group
  const handleCreateGroup = async (e: React.FormEvent) => {
    e.preventDefault()
    setGroupError('')
    setGroupSubmitting(true)
    try {
      const tenantId = routerForm.tenantId || tenants[0]?.id
      await clientPostApi('/routers/groups', {
        tenantId,
        name: groupForm.name.trim(),
        code: groupForm.code.trim().toUpperCase(),
        description: groupForm.description.trim() || undefined,
        region: groupForm.region.trim() || undefined,
      })
      setGroupModalOpen(false)
      setGroupForm({ name: '', code: '', description: '', region: '' })
      await loadData()
    } catch (err) {
      setGroupError(err instanceof Error ? err.message : 'Failed to create group')
    } finally {
      setGroupSubmitting(false)
    }
  }

  const handleCopyAddress = (router: any) => {
    const vpnHost = process.env.NEXT_PUBLIC_VPN_HOST || (typeof window !== 'undefined' ? window.location.hostname : 'arofi.net')
    const address = `${vpnHost}:${router.remotePort || '30560'}`
    navigator.clipboard.writeText(address)
    setCopiedId(router.id)
    setTimeout(() => setCopiedId(null), 2000)
    setActiveMenuId(null)
  }

  const handleGetScript = async (router: any) => {
    setActiveMenuId(null)
    setLoadingScript(router.id)
    try {
      const setup = await clientFetchApi<RouterSetupResponse>(`/routers/${router.id}/setup`)
      const command = setup.oneRunCommand ?? setup.provisioningScript ?? 'Script unavailable - please contact support.'
      setScriptModal({ router: setup.router, command, remoteCommand: buildRemoteInstallCommand(setup.router) })
    } catch (err) {
      setActionNotice({ tone: 'error', message: err instanceof Error ? err.message : 'Could not load setup script. Please try again.' })
    } finally {
      setLoadingScript(null)
    }
  }

  const handleShowCompensation = async (router: any) => {
    setActiveMenuId(null)
    setLoadingCompensation(router.id)
    try {
      const compensation = await clientFetchApi<RouterCompensationOverview>(`/routers/${router.id}/compensation`)
      setCompensationModal({ router, overview: compensation })
    } catch (err) {
      setActionNotice({ tone: 'error', message: err instanceof Error ? err.message : 'Could not load compensation details.' })
    } finally {
      setLoadingCompensation(null)
    }
  }

  const handleOpenRemotePort = async (routerId: string) => {
    setActiveMenuId(null)
    setRemoteAction(routerId)
    try {
      await clientPostApi(`/routers/${routerId}/remote-access/open`, {})
      setActionNotice({ tone: 'success', message: 'Remote WinBox port opened for this router.' })
      await loadData(true)
    } catch (err) {
      setActionNotice({ tone: 'error', message: err instanceof Error ? err.message : 'Could not open remote port' })
    } finally {
      setRemoteAction(null)
    }
  }

  const handleCloseRemotePort = async (routerId: string) => {
    setActiveMenuId(null)
    setRemoteAction(routerId)
    try {
      await clientPostApi(`/routers/${routerId}/remote-access/close`, {})
      setActionNotice({ tone: 'success', message: 'Remote WinBox port closed for this router.' })
      await loadData(true)
    } catch (err) {
      setActionNotice({ tone: 'error', message: err instanceof Error ? err.message : 'Could not close remote port' })
    } finally {
      setRemoteAction(null)
    }
  }

  const handleTestRemotePort = async (routerId: string) => {
    setActiveMenuId(null)
    setRemoteAction(routerId)
    try {
      const result = await clientPostApi<{ reachable: boolean; message: string }>(`/routers/${routerId}/remote-access/test`, {})
      setActionNotice({
        tone: result.reachable ? 'success' : 'error',
        message: result.message || (result.reachable ? 'Remote port is reachable.' : 'Remote port is not reachable.'),
      })
      await loadData(true)
    } catch (err) {
      setActionNotice({ tone: 'error', message: err instanceof Error ? err.message : 'Could not test remote port' })
    } finally {
      setRemoteAction(null)
    }
  }

  const handleToggleCompensation = async (enabled: boolean) => {
    if (!compensationModal) return
    try {
      const settings = await clientPostApi<{ autoCompensateRouterOutages: boolean }>('/routers/compensation/settings', { enabled })
      setCompensationModal((previous) => previous ? { ...previous, overview: { ...previous.overview, settings } } : previous)
    } catch (err) {
      setActionNotice({ tone: 'error', message: err instanceof Error ? err.message : 'Could not update compensation setting.' })
    }
  }

  const handleManualCompensation = async () => {
    if (!compensationModal) return
    try {
      await clientPostApi(`/routers/${compensationModal.router.id}/compensation/manual`, {})
      const compensation = await clientFetchApi<RouterCompensationOverview>(`/routers/${compensationModal.router.id}/compensation`)
      setCompensationModal((previous) => previous ? { ...previous, overview: compensation } : previous)
    } catch (err) {
      setActionNotice({ tone: 'error', message: err instanceof Error ? err.message : 'Could not compensate latest outage.' })
    }
  }

  function buildRemoteInstallCommand(router: any) {
    if (!router.remoteToken) return ''
    const origin = typeof window !== 'undefined' ? window.location.origin : 'https://arofi.net'
    return buildRemoteAccessInstallCommand(router.remoteToken, origin)
  }

  function formatSecondsDuration(seconds?: number | null) {
    if (!seconds || seconds <= 0) return '0 min'
    const minutes = Math.max(1, Math.round(seconds / 60))
    if (minutes < 60) return `${minutes} min`
    const hours = Math.floor(minutes / 60)
    const remainder = minutes % 60
    return `${hours} hr${hours === 1 ? '' : 's'}${remainder ? ` ${remainder} min` : ''}`
  }

  if (loading && tenants.length === 0) {
    return (
      <div className="card" style={{ padding: 40, display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 }}>
          <RefreshCw className="animate-spin text-primary" size={32} />
          <span style={{ fontSize: 14, color: 'var(--text-secondary)' }}>Loading router list...</span>
        </div>
      </div>
    )
  }

  const routers = overview?.routers || []

  return (
    <div style={{ display: 'grid', gap: 20 }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 16 }}>
        <div style={{ display: 'grid', gap: 4 }}>
          <h1 style={{ fontSize: 24, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 10 }}>
            <Settings className="text-primary" /> Routers
          </h1>
          <p style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
            Manage your network infrastructure. Add, configure, and monitor your physical routers.
          </p>
        </div>

        <div style={{ display: 'flex', gap: 8 }}>
          <button
            type="button"
            className="btn btn-ghost"
            style={{ display: 'flex', alignItems: 'center', gap: 6 }}
            onClick={() => { setGroupForm({ name: '', code: '', description: '', region: '' }); setGroupError(''); setGroupModalOpen(true) }}
          >
            <Plus size={14} /> Add Group
          </button>
          <button
            type="button"
            className="btn btn-primary"
            style={{ display: 'flex', alignItems: 'center', gap: 6 }}
            onClick={() => setAddModalOpen(true)}
          >
            <Plus size={16} /> Add Router
          </button>
        </div>
      </div>

      {error && (
        <div className="card" style={{ border: '1px solid var(--danger-fg)', background: 'rgba(239, 68, 68, 0.05)', padding: 14 }}>
          <p style={{ color: 'var(--danger-fg)', fontSize: 13, margin: 0, display: 'flex', alignItems: 'center', gap: 8 }}>
            <AlertCircle size={16} /> {error}
          </p>
        </div>
      )}

      {/* Routers Table */}
      <div className="card" style={{ padding: 0 }}>
        <div className="table-wrap">
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ textAlign: 'left', borderBottom: '1px solid var(--border)', fontSize: 12, color: 'var(--text-secondary)' }}>
                <th style={{ padding: '16px 20px' }}>Router</th>
                <th style={{ padding: '16px 20px' }}>Model / Version</th>
                <th style={{ padding: '16px 20px' }}>Status</th>
                <th style={{ padding: '16px 20px' }}>Active Users</th>
                <th style={{ padding: '16px 20px' }}>Last Signal</th>
                <th style={{ padding: '16px 20px', textAlign: 'right' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {routers.length === 0 ? (
                <tr>
                  <td colSpan={6} style={{ textAlign: 'center', padding: '40px 20px', color: 'var(--text-secondary)' }}>
                    No routers registered. Click "+ Add Router" to onboard your first MikroTik.
                  </td>
                </tr>
              ) : (
                routers.map((router) => {
                  // Use isLiveNow (heartbeat-based) — status field lags because it
                  // reflects the last management API health check result, not the
                  // heartbeat window, so it stays HEALTHY even after power-off.
                  const isOnline = router.isLiveNow === true
                  return (
                    <tr key={router.id} style={{ borderBottom: '1px solid var(--border)', fontSize: 13 }}>
                      <td style={{ padding: '16px 20px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                          <div style={{ padding: 8, background: 'var(--bg-muted)', borderRadius: 8 }}>
                            <Radio size={16} className="text-primary" />
                          </div>
                          <div>
                            <div style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{router.name}</div>
                            <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{router.identity}</div>
                          </div>
                        </div>
                      </td>
                      <td style={{ padding: '16px 20px', color: 'var(--text-secondary)' }}>
                        {router.model || 'MIKROTIK'} <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>({router.routerOsVersion || 'v7'})</span>
                      </td>
                      <td style={{ padding: '16px 20px' }}>
                        <span className={`badge ${isOnline ? 'badge-success' : 'badge-danger'}`} style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                          <span style={{ 
                            width: 6, 
                            height: 6, 
                            borderRadius: '50%', 
                            backgroundColor: isOnline ? 'var(--success-fg)' : 'var(--danger-fg)' 
                          }} />
                          {isOnline ? 'Online' : 'Offline'}
                        </span>
                      </td>
                      <td style={{ padding: '16px 20px', color: 'var(--text-secondary)' }}>
                        {router.activeSessions ?? 0}
                      </td>
                      <td style={{ padding: '16px 20px', color: 'var(--text-secondary)', fontSize: 12 }}>
                        {router.lastSignalAt
                          ? formatDate(router.lastSignalAt)
                          : router.lastSeenAt
                            ? formatDate(router.lastSeenAt)
                            : '—'}
                      </td>
                      <td style={{ padding: '16px 20px', textAlign: 'right' }}>
                        <button
                          type="button"
                          className="btn btn-ghost"
                          style={{ padding: 6, borderRadius: '50%' }}
                          onClick={(event) => {
                            if (activeMenuId === router.id) {
                              setActiveMenuId(null)
                              return
                            }
                            const rect = event.currentTarget.getBoundingClientRect()
                            const estimatedMenuHeight = 460
                            const spaceBelow = window.innerHeight - rect.bottom
                            const spaceAbove = rect.top
                            const openUp = spaceBelow < estimatedMenuHeight && spaceAbove > spaceBelow
                            setMenuPosition({
                              right: Math.max(12, window.innerWidth - rect.right),
                              ...(openUp
                                ? { bottom: Math.max(12, window.innerHeight - rect.top + 4) }
                                : { top: Math.min(rect.bottom + 4, window.innerHeight - 12) }),
                            })
                            setActiveMenuId(router.id)
                          }}
                        >
                          <MoreVertical size={16} />
                        </button>

                        {/* Actions Dropdown — rendered via portal so the table's
                            overflow-x:auto can never clip it */}
                        {activeMenuId === router.id && menuPosition && createPortal(
                          <>
                            <div
                              style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, zIndex: 1000 }}
                              onClick={() => setActiveMenuId(null)}
                            />
                            <div style={{
                              position: 'fixed',
                              right: menuPosition.right,
                              ...(menuPosition.bottom !== undefined
                                ? { bottom: menuPosition.bottom }
                                : { top: menuPosition.top }),
                              background: 'var(--bg-card)',
                              border: '1px solid var(--border)',
                              borderRadius: 10,
                              boxShadow: 'var(--shadow-lg)',
                              width: 200,
                              maxHeight: 'min(520px, calc(100vh - 24px))',
                              overflowY: 'auto',
                              zIndex: 1001,
                              display: 'flex',
                              flexDirection: 'column',
                              padding: 6,
                              textAlign: 'left'
                            }}>
                              <button
                                type="button"
                                className="btn btn-primary"
                                style={{ justifyContent: 'flex-start', fontSize: 13, height: 'auto', padding: '8px 12px', margin: '0 0 4px 0' }}
                                onClick={() => void handleGetScript(router)}
                                disabled={loadingScript === router.id}
                              >
                                <FileCode size={14} style={{ marginRight: 8 }} />
                                {loadingScript === router.id ? 'Loading...' : 'Get Setup Script'}
                              </button>

                              <button
                                type="button"
                                className="btn btn-ghost"
                                style={{ justifyContent: 'flex-start', fontSize: 13, height: 'auto', padding: '8px 12px' }}
                                onClick={() => void handleShowCompensation(router)}
                                disabled={loadingCompensation === router.id}
                              >
                                <RefreshCw size={14} style={{ marginRight: 8 }} /> {loadingCompensation === router.id ? 'Loading...' : 'Compensation'}
                              </button>

                              <div style={{ height: 1, background: 'var(--border)', margin: '4px 0' }} />

                              <button
                                type="button"
                                className="btn btn-ghost"
                                style={{ justifyContent: 'flex-start', fontSize: 13, height: 'auto', padding: '8px 12px' }}
                                onClick={() => {
                                  setRenameModalOpen(router)
                                  setRenameName(router.name)
                                  setActiveMenuId(null)
                                }}
                              >
                                <Edit2 size={14} style={{ marginRight: 8 }} /> Rename
                              </button>

                              <button 
                                type="button" 
                                className="btn btn-ghost" 
                                style={{ justifyContent: 'flex-start', fontSize: 13, height: 'auto', padding: '8px 12px' }}
                                onClick={() => {
                                  setConfigModalOpen(router)
                                  setActiveMenuId(null)
                                }}
                              >
                                <Settings size={14} style={{ marginRight: 8 }} /> Configuration
                              </button>

                              <div style={{ height: 1, background: 'var(--border)', margin: '4px 0' }} />
                              <span style={{ fontSize: 10, textTransform: 'uppercase', color: 'var(--text-muted)', padding: '4px 12px', fontWeight: 600 }}>Remote Access</span>

                              {!router.isRemotePortOpen ? (
                                <button
                                  type="button"
                                  className="btn btn-ghost"
                                  style={{ justifyContent: 'flex-start', fontSize: 13, height: 'auto', padding: '8px 12px' }}
                                  onClick={() => void handleOpenRemotePort(router.id)}
                                  disabled={remoteAction === router.id}
                                >
                                  <Globe size={14} style={{ marginRight: 8 }} /> {remoteAction === router.id ? 'Opening...' : 'Open Port'}
                                </button>
                              ) : (
                                <button
                                  type="button"
                                  className="btn btn-ghost"
                                  style={{ justifyContent: 'flex-start', fontSize: 13, height: 'auto', padding: '8px 12px' }}
                                  onClick={() => void handleCloseRemotePort(router.id)}
                                  disabled={remoteAction === router.id}
                                >
                                  <Globe size={14} style={{ marginRight: 8 }} /> {remoteAction === router.id ? 'Closing...' : 'Close Port'}
                                </button>
                              )}

                              <button
                                type="button"
                                className="btn btn-ghost"
                                style={{ justifyContent: 'flex-start', fontSize: 13, height: 'auto', padding: '8px 12px' }}
                                onClick={() => void handleTestRemotePort(router.id)}
                                disabled={remoteAction === router.id}
                              >
                                <Radio size={14} style={{ marginRight: 8 }} /> Test Remote Port
                              </button>

                              <button 
                                type="button" 
                                className="btn btn-ghost" 
                                style={{ justifyContent: 'flex-start', fontSize: 13, height: 'auto', padding: '8px 12px' }}
                                onClick={() => handleCopyAddress(router)}
                              >
                                <Globe size={14} style={{ marginRight: 8 }} /> {copiedId === router.id ? 'Copied!' : 'Copy Address'}
                              </button>

                              <button 
                                type="button" 
                                className="btn btn-ghost" 
                                style={{ justifyContent: 'flex-start', fontSize: 13, height: 'auto', padding: '8px 12px' }}
                                onClick={() => handleTestConnection(router.id)}
                              >
                                <Radio size={14} style={{ marginRight: 8 }} /> Test Connection
                              </button>

                              <button 
                                type="button" 
                                className="btn btn-ghost" 
                                style={{ justifyContent: 'flex-start', fontSize: 13, height: 'auto', padding: '8px 12px' }}
                                onClick={() => {
                                  setPasswordModalOpen(router)
                                  setActiveMenuId(null)
                                }}
                              >
                                <Lock size={14} style={{ marginRight: 8 }} /> Update Admin Password
                              </button>

                              <button 
                                type="button" 
                                className="btn btn-ghost" 
                                style={{ justifyContent: 'flex-start', fontSize: 13, height: 'auto', padding: '8px 12px' }}
                                onClick={() => handleReboot(router)}
                              >
                                <RefreshCw size={14} style={{ marginRight: 8 }} /> Reboot Router
                              </button>

                              <div style={{ height: 1, background: 'var(--border)', margin: '4px 0' }} />

                              <button
                                type="button"
                                className="btn btn-ghost"
                                style={{ justifyContent: 'flex-start', fontSize: 13, height: 'auto', padding: '8px 12px', color: 'var(--danger-fg)' }}
                                onClick={() => {
                                  setDeleteModalRouter(router)
                                  setDeleteError('')
                                  setActiveMenuId(null)
                                }}
                              >
                                <Trash2 size={14} style={{ marginRight: 8 }} /> Delete
                              </button>
                            </div>
                          </>,
                          document.body,
                        )}
                      </td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* MODAL: Register Router */}
      {addModalOpen && (
        <div className="modal-overlay" onClick={() => setAddModalOpen(false)}>
          <div className="modal-card" style={{ width: 'min(780px, 100%)' }} onClick={(e) => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--border)', paddingBottom: 14 }}>
              <h3 style={{ fontSize: 16, fontWeight: 700, margin: 0 }}>Register MikroTik Router</h3>
              <button type="button" className="btn btn-ghost" style={{ padding: 4 }} onClick={() => setAddModalOpen(false)}>x</button>
            </div>
            
            <form onSubmit={handleRegisterRouter} style={{ marginTop: 16, display: 'grid', gap: 16 }}>
              <div className="form-grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12 }}>
                {/* Tenant Selector */}
                {session?.user.permissions.includes('ALL') && (
                  <div className="form-group">
                    <label className="form-label">Business</label>
                    <select
                      className="form-input"
                      value={routerForm.tenantId}
                      onChange={(e) => setRouterForm(prev => ({ ...prev, tenantId: e.target.value, groupId: '', hotspotId: '' }))}
                      required
                    >
                      {tenants.map(t => (
                        <option key={t.id} value={t.id}>{t.name}</option>
                      ))}
                    </select>
                  </div>
                )}

                {/* Router Name */}
                <div className="form-group">
                  <label className="form-label">Router Name</label>
                  <input
                    className="form-input"
                    type="text"
                    value={routerForm.name}
                    onChange={(e) => setRouterForm(prev => ({ ...prev, name: e.target.value }))}
                    placeholder="e.g. Main Router"
                    required
                  />
                </div>

                {/* Wi-Fi / SSID */}
                <div className="form-group">
                  <label className="form-label">Wi-Fi / Site Name (SSID)</label>
                  <input
                    className="form-input"
                    type="text"
                    value={routerForm.siteLabel}
                    onChange={(e) => setRouterForm(prev => ({ ...prev, siteLabel: e.target.value }))}
                    placeholder="e.g. MUTUNGO_HILL_WIFI"
                    required
                  />
                </div>

                {/* Physical location */}
                <div className="form-group">
                  <label className="form-label">Physical Location</label>
                  <input
                    className="form-input"
                    type="text"
                    value={routerForm.locationText}
                    onChange={(e) => setRouterForm(prev => ({ ...prev, locationText: e.target.value }))}
                    placeholder="e.g. Mutungo Hill Stage, Plot 12, Kampala"
                  />
                </div>

                {/* ISP */}
                <div className="form-group">
                  <label className="form-label">Internet Provider (ISP)</label>
                  <input
                    className="form-input"
                    type="text"
                    value={routerForm.ispName}
                    onChange={(e) => setRouterForm(prev => ({ ...prev, ispName: e.target.value }))}
                    placeholder="e.g. MTN, Airtel, Liquid, Roke"
                  />
                </div>

                {/* Site manager */}
                <div className="form-group">
                  <label className="form-label">Site Manager Name</label>
                  <input
                    className="form-input"
                    type="text"
                    value={routerForm.managerName}
                    onChange={(e) => setRouterForm(prev => ({ ...prev, managerName: e.target.value }))}
                    placeholder="Person managing this hotspot"
                  />
                </div>
                <div className="form-group">
                  <label className="form-label">Site Manager Phone</label>
                  <PhoneNumberField
                    value={routerForm.managerPhone}
                    onChange={(value) => setRouterForm(prev => ({ ...prev, managerPhone: value }))}
                  />
                </div>

                {/* Group Selector */}
                <div className="form-group">
                  <label className="form-label">Router Group</label>
                  <select
                    className="form-input"
                    value={routerForm.groupId}
                    onChange={(e) => setRouterForm(prev => ({ ...prev, groupId: e.target.value }))}
                  >
                    <option value="">No group</option>
                    {groupsForTenant.map(g => (
                      <option key={g.id} value={g.id}>{g.name}</option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Mode Selection */}
              <div>
                <label className="form-label" style={{ marginBottom: 8, display: 'block' }}>Setup Mode</label>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                  <button
                    type="button"
                    style={{
                      padding: 14,
                      borderRadius: 10,
                      border: routerForm.scriptMode === 'FRESH_FULL_CAPTIVE_WIFI' ? '2px solid var(--primary)' : '1px solid var(--border)',
                      background: routerForm.scriptMode === 'FRESH_FULL_CAPTIVE_WIFI' ? 'var(--blue-light)' : 'var(--bg-card)',
                      textAlign: 'left',
                      cursor: 'pointer'
                    }}
                    onClick={() => setRouterForm(prev => ({ ...prev, scriptMode: 'FRESH_FULL_CAPTIVE_WIFI' }))}
                  >
                    <div style={{ fontWeight: 600, fontSize: 13, display: 'flex', justifyContent: 'space-between' }}>
                      Create Customer Wi-Fi
                      {routerForm.scriptMode === 'FRESH_FULL_CAPTIVE_WIFI' && <Check size={16} className="text-primary" />}
                    </div>
                    <span style={{ fontSize: 11, color: 'var(--text-secondary)', display: 'block', marginTop: 4 }}>
                      Builds open SSID and captive portal on isolated bridge.
                    </span>
                  </button>

                  <button
                    type="button"
                    style={{
                      padding: 14,
                      borderRadius: 10,
                      border: routerForm.scriptMode === 'SAFE_EXISTING_ROUTER' ? '2px solid var(--primary)' : '1px solid var(--border)',
                      background: routerForm.scriptMode === 'SAFE_EXISTING_ROUTER' ? 'var(--blue-light)' : 'var(--bg-card)',
                      textAlign: 'left',
                      cursor: 'pointer'
                    }}
                    onClick={() => setRouterForm(prev => ({ ...prev, scriptMode: 'SAFE_EXISTING_ROUTER' }))}
                  >
                    <div style={{ fontWeight: 600, fontSize: 13, display: 'flex', justifyContent: 'space-between' }}>
                      Existing Hotspot Setup
                      {routerForm.scriptMode === 'SAFE_EXISTING_ROUTER' && <Check size={16} className="text-primary" />}
                    </div>
                    <span style={{ fontSize: 11, color: 'var(--text-secondary)', display: 'block', marginTop: 4 }}>
                      Only configures RADIUS + captive portal links.
                    </span>
                  </button>
                </div>
              </div>

              {/* Advanced Settings */}
              <div style={{ borderTop: '1px solid var(--border)', paddingTop: 14 }}>
                <h4 style={{ fontSize: 13, fontWeight: 600, margin: '0 0 12px 0' }}>Advanced / Optional Settings</h4>
                <div className="form-grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12 }}>
                  
                  {/* Link hotspot site */}
                  <div className="form-group">
                    <label className="form-label">Link Hotspot Site</label>
                    <select
                      className="form-input"
                      value={routerForm.hotspotId}
                      onChange={(e) => setRouterForm(prev => ({ ...prev, hotspotId: e.target.value }))}
                    >
                      <option value="">Link later</option>
                      {hotspotsForTenant.map(h => (
                        <option key={h.id} value={h.id}>{h.name}</option>
                      ))}
                    </select>
                  </div>

                  {/* TTL checkbox */}
                  <div className="form-group" style={{ display: 'flex', alignItems: 'center', height: '100%', paddingTop: 20 }}>
                    <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12.5, color: 'var(--text-secondary)', cursor: 'pointer' }}>
                      <input
                        type="checkbox"
                        checked={routerForm.ttlAntiTetheringEnabled}
                        onChange={(e) => setRouterForm(prev => ({ ...prev, ttlAntiTetheringEnabled: e.target.checked }))}
                      />
                      Enable TTL Anti-Tethering
                    </label>
                  </div>
                </div>
              </div>

              <div style={{ marginTop: 10 }}>
                <FormProcessStatus busy={submitting} error={formError} text={processText || 'Saving router configuration...'} />
              </div>

              <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', borderTop: '1px solid var(--border)', paddingTop: 14 }}>
                <button type="button" className="btn btn-ghost" onClick={() => setAddModalOpen(false)}>Cancel</button>
                <button type="submit" className="btn btn-primary" disabled={submitting}>Register Router</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: Configuration Detail */}
      {configModalOpen && (
        <div className="modal-overlay" onClick={() => setConfigModalOpen(null)}>
          <div className="modal-card" onClick={(e) => e.stopPropagation()}>
            <h3 style={{ fontSize: 16, fontWeight: 700, margin: '0 0 16px 0' }}>Configuration details: {configModalOpen.name}</h3>
            
            <div style={{ display: 'grid', gap: 12, fontSize: 13 }}>
              <div style={{ display: 'grid', gridTemplateColumns: '120px 1fr' }}>
                <span style={{ color: 'var(--text-secondary)' }}>Router ID:</span>
                <strong style={{ fontFamily: 'monospace' }}>{configModalOpen.id}</strong>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '120px 1fr' }}>
                <span style={{ color: 'var(--text-secondary)' }}>Identity:</span>
                <strong>{configModalOpen.identity}</strong>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '120px 1fr' }}>
                <span style={{ color: 'var(--text-secondary)' }}>API Port:</span>
                <strong>{configModalOpen.apiPort}</strong>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '120px 1fr' }}>
                <span style={{ color: 'var(--text-secondary)' }}>Connection Mode:</span>
                <strong>{configModalOpen.connectionMode}</strong>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '120px 1fr' }}>
                <span style={{ color: 'var(--text-secondary)' }}>Remote Token:</span>
                <strong style={{ fontFamily: 'monospace' }}>{configModalOpen.remoteToken || 'N/A'}</strong>
              </div>
            </div>

            <div style={{ marginTop: 20, display: 'flex', justifyContent: 'flex-end' }}>
              <button type="button" className="btn btn-primary" onClick={() => setConfigModalOpen(null)}>Done</button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: Rename Router */}
      {renameModalOpen && (
        <div className="modal-overlay" onClick={() => !renameSubmitting && setRenameModalOpen(null)}>
          <div className="modal-card" onClick={(e) => e.stopPropagation()}>
            <h3 style={{ fontSize: 16, fontWeight: 700, margin: '0 0 16px 0' }}>Rename Router</h3>
            <div className="form-group">
              <label className="form-label">New Router Name</label>
              <input
                className="form-input"
                type="text"
                value={renameName}
                onChange={(e) => setRenameName(e.target.value)}
                required
              />
            </div>
            {renameError && <p style={{ color: 'var(--danger-fg)', fontSize: 13, margin: '8px 0 0' }}>{renameError}</p>}
            <div style={{ marginTop: 20, display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button type="button" className="btn btn-ghost" onClick={() => setRenameModalOpen(null)} disabled={renameSubmitting}>Cancel</button>
              <button type="button" className="btn btn-primary" onClick={() => void handleRenameSubmit()} disabled={renameSubmitting}>{renameSubmitting ? 'Saving...' : 'Rename'}</button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: Update Admin Password */}
      {passwordModalOpen && (
        <div className="modal-overlay" onClick={() => !passwordSubmitting && setPasswordModalOpen(null)}>
          <div className="modal-card" onClick={(e) => e.stopPropagation()}>
            <h3 style={{ fontSize: 16, fontWeight: 700, margin: '0 0 16px 0' }}>Update Admin Password</h3>
            <p style={{ fontSize: 12.5, color: 'var(--text-secondary)', marginBottom: 14 }}>
              Provide the new MikroTik admin password. AROFi uses this to connect via the RouterOS API.
            </p>
            <div className="form-group">
              <label className="form-label">New API Password</label>
              <input
                className="form-input"
                type="password"
                value={adminPassword}
                onChange={(e) => setAdminPassword(e.target.value)}
                placeholder="Enter password"
                required
              />
            </div>
            {passwordError && <p style={{ color: 'var(--danger-fg)', fontSize: 13, margin: '8px 0 0' }}>{passwordError}</p>}
            <div style={{ marginTop: 20, display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button type="button" className="btn btn-ghost" onClick={() => setPasswordModalOpen(null)} disabled={passwordSubmitting}>Cancel</button>
              <button type="button" className="btn btn-primary" onClick={() => void handleUpdatePassword(passwordModalOpen)} disabled={passwordSubmitting}>{passwordSubmitting ? 'Saving...' : 'Save Password'}</button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: Delete Router */}
      {deleteModalRouter && (
        <div className="modal-overlay" onClick={() => !deleting && setDeleteModalRouter(null)}>
          <div className="modal-card" onClick={(e) => e.stopPropagation()}>
            <h3 style={{ fontSize: 16, fontWeight: 700, margin: '0 0 12px 0', color: 'var(--danger-fg)' }}>
              <Trash2 size={18} style={{ display: 'inline', marginRight: 8, verticalAlign: 'text-bottom' }} />
              Delete Router
            </h3>
            <p style={{ fontSize: 13.5, color: 'var(--text-secondary)', marginBottom: 8 }}>
              You are about to permanently delete <strong>{deleteModalRouter.name}</strong>. This removes the router, its RADIUS client, and all health-check history from AROFi.
            </p>
            <p style={{ fontSize: 13, color: 'var(--danger-fg)', background: 'rgba(239,68,68,0.07)', border: '1px solid rgba(239,68,68,0.25)', borderRadius: 8, padding: '10px 12px', marginBottom: 4 }}>
              This cannot be undone. Active sessions on this router will be orphaned until they expire naturally in RADIUS.
            </p>
            {deleteError && <p style={{ color: 'var(--danger-fg)', fontSize: 13, marginTop: 8 }}>{deleteError}</p>}
            <div style={{ marginTop: 20, display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button type="button" className="btn btn-ghost" onClick={() => setDeleteModalRouter(null)} disabled={deleting}>Cancel</button>
              <button
                type="button"
                className="btn"
                style={{ background: 'var(--danger-fg)', color: '#fff' }}
                onClick={() => void handleDeleteRouter()}
                disabled={deleting}
              >
                {deleting ? 'Deleting...' : 'Delete Router'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: Create Router Group */}
      {groupModalOpen && (
        <div className="modal-overlay" onClick={() => !groupSubmitting && setGroupModalOpen(false)}>
          <div className="modal-card" onClick={(e) => e.stopPropagation()}>
            <h3 style={{ fontSize: 16, fontWeight: 700, margin: '0 0 4px 0' }}>Create Router Group</h3>
            <p style={{ fontSize: 12.5, color: 'var(--text-secondary)', marginBottom: 16 }}>
              Groups let you organize routers by site, region, or purpose and filter them together.
            </p>
            <form onSubmit={(e) => void handleCreateGroup(e)} style={{ display: 'grid', gap: 12 }}>
              {session?.user.permissions.includes('ALL') && tenants.length > 1 && (
                <div className="form-group">
                  <label className="form-label">Business</label>
                  <select
                    className="form-input"
                    value={routerForm.tenantId}
                    onChange={(e) => setRouterForm(prev => ({ ...prev, tenantId: e.target.value }))}
                    required
                  >
                    {tenants.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                  </select>
                </div>
              )}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div className="form-group">
                  <label className="form-label">Group Name</label>
                  <input className="form-input" value={groupForm.name} onChange={(e) => setGroupForm(p => ({ ...p, name: e.target.value }))} placeholder="e.g. Kampala North" required />
                </div>
                <div className="form-group">
                  <label className="form-label">Code</label>
                  <input className="form-input" value={groupForm.code} onChange={(e) => setGroupForm(p => ({ ...p, code: e.target.value.toUpperCase() }))} placeholder="KLA-N" required />
                </div>
              </div>
              <div className="form-group">
                <label className="form-label">Region (optional)</label>
                <input className="form-input" value={groupForm.region} onChange={(e) => setGroupForm(p => ({ ...p, region: e.target.value }))} placeholder="e.g. Central" />
              </div>
              <div className="form-group">
                <label className="form-label">Description (optional)</label>
                <input className="form-input" value={groupForm.description} onChange={(e) => setGroupForm(p => ({ ...p, description: e.target.value }))} placeholder="e.g. All routers in the Kampala North zone" />
              </div>
              {groupError && <p style={{ color: 'var(--danger-fg)', fontSize: 13, margin: 0 }}>{groupError}</p>}
              <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', borderTop: '1px solid var(--border)', paddingTop: 14 }}>
                <button type="button" className="btn btn-ghost" onClick={() => setGroupModalOpen(false)} disabled={groupSubmitting}>Cancel</button>
                <button type="submit" className="btn btn-primary" disabled={groupSubmitting}>{groupSubmitting ? 'Creating...' : 'Create Group'}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: Compensation */}
      {compensationModal && (
        <div className="modal-overlay" onClick={() => setCompensationModal(null)}>
          <div className="modal-card" style={{ width: 'min(780px, 100%)' }} onClick={(e) => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', borderBottom: '1px solid var(--border)', paddingBottom: 14, marginBottom: 16 }}>
              <div style={{ display: 'grid', gap: 3 }}>
                <h3 style={{ fontSize: 16, fontWeight: 700, margin: 0 }}>Outage Compensation - {compensationModal.router.name}</h3>
                <p style={{ fontSize: 12.5, color: 'var(--text-secondary)', margin: 0 }}>
                  Auto compensation is the default. When this router comes back online, overlapping customer packages are extended by the offline time.
                </p>
              </div>
              <button type="button" className="btn btn-ghost" style={{ padding: 4, flexShrink: 0 }} onClick={() => setCompensationModal(null)}>x</button>
            </div>

            <div style={{ display: 'grid', gap: 14 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center', flexWrap: 'wrap', padding: 12, border: '1px solid var(--border)', borderRadius: 10 }}>
                <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontWeight: 700, color: 'var(--text-primary)' }}>
                  <input
                    type="checkbox"
                    checked={compensationModal.overview.settings.autoCompensateRouterOutages !== false}
                    onChange={(event) => void handleToggleCompensation(event.target.checked)}
                  />
                  Auto compensate users
                </label>
                <button type="button" className="btn btn-primary" onClick={() => void handleManualCompensation()}>
                  Compensate latest outage now
                </button>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 12 }}>
                <div style={{ display: 'grid', gap: 8 }}>
                  <strong style={{ fontSize: 13, color: 'var(--text-primary)' }}>Recent outages</strong>
                  {compensationModal.overview.outages.length === 0 && <span style={{ fontSize: 12.5, color: 'var(--text-secondary)' }}>No outages recorded yet.</span>}
                  {compensationModal.overview.outages.slice(0, 4).map((outage) => (
                    <div key={outage.id} style={{ border: '1px solid var(--border)', borderRadius: 8, padding: 10, display: 'grid', gap: 4 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                        <strong style={{ fontSize: 12.5 }}>{formatSecondsDuration(outage.durationSeconds)}</strong>
                        <span className={outage.status === 'COMPENSATED' ? 'badge badge-success' : outage.status === 'OPEN' ? 'badge badge-warning' : 'badge badge-info'}>
                          {outage.status.toLowerCase().replace(/_/g, ' ')}
                        </span>
                      </div>
                      <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{formatDate(outage.offlineAt)} - {outage.restoredAt ? formatDate(outage.restoredAt) : 'ongoing'}</span>
                      <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{outage.affectedActivations} package(s), {formatSecondsDuration(outage.totalSecondsCredited)} credited</span>
                    </div>
                  ))}
                </div>

                <div style={{ display: 'grid', gap: 8 }}>
                  <strong style={{ fontSize: 13, color: 'var(--text-primary)' }}>Recent customer credits</strong>
                  {compensationModal.overview.compensations.length === 0 && <span style={{ fontSize: 12.5, color: 'var(--text-secondary)' }}>No customer compensation credits yet.</span>}
                  {compensationModal.overview.compensations.slice(0, 4).map((credit) => (
                    <div key={credit.id} style={{ border: '1px solid var(--border)', borderRadius: 8, padding: 10, display: 'grid', gap: 4 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                        <strong style={{ fontSize: 12.5 }}>{credit.activation.package.name}</strong>
                        <span className="badge badge-success">+{formatSecondsDuration(credit.secondsCredited)}</span>
                      </div>
                      <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{credit.accessPhoneNumber ?? credit.customerReference ?? 'Customer'}</span>
                      <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>New expiry {formatDate(credit.newEndsAt)}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {actionNotice && (
        <div
          className={`badge ${actionNotice.tone === 'success' ? 'badge-success' : actionNotice.tone === 'error' ? 'badge-danger' : 'badge-info'}`}
          style={{ justifySelf: 'start', padding: '8px 12px' }}
        >
          {actionNotice.message}
        </div>
      )}

      {/* MODAL: Setup Script */}
      {scriptModal && (
        <div className="modal-overlay" onClick={() => setScriptModal(null)}>
          <div className="modal-card" style={{ width: 'min(1180px, calc(100vw - 32px))' }} onClick={(e) => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', borderBottom: '1px solid var(--border)', paddingBottom: 14, marginBottom: 16 }}>
              <div style={{ display: 'grid', gap: 3 }}>
                <h3 style={{ fontSize: 18, fontWeight: 800, margin: 0 }}>Router Setup Flow - {scriptModal.router.name}</h3>
                <p style={{ fontSize: 12.5, color: 'var(--text-secondary)', margin: 0 }}>
                  Run these in order from WinBox Terminal. Onboarding connects billing first; remote access enables support and WinBox tools.
                </p>
              </div>
              <button type="button" className="btn btn-ghost" style={{ padding: 4, flexShrink: 0 }} onClick={() => setScriptModal(null)}>×</button>
            </div>

            <div style={{ display: 'grid', gap: 12 }}>
              {scriptModal.postRegister && (
                <div style={{ padding: 12, background: 'var(--blue-light)', border: '1px solid var(--blue-mid)', borderRadius: 8, fontSize: 12.5, color: 'var(--arofi-theme-accent-text)', lineHeight: 1.5 }}>
                  Router registered. Run both scripts below for billing, monitoring, and remote support to work.
                </div>
              )}
              <div className="router-script-grid">
                <div className="router-script-panel">
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'center' }}>
                    <div style={{ display: 'grid', gap: 3 }}>
                      <strong style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span className="badge badge-info">1</span>
                        Onboarding script
                      </strong>
                      <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>Creates hotspot, RADIUS, captive portal, and anti-tethering rules.</span>
                    </div>
                    <button
                      type="button"
                      className="btn btn-primary"
                      style={{ flexShrink: 0, display: 'inline-flex', alignItems: 'center', gap: 6 }}
                      onClick={() => {
                        navigator.clipboard.writeText(scriptModal.command)
                        setScriptCopied(true)
                        setTimeout(() => setScriptCopied(false), 2000)
                      }}
                    >
                      {scriptCopied ? <Check size={14} /> : <Copy size={14} />}
                      {scriptCopied ? 'Copied' : 'Copy'}
                    </button>
                  </div>
                  <div className="router-script-code">
                    <pre>
                      {scriptModal.command}
                    </pre>
                  </div>
                  <div style={{ padding: 10, background: 'var(--bg-muted, #f8fafc)', border: '1px solid var(--border)', borderRadius: 8, fontSize: 12.5, color: 'var(--text-secondary)', lineHeight: 1.5 }}>
                    <strong style={{ color: 'var(--text-primary)' }}>Run first:</strong> Open WinBox, open Terminal, paste this command, press Enter, and wait until it finishes.
                  </div>
                  <a href="/docs/getting-started#run-onboarding-script" target="_blank" rel="noopener noreferrer" style={{ fontSize: 12.5, display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                    <PlayCircle size={14} /> Video: onboarding script
                  </a>
                </div>
                <div className="router-script-panel">
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'center' }}>
                    <div style={{ display: 'grid', gap: 3 }}>
                      <strong style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span className="badge badge-success">2</span>
                        Remote access script
                      </strong>
                      <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>Enables secure WinBox support, port tests, reboot, and remote access tools.</span>
                    </div>
                    {scriptModal.remoteCommand && (
                      <button
                        type="button"
                        className="btn btn-primary"
                        style={{ flexShrink: 0, display: 'inline-flex', alignItems: 'center', gap: 6 }}
                        onClick={() => {
                          navigator.clipboard.writeText(scriptModal.remoteCommand || '')
                          setRemoteScriptCopied(true)
                          setTimeout(() => setRemoteScriptCopied(false), 2000)
                        }}
                      >
                        {remoteScriptCopied ? <Check size={14} /> : <Copy size={14} />}
                        {remoteScriptCopied ? 'Copied' : 'Copy'}
                      </button>
                    )}
                  </div>
                  <div className="router-script-code">
                    <pre>
                      {scriptModal.remoteCommand || 'Remote access script unavailable - reopen this router menu after registration refreshes.'}
                    </pre>
                  </div>
                  <div style={{ padding: 10, background: 'var(--bg-muted, #f8fafc)', border: '1px solid var(--border)', borderRadius: 8, fontSize: 12.5, color: 'var(--text-secondary)', lineHeight: 1.5 }}>
                    <strong style={{ color: 'var(--text-primary)' }}>Run second:</strong> Paste after onboarding completes. The router row should then show remote address and test results.
                  </div>
                  <a href="/docs/getting-started#run-remote-access-script" target="_blank" rel="noopener noreferrer" style={{ fontSize: 12.5, display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                    <PlayCircle size={14} /> Video: remote access script
                  </a>
                </div>
              </div>

              <div style={{ padding: 12, background: 'var(--amber-light)', border: '1px solid var(--amber-mid)', borderRadius: 8, fontSize: 12.5, color: 'var(--amber-dark)', lineHeight: 1.5 }}>
                <strong>Required:</strong> The router will not sell internet, monitor users, or accept remote support until both scripts have been run successfully.
              </div>

              <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
                <button type="button" className="btn btn-ghost" onClick={() => setScriptModal(null)}>Close</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
