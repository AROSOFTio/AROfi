import { fetchApi } from '@/lib/api'
import { formatCurrency, formatDate } from '@/lib/format'

export const dynamic = 'force-dynamic'

type AgentSalesResponse = {
  recentSales: Array<{
    id: string
    amountUgx: number
    customerReference?: string | null
    packageName: string
    voucherCode?: string | null
    paymentMethod: 'CASH' | 'MOBILE_MONEY'
    fulfillment: string
    commissionUgx: number
    createdAt: string
  }>
}

export default async function AgentSalesPage() {
  const data = await fetchApi<AgentSalesResponse>('/agent-sales/me/dashboard')
  const sales = data?.recentSales ?? []

  return (
    <div style={{ maxWidth: 1120, margin: '0 auto', display: 'grid', gap: 14 }}>
      <div className="page-header" style={{ marginBottom: 0 }}>
        <div>
          <h1 className="page-title">My Sales</h1>
          <p className="page-subtitle">Your latest WiFi sales and the access codes created for customers.</p>
        </div>
        <a href="/dashboard?sell=1" className="btn btn-primary">Sell WiFi / Internet</a>
      </div>

      <div className="card" style={{ margin: 0 }}>
        {sales.length === 0 ? (
          <div className="empty-state"><p>No sales yet.</p></div>
        ) : (
          <div className="table-wrap">
            <table>
              <thead><tr><th>Package</th><th>Access</th><th>Payment</th><th>Sale</th><th>Commission</th><th>Time</th></tr></thead>
              <tbody>
                {sales.map((sale) => (
                  <tr key={sale.id}>
                    <td style={{ fontWeight: 750 }}>{sale.packageName}</td>
                    <td>
                      {sale.voucherCode ? (
                        <div>
                          <span className="badge badge-info">Access code</span>
                          <div style={{ marginTop: 5, fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', fontWeight: 900, letterSpacing: '.06em' }}>{sale.voucherCode}</div>
                        </div>
                      ) : (
                        <span className="badge badge-success">Device activated</span>
                      )}
                    </td>
                    <td><span className={sale.paymentMethod === 'MOBILE_MONEY' ? 'badge badge-success' : 'badge badge-warning'}>{sale.paymentMethod === 'MOBILE_MONEY' ? 'Mobile Money' : 'Cash'}</span></td>
                    <td style={{ fontWeight: 750 }}>{formatCurrency(sale.amountUgx)}</td>
                    <td style={{ fontWeight: 750, color: 'var(--success-fg)' }}>{formatCurrency(sale.commissionUgx)}</td>
                    <td style={{ color: 'var(--text-muted)', fontSize: 12 }}>{formatDate(sale.createdAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
