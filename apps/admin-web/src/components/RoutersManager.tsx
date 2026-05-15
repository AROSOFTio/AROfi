'use client'

import { FormEvent, useEffect, useMemo, useState, type Dispatch, type SetStateAction } from 'react'
import {
  AdminSessionResponse,
  HotspotOverviewResponse,
  RouterOverviewResponse,
  RouterSetupResponse,
  TenantOverviewResponse,
} from '@/lib/admin-types'
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
  scriptMode: 'SAFE_EXISTING_ROUTER' | 'FRESH_FULL_HOTSPOT'
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
  scriptMode: 'SAFE_EXISTING_ROUTER',
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
      { title: 'Health check', ready: (overview?.summary.healthyRouters ?? 0) > 0 },
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
    setSubmittingGroup(true)

    try {
      await clientPostApi('/routers/groups', {
        tenantId: groupForm.tenantId,
        name: groupForm.name.trim(),
        code: groupForm.code.trim().toUpperCase(),
        region: groupForm.region.trim() || undefined,
        description: groupForm.description.trim() || undefined,
      })
      setSuccess('Router group created successfully')
      setGroupForm((previous) => ({ ...initialGroupForm, tenantId: previous.tenantId }))
      await loadData()
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Unable to create router group')
    } finally {
      setSubmittingGroup(false)
    }
  }

  async function handleRegisterRouter(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError(null)
    setSuccess(null)
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
      setSelectedSetup(setup)
      setSuccess('Router registered successfully. The provisioning script is ready below.')
      setRouterForm((previous) => ({
        ...initialRouterForm(),
        tenantId: previous.tenantId,
        groupId: previous.groupId,
        hotspotId: previous.hotspotId,
      }))
      await loadData(setup.router.id)
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Unable to register router')
    } finally {
      setSubmittingRouter(false)
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
    await navigator.clipboard.writeText(selectedSetup.provisioningScript)
    setSuccess('RouterOS script copied to clipboard.')
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
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <span className="badge badge-info">{selectedSetup.router.onboardingStatus ?? 'SCRIPT_GENERATED'}</span>
                <span className="badge badge-warning">Verified only after RADIUS/accounting traffic</span>
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="charts-grid">
        <RouterGroupCard
          formState={groupForm}
          setFormState={setGroupForm}
          onSubmit={handleCreateGroup}
          submitting={submittingGroup}
          showTenantSelector={showTenantSelector}
          tenants={tenants}
        />
        <RouterCreateCard
          formState={routerForm}
          setFormState={setRouterForm}
          onSubmit={handleRegisterRouter}
          submitting={submittingRouter}
          showTenantSelector={showTenantSelector}
          tenants={tenants}
          groups={groupsForTenant}
          hotspots={hotspotsForTenant}
          showAdvanced={showAdvancedRouterSettings}
          setShowAdvanced={setShowAdvancedRouterSettings}
        />
      </div>

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
              Open WinBox, WebFig, or SSH Terminal, paste the script, then press Enter. The router remains in waiting state until AROFi sees real RADIUS authentication or accounting traffic.
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
              {selectedSetup?.provisioningScript ?? 'The RouterOS setup script will appear here after your first MikroTik is registered.'}
            </pre>
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

function RouterGroupCard({ formState, setFormState, onSubmit, submitting, showTenantSelector, tenants }: { formState: GroupFormState; setFormState: Dispatch<SetStateAction<GroupFormState>>; onSubmit: (event: FormEvent<HTMLFormElement>) => void; submitting: boolean; showTenantSelector: boolean; tenants: TenantOverviewResponse['items'] }) {
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
            <button type="submit" className="btn btn-primary" disabled={submitting}>{submitting ? 'Creating...' : 'Create Group'}</button>
          </div>
        </form>
      </div>
    </div>
  )
}

function RouterCreateCard({ formState, setFormState, onSubmit, submitting, showTenantSelector, tenants, groups, hotspots, showAdvanced, setShowAdvanced }: { formState: RouterFormState; setFormState: Dispatch<SetStateAction<RouterFormState>>; onSubmit: (event: FormEvent<HTMLFormElement>) => void; submitting: boolean; showTenantSelector: boolean; tenants: TenantOverviewResponse['items']; groups: RouterOverviewResponse['groups']; hotspots: HotspotOverviewResponse['items']; showAdvanced: boolean; setShowAdvanced: Dispatch<SetStateAction<boolean>> }) {
  return (
    <div className="card">
      <div className="card-header"><span className="card-title">Register MikroTik Router</span></div>
      <div className="content" style={{ paddingTop: 16 }}>
        <form onSubmit={onSubmit}>
          <div className="stats-grid" style={{ marginBottom: 12 }}>
            {showTenantSelector && <SelectField label="Tenant" value={formState.tenantId} onChange={(value) => setFormState((previous) => ({ ...previous, tenantId: value, groupId: '', hotspotId: '' }))} options={tenants.map((tenant) => ({ value: tenant.id, label: tenant.name }))} required />}
            <InputField label="Router Display Name" value={formState.name} onChange={(value) => setFormState((previous) => ({ ...previous, name: value }))} placeholder="Shop WiFi Router" required />
            <InputField label="Branch / Site Name" value={formState.siteLabel} onChange={(value) => setFormState((previous) => ({ ...previous, siteLabel: value }))} placeholder="Kiseka Arcade" />
            <InputField label="Existing HotSpot Name" value={formState.hotspotServerName} onChange={(value) => setFormState((previous) => ({ ...previous, hotspotServerName: value }))} placeholder="Leave blank to use hotspot1" />
            <SelectField label="Script Mode" value={formState.scriptMode} onChange={(value) => setFormState((previous) => ({ ...previous, scriptMode: value as RouterFormState['scriptMode'] }))} options={[{ value: 'SAFE_EXISTING_ROUTER', label: 'Safe existing router integration' }, { value: 'FRESH_FULL_HOTSPOT', label: 'Fresh router full HotSpot setup' }]} />
            <SelectField label="Router Group" value={formState.groupId} onChange={(value) => setFormState((previous) => ({ ...previous, groupId: value }))} options={[{ value: '', label: 'No group yet' }, ...groups.map((group) => ({ value: group.id, label: `${group.name} (${group.code})` }))]} />
            <SelectField label="Hotspot Site" value={formState.hotspotId} onChange={(value) => setFormState((previous) => ({ ...previous, hotspotId: value }))} options={[{ value: '', label: 'Link later' }, ...hotspots.map((hotspot) => ({ value: hotspot.id, label: hotspot.name }))]} />
          </div>
          <div style={{ marginBottom: 12, color: 'var(--text-muted)', fontSize: 13, lineHeight: 1.5 }}>
            Use safe mode when the router already has WAN/LAN and HotSpot configured. Use fresh mode only for a new router where the LAN bridge is named <code>bridge</code>.
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
          <div style={{ marginTop: 12, display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            <button type="submit" className="btn btn-primary" disabled={submitting}>{submitting ? 'Registering...' : 'Register Router'}</button>
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
                  <td><div style={{ fontFamily: 'monospace', fontSize: 12 }}>{router.host}:{router.apiPort}</div><div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{router.connectionMode.toLowerCase()}</div></td>
                  <td><span className={getStatusBadgeClass(router.status)}>{router.status.toLowerCase()}</span><div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4 }}>{router.onboardingStatus ?? 'NOT_STARTED'}</div><div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4 }}>{formatLatency(router.lastLatencyMs)}</div></td>
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
