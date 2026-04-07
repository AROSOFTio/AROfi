import {
  RouterOverviewResponse,
  RouterSetupResponse,
} from '@/lib/admin-types'
import { fetchApi } from '@/lib/api'
import {
  formatDate,
  formatLatency,
  getStatusBadgeClass,
} from '@/lib/format'

export const dynamic = 'force-dynamic'

export default async function RoutersPage() {
  const data = await fetchApi<RouterOverviewResponse>('/routers/overview')
  const primaryRouter = data?.routers[0]
  const setup = primaryRouter
    ? await fetchApi<RouterSetupResponse>(`/routers/${primaryRouter.id}/setup`)
    : null

  return (
    <>
      <div className="page-header">
        <div>
          <h1 className="page-title">Routers</h1>
          <p className="page-subtitle">
            MikroTik onboarding, router health, RADIUS client readiness, and AAA rollout from one place.
          </p>
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          <span className="badge badge-info" style={{ padding: '8px 12px' }}>
            {data?.radiusFoundation.serverHost ?? 'RADIUS pending'}:{data?.radiusFoundation.authPort ?? 1812}
          </span>
          <span className={getStatusBadgeClass(primaryRouter?.status ?? 'PENDING')} style={{ padding: '8px 12px' }}>
            {primaryRouter?.status?.toLowerCase() ?? 'pending'}
          </span>
        </div>
      </div>

      <div className="stats-grid" style={{ marginBottom: 20 }}>
        {[
          { label: 'Total Routers', value: `${data?.summary.totalRouters ?? 0}`, color: 'blue' },
          { label: 'Healthy', value: `${data?.summary.healthyRouters ?? 0}`, color: 'green' },
          { label: 'Groups', value: `${data?.summary.routerGroups ?? 0}`, color: 'purple' },
          { label: 'Live Sessions', value: `${data?.summary.activeSessions ?? 0}`, color: 'amber' },
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
            <p>Router APIs are unreachable right now. Once the API is healthy, onboarding and health telemetry will appear here automatically.</p>
          </div>
        </div>
      )}

      <div className="charts-grid">
        <div className="card">
          <div className="card-header">
            <span className="card-title">Router Setup</span>
          </div>
          <div style={{ padding: 20, display: 'grid', gap: 16 }}>
            <div>
              <div style={{ fontSize: 12, color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: 8 }}>
                AAA Foundation
              </div>
              <div style={{ display: 'grid', gap: 8 }}>
                <div><strong>RADIUS Host:</strong> {setup?.radiusServer.host ?? data?.radiusFoundation.serverHost ?? 'Pending'}</div>
                <div><strong>Auth Port:</strong> {setup?.radiusServer.authPort ?? data?.radiusFoundation.authPort ?? 1812}</div>
                <div><strong>Accounting Port:</strong> {setup?.radiusServer.accountingPort ?? data?.radiusFoundation.accountingPort ?? 1813}</div>
                <div><strong>Shared Secret:</strong> {setup?.radiusServer.sharedSecret ?? 'Configured on router creation'}</div>
              </div>
            </div>
            <div>
              <div style={{ fontSize: 12, color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: 8 }}>
                Rollout Checklist
              </div>
              <div style={{ display: 'grid', gap: 10 }}>
                {(setup?.onboardingChecklist ?? []).map((item, index) => (
                  <div key={item} style={{ display: 'flex', gap: 10 }}>
                    <span className="badge badge-info" style={{ minWidth: 28, justifyContent: 'center' }}>{index + 1}</span>
                    <span style={{ color: 'var(--text-secondary)' }}>{item}</span>
                  </div>
                ))}
                {!setup && <span style={{ color: 'var(--text-muted)' }}>Create or seed a router to get a MikroTik provisioning playbook.</span>}
              </div>
            </div>
          </div>
        </div>

        <div className="card">
          <div className="card-header">
            <span className="card-title">Provisioning Script</span>
          </div>
          <div style={{ padding: 20 }}>
            <pre
              style={{
                whiteSpace: 'pre-wrap',
                wordBreak: 'break-word',
                background: 'rgba(255,255,255,0.03)',
                border: '1px solid var(--border)',
                borderRadius: 12,
                padding: 16,
                fontSize: 12,
                lineHeight: 1.6,
                color: 'var(--text-primary)',
                minHeight: 260,
              }}
            >
              {setup?.provisioningScript ?? 'RouterOS onboarding script will appear here after the first router is registered.'}
            </pre>
          </div>
        </div>
      </div>

      <div className="card">
        <div className="card-header">
          <span className="card-title">Router Groups</span>
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Group</th>
                <th>Tenant</th>
                <th>Region</th>
                <th>Routers</th>
                <th>Healthy</th>
                <th>Offline</th>
              </tr>
            </thead>
            <tbody>
              {(data?.groups ?? []).length === 0 && (
                <tr>
                  <td colSpan={6}>
                    <div className="empty-state">
                      <p>No router groups yet. Create one group per branch, POP, or operational cluster.</p>
                    </div>
                  </td>
                </tr>
              )}
              {(data?.groups ?? []).map((group) => (
                <tr key={group.id}>
                  <td>
                    <div style={{ color: 'var(--text-primary)', fontWeight: 600 }}>{group.name}</div>
                    <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{group.code}</div>
                  </td>
                  <td>{group.tenant.name}</td>
                  <td>{group.region ?? 'Unspecified'}</td>
                  <td>{group.routerCount}</td>
                  <td>{group.healthyCount}</td>
                  <td>{group.offlineCount}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="card">
        <div className="card-header">
          <span className="card-title">Router Inventory</span>
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Router</th>
                <th>Tenant</th>
                <th>Group</th>
                <th>API Endpoint</th>
                <th>Hotspot</th>
                <th>Sessions</th>
                <th>Health</th>
                <th>Last Seen</th>
              </tr>
            </thead>
            <tbody>
              {(data?.routers ?? []).length === 0 && (
                <tr>
                  <td colSpan={8}>
                    <div className="empty-state">
                      <p>No routers registered yet. Seed or onboard a MikroTik router to start health checks and session tracking.</p>
                    </div>
                  </td>
                </tr>
              )}
              {(data?.routers ?? []).map((router) => (
                <tr key={router.id}>
                  <td>
                    <div style={{ color: 'var(--text-primary)', fontWeight: 600 }}>{router.name}</div>
                    <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                      {router.identity} {router.routerOsVersion ? `| RouterOS ${router.routerOsVersion}` : ''}
                    </div>
                  </td>
                  <td>{router.tenant.name}</td>
                  <td>{router.group?.name ?? 'Ungrouped'}</td>
                  <td>
                    <div style={{ fontFamily: 'monospace', fontSize: 12 }}>{router.host}:{router.apiPort}</div>
                    <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{router.connectionMode.toLowerCase()}</div>
                  </td>
                  <td>{router.hotspot?.name ?? router.siteLabel ?? 'Not linked'}</td>
                  <td>{router.activeSessions}</td>
                  <td>
                    <span className={getStatusBadgeClass(router.status)}>{router.status.toLowerCase()}</span>
                    <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 6 }}>
                      {formatLatency(router.lastLatencyMs)}
                    </div>
                  </td>
                  <td style={{ fontSize: 12 }}>{formatDate(router.lastSeenAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="card">
        <div className="card-header">
          <span className="card-title">Recent Health Checks</span>
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Router</th>
                <th>Tenant</th>
                <th>Status</th>
                <th>Latency</th>
                <th>Message</th>
                <th>Checked</th>
              </tr>
            </thead>
            <tbody>
              {(data?.recentHealthChecks ?? []).length === 0 && (
                <tr>
                  <td colSpan={6}>
                    <div className="empty-state">
                      <p>No router health checks yet. Run the health-check endpoint after onboarding the first device.</p>
                    </div>
                  </td>
                </tr>
              )}
              {(data?.recentHealthChecks ?? []).map((check) => (
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
