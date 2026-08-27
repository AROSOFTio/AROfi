'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { clientFetchApi } from '@/lib/client-api'
import { useRealtimeRefresh } from '@/lib/realtime'
import type { RouterOverviewResponse } from '@/lib/admin-types'
import {
  Activity,
  Users,
  Clock,
  RefreshCw,
  AlertCircle,
  Plus,
  Wifi,
  WifiOff,
  Zap,
} from 'lucide-react'
import { formatDate } from '@/lib/format'

export default function RouterObservabilityPage() {
  const [loading, setLoading] = useState(true)
  const [data, setData] = useState<RouterOverviewResponse | null>(null)
  const [selectedRouterId, setSelectedRouterId] = useState<string>('')
  const [error, setError] = useState<string | null>(null)
  const requestInFlight = useRef(false)

  async function loadRouters() {
    if (requestInFlight.current) return
    requestInFlight.current = true
    try {
      const result = await clientFetchApi<RouterOverviewResponse>('/routers/overview')
      setData(result)
      setError(null)
      setSelectedRouterId((current) => current || result.routers[0]?.id || '')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch routers')
    } finally {
      requestInFlight.current = false
      setLoading(false)
    }
  }

  useRealtimeRefresh(() => void loadRouters(), [
    'router.online',
    'router.stale',
    'router.offline',
    'session.started',
    'session.updated',
    'session.stopped',
    'disconnect.failed',
  ], 5_000)

  useEffect(() => {
    void loadRouters()
    const interval = setInterval(() => {
      if (document.visibilityState === 'visible') {
        void loadRouters()
      }
    }, 120_000)
    return () => clearInterval(interval)
  }, [])

  const routers = data?.routers ?? []
  const recentHealthChecks = data?.recentHealthChecks ?? []

  const selectedRouter = useMemo(
    () => routers.find((r) => r.id === selectedRouterId),
    [routers, selectedRouterId],
  )

  if (loading && routers.length === 0) {
    return (
      <div className="card" style={{ padding: 40, display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 }}>
          <RefreshCw className="animate-spin text-primary" size={32} />
          <span style={{ fontSize: 14, color: 'var(--text-secondary)' }}>Loading router data...</span>
        </div>
      </div>
    )
  }

  if (!loading && routers.length === 0) {
    return (
      <div className="card" style={{ padding: 40, textAlign: 'center' }}>
        <AlertCircle style={{ color: 'var(--danger-fg)', marginBottom: 12 }} size={40} />
        <h3 style={{ fontSize: 16, fontWeight: 600, color: 'var(--text-primary)' }}>No Routers Registered</h3>
        <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginTop: 8 }}>
          Register your first MikroTik router before viewing observability metrics.
        </p>
      </div>
    )
  }

  if (error) {
    return (
      <div className="card" style={{ padding: 40, textAlign: 'center' }}>
        <AlertCircle style={{ color: 'var(--danger-fg)', marginBottom: 12 }} size={40} />
        <p style={{ fontSize: 13, color: 'var(--danger-fg)' }}>{error}</p>
      </div>
    )
  }

  const isLive = selectedRouter?.liveState === 'LIVE' || selectedRouter?.isLiveNow === true

  return (
    <div style={{ display: 'grid', gap: 20 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 16 }}>
        <div style={{ display: 'grid', gap: 4 }}>
          <h1 style={{ fontSize: 24, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 10 }}>
            <Activity className="text-primary" /> Router Observability
          </h1>
          <p style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
            Model/Board: <strong style={{ color: 'var(--text-primary)' }}>{selectedRouter?.model || 'MikroTik'}</strong>
          </p>
        </div>

        <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          <a
            href="/admin/settings/routers?add=true"
            className="btn btn-primary"
            style={{ display: 'inline-flex', alignItems: 'center', gap: 6, height: 'auto', padding: '8px 14px', borderRadius: 8, fontSize: 13, textDecoration: 'none', fontWeight: 600 }}
          >
            <Plus size={16} /> Register Router
          </a>
          <select
            value={selectedRouterId}
            onChange={(e) => setSelectedRouterId(e.target.value)}
            className="form-control"
            style={{ minWidth: 200, padding: '8px 12px', borderRadius: 8, height: 'auto' }}
          >
            {routers.map((r) => (
              <option key={r.id} value={r.id}>{r.name} ({r.host})</option>
            ))}
          </select>
          <span
            className={`badge ${isLive ? 'badge-success' : 'badge-danger'}`}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 12px' }}
          >
            <span style={{ width: 8, height: 8, borderRadius: '50%', backgroundColor: isLive ? 'var(--success-fg)' : 'var(--danger-fg)', display: 'inline-block' }} />
            {isLive ? 'Live' : (selectedRouter?.liveState ?? 'Offline')}
          </span>
        </div>
      </div>

      <div className="stats-grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))' }}>
        <div className="stat-card green">
          <div className="stat-label" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <Users size={16} /> Active Users
          </div>
          <div className="stat-value green" style={{ fontSize: 20 }}>
            {selectedRouter?.activeSessions ?? 0}
          </div>
        </div>

        <div className="stat-card blue">
          <div className="stat-label" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <Zap size={16} /> Latency
          </div>
          <div className="stat-value blue" style={{ fontSize: 20 }}>
            {selectedRouter?.latestHealthCheck?.latencyMs != null
              ? `${selectedRouter.latestHealthCheck.latencyMs} ms`
              : '—'}
          </div>
        </div>

        <div className={`stat-card ${isLive ? 'green' : selectedRouter?.liveState === 'OFFLINE' ? 'danger' : 'amber'}`}>
          <div className="stat-label" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            {isLive ? <Wifi size={16} /> : <WifiOff size={16} />} Live State
          </div>
          <div className={`stat-value ${isLive ? 'green' : selectedRouter?.liveState === 'OFFLINE' ? 'danger' : 'amber'}`} style={{ fontSize: 16 }}>
            {selectedRouter?.liveState ?? selectedRouter?.status?.replace(/_/g, ' ') ?? '—'}
          </div>
        </div>

        <div className="stat-card orange">
          <div className="stat-label" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <Clock size={16} /> Last Signal
          </div>
          <div className="stat-value orange" style={{ fontSize: 13 }}>
            {selectedRouter?.lastSignalAt
              ? formatDate(selectedRouter.lastSignalAt)
              : selectedRouter?.lastSeenAt
                ? formatDate(selectedRouter.lastSeenAt)
                : '—'}
          </div>
        </div>
      </div>

      <div className="card">
        <div className="card-header">
          <span className="card-title">All Routers</span>
          <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>Realtime updates, fallback every 2 minutes</span>
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Router</th>
                <th>Host</th>
                <th>Model</th>
                <th>Live State</th>
                <th>Active Users</th>
                <th>Latency</th>
                <th>Last Signal</th>
              </tr>
            </thead>
            <tbody>
              {routers.map((router) => {
                const live = router.liveState === 'LIVE' || router.isLiveNow
                return (
                  <tr
                    key={router.id}
                    style={{ cursor: 'pointer', background: router.id === selectedRouterId ? 'var(--surface-2)' : undefined }}
                    onClick={() => setSelectedRouterId(router.id)}
                  >
                    <td>
                      <div style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{router.name}</div>
                      <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{router.siteLabel || router.identity}</div>
                    </td>
                    <td style={{ fontFamily: 'monospace', fontSize: 12 }}>{router.host}</td>
                    <td>{router.model || '—'}</td>
                    <td>
                      <span className={`badge ${live ? 'badge-success' : 'badge-danger'}`}>
                        {router.liveState ?? router.status?.replace(/_/g, ' ') ?? 'Unknown'}
                      </span>
                    </td>
                    <td>{router.activeSessions ?? 0}</td>
                    <td>
                      {router.latestHealthCheck?.latencyMs != null
                        ? `${router.latestHealthCheck.latencyMs} ms`
                        : '—'}
                    </td>
                    <td style={{ fontSize: 12 }}>
                      {router.lastSignalAt
                        ? formatDate(router.lastSignalAt)
                        : router.lastSeenAt
                          ? formatDate(router.lastSeenAt)
                          : '—'}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>

      {recentHealthChecks.length > 0 && (
        <div className="card">
          <div className="card-header">
            <span className="card-title">Recent Health Checks</span>
          </div>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Router</th>
                  <th>Business</th>
                  <th>Status</th>
                  <th>Latency</th>
                  <th>Message</th>
                  <th>Checked At</th>
                </tr>
              </thead>
              <tbody>
                {recentHealthChecks.map((check) => (
                  <tr key={check.id}>
                    <td style={{ fontWeight: 600 }}>{check.router.name}</td>
                    <td>{check.tenant.name}</td>
                    <td>
                      <span className={`badge ${check.status === 'HEALTHY' ? 'badge-success' : 'badge-danger'}`}>
                        {check.status}
                      </span>
                    </td>
                    <td>{check.latencyMs != null ? `${check.latencyMs} ms` : '—'}</td>
                    <td style={{ fontSize: 12, color: 'var(--text-muted)' }}>{check.message || '—'}</td>
                    <td style={{ fontSize: 12 }}>{formatDate(check.checkedAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
