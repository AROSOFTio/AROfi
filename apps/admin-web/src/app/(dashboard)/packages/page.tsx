import { PackageCatalogResponse } from '@/lib/admin-types'
import { fetchApi } from '@/lib/api'
import { formatCurrency, formatDate, formatDuration, getStatusBadgeClass } from '@/lib/format'

export const dynamic = 'force-dynamic'

export default async function PackagesPage() {
  const data = await fetchApi<PackageCatalogResponse>('/packages')
  const items = data?.items ?? []

  return (
    <>
      <div className="page-header">
        <div>
          <h1 className="page-title">Packages</h1>
          <p className="page-subtitle">Phase 2 pricing catalog, package definitions, and voucher readiness in UGX.</p>
        </div>
        <button className="btn btn-primary">+ Create Package</button>
      </div>

      <div className="stats-grid" style={{ marginBottom: 20 }}>
        {[
          { label: 'Total Packages', value: `${data?.summary.totalPackages ?? 0}`, color: 'blue' },
          { label: 'Active Packages', value: `${data?.summary.activePackages ?? 0}`, color: 'green' },
          { label: 'Featured Offers', value: `${data?.summary.featuredPackages ?? 0}`, color: 'amber' },
          { label: 'Avg Price', value: formatCurrency(data?.summary.averagePriceUgx ?? 0), color: 'purple' },
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
            <p>Package API is unreachable right now. The page will populate automatically once the API is available.</p>
          </div>
        </div>
      )}

      <div className="card">
        <div className="card-header">
          <span className="card-title">Package Catalog</span>
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Package</th>
                <th>Tenant</th>
                <th>Duration</th>
                <th>Price</th>
                <th>Speed</th>
                <th>Voucher Batches</th>
                <th>Status</th>
                <th>Updated</th>
              </tr>
            </thead>
            <tbody>
              {items.length === 0 && (
                <tr>
                  <td colSpan={8}>
                    <div className="empty-state">
                      <p>No packages found yet. Seed data or create a package to start selling bandwidth.</p>
                    </div>
                  </td>
                </tr>
              )}
              {items.map((item) => (
                <tr key={item.id}>
                  <td>
                    <div style={{ color: 'var(--text-primary)', fontWeight: 600 }}>{item.name}</div>
                    <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{item.code}</div>
                  </td>
                  <td>{item.tenant.name}</td>
                  <td>{formatDuration(item.durationMinutes)}</td>
                  <td style={{ color: 'var(--text-primary)', fontWeight: 600 }}>{formatCurrency(item.activePriceUgx)}</td>
                  <td>
                    {item.downloadSpeedKbps && item.uploadSpeedKbps
                      ? `${item.downloadSpeedKbps / 1024}M / ${item.uploadSpeedKbps / 1024}M`
                      : 'Unspecified'}
                  </td>
                  <td>{item.voucherBatchCount}</td>
                  <td>
                    <span className={getStatusBadgeClass(item.status)}>{item.status.toLowerCase()}</span>
                  </td>
                  <td style={{ fontSize: 12 }}>{formatDate(item.updatedAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </>
  )
}
