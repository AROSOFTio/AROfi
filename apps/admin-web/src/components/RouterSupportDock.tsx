'use client'

import { useEffect, useMemo, useState } from 'react'
import { Power, RotateCcw, Search, Trash2, Wrench, X } from 'lucide-react'
import type { AdminSessionResponse, RouterItem, RouterOverviewResponse } from '@/lib/admin-types'
import { clientDeleteApi, clientFetchApi, clientPostApi } from '@/lib/client-api'
import { formatDate } from '@/lib/format'

type RouterLifecycle = {
  routerId: string
  routerName: string
  tenant: { id: string; name: string }
  lifecycleState: 'ACTIVE' | 'DEACTIVATED'
  canDelete: boolean
  protectedActivityCount: number
  protectedActivity: {
    activations: number
    sessions: number
    voucherRedemptions: number
    compensations: number
    radiusCredentials: number
    disconnectionAttempts: number
  }
  deleteBlockReason?: string | null
  radiusClientEnabled: boolean
  nasClientEnabled: boolean
  remoteAccessEnabled: boolean
  remotePortOpen: boolean
  createdAt: string
  message?: string
}

export default function RouterSupportDock({ user }: { user: AdminSessionResponse['user'] }) {
  const canManageRouters = user.permissions.includes('ALL') || user.permissions.includes('routers.manage')
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [routers, setRouters] = useState<RouterItem[]>([])
  const [selectedId, setSelectedId] = useState('')
  const [lifecycle, setLifecycle] = useState<RouterLifecycle | null>(null)
  const [lifecycleLoading, setLifecycleLoading] = useState(false)
  const [query, setQuery] = useState('')
  const [busyAction, setBusyAction] = useState<'delete' | 'deactivate' | 'reactivate' | ''>('')
  const [notice, setNotice] = useState<{ tone: 'success' | 'error'; text: string } | null>(null)

  const filteredRouters = useMemo(() => {
    const needle = query.trim().toLowerCase()
    if (!needle) return routers
    return routers.filter((router) =>
      [router.name, router.identity, router.tenant?.name, router.host, router.siteLabel]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(needle)),
    )
  }, [query, routers])

  const selectedRouter = routers.find((router) => router.id === selectedId) ?? null

  useEffect(() => {
    if (!open || !selectedId) {
      setLifecycle(null)
      return
    }
    let cancelled = false
    setLifecycleLoading(true)
    setNotice(null)
    void clientFetchApi<RouterLifecycle>(`/routers/${selectedId}/lifecycle`)
      .then((data) => {
        if (!cancelled) setLifecycle(data)
      })
      .catch((error) => {
        if (!cancelled) setNotice({ tone: 'error', text: error instanceof Error ? error.message : 'Could not load router lifecycle.' })
      })
      .finally(() => {
        if (!cancelled) setLifecycleLoading(false)
      })
    return () => { cancelled = true }
  }, [open, selectedId])

  if (!canManageRouters) return null

  async function loadRouters(preferredId?: string) {
    setLoading(true)
    try {
      const data = await clientFetchApi<RouterOverviewResponse>('/routers/overview')
      const items = data.routers ?? []
      setRouters(items)
      const nextId = preferredId && items.some((router) => router.id === preferredId)
        ? preferredId
        : items[0]?.id ?? ''
      setSelectedId(nextId)
      if (!nextId) setLifecycle(null)
    } catch (error) {
      setNotice({ tone: 'error', text: error instanceof Error ? error.message : 'Could not load routers.' })
    } finally {
      setLoading(false)
    }
  }

  async function openDock() {
    setOpen(true)
    setNotice(null)
    await loadRouters(selectedId || undefined)
  }

  async function deactivate() {
    if (!selectedRouter || busyAction) return
    if (!window.confirm(`Deactivate ${selectedRouter.name}? AROFi will preserve its history and disable its NAS/RADIUS client.`)) return
    setBusyAction('deactivate')
    setNotice(null)
    try {
      const result = await clientPostApi<RouterLifecycle>(`/routers/${selectedRouter.id}/deactivate`, {})
      setLifecycle(result)
      setNotice({ tone: 'success', text: result.message ?? 'Router deactivated.' })
      await loadRouters(selectedRouter.id)
    } catch (error) {
      setNotice({ tone: 'error', text: error instanceof Error ? error.message : 'Could not deactivate router.' })
    } finally {
      setBusyAction('')
    }
  }

  async function reactivate() {
    if (!selectedRouter || busyAction) return
    setBusyAction('reactivate')
    setNotice(null)
    try {
      const result = await clientPostApi<RouterLifecycle>(`/routers/${selectedRouter.id}/reactivate`, {})
      setLifecycle(result)
      setNotice({ tone: 'success', text: result.message ?? 'Router reactivated.' })
      await loadRouters(selectedRouter.id)
    } catch (error) {
      setNotice({ tone: 'error', text: error instanceof Error ? error.message : 'Could not reactivate router.' })
    } finally {
      setBusyAction('')
    }
  }

  async function deleteRouter() {
    if (!selectedRouter || !lifecycle?.canDelete || busyAction) return
    if (!window.confirm(`Permanently delete ${selectedRouter.name}? This is allowed only because AROFi found no protected customer or transaction history.`)) return
    setBusyAction('delete')
    setNotice(null)
    try {
      await clientDeleteApi(`/routers/${selectedRouter.id}`)
      setNotice({ tone: 'success', text: `${selectedRouter.name} was permanently deleted.` })
      await loadRouters()
    } catch (error) {
      setNotice({ tone: 'error', text: error instanceof Error ? error.message : 'Could not delete router.' })
    } finally {
      setBusyAction('')
    }
  }

  return (
    <>
      <button type="button" className="topbar-ai-support" onClick={() => void openDock()} aria-label="Open router troubleshooting tools">
        <Wrench size={15} />
        <span>Router Tools</span>
      </button>

      {open && (
        <div className="router-support-overlay" role="dialog" aria-modal="true" aria-label="Router troubleshooting tools">
          <div className="router-support-panel">
            <div className="router-support-head">
              <div>
                <strong>Router Troubleshooting & Lifecycle</strong>
                <span>{user.permissions.includes('ALL') ? 'Developer Admin: all businesses' : user.tenantName ?? 'Business workspace'}</span>
              </div>
              <button type="button" className="btn btn-ghost" onClick={() => setOpen(false)} aria-label="Close router tools"><X size={17} /></button>
            </div>

            <div className="router-support-body">
              <aside className="router-support-list">
                <div className="router-support-search">
                  <Search size={14} />
                  <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search router or business" />
                </div>
                {loading && <p className="router-support-muted">Loading routers…</p>}
                {!loading && filteredRouters.length === 0 && <p className="router-support-muted">No matching routers.</p>}
                {!loading && filteredRouters.map((router) => (
                  <button
                    type="button"
                    key={router.id}
                    className={`router-support-router ${selectedId === router.id ? 'active' : ''}`}
                    onClick={() => setSelectedId(router.id)}
                  >
                    <strong>{router.name}</strong>
                    <span>{router.tenant?.name ?? 'Business'} · {router.isLiveNow ? 'online' : 'offline'}</span>
                  </button>
                ))}
              </aside>

              <main className="router-support-detail">
                {!selectedRouter ? (
                  <div className="router-support-empty">Select a router to troubleshoot it.</div>
                ) : (
                  <>
                    <div className="router-support-title-row">
                      <div>
                        <h3>{selectedRouter.name}</h3>
                        <p>{selectedRouter.tenant?.name} · {selectedRouter.siteLabel ?? selectedRouter.identity}</p>
                      </div>
                      <span className={`badge ${lifecycle?.lifecycleState === 'DEACTIVATED' ? 'badge-warning' : selectedRouter.isLiveNow ? 'badge-success' : 'badge-danger'}`}>
                        {lifecycle?.lifecycleState === 'DEACTIVATED' ? 'Deactivated' : selectedRouter.isLiveNow ? 'Online' : 'Offline'}
                      </span>
                    </div>

                    {notice && <div className={`router-support-notice ${notice.tone}`}>{notice.text}</div>}

                    <section className="router-support-grid">
                      <Info label="Router ID" value={selectedRouter.id} mono />
                      <Info label="Host / API" value={`${selectedRouter.host}:${selectedRouter.apiPort}`} mono />
                      <Info label="Onboarding" value={selectedRouter.onboardingStatus ?? 'NOT_STARTED'} />
                      <Info label="Last signal" value={selectedRouter.lastSignalAt ? formatDate(selectedRouter.lastSignalAt) : 'No signal'} />
                      <Info label="Setup callback" value={selectedRouter.provisioningCallbackReceived ? 'Received' : 'Not received'} good={selectedRouter.provisioningCallbackReceived} />
                      <Info label="RADIUS auth" value={selectedRouter.radiusAuthSeen ? 'Seen' : 'Not seen'} good={selectedRouter.radiusAuthSeen} />
                      <Info label="Accounting" value={selectedRouter.accountingSeen ? 'Seen' : 'Not seen'} good={selectedRouter.accountingSeen} />
                      <Info label="Management API" value={selectedRouter.managementApiReachable ? 'Reachable' : 'Not reachable'} good={selectedRouter.managementApiReachable} />
                    </section>

                    <section className="router-support-lifecycle">
                      <div className="router-support-section-title">Lifecycle safety</div>
                      {lifecycleLoading ? (
                        <p className="router-support-muted">Checking customer and transaction history…</p>
                      ) : lifecycle ? (
                        <>
                          <div className="router-support-history">
                            <span><strong>{lifecycle.protectedActivity.activations}</strong> activations</span>
                            <span><strong>{lifecycle.protectedActivity.sessions}</strong> sessions</span>
                            <span><strong>{lifecycle.protectedActivity.voucherRedemptions}</strong> voucher uses</span>
                            <span><strong>{lifecycle.protectedActivity.compensations}</strong> compensations</span>
                          </div>
                          <p className="router-support-muted">
                            {lifecycle.canDelete
                              ? 'No protected customer history was found. This router can be permanently deleted.'
                              : lifecycle.deleteBlockReason}
                          </p>
                        </>
                      ) : null}
                    </section>

                    <div className="router-support-actions">
                      {lifecycle?.lifecycleState === 'DEACTIVATED' ? (
                        <button type="button" className="btn btn-primary" onClick={() => void reactivate()} disabled={Boolean(busyAction)}>
                          <RotateCcw size={14} /> {busyAction === 'reactivate' ? 'Reactivating…' : 'Reactivate'}
                        </button>
                      ) : (
                        <button type="button" className="btn btn-ghost" onClick={() => void deactivate()} disabled={Boolean(busyAction) || lifecycleLoading}>
                          <Power size={14} /> {busyAction === 'deactivate' ? 'Deactivating…' : 'Deactivate & keep history'}
                        </button>
                      )}
                      <button
                        type="button"
                        className="btn btn-danger"
                        onClick={() => void deleteRouter()}
                        disabled={Boolean(busyAction) || lifecycleLoading || !lifecycle?.canDelete}
                        title={lifecycle?.canDelete ? 'Permanent delete' : 'History exists; deactivate instead'}
                      >
                        <Trash2 size={14} /> {busyAction === 'delete' ? 'Deleting…' : 'Delete permanently'}
                      </button>
                    </div>
                  </>
                )}
              </main>
            </div>
          </div>
          <style>{`
            .router-support-overlay{position:fixed;inset:0;background:rgba(15,23,42,.48);z-index:1500;display:flex;align-items:center;justify-content:center;padding:18px}.router-support-panel{width:min(1040px,100%);height:min(720px,92vh);background:var(--bg-card);border:1px solid var(--border);border-radius:16px;box-shadow:0 24px 80px rgba(15,23,42,.28);overflow:hidden;display:flex;flex-direction:column}.router-support-head{display:flex;justify-content:space-between;align-items:center;padding:16px 18px;border-bottom:1px solid var(--border)}.router-support-head>div{display:grid;gap:3px}.router-support-head strong{font-size:15px}.router-support-head span{font-size:11.5px;color:var(--text-muted)}.router-support-body{display:grid;grid-template-columns:280px 1fr;min-height:0;flex:1}.router-support-list{border-right:1px solid var(--border);padding:12px;overflow:auto}.router-support-search{display:flex;align-items:center;gap:7px;border:1px solid var(--border);border-radius:9px;padding:8px 10px;margin-bottom:10px}.router-support-search input{border:0;outline:0;background:transparent;width:100%;color:var(--text-primary);font-size:12px}.router-support-router{display:grid;width:100%;text-align:left;border:0;background:transparent;border-radius:9px;padding:10px;cursor:pointer;color:var(--text-primary);gap:3px}.router-support-router:hover,.router-support-router.active{background:var(--bg-muted)}.router-support-router strong{font-size:12.5px}.router-support-router span,.router-support-muted{font-size:11.5px;color:var(--text-muted)}.router-support-detail{padding:18px;overflow:auto}.router-support-title-row{display:flex;justify-content:space-between;gap:14px;align-items:flex-start}.router-support-title-row h3{margin:0;font-size:19px}.router-support-title-row p{margin:4px 0 0;color:var(--text-muted);font-size:12px}.router-support-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:9px;margin-top:16px}.router-support-info{border:1px solid var(--border);border-radius:9px;padding:10px;display:grid;gap:4px}.router-support-info label{font-size:10.5px;text-transform:uppercase;color:var(--text-muted);font-weight:700}.router-support-info span{font-size:12.5px;word-break:break-word}.router-support-info span.good{color:var(--success-fg);font-weight:700}.router-support-info span.mono{font-family:monospace}.router-support-lifecycle{margin-top:16px;border-top:1px solid var(--border);padding-top:14px}.router-support-section-title{font-size:13px;font-weight:800;margin-bottom:9px}.router-support-history{display:flex;gap:8px;flex-wrap:wrap}.router-support-history span{font-size:11.5px;border:1px solid var(--border);border-radius:999px;padding:5px 8px}.router-support-actions{display:flex;gap:9px;flex-wrap:wrap;margin-top:18px}.router-support-notice{margin-top:12px;border-radius:8px;padding:9px 11px;font-size:12px}.router-support-notice.success{background:rgba(34,197,94,.08);color:var(--success-fg);border:1px solid rgba(34,197,94,.24)}.router-support-notice.error{background:rgba(239,68,68,.08);color:var(--danger-fg);border:1px solid rgba(239,68,68,.24)}.router-support-empty{height:100%;display:grid;place-items:center;color:var(--text-muted);font-size:13px}@media(max-width:720px){.router-support-overlay{padding:0}.router-support-panel{height:100vh;border-radius:0;border:0}.router-support-body{grid-template-columns:1fr}.router-support-list{border-right:0;border-bottom:1px solid var(--border);max-height:190px}.router-support-grid{grid-template-columns:1fr}.router-support-detail{padding:14px}}
          `}</style>
        </div>
      )}
    </>
  )
}

function Info({ label, value, mono = false, good }: { label: string; value: string; mono?: boolean; good?: boolean }) {
  return (
    <div className="router-support-info">
      <label>{label}</label>
      <span className={`${mono ? 'mono ' : ''}${good ? 'good' : ''}`.trim()}>{value}</span>
    </div>
  )
}
