import { BillingSalesByTenantResponse } from '@/lib/admin-types'
import { fetchApi } from '@/lib/api'
import { formatCurrency } from '@/lib/format'

export const dynamic = 'force-dynamic'

const planBadgeClass: Record<string, string> = {
  FREE: 'badge-info',
  PRO: 'badge-success',
  ENTERPRISE: 'badge-warning',
}

export default async function SalesByTenantPage() {
  const data = await fetchApi<BillingSalesByTenantResponse>('/billing/sales-by-tenant')
  const rows = data?.rows ?? []

  return (
    <>
      <div className="page-header">
        <div>
          <h1 className="page-title">Sales by Vendor</h1>
          <p className="page-subtitle">Completed mobile money and voucher sales, grouped by vendor/tenant.</p>
        </div>
      </div>

      <div className="stats-grid" style={{ marginBottom: 20 }}>
        {[
          { label: 'Vendors with Sales', value: `${data?.summary.tenantCount ?? 0}`, color: 'blue' },
          { label: 'Total Sales', value: `${data?.summary.totalSalesCount ?? 0}`, color: 'purple' },
          { label: 'Gross Sales', value: formatCurrency(data?.summary.totalGrossSalesUgx ?? 0), color: 'green' },
          { label: 'Platform Fees', value: formatCurrency(data?.summary.totalPlatformFeesUgx ?? 0), color: 'amber' },
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
            <p>Sales data is not reachable yet. Once the billing API responds, this page will show live revenue by vendor.</p>
          </div>
        </div>
      )}

      <div className="card">
        <div className="card-header">
          <span className="card-title">Vendor Sales Breakdown</span>
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Vendor</th>
                <th>Plan</th>
                <th>Sales</th>
                <th>Gross</th>
                <th>Platform Fees</th>
                <th>Vendor Net</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 && (
                <tr>
                  <td colSpan={6}>
                    <div className="empty-state">
                      <p>No completed sales recorded yet.</p>
                    </div>
                  </td>
                </tr>
              )}
              {rows.map((row) => (
                <tr key={row.tenantId}>
                  <td style={{ fontWeight: 600 }}>{row.tenantName}</td>
                  <td>
                    <span className={`badge ${planBadgeClass[row.subscriptionPlan] ?? 'badge-info'}`}>{row.subscriptionPlan}</span>
                  </td>
                  <td>{row.salesCount}</td>
                  <td style={{ color: 'var(--text-primary)', fontWeight: 600 }}>{formatCurrency(row.grossSalesUgx)}</td>
                  <td>{formatCurrency(row.platformFeesUgx)}</td>
                  <td>{formatCurrency(row.netEarningsUgx)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </>
  )
}
