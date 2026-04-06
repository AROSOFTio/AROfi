import { BillingSalesResponse } from '@/lib/admin-types'
import { fetchApi } from '@/lib/api'
import { formatCurrency, formatDate, formatTransactionType, getStatusBadgeClass } from '@/lib/format'

export const dynamic = 'force-dynamic'

export default async function SalesPage() {
  const data = await fetchApi<BillingSalesResponse>('/billing/sales')
  const items = data?.items ?? []

  return (
    <>
      <div className="page-header">
        <div>
          <h1 className="page-title">Sales</h1>
          <p className="page-subtitle">Gross collections, platform fees, and vendor net revenue across mobile money and vouchers.</p>
        </div>
        <button className="btn btn-ghost">Export Sales</button>
      </div>

      <div className="stats-grid" style={{ marginBottom: 20 }}>
        {[
          { label: 'Total Sales', value: formatCurrency(data?.summary.totalGrossUgx ?? 0), color: 'green' },
          { label: 'Platform Fees', value: formatCurrency(data?.summary.totalFeesUgx ?? 0), color: 'amber' },
          { label: 'Vendor Net', value: formatCurrency(data?.summary.totalNetUgx ?? 0), color: 'blue' },
          { label: 'Voucher Sales', value: formatCurrency(data?.summary.voucherGrossUgx ?? 0), color: 'purple' },
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
            <p>Sales data is not reachable yet. Once the billing API responds, this page will show live revenue records.</p>
          </div>
        </div>
      )}

      <div className="card">
        <div className="card-header">
          <span className="card-title">Sales Ledger</span>
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Reference</th>
                <th>Tenant</th>
                <th>Package</th>
                <th>Type</th>
                <th>Gross</th>
                <th>Fee</th>
                <th>Net</th>
                <th>Status</th>
                <th>Date</th>
              </tr>
            </thead>
            <tbody>
              {items.length === 0 && (
                <tr>
                  <td colSpan={9}>
                    <div className="empty-state">
                      <p>No sales have been posted yet.</p>
                    </div>
                  </td>
                </tr>
              )}
              {items.map((item) => (
                <tr key={item.id}>
                  <td style={{ fontFamily: 'monospace', fontSize: 12 }}>{item.externalReference ?? item.id.slice(0, 8)}</td>
                  <td>{item.tenant.name}</td>
                  <td>{item.package?.name ?? 'N/A'}</td>
                  <td>{formatTransactionType(item.type)}</td>
                  <td style={{ color: 'var(--text-primary)', fontWeight: 600 }}>{formatCurrency(item.grossAmountUgx)}</td>
                  <td>{formatCurrency(item.feeAmountUgx)}</td>
                  <td>{formatCurrency(item.netAmountUgx)}</td>
                  <td>
                    <span className={getStatusBadgeClass(item.status)}>{item.status.toLowerCase()}</span>
                  </td>
                  <td style={{ fontSize: 12 }}>{formatDate(item.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </>
  )
}
