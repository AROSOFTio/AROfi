export default function SessionsPage() {
  return (
    <>
      <div className="page-header">
        <div>
          <h1 className="page-title">Sessions</h1>
          <p className="page-subtitle">Real-time and historical RADIUS sessions across all hotspots</p>
        </div>
        <span className="badge badge-success" style={{ padding: '6px 14px' }}>● Live</span>
      </div>
      <div className="stats-grid" style={{ marginBottom: 20 }}>
        {[
          { label: 'Active Sessions', value: '—', color: 'green' },
          { label: 'Total Today', value: '—', color: 'blue' },
          { label: 'Data Used Today', value: '— MB', color: 'amber' },
          { label: 'Avg Session Time', value: '—', color: 'purple' },
        ].map(s => (
          <div key={s.label} className={`stat-card ${s.color}`}>
            <div className="stat-label">{s.label}</div>
            <div className={`stat-value ${s.color}`}>{s.value}</div>
          </div>
        ))}
      </div>
      <div className="card">
        <div className="card-header"><span className="card-title">Active Sessions</span></div>
        <div className="table-wrap">
          <table>
            <thead><tr>
              <th>Username / MAC</th><th>Hotspot</th><th>IP Address</th><th>Package</th><th>Data Used</th><th>Time Online</th><th>Actions</th>
            </tr></thead>
            <tbody><tr><td colSpan={7}><div className="empty-state"><p>No active sessions. Connect routers to see live data.</p></div></td></tr></tbody>
          </table>
        </div>
      </div>
    </>
  )
}
