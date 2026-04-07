export default function DashboardHome() {
  const stats = [
    { label: 'Revenue (Monthly)', value: 'UGX -', color: 'vibrant', change: 'Gross collections' },
    { label: 'Total Tenants', value: '-', color: 'green', change: 'Vendors on platform' },
    { label: 'Active Hotspots', value: '-', color: 'amber', change: 'Live NAS points' },
    { label: 'Active Sessions', value: '-', color: 'purple', change: 'Online right now' },
    { label: 'Vouchers Sold', value: '-', color: 'blue', change: 'This month' },
    { label: 'Mobile Money Txns', value: '-', color: 'green', change: 'Yo! Uganda payments' },
    { label: 'Platform Fees (8%)', value: 'UGX -', color: 'amber', change: 'MM fee earned' },
    { label: 'Pending Settlements', value: 'UGX -', color: 'purple', change: 'Awaiting disburse' },
  ]

  const recentTxns = [
    { id: 'TXN-001', tenant: 'SpeedNet Kampala', amount: 'UGX 5,000', method: 'MTN MoMo', status: 'success', time: 'Just now' },
    { id: 'TXN-002', tenant: 'QuickFi Entebbe', amount: 'UGX 2,000', method: 'Airtel Money', status: 'success', time: '2 min ago' },
    { id: 'TXN-003', tenant: 'NetZone Jinja', amount: 'UGX 10,000', method: 'Voucher', status: 'success', time: '5 min ago' },
    { id: 'TXN-004', tenant: 'SpeedNet Kampala', amount: 'UGX 5,000', method: 'MTN MoMo', status: 'pending', time: '8 min ago' },
    { id: 'TXN-005', tenant: 'BudaNet Masaka', amount: 'UGX 3,000', method: 'Airtel Money', status: 'failed', time: '12 min ago' },
  ]

  return (
    <>
      <div className="page-header">
        <div>
          <h1 className="page-title">Dashboard</h1>
          <p className="page-subtitle">Platform overview - Currency: UGX (Ugandan Shilling)</p>
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          <button className="btn btn-ghost">Export Report</button>
          <button className="btn btn-primary">+ Add Tenant</button>
        </div>
      </div>

      <div className="stats-grid">
        {stats.map((s) => (
          <div key={s.label} className={`stat-card ${s.color}`}>
            <div className="stat-label">{s.label}</div>
            <div className={`stat-value ${s.color === 'vibrant' ? '' : s.color}`}>{s.value}</div>
            <div className="stat-change">{s.change}</div>
          </div>
        ))}
      </div>

      <div className="card">
        <div className="card-header">
          <span className="card-title">Recent Transactions</span>
          <a href="/payments" className="btn btn-ghost" style={{ padding: '5px 12px', fontSize: 12 }}>View All</a>
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>TXN ID</th>
                <th>Tenant</th>
                <th>Amount (UGX)</th>
                <th>Method</th>
                <th>Status</th>
                <th>Time</th>
              </tr>
            </thead>
            <tbody>
              {recentTxns.map((t) => (
                <tr key={t.id}>
                  <td style={{ fontFamily: 'monospace', color: 'var(--text-primary)', fontSize: 12 }}>{t.id}</td>
                  <td>{t.tenant}</td>
                  <td style={{ color: 'var(--text-primary)', fontWeight: 600 }}>{t.amount}</td>
                  <td>{t.method}</td>
                  <td>
                    <span className={`badge ${t.status === 'success' ? 'badge-success' : t.status === 'pending' ? 'badge-warning' : 'badge-danger'}`}>
                      {t.status}
                    </span>
                  </td>
                  <td style={{ fontSize: 12 }}>{t.time}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="charts-grid">
        <div className="card">
          <div className="card-header">
            <span className="card-title">Active Sessions</span>
            <span className="badge badge-success">Live</span>
          </div>
          <div className="empty-state">
            <svg fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" /></svg>
            <p>Session data will appear here once routers are connected.</p>
          </div>
        </div>
        <div className="card">
          <div className="card-header">
            <span className="card-title">Revenue Breakdown</span>
            <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>This month | UGX</span>
          </div>
          <div className="empty-state">
            <svg fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M11 3.055A9.001 9.001 0 1020.945 13H11V3.055z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M20.488 9H15V3.512A9.025 9.025 0 0120.488 9z" /></svg>
            <p>Revenue charts will display once payment data flows in.</p>
          </div>
        </div>
      </div>

      <div className="card">
        <div className="card-header">
          <span className="card-title">Tenants (Vendors)</span>
          <a href="/tenants" className="btn btn-ghost" style={{ padding: '5px 12px', fontSize: 12 }}>Manage</a>
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Tenant Name</th>
                <th>Domain</th>
                <th>Hotspots</th>
                <th>Balance (UGX)</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td colSpan={5}>
                  <div className="empty-state" style={{ padding: '24px' }}>
                    <p>No tenants yet. Add your first vendor to get started.</p>
                  </div>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </>
  )
}
