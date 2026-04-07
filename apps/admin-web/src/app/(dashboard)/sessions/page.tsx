import { SessionOverviewResponse } from '@/lib/admin-types'
import { fetchApi } from '@/lib/api'
import {
  formatDate,
  formatMegabytes,
  formatSessionTime,
  getStatusBadgeClass,
} from '@/lib/format'

export const dynamic = 'force-dynamic'

export default async function SessionsPage() {
  const data = await fetchApi<SessionOverviewResponse>('/sessions/overview')

  return (
    <>
      <div className="page-header">
        <div>
          <h1 className="page-title">Usage Analytics</h1>
          <p className="page-subtitle">
            Live sessions, AAA events, and the first layer of router-level usage analytics across the network core.
          </p>
        </div>
        <span className="badge badge-success" style={{ padding: '8px 14px' }}>
          Live AAA
        </span>
      </div>

      <div className="stats-grid" style={{ marginBottom: 20 }}>
        {[
          { label: 'Active Sessions', value: `${data?.summary.activeSessions ?? 0}`, color: 'green' },
          { label: 'Sessions Today', value: `${data?.summary.totalSessionsToday ?? 0}`, color: 'blue' },
          { label: 'Data Used Today', value: formatMegabytes(data?.summary.dataUsedTodayMb ?? 0), color: 'amber' },
          { label: 'Avg Session Time', value: formatSessionTime((data?.summary.averageSessionMinutes ?? 0) * 60), color: 'purple' },
        ].map((stat) => (
          <div key={stat.label} className={`stat-card ${stat.color}`}>
            <div className="stat-label">{stat.label}</div>
            <div className={`stat-value ${stat.color}`}>{stat.value}</div>
          </div>
        ))}
      </div>

      {!data && (
        <div className="card">
          <div className="empty-state">
            <p>Session analytics are waiting for the API. Once the network core is reachable, live usage and AAA telemetry will populate here.</p>
          </div>
        </div>
      )}

      <div className="charts-grid">
        <div className="card">
          <div className="card-header">
            <span className="card-title">Router Usage Base</span>
          </div>
          <div style={{ padding: 20, display: 'grid', gap: 14 }}>
            {(data?.usageByRouter ?? []).length === 0 && (
              <div className="empty-state" style={{ padding: 24 }}>
                <p>No router usage data yet. Accounting packets will build the analytics baseline here.</p>
              </div>
            )}
            {(data?.usageByRouter ?? []).map((router) => {
              const maxUsage = Math.max(...(data?.usageByRouter ?? []).map((item) => item.totalDataMb), 1)
              const width = Math.max(12, Math.round((router.totalDataMb / maxUsage) * 100))

              return (
                <div key={router.id} style={{ display: 'grid', gap: 8 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
                    <div>
                      <div style={{ color: 'var(--text-primary)', fontWeight: 600 }}>{router.name}</div>
                      <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{router.tenant?.name ?? 'Shared'}</div>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <div style={{ color: 'var(--text-primary)', fontWeight: 600 }}>{formatMegabytes(router.totalDataMb)}</div>
                      <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                        {router.totalSessions} sessions, {router.activeSessions} live
                      </div>
                    </div>
                  </div>
                  <div style={{ width: '100%', height: 10, borderRadius: 999, background: 'rgba(255,255,255,0.06)', overflow: 'hidden' }}>
                    <div
                      style={{
                        width: `${width}%`,
                        height: '100%',
                        borderRadius: 999,
                        background: 'linear-gradient(90deg, #3b82f6, #34d399)',
                      }}
                    />
                  </div>
                </div>
              )
            })}
          </div>
        </div>

        <div className="card">
          <div className="card-header">
            <span className="card-title">AAA Signal</span>
          </div>
          <div style={{ padding: 20, display: 'grid', gap: 16 }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
              <div style={{ background: 'rgba(16,185,129,0.08)', border: '1px solid rgba(16,185,129,0.18)', borderRadius: 12, padding: 16 }}>
                <div style={{ fontSize: 12, color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: 8 }}>Accepted Today</div>
                <div style={{ fontSize: 28, fontWeight: 700, color: '#34d399' }}>{data?.summary.acceptedAuthToday ?? 0}</div>
              </div>
              <div style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.18)', borderRadius: 12, padding: 16 }}>
                <div style={{ fontSize: 12, color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: 8 }}>Rejected Today</div>
                <div style={{ fontSize: 28, fontWeight: 700, color: '#f87171' }}>{data?.summary.rejectedAuthToday ?? 0}</div>
              </div>
            </div>
            <div style={{ color: 'var(--text-secondary)', lineHeight: 1.6, fontSize: 14 }}>
              Access-Accept, Access-Reject, and accounting updates are now stored as first-class AAA events. This gives us a solid operational base for enforcing vouchers, package activations, and session visibility in later phases.
            </div>
          </div>
        </div>
      </div>

      <div className="card">
        <div className="card-header">
          <span className="card-title">Active Sessions</span>
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>User / Device</th>
                <th>Router</th>
                <th>Hotspot</th>
                <th>Package</th>
                <th>Data Used</th>
                <th>Time Online</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {(data?.activeSessions ?? []).length === 0 && (
                <tr>
                  <td colSpan={7}>
                    <div className="empty-state">
                      <p>No active sessions right now. Once routers send accounting updates, live subscribers will appear here.</p>
                    </div>
                  </td>
                </tr>
              )}
              {(data?.activeSessions ?? []).map((session) => (
                <tr key={session.id}>
                  <td>
                    <div style={{ color: 'var(--text-primary)', fontWeight: 600 }}>{session.username}</div>
                    <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                      {session.macAddress ?? session.customerReference ?? session.phoneNumber ?? 'Unknown identity'}
                    </div>
                  </td>
                  <td>{session.router?.name ?? 'Unassigned'}</td>
                  <td>{session.hotspot?.name ?? 'Unknown hotspot'}</td>
                  <td>{session.packageName}</td>
                  <td>{formatMegabytes(session.dataUsedMb)}</td>
                  <td>{formatSessionTime(session.sessionTimeSeconds)}</td>
                  <td><span className={getStatusBadgeClass(session.status)}>{session.status.toLowerCase()}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="card">
        <div className="card-header">
          <span className="card-title">Recent AAA Events</span>
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Event</th>
                <th>User</th>
                <th>Router</th>
                <th>Hotspot</th>
                <th>Message</th>
                <th>Time</th>
              </tr>
            </thead>
            <tbody>
              {(data?.recentEvents ?? []).length === 0 && (
                <tr>
                  <td colSpan={6}>
                    <div className="empty-state">
                      <p>No AAA events recorded yet. Access and accounting traffic will be logged here.</p>
                    </div>
                  </td>
                </tr>
              )}
              {(data?.recentEvents ?? []).map((event) => (
                <tr key={event.id}>
                  <td><span className={getStatusBadgeClass(event.eventType)}>{event.eventType.toLowerCase()}</span></td>
                  <td>
                    <div style={{ color: 'var(--text-primary)', fontWeight: 600 }}>{event.username ?? 'Unknown user'}</div>
                    <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{event.phoneNumber ?? event.macAddress ?? 'No phone or MAC'}</div>
                  </td>
                  <td>{event.router?.name ?? 'Router not mapped'}</td>
                  <td>{event.hotspot?.name ?? 'Hotspot not mapped'}</td>
                  <td>{event.message ?? event.responseCode ?? 'No message'}</td>
                  <td style={{ fontSize: 12 }}>{formatDate(event.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </>
  )
}
