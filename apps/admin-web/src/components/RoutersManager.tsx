'use client'

import { FormEvent, useEffect, useMemo, useState, type Dispatch, type SetStateAction } from 'react'
import {
  AdminSessionResponse,
  HotspotOverviewResponse,
  RouterOverviewResponse,
  RouterSetupResponse,
  TenantOverviewResponse,
} from '@/lib/admin-types'
import FormProcessStatus from '@/components/FormProcessStatus'
import { clientFetchApi, clientPostApi } from '@/lib/client-api'
import { formatDate, formatLatency, getStatusBadgeClass } from '@/lib/format'

type GroupFormState = {
  tenantId: string
  name: string
  code: string
  region: string
  description: string
}

type RouterFormState = {
  tenantId: string
  groupId: string
  hotspotId: string
  name: string
  identity: string
  host: string
  connectionMode: 'ROUTEROS_API' | 'ROUTEROS_API_SSL'
  apiPort: string
  username: string
  password: string
  sharedSecret: string
  siteLabel: string
  model: string
  routerOsVersion: string
  hotspotServerName: string
  portalWalledGardenHosts: string
  ttlAntiTetheringEnabled: boolean
  scriptMode: 'SAFE_EXISTING_ROUTER' | 'FRESH_FULL_HOTSPOT' | 'FRESH_FULL_CAPTIVE_WIFI'
  tags: string
}

const initialGroupForm: GroupFormState = {
  tenantId: '',
  name: '',
  code: '',
  region: '',
  description: '',
}

const initialRouterForm = (): RouterFormState => ({
  tenantId: '',
  groupId: '',
  hotspotId: '',
  name: '',
  identity: '',
  host: '',
  connectionMode: 'ROUTEROS_API',
  apiPort: '',
  username: 'admin',
  password: '',
  sharedSecret: generateSecret(),
  siteLabel: '',
  model: '',
  routerOsVersion: '',
  hotspotServerName: '',
  portalWalledGardenHosts: '',
  ttlAntiTetheringEnabled: false,
  scriptMode: 'FRESH_FULL_CAPTIVE_WIFI',
  tags: '',
})

function generateSecret() {
  return Math.random().toString(36).slice(2, 10) + Math.random().toString(36).slice(2, 10)
}

function parseOptionalInt(value: string) {
  if (!value.trim()) {
    return undefined
  }

  const parsed = Number.parseInt(value, 10)
  return Number.isFinite(parsed) ? parsed : undefined
}

function parseTags(value: string) {
  return value.split(',').map((item) => item.trim()).filter(Boolean)
}

function parseHosts(value: string) {
  return value.split(',').map((item) => item.trim()).filter(Boolean)
}

