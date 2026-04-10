import { FeatureLimitResponse } from '@/lib/admin-types'
import { fetchApi } from '@/lib/api'
import { getStatusBadgeClass } from '@/lib/format'

export const dynamic = 'force-dynamic'

function formatNumber(value: number | null | undefined) {
  if (value === null || value === undefined) {
    return 'N/A'
  }

  return new Intl.NumberFormat('en-US').format(value)
}

export default async function FeatureLimitsPage() {
  const data = await fetchApi<FeatureLimitResponse>('/system/feature-limits')
  const limits = data?.items ?? []

  return (
    <>
      <div className="page-header">
        <div>
          <h1 className="page-title">Feature Limits</h1>
          <p className="page-subtitle">Tenant usage caps, warning thresholds, and operational capacity signals.</p>
        </div>
        <button className="btn btn-ghost">Refresh Usage</button>
      </div>

      <div className="stats-grid" style={{ marginBottom: 20 }}>
        {[
          { label: 'Configured', value: `${data?.summary.totalLimits ?? 0}`, color: 'blue' },
          { label: 'Enabled', value: `${data?.summary.enabled ?? 0}`, color: 'green' },
          { label: 'Warnings', value: `${data?.summary.warning ?? 0}`, color: 'amber' },
          { label: 'Exceeded', value: `${data?.summary.exceeded ?? 0}`, color: 'purple' },
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
            <p>Feature limit telemetry is unavailable. Confirm API connectivity and reload this page.</p>
          </div>
        </div>
      )}

      <div className="card">
        <div className="card-header">
          <span className="card-title">Limit Register</span>
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Tenant</th>
                <th>Limit</th>
                <th>Category</th>
                <th>Usage</th>
                <th>Threshold</th>
                <th>Hard Limit</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {limits.length === 0 && (
                <tr>
                  <td colSpan={7}>
                    <div className="empty-state">
                      <p>No feature limits are configured yet.</p>
                    </div>
                  </td>
                </tr>
              )}
              {limits.map((limit) => (
                <tr key={limit.id}>
                  <td>{limit.tenant?.name ?? 'Global'}</td>
                  <td>
                    <div style={{ color: 'var(--text-primary)', fontWeight: 600 }}>{limit.name}</div>
                    <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{limit.code}</div>
                  </td>
                  <td>{limit.category}</td>
                  <td>
                    <div>{formatNumber(limit.currentUsage)} {limit.unit ?? ''}</div>
                    <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                      {limit.limitValue === null ? 'Unlimited' : `${formatNumber(limit.remaining)} remaining`}
                    </div>
                  </td>
                  <td>
                    <div>{limit.limitValue === null ? 'Unlimited' : `${formatNumber(limit.limitValue)} max`}</div>
                    <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{limit.warningThresholdPct}% warning</div>
                  </td>
                  <td>{limit.hardLimit ? 'Yes' : 'No'}</td>
                  <td>
                    <span className={getStatusBadgeClass(limit.health.toUpperCase())}>
                      {limit.health}
                      {limit.usagePercentage !== null && limit.usagePercentage !== undefined ? ` (${limit.usagePercentage}%)` : ''}
                    </span>
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
