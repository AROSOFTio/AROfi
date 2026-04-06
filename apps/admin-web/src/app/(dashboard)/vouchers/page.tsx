import { VouchersOverviewResponse } from '@/lib/admin-types'
import { fetchApi } from '@/lib/api'
import { formatCurrency, formatDate, getStatusBadgeClass } from '@/lib/format'

export const dynamic = 'force-dynamic'

export default async function VouchersPage() {
  const data = await fetchApi<VouchersOverviewResponse>('/vouchers/overview')
  const batches = data?.batches ?? []
  const recentRedemptions = data?.recentRedemptions ?? []

  return (
    <>
      <div className="page-header">
        <div>
          <h1 className="page-title">Vouchers</h1>
          <p className="page-subtitle">Voucher batches, local sales performance, and redemption activity for hotspot access.</p>
        </div>
        <button className="btn btn-primary">Generate Vouchers</button>
      </div>

      <div className="stats-grid" style={{ marginBottom: 20 }}>
        {[
          { label: 'Total Generated', value: `${data?.summary.totalGenerated ?? 0}`, color: 'blue' },
          { label: 'Active / Unused', value: `${data?.summary.activeUnused ?? 0}`, color: 'green' },
          { label: 'Redeemed', value: `${data?.summary.redeemed ?? 0}`, color: 'amber' },
          { label: 'Voucher Sales', value: formatCurrency(data?.summary.totalVoucherSalesUgx ?? 0), color: 'purple' },
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
            <p>Voucher API is unavailable right now. Once the backend is reachable, batch and redemption data will load here.</p>
          </div>
        </div>
      )}

      <div className="card">
        <div className="card-header">
          <span className="card-title">Voucher Batches</span>
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Batch</th>
                <th>Tenant</th>
                <th>Package</th>
                <th>Qty</th>
                <th>Face Value</th>
                <th>Remaining</th>
                <th>Redeemed</th>
                <th>Status</th>
                <th>Created</th>
              </tr>
            </thead>
            <tbody>
              {batches.length === 0 && (
                <tr>
                  <td colSpan={9}>
                    <div className="empty-state">
                      <p>No voucher batches generated yet.</p>
                    </div>
                  </td>
                </tr>
              )}
              {batches.map((batch) => (
                <tr key={batch.id}>
                  <td>
                    <div style={{ color: 'var(--text-primary)', fontWeight: 600 }}>{batch.batchNumber}</div>
                    <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{batch.prefix}</div>
                  </td>
                  <td>{batch.tenant.name}</td>
                  <td>{batch.package.name}</td>
                  <td>{batch.quantity}</td>
                  <td style={{ color: 'var(--text-primary)', fontWeight: 600 }}>{formatCurrency(batch.faceValueUgx)}</td>
                  <td>{batch.remainingCount}</td>
                  <td>{batch.redeemedCount}</td>
                  <td>
                    <span className={getStatusBadgeClass(batch.status)}>{batch.status.toLowerCase()}</span>
                  </td>
                  <td style={{ fontSize: 12 }}>{formatDate(batch.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="card">
        <div className="card-header">
          <span className="card-title">Recent Redemptions</span>
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Voucher</th>
                <th>Package</th>
                <th>Hotspot</th>
                <th>Customer</th>
                <th>Redeemed</th>
              </tr>
            </thead>
            <tbody>
              {recentRedemptions.length === 0 && (
                <tr>
                  <td colSpan={5}>
                    <div className="empty-state">
                      <p>No voucher redemptions recorded yet.</p>
                    </div>
                  </td>
                </tr>
              )}
              {recentRedemptions.map((redemption) => (
                <tr key={redemption.id}>
                  <td style={{ fontFamily: 'monospace', color: 'var(--text-primary)' }}>{redemption.voucher.code}</td>
                  <td>{redemption.package.name}</td>
                  <td>{redemption.hotspot?.name ?? 'Portal'}</td>
                  <td>{redemption.customerReference ?? 'Anonymous'}</td>
                  <td style={{ fontSize: 12 }}>{formatDate(redemption.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </>
  )
}