export default function RoutersManager() {
  const [overview, setOverview] = useState<RouterOverviewResponse | null>(null)
  const [hotspots, setHotspots] = useState<HotspotOverviewResponse | null>(null)
  const [tenants, setTenants] = useState<TenantOverviewResponse['items']>([])
  const [session, setSession] = useState<AdminSessionResponse | null>(null)
  const [groupForm, setGroupForm] = useState<GroupFormState>(initialGroupForm)
  const [routerForm, setRouterForm] = useState<RouterFormState>(initialRouterForm)
  const [selectedSetup, setSelectedSetup] = useState<RouterSetupResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadingSetup, setLoadingSetup] = useState(false)
  const [submittingGroup, setSubmittingGroup] = useState(false)
  const [submittingRouter, setSubmittingRouter] = useState(false)
  const [runningHealthCheckId, setRunningHealthCheckId] = useState<string | null>(null)
  const [showAdvancedRouterSettings, setShowAdvancedRouterSettings] = useState(false)
  const [groupModalOpen, setGroupModalOpen] = useState(false)
  const [routerModalOpen, setRouterModalOpen] = useState(false)
  const [groupProcessText, setGroupProcessText] = useState('')
  const [routerProcessText, setRouterProcessText] = useState('')
  const [groupFormError, setGroupFormError] = useState('')
  const [routerFormError, setRouterFormError] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  const routerSummary = overview?.summary ?? {
    totalRouters: 0,
    healthyRouters: 0,
    degradedRouters: 0,
    offlineRouters: 0,
    pendingRouters: 0,
    routerGroups: 0,
    activeSessions: 0,
    averageLatencyMs: 0,
  }

  const showTenantSelector = !session?.user.tenantId && tenants.length > 1
  const groupsForTenant = useMemo(
    () => (overview?.groups ?? []).filter((group) => group.tenant.id === routerForm.tenantId),
    [overview, routerForm.tenantId],
  )
  const hotspotsForTenant = useMemo(
    () => (hotspots?.items ?? []).filter((hotspot) => hotspot.tenant.id === routerForm.tenantId),
    [hotspots, routerForm.tenantId],
  )
  const launchChecklist = useMemo(
    () => [
      { title: 'Hotspot site', ready: (hotspots?.items.length ?? 0) > 0 },
      { title: 'Router group', ready: (overview?.groups.length ?? 0) > 0 },
      { title: 'First router', ready: (overview?.routers.length ?? 0) > 0 },
      { title: 'RADIUS/API verification', ready: (overview?.summary.healthyRouters ?? 0) > 0 },
    ],
    [hotspots, overview],
  )

  useEffect(() => {
    void loadData()
  }, [])

  async function loadData(preferredRouterId?: string) {
    try {
      setLoading(true)
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

      const defaultTenantId = sessionData.user.tenantId ?? tenantData.items[0]?.id ?? ''
      setGroupForm((previous) => (previous.tenantId ? previous : { ...previous, tenantId: defaultTenantId }))
      setRouterForm((previous) => (previous.tenantId ? previous : { ...previous, tenantId: defaultTenantId }))

      const setupRouterId =
        preferredRouterId && overviewData.routers.some((router) => router.id === preferredRouterId)
          ? preferredRouterId
          : overviewData.routers[0]?.id

      if (setupRouterId) {
        await loadSetup(setupRouterId)
      } else {
        setSelectedSetup(null)
      }
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Unable to load router data')
    } finally {
      setLoading(false)
    }
  }

  async function loadSetup(routerId: string) {
    try {
      setLoadingSetup(true)
      setError(null)
      setSelectedSetup(await clientFetchApi<RouterSetupResponse>(`/routers/${routerId}/setup`))
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Unable to load router setup')
    } finally {
      setLoadingSetup(false)
    }
  }

  async function handleCreateGroup(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError(null)
    setSuccess(null)
    setGroupFormError('')
    setGroupProcessText('Creating router group for this tenant.')
    setSubmittingGroup(true)

    try {
      await clientPostApi('/routers/groups', {
        tenantId: groupForm.tenantId,
        name: groupForm.name.trim(),
        code: groupForm.code.trim().toUpperCase(),
        region: groupForm.region.trim() || undefined,
        description: groupForm.description.trim() || undefined,
      })
      setGroupProcessText('Refreshing router groups and tenant launch checklist.')
      setSuccess('Router group created successfully')
      setGroupForm((previous) => ({ ...initialGroupForm, tenantId: previous.tenantId }))
      await loadData()
      setGroupModalOpen(false)
    } catch (requestError) {
      const failure = requestError instanceof Error ? requestError.message : 'Unable to create router group'
      setError(failure)
      setGroupFormError(failure)
    } finally {
      setSubmittingGroup(false)
      setGroupProcessText('')
    }
  }

  async function handleRegisterRouter(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError(null)
    setSuccess(null)
    setRouterFormError('')
    setRouterProcessText('Registering MikroTik router and preparing the onboarding script.')
    setSubmittingRouter(true)

    try {
      const setup = await clientPostApi<RouterSetupResponse>('/routers', {
        tenantId: routerForm.tenantId,
        groupId: routerForm.groupId || undefined,
        hotspotId: routerForm.hotspotId || undefined,
        name: routerForm.name.trim(),
        identity: routerForm.identity.trim() || undefined,
        host: routerForm.host.trim(),
        connectionMode: routerForm.connectionMode,
        apiPort: parseOptionalInt(routerForm.apiPort),
        username: routerForm.username.trim(),
        password: routerForm.password,
        sharedSecret: routerForm.sharedSecret.trim(),
        siteLabel: routerForm.siteLabel.trim() || undefined,
        model: routerForm.model.trim() || undefined,
        routerOsVersion: routerForm.routerOsVersion.trim() || undefined,
        hotspotServerName: routerForm.hotspotServerName.trim() || undefined,
        portalWalledGardenHosts: parseHosts(routerForm.portalWalledGardenHosts),
        ttlAntiTetheringEnabled: routerForm.ttlAntiTetheringEnabled,
        scriptMode: routerForm.scriptMode,
        tags: parseTags(routerForm.tags),
      })
      setRouterProcessText('Generating RouterOS setup details and refreshing inventory.')
      setSelectedSetup(setup)
      setSuccess('Router registered successfully. The provisioning script is ready below.')
      setRouterForm((previous) => ({
        ...initialRouterForm(),
        tenantId: previous.tenantId,
        groupId: previous.groupId,
        hotspotId: previous.hotspotId,
      }))
      await loadData(setup.router.id)
      setRouterModalOpen(false)
    } catch (requestError) {
      const failure = requestError instanceof Error ? requestError.message : 'Unable to register router'
      setError(failure)
      setRouterFormError(failure)
    } finally {
      setSubmittingRouter(false)
      setRouterProcessText('')
    }
  }

  async function handleHealthCheck(routerId: string) {
    try {
      setRunningHealthCheckId(routerId)
      setError(null)
      setSuccess(null)
      setSelectedSetup(await clientPostApi<RouterSetupResponse>(`/routers/${routerId}/health-check`, {}))
      setSuccess('Health check completed and setup details refreshed.')
      await loadData(routerId)
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Unable to run health check')
    } finally {
      setRunningHealthCheckId(null)
    }
  }

  async function handleRotateSecret(routerId: string) {
    try {
      setError(null)
      setSuccess(null)
      const setup = await clientPostApi<RouterSetupResponse>(`/routers/${routerId}/rotate-radius-secret`, {})
      setSelectedSetup(setup)
      setSuccess('RADIUS secret rotated. Paste the newly generated script into the router again.')
      await loadData(routerId)
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Unable to rotate RADIUS secret')
    }
  }

  async function copyScript() {
    if (!selectedSetup?.provisioningScript) {
      return
    }
    const cmd = `/tool fetch url="https://arofi.arosoft.io/api/mikrotik/script/${selectedSetup.router.registrationKey}" dst-path="a.rsc" mode=https; /import file-name="a.rsc"; /file remove "a.rsc"`
    await navigator.clipboard.writeText(cmd)
    setSuccess('RouterOS script copied to clipboard.')
  }

  async function copyRouterAccessDetails() {
    if (!selectedSetup?.router) {
      return
    }

    const router = selectedSetup.router
    const lines = [
      `Router: ${router.name}`,
      `WinBox Address: ${router.host}`,
      `WinBox Username: admin`,
      `WinBox Password: leave empty only if this router admin password is blank`,
      `RouterOS API for AROFi health checks: ${router.host}:${router.apiPort}`,
      `Status: ${router.managementApiReachable ? 'API reachable' : 'API management not reachable from AROFi'}`,
      'Remote WinBox connects only if TCP 8291 is reachable through public IP, port-forwarding, VPN, or tunnel.',
    ]

    await navigator.clipboard.writeText(lines.join('\n'))
    setSuccess('Router management connection details copied without password.')
  }

  function downloadScript() {
    if (!selectedSetup?.provisioningScript) {
      return
    }
    const blob = new Blob([selectedSetup.provisioningScript], { type: 'text/plain' })
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = `${selectedSetup.router.name.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}-arofi-routeros.rsc`
    anchor.click()
    URL.revokeObjectURL(url)
  }

  return (
    <>
      <div className="page-header">
        <div>
          <h1 className="page-title">Routers</h1>
          <p className="page-subtitle">
            Register the first MikroTik, link it to a hotspot, and push RouterOS billing setup from the tenant workspace.
          </p>
        </div>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <span className="badge badge-info" style={{ padding: '8px 12px' }}>
            {overview?.radiusFoundation.serverHost ?? 'RADIUS pending'}:{overview?.radiusFoundation.authPort ?? 1812}
          </span>
          {session?.user.tenantName && (
            <span className="badge badge-success" style={{ padding: '8px 12px' }}>
              {session.user.tenantName}
            </span>
          )}
        </div>
      </div>

      <div className="stats-grid" style={{ marginBottom: 20 }}>
        {[
          { label: 'Routers', value: `${routerSummary.totalRouters}`, color: 'blue' },
          { label: 'Healthy', value: `${routerSummary.healthyRouters}`, color: 'green' },
          { label: 'Pending', value: `${routerSummary.pendingRouters}`, color: 'amber' },
          { label: 'Groups', value: `${routerSummary.routerGroups}`, color: 'purple' },
          { label: 'Live Sessions', value: `${routerSummary.activeSessions}`, color: 'blue' },
          { label: 'Avg Latency', value: formatLatency(routerSummary.averageLatencyMs), color: 'green' },
        ].map((stat) => (
          <div key={stat.label} className={`stat-card ${stat.color}`}>
            <div className="stat-label">{stat.label}</div>
            <div className={`stat-value ${stat.color}`}>{stat.value}</div>
          </div>
        ))}
      </div>

      <div className="charts-grid">
        <div className="card">
          <div className="card-header">
            <span className="card-title">Tenant Launch Sequence</span>
          </div>
          <div style={{ padding: 20, display: 'grid', gap: 12 }}>
            {launchChecklist.map((step, index) => (
              <div key={step.title} style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                <span className={step.ready ? 'badge badge-success' : 'badge badge-warning'} style={{ minWidth: 28, justifyContent: 'center' }}>
                  {index + 1}
                </span>
                <span style={{ color: 'var(--text-secondary)' }}>
                  {step.title} {step.ready ? 'ready' : 'pending'}
                </span>
              </div>
            ))}
          </div>
        </div>

        <div className="card">
          <div className="card-header">
            <span className="card-title">Selected Router Setup</span>
            {loadingSetup && <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>Refreshing...</span>}
          </div>
          <div style={{ padding: 20, display: 'grid', gap: 10 }}>
            <div style={{ color: 'var(--text-primary)', fontWeight: 700 }}>
              {selectedSetup?.router.name ?? 'No router selected yet'}
            </div>
            <div style={{ color: 'var(--text-secondary)', fontSize: 13 }}>
              {selectedSetup?.router.hotspot?.name ??
                'Register a router to receive a RouterOS provisioning script and checklist.'}
            </div>
            <div style={{ fontFamily: 'monospace', fontSize: 12, color: 'var(--text-muted)' }}>
              Secret hint {selectedSetup?.radiusClient?.sharedSecretHint ?? overview?.radiusFoundation.sharedSecretHint ?? 'Pending'}
            </div>
            <div style={{ fontFamily: 'monospace', fontSize: 12, color: 'var(--text-muted)' }}>
              NAS client {selectedSetup?.nasClient ? `${selectedSetup.nasClient.nasname} (${selectedSetup.nasClient.enabled ? 'enabled' : 'disabled'})` : 'pending'}
            </div>
            {selectedSetup?.router && (
                <div style={{ display: 'grid', gap: 6, padding: 12, border: '1px solid var(--border)', borderRadius: 8, background: 'var(--surface-muted)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
                  <strong style={{ color: 'var(--text-primary)', fontSize: 13 }}>Remote management details</strong>
                  <button type="button" className="btn btn-ghost" onClick={() => void copyRouterAccessDetails()}>Copy details</button>
                </div>
                <div style={{ fontFamily: 'monospace', fontSize: 12, color: 'var(--text-secondary)' }}>Host/IP: {selectedSetup.router.host}</div>
                <div style={{ fontFamily: 'monospace', fontSize: 12, color: 'var(--text-secondary)' }}>API: {selectedSetup.router.host}:{selectedSetup.router.apiPort} | WinBox service: TCP 8291</div>
                <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>This is a reachability target, not a guarantee. ISP NAT, firewall, missing port forwarding, or disabled WinBox can block remote login.</div>
              </div>
            )}
            {selectedSetup?.router && (
              <div style={{ display: 'grid', gap: 10, padding: 14, border: '1px solid var(--green-mid)', borderRadius: 12, background: 'var(--green-light)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
                  <strong style={{ color: 'var(--green-dark)', fontSize: 14 }}>Remote WinBox access for vendor</strong>
                  <button type="button" className="btn btn-primary" onClick={() => void copyRouterAccessDetails()}>Copy WinBox Address</button>
                </div>
                {selectedSetup.router.host.includes('.self-service') ? (
                  <div style={{ color: 'var(--text-2)', fontSize: 13, lineHeight: 1.55 }}>
                    Run the RouterOS script first. After the router calls back, AROFi will show the remote address here.
                  </div>
                ) : (
                  <>
                    <div style={{ display: 'grid', gridTemplateColumns: '120px 1fr', gap: 8, color: 'var(--text-2)', fontSize: 13 }}>
                      <span>Address</span><strong style={{ color: 'var(--text-1)', fontFamily: 'monospace' }}>{selectedSetup.router.host}</strong>
                      <span>Username</span><strong style={{ color: 'var(--text-1)' }}>admin</strong>
                      <span>Password</span><strong style={{ color: 'var(--text-1)' }}>Leave empty only if router admin password is blank</strong>
                    </div>
                    <div style={{ color: 'var(--text-2)', fontSize: 12, lineHeight: 1.5 }}>
                      Open WinBox and paste the AROFi address into Connect To. Remote login works only if TCP 8291 reaches the MikroTik through public IP, port forwarding, VPN, or tunnel.
                    </div>
                  </>
                )}
              </div>
            )}
            {selectedSetup?.router && (
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <span className="badge badge-info">{selectedSetup.router.onboardingStatus ?? 'SCRIPT_GENERATED'}</span>
                <span className={selectedSetup.router.provisioningCallbackReceived ? 'badge badge-success' : 'badge badge-warning'}>
                  {selectedSetup.router.provisioningCallbackReceived ? 'Script callback received' : 'Waiting for script callback'}
                </span>
                <span className={selectedSetup.router.radiusAuthSeen ? 'badge badge-success' : 'badge badge-warning'}>
                  {selectedSetup.router.radiusAuthSeen ? 'RADIUS auth seen' : 'RADIUS auth not seen'}
                </span>
                <span className={selectedSetup.router.accountingSeen ? 'badge badge-success' : 'badge badge-warning'}>
                  {selectedSetup.router.accountingSeen ? 'Accounting seen' : 'Accounting not seen'}
                </span>
                <span className={selectedSetup.router.managementApiReachable ? 'badge badge-success' : 'badge badge-warning'}>
                  {selectedSetup.router.managementApiReachable ? 'Management API reachable' : `API mgmt needs TCP ${selectedSetup.router.apiPort}`}
                </span>
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="charts-grid">
        <div className="card">
          <div className="card-header"><span className="card-title">Router Groups</span></div>
          <div style={{ padding: 20, display: 'grid', gap: 12 }}>
            <p style={{ color: 'var(--text-secondary)', fontSize: 13, lineHeight: 1.6 }}>Group routers by branch, region, or site before registering MikroTik devices.</p>
            <button type="button" className="btn btn-primary" onClick={() => { setGroupFormError(''); setGroupProcessText(''); setGroupModalOpen(true) }}>Create Router Group</button>
          </div>
        </div>
        <div className="card">
          <div className="card-header"><span className="card-title">MikroTik Registration</span></div>
          <div style={{ padding: 20, display: 'grid', gap: 12 }}>
            <p style={{ color: 'var(--text-secondary)', fontSize: 13, lineHeight: 1.6 }}>Register a MikroTik, generate the RouterOS script, then verify callback, RADIUS, accounting, and optional API reachability.</p>
            <button type="button" className="btn btn-primary" onClick={() => { setRouterFormError(''); setRouterProcessText(''); setRouterModalOpen(true) }}>Register MikroTik Router</button>
          </div>
        </div>
      </div>

      {groupModalOpen && (
        <div className="modal-overlay" role="dialog" aria-modal="true" onClick={() => !submittingGroup && setGroupModalOpen(false)}>
          <div className="modal-card" onClick={(event) => event.stopPropagation()}>
            <button type="button" className="modal-close" onClick={() => setGroupModalOpen(false)} disabled={submittingGroup}>Close</button>
            <RouterGroupCard
              formState={groupForm}
              setFormState={setGroupForm}
              onSubmit={handleCreateGroup}
              submitting={submittingGroup}
              processText={groupProcessText}
              formError={groupFormError}
              showTenantSelector={showTenantSelector}
              tenants={tenants}
            />
          </div>
        </div>
      )}

      {routerModalOpen && (
        <div className="modal-overlay" role="dialog" aria-modal="true" onClick={() => !submittingRouter && setRouterModalOpen(false)}>
          <div className="modal-card" style={{ width: 'min(980px, 100%)' }} onClick={(event) => event.stopPropagation()}>
            <button type="button" className="modal-close" onClick={() => setRouterModalOpen(false)} disabled={submittingRouter}>Close</button>
            <RouterCreateCard
              formState={routerForm}
              setFormState={setRouterForm}
              onSubmit={handleRegisterRouter}
              submitting={submittingRouter}
              processText={routerProcessText}
              formError={routerFormError}
              showTenantSelector={showTenantSelector}
              tenants={tenants}
              groups={groupsForTenant}
              hotspots={hotspotsForTenant}
              showAdvanced={showAdvancedRouterSettings}
              setShowAdvanced={setShowAdvancedRouterSettings}
            />
          </div>
        </div>
      )}

      {(error || success) && (
        <div className="card">
          <div style={{ padding: 16 }}>
            {error && <p style={{ color: 'var(--danger-fg)', fontSize: 13 }}>{error}</p>}
            {success && <p style={{ color: 'var(--success-fg)', fontSize: 13 }}>{success}</p>}
          </div>
        </div>
      )}

      <div className="charts-grid">
        <div className="card">
          <div className="card-header">
            <span className="card-title">Provisioning Checklist</span>
          </div>
          <div style={{ padding: 20, display: 'grid', gap: 10 }}>
            <div style={{ color: 'var(--text-secondary)', fontSize: 13, lineHeight: 1.6 }}>
              Open WinBox, WebFig, or SSH Terminal, paste the script, then press Enter. The script now calls AROFi back so the platform can learn the router public/NAT IP. AROFi becomes live only after real RADIUS authentication or accounting traffic is received.
            </div>
            {(selectedSetup?.onboardingChecklist ?? []).length === 0 && (
              <div className="empty-state">
                <p>Register a router to receive MikroTik onboarding instructions.</p>
              </div>
            )}
            {(selectedSetup?.onboardingChecklist ?? []).map((item, index) => (
              <div key={item} style={{ display: 'flex', gap: 10 }}>
                <span className="badge badge-info" style={{ minWidth: 28, justifyContent: 'center' }}>{index + 1}</span>
                <span style={{ color: 'var(--text-secondary)' }}>{item}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="card">
          <div className="card-header">
            <span className="card-title">Provisioning Script</span>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <button type="button" className="btn btn-ghost" onClick={() => void copyScript()} disabled={!selectedSetup?.provisioningScript}>Copy</button>
              <button type="button" className="btn btn-ghost" onClick={downloadScript} disabled={!selectedSetup?.provisioningScript}>Download</button>
              <button type="button" className="btn btn-ghost" onClick={() => selectedSetup && void handleRotateSecret(selectedSetup.router.id)} disabled={!selectedSetup}>Rotate Secret</button>
            </div>
          </div>
          <div style={{ padding: 20 }}>
            <div style={{ display: 'grid', gap: 8, marginBottom: 14 }}>
              {(selectedSetup?.setupDiagnostics ?? []).map((check) => (
                <div key={check.code} style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center' }}>
                  <span style={{ color: 'var(--text-secondary)', fontSize: 13 }}>{check.label}</span>
                  <span className={check.ok ? 'badge badge-success' : 'badge badge-warning'}>{check.ok ? 'pass' : 'pending'}</span>
                </div>
              ))}
            </div>
            <pre style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word', background: 'rgba(255,255,255,0.03)', border: '1px solid var(--border)', borderRadius: 12, padding: 16, fontSize: 12, lineHeight: 1.6, color: 'var(--text-primary)', minHeight: 280 }}>
              {selectedSetup?.router.registrationKey 
                ? `/tool fetch url="https://arofi.arosoft.io/api/mikrotik/script/${selectedSetup.router.registrationKey}" dst-path="a.rsc" mode=https; /import file-name="a.rsc"; /file remove "a.rsc"`
                : 'The RouterOS setup script will appear here after your first MikroTik is registered.'}
            </pre>
            {selectedSetup?.router && (
              <div style={{ marginTop: 14, display: 'grid', gap: 8, color: 'var(--text-secondary)', fontSize: 13, lineHeight: 1.55 }}>
                <strong style={{ color: 'var(--text-primary)' }}>Manual checks after script import</strong>
                <span>1. If the script says callback failed, fix router DNS/internet, then import again.</span>
                <span>2. If the router was registered without a real NAS/public IP, restart FreeRADIUS once on the VPS: <code>sudo docker compose restart freeradius</code>.</span>
                <span>3. If the router is behind a Savana/ISP router, API health check needs port forwarding TCP {selectedSetup.router.apiPort} to the MikroTik, or use a reachable VPN/private IP. HotSpot and RADIUS can still work without this.</span>
                <span>4. The script installs MikroTik <code>hotspot/login.html</code> automatically. If the script warns that install failed, fix router internet/DNS/HTTPS, then import it again.</span>
              </div>
            )}
          </div>
        </div>
      </div>

      <RouterInventoryTable
        loading={loading}
        routers={overview?.routers ?? []}
        recentHealthChecks={overview?.recentHealthChecks ?? []}
        onLoadSetup={(routerId) => void loadSetup(routerId)}
        onHealthCheck={(routerId) => void handleHealthCheck(routerId)}
        runningHealthCheckId={runningHealthCheckId}
      />
    </>
  )
}

function RouterGroupCard({
  formState,
  setFormState,
  onSubmit,
  submitting,
  processText,
  formError,
  showTenantSelector,
  tenants,
}: {
  formState: GroupFormState
  setFormState: Dispatch<SetStateAction<GroupFormState>>
  onSubmit: (event: FormEvent<HTMLFormElement>) => void
  submitting: boolean
  processText: string
  formError: string
  showTenantSelector: boolean
  tenants: TenantOverviewResponse['items']
}) {
  return (
    <div className="card">
      <div className="card-header"><span className="card-title">Create Router Group</span></div>
      <div className="content" style={{ paddingTop: 16 }}>
        <form onSubmit={onSubmit}>
          <div className="stats-grid" style={{ marginBottom: 12 }}>
            {showTenantSelector && <SelectField label="Tenant" value={formState.tenantId} onChange={(value) => setFormState((previous) => ({ ...previous, tenantId: value }))} options={tenants.map((tenant) => ({ value: tenant.id, label: tenant.name }))} required />}
            <InputField label="Group Name" value={formState.name} onChange={(value) => setFormState((previous) => ({ ...previous, name: value }))} placeholder="Primary Site" required />
            <InputField label="Group Code" value={formState.code} onChange={(value) => setFormState((previous) => ({ ...previous, code: value.toUpperCase() }))} placeholder="PRIMARY" required />
            <InputField label="Region" value={formState.region} onChange={(value) => setFormState((previous) => ({ ...previous, region: value }))} placeholder="Kampala Central" />
          </div>
          <InputField label="Description" value={formState.description} onChange={(value) => setFormState((previous) => ({ ...previous, description: value }))} placeholder="Main branch routers and uplink infrastructure." />
          <div style={{ marginTop: 12 }}>
            <FormProcessStatus busy={submitting} error={formError} text={processText || 'Creating router group. This modal closes after the group is saved.'} />
          </div>
          <div style={{ marginTop: 12 }}>
            <button type="submit" className="btn btn-primary" disabled={submitting}>{submitting ? 'Creating group...' : 'Create Group'}</button>
          </div>
        </form>
      </div>
    </div>
  )
}

function RouterCreateCard({
  formState,
  setFormState,
  onSubmit,
  submitting,
  processText,
  formError,
  showTenantSelector,
  tenants,
  groups,
  hotspots,
  showAdvanced,
  setShowAdvanced,
}: {
  formState: RouterFormState
  setFormState: Dispatch<SetStateAction<RouterFormState>>
  onSubmit: (event: FormEvent<HTMLFormElement>) => void
  submitting: boolean
  processText: string
  formError: string
  showTenantSelector: boolean
  tenants: TenantOverviewResponse['items']
  groups: RouterOverviewResponse['groups']
  hotspots: HotspotOverviewResponse['items']
  showAdvanced: boolean
  setShowAdvanced: Dispatch<SetStateAction<boolean>>
}) {
  return (
    <div className="card">
      <div className="card-header"><span className="card-title">Register MikroTik Router</span></div>
      <div className="content" style={{ paddingTop: 16 }}>
        <form onSubmit={onSubmit}>
          <div className="stats-grid" style={{ marginBottom: 12 }}>
            {showTenantSelector && <SelectField label="Tenant" value={formState.tenantId} onChange={(value) => setFormState((previous) => ({ ...previous, tenantId: value, groupId: '', hotspotId: '' }))} options={tenants.map((tenant) => ({ value: tenant.id, label: tenant.name }))} required />}
            <InputField label="Router Display Name" value={formState.name} onChange={(value) => setFormState((previous) => ({ ...previous, name: value }))} placeholder="Shop WiFi Router" required />
            <InputField label="Branch / Site Name" value={formState.siteLabel} onChange={(value) => setFormState((previous) => ({ ...previous, siteLabel: value }))} placeholder="Kiseka Arcade" />
            <InputField label="HotSpot Server Name" value={formState.hotspotServerName} onChange={(value) => setFormState((previous) => ({ ...previous, hotspotServerName: value }))} placeholder="Leave blank to use AROFi" />
            <SelectField label="Script Mode" value={formState.scriptMode} onChange={(value) => setFormState((previous) => ({ ...previous, scriptMode: value as RouterFormState['scriptMode'] }))} options={[{ value: 'FRESH_FULL_CAPTIVE_WIFI', label: 'Fresh full captive Wi-Fi (open SSID)' }, { value: 'SAFE_EXISTING_ROUTER', label: 'Safe existing HotSpot integration' }, { value: 'FRESH_FULL_HOTSPOT', label: 'Legacy fresh HotSpot setup' }]} />
            <SelectField label="Router Group" value={formState.groupId} onChange={(value) => setFormState((previous) => ({ ...previous, groupId: value }))} options={[{ value: '', label: 'No group yet' }, ...groups.map((group) => ({ value: group.id, label: `${group.name} (${group.code})` }))]} />
            <SelectField label="Hotspot Site" value={formState.hotspotId} onChange={(value) => setFormState((previous) => ({ ...previous, hotspotId: value }))} options={[{ value: '', label: 'Link later' }, ...hotspots.map((hotspot) => ({ value: hotspot.id, label: hotspot.name }))]} />
          </div>
          <div style={{ marginBottom: 12, color: 'var(--text-muted)', fontSize: 13, lineHeight: 1.5 }}>
            Fresh full captive Wi-Fi configures WAN on ether1, creates an open SSID, installs the AROFi HotSpot redirect page, and binds HotSpot to RADIUS. Use safe mode only when an operator already built the MikroTik HotSpot manually.
          </div>
          <button type="button" className="btn btn-ghost" onClick={() => setShowAdvanced((previous) => !previous)} style={{ marginBottom: 12 }}>
            {showAdvanced ? 'Hide Advanced Settings' : 'Show Advanced Settings'}
          </button>
          {showAdvanced && (
            <>
              <div className="stats-grid" style={{ marginBottom: 12 }}>
                <InputField label="Management Host / IP" value={formState.host} onChange={(value) => setFormState((previous) => ({ ...previous, host: value }))} placeholder="Optional, for health checks" />
                <InputField label="Identity" value={formState.identity} onChange={(value) => setFormState((previous) => ({ ...previous, identity: value }))} placeholder="Optional RouterOS identity" />
                <SelectField label="Connection Mode" value={formState.connectionMode} onChange={(value) => setFormState((previous) => ({ ...previous, connectionMode: value as RouterFormState['connectionMode'] }))} options={[{ value: 'ROUTEROS_API', label: 'RouterOS API' }, { value: 'ROUTEROS_API_SSL', label: 'RouterOS API SSL' }]} />
                <InputField label="API Port" value={formState.apiPort} onChange={(value) => setFormState((previous) => ({ ...previous, apiPort: value }))} placeholder="8728" />
                <InputField label="Admin Username" value={formState.username} onChange={(value) => setFormState((previous) => ({ ...previous, username: value }))} placeholder="Optional, for health checks" />
                <InputField label="Admin Password" type="password" value={formState.password} onChange={(value) => setFormState((previous) => ({ ...previous, password: value }))} placeholder="Optional, encrypted at rest" />
                <InputField label="RADIUS Shared Secret" value={formState.sharedSecret} onChange={(value) => setFormState((previous) => ({ ...previous, sharedSecret: value }))} placeholder="Generated automatically" />
                <InputField label="RouterOS Major Version" value={formState.routerOsVersion} onChange={(value) => setFormState((previous) => ({ ...previous, routerOsVersion: value }))} placeholder="Optional" />
                <InputField label="Model" value={formState.model} onChange={(value) => setFormState((previous) => ({ ...previous, model: value }))} placeholder="RB951Ui-2HnD" />
              </div>
              <div style={{ display: 'grid', gap: 10, marginBottom: 12 }}>
                <InputField label="Extra Walled Garden Hosts" value={formState.portalWalledGardenHosts} onChange={(value) => setFormState((previous) => ({ ...previous, portalWalledGardenHosts: value }))} placeholder="extra.example.com" />
                <label style={{ display: 'flex', gap: 10, alignItems: 'center', color: 'var(--text-secondary)', fontSize: 13 }}>
                  <input type="checkbox" checked={formState.ttlAntiTetheringEnabled} onChange={(event) => setFormState((previous) => ({ ...previous, ttlAntiTetheringEnabled: event.target.checked }))} />
                  Enable optional TTL anti-tethering rule. This reduces common sharing but cannot guarantee detection of every NAT tethering case.
                </label>
              </div>
              <InputField label="Tags" value={formState.tags} onChange={(value) => setFormState((previous) => ({ ...previous, tags: value }))} placeholder="backbone, tower-a, hotspot-core" />
            </>
          )}
          <div style={{ marginTop: 12 }}>
            <FormProcessStatus busy={submitting} error={formError} text={processText || 'Registering router. This modal closes after AROFi saves the router and generates setup details.'} />
          </div>
          <div style={{ marginTop: 12, display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            <button type="submit" className="btn btn-primary" disabled={submitting}>{submitting ? 'Registering router...' : 'Register Router'}</button>
            {showAdvanced && <button type="button" className="btn btn-ghost" onClick={() => setFormState((previous) => ({ ...previous, sharedSecret: generateSecret() }))}>Regenerate Secret</button>}
          </div>
        </form>
      </div>
    </div>
  )
}

function RouterInventoryTable({ loading, routers, recentHealthChecks, onLoadSetup, onHealthCheck, runningHealthCheckId }: { loading: boolean; routers: RouterOverviewResponse['routers']; recentHealthChecks: RouterOverviewResponse['recentHealthChecks']; onLoadSetup: (routerId: string) => void; onHealthCheck: (routerId: string) => void; runningHealthCheckId: string | null }) {
  return (
    <>
      <div className="card">
        <div className="card-header"><span className="card-title">Router Inventory</span></div>
        <div className="table-wrap">
          <table>
            <thead><tr><th>Router</th><th>Tenant</th><th>Hotspot</th><th>Endpoint</th><th>Status</th><th>Sessions</th><th>Last Seen</th><th>Actions</th></tr></thead>
            <tbody>
              {loading && <tr><td colSpan={8}><div className="empty-state"><p>Loading routers...</p></div></td></tr>}
              {!loading && routers.length === 0 && <tr><td colSpan={8}><div className="empty-state"><p>No routers registered yet. Use the onboarding form above to connect the first MikroTik.</p></div></td></tr>}
              {routers.map((router) => (
                <tr key={router.id}>
                  <td><div style={{ color: 'var(--text-primary)', fontWeight: 600 }}>{router.name}</div><div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{router.identity} {router.model ? `| ${router.model}` : ''}</div></td>
                  <td>{router.tenant.name}</td>
                  <td>{router.hotspot?.name ?? router.siteLabel ?? 'Not linked'}</td>
                  <td>
                    <div style={{ fontFamily: 'monospace', fontSize: 12 }}>{router.host}:{router.apiPort}</div>
                    <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{router.connectionMode.toLowerCase()}</div>
                    {router.host.includes('.self-service') && (
                      <div style={{ fontSize: 12, color: 'var(--warning-fg)', marginTop: 4 }}>Waiting for script callback to learn NAS IP</div>
                    )}
                  </td>
                  <td>
                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                      <span className={router.provisioningCallbackReceived ? 'badge badge-success' : 'badge badge-warning'}>
                        {router.provisioningCallbackReceived ? 'callback' : 'no callback'}
                      </span>
                      <span className={router.radiusAuthSeen ? 'badge badge-success' : 'badge badge-warning'}>
                        {router.radiusAuthSeen ? 'auth' : 'no auth'}
                      </span>
                      <span className={router.accountingSeen ? 'badge badge-success' : 'badge badge-warning'}>
                        {router.accountingSeen ? 'acct' : 'no acct'}
                      </span>
                      <span className={router.managementApiReachable ? 'badge badge-success' : 'badge badge-warning'}>
                        {router.managementApiReachable ? 'api reachable' : 'api mgmt unreachable'}
                      </span>
                    </div>
                    <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 6 }}>{router.onboardingStatus ?? 'NOT_STARTED'}</div>
                    <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4 }}>{router.managementApiMessage ?? router.healthMessage ?? 'HotSpot/RADIUS can work even if management API is unreachable.'}</div>
                    <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4 }}>{formatLatency(router.lastLatencyMs)}</div>
                  </td>
                  <td>{router.activeSessions}</td>
                  <td style={{ fontSize: 12 }}>{formatDate(router.lastSeenAt)}</td>
                  <td><div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}><button type="button" className="btn btn-ghost" onClick={() => onLoadSetup(router.id)}>View Setup</button><button type="button" className="btn btn-ghost" onClick={() => onHealthCheck(router.id)} disabled={runningHealthCheckId === router.id}>{runningHealthCheckId === router.id ? 'Checking...' : 'Health Check'}</button></div></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="card">
        <div className="card-header"><span className="card-title">Recent Health Checks</span></div>
        <div className="table-wrap">
          <table>
            <thead><tr><th>Router</th><th>Tenant</th><th>Status</th><th>Latency</th><th>Message</th><th>Checked</th></tr></thead>
            <tbody>
              {loading && <tr><td colSpan={6}><div className="empty-state"><p>Loading health checks...</p></div></td></tr>}
              {!loading && recentHealthChecks.length === 0 && <tr><td colSpan={6}><div className="empty-state"><p>No health checks yet. Run one after provisioning the first router.</p></div></td></tr>}
              {recentHealthChecks.map((check) => (
                <tr key={check.id}>
                  <td>{check.router.name}</td>
                  <td>{check.tenant.name}</td>
                  <td><span className={getStatusBadgeClass(check.status)}>{check.status.toLowerCase()}</span></td>
                  <td>{formatLatency(check.latencyMs)}</td>
                  <td>{check.message ?? 'No message'}</td>
                  <td style={{ fontSize: 12 }}>{formatDate(check.checkedAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </>
  )
}

function InputField({ label, value, onChange, placeholder, type = 'text', required = false }: { label: string; value: string; onChange: (value: string) => void; placeholder: string; type?: string; required?: boolean }) {
  return <div className="form-group"><label className="form-label">{label}</label><input className="form-input" type={type} value={value} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} required={required} /></div>
}

function SelectField({ label, value, onChange, options, required = false }: { label: string; value: string; onChange: (value: string) => void; options: Array<{ value: string; label: string }>; required?: boolean }) {
  return <div className="form-group"><label className="form-label">{label}</label><select className="form-input" value={value} onChange={(event) => onChange(event.target.value)} required={required}>{!required && <option value="">Select option</option>}{options.map((option) => <option key={`${option.value}-${option.label}`} value={option.value}>{option.label}</option>)}</select></div>
}
