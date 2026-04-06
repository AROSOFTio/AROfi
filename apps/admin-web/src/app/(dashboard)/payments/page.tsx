export default function PaymentsPage() {
  return (
    <>
      <div className="page-header">
        <div>
          <h1 className="page-title">Payments</h1>
          <p className="page-subtitle">Mobile money transactions via Yo! Uganda — MTN & Airtel — UGX</p>
        </div>
        <button className="btn btn-ghost">Export</button>
      </div>
      <div className="stats-grid" style={{ marginBottom: 20 }}>
        {[
          { label: 'Total Collected (UGX)', value: '—', color: 'green' },
          { label: 'MTN MoMo', value: '—', color: 'amber' },
          { label: 'Airtel Money', value: '—', color: 'blue' },
          { label: 'Platform Fees 8% (UGX)', value: '—', color: 'purple' },
        ].map(s => (
          <div key={s.label} className={`stat-card ${s.color}`}>
            <div className="stat-label">{s.label}</div>
            <div className={`stat-value ${s.color}`}>{s.value}</div>
          </div>
        ))}
      </div>
      <div className="card">
        <div className="card-header"><span className="card-title">All Transactions</span></div>
        <div className="table-wrap">
          <table>
            <thead><tr>
              <th>TXN ID</th><th>Tenant</th><th>Phone</th><th>Amount (UGX)</th><th>Fee 8% (UGX)</th><th>Net (UGX)</th><th>Method</th><th>Status</th><th>Date</th>
            </tr></thead>
            <tbody><tr><td colSpan={9}><div className="empty-state"><p>No payment transactions recorded yet.</p></div></td></tr></tbody>
          </table>
        </div>
      </div>
    </>
  )
}
