import { AuditLogResponse } from '@/lib/admin-types'
import { fetchApi } from '@/lib/api'
import { formatDate, formatTransactionType, getStatusBadgeClass } from '@/lib/format'

export const dynamic = 'force-dynamic'

export default async function AuditLogsPage() {
  const data = await fetchApi<AuditLogResponse>('/system/audit-logs')
  const logs = data?.items ?? []

  return (
    <>
      <div className="page-header">
        <div>
          <h1 className="page-title">Audit Logs</h1>
          <p className="page-subtitle">Security-sensitive actions, platform events, and operator activity traces across the system.</p>
        </div>
        <button className="btn btn-ghost">Export Audit Trail</button>
      </div>

      <div className="stats-grid" style={{ marginBottom: 20 }}>
        {[
          { label: 'Total Entries', value: `${data?.summary.totalEntries ?? 0}`, color: 'blue' },
          { label: 'Warnings', value: `${data?.summary.warning ?? 0}`, color: 'amber' },
          { label: 'Errors', value: `${(data?.summary.error ?? 0) + (data?.summary.critical ?? 0)}`, color: 'purple' },
          { label: 'Critical', value: `${data?.summary.critical ?? 0}`, color: 'green' },
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
            <p>Audit logs are unavailable right now. Confirm API connectivity and try again.</p>
          </div>
        </div>
      )}

      <div className="card">
        <div className="card-header">
          <span className="card-title">Recent Audit Events</span>
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Time</th>
                <th>Severity</th>
                <th>Action</th>
                <th>Entity</th>
                <th>Actor</th>
                <th>Tenant</th>
                <th>Context</th>
              </tr>
            </thead>
            <tbody>
              {logs.length === 0 && (
                <tr>
                  <td colSpan={7}>
                    <div className="empty-state">
                      <p>No audit events have been recorded yet.</p>
                    </div>
                  </td>
                </tr>
              )}
              {logs.map((log) => (
                <tr key={log.id}>
                  <td style={{ fontSize: 12 }}>{formatDate(log.createdAt)}</td>
                  <td>
                    <span className={getStatusBadgeClass(log.severity)}>{log.severity.toLowerCase()}</span>
                  </td>
                  <td>{formatTransactionType(log.action)}</td>
                  <td>
                    <div>{log.entity}</div>
                    <div style={{ fontSize: 12, color: 'var(--text-muted)', fontFamily: 'monospace' }}>
                      {log.entityId ?? 'N/A'}
                    </div>
                  </td>
                  <td>
                    <div>{log.actorName ?? 'System'}</div>
                    <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{log.actorEmail ?? log.userId ?? 'N/A'}</div>
                  </td>
                  <td>{log.tenant?.name ?? 'Global'}</td>
                  <td style={{ fontSize: 12 }}>
                    {log.ipAddress ?? 'No IP'} . {log.userAgent ? 'UA captured' : 'No user-agent'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </>
  )
}
