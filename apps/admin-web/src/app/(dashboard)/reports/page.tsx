export default function ReportsPage() {
  return (
    <>
      <div className="page-header">
        <div>
          <h1 className="page-title">Reports</h1>
          <p className="page-subtitle">Financial and operational reports — Currency: UGX</p>
        </div>
        <button className="btn btn-primary">Generate Report</button>
      </div>
      <div className="charts-grid">
        {[
          { title: 'Revenue Report', desc: 'Monthly gross & net revenue per tenant' },
          { title: 'Sessions Report', desc: 'Daily session counts and data usage' },
          { title: 'Voucher Sales Report', desc: 'Voucher batch performance by tenant' },
          { title: 'Agent Performance', desc: 'Float usage and agent-driven sales' },
        ].map(r => (
          <div key={r.title} className="card" style={{ cursor: 'pointer' }}>
            <div className="card-header">
              <span className="card-title">{r.title}</span>
              <button className="btn btn-ghost" style={{ padding: '4px 10px', fontSize: 11 }}>Generate</button>
            </div>
            <div style={{ padding: '16px 20px', color: 'var(--text-muted)', fontSize: 13 }}>
              {r.desc}
            </div>
          </div>
        ))}
      </div>
    </>
  )
}
