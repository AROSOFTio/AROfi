export default function VouchersPage() {
  return (
    <>
      <div className="page-header">
        <div>
          <h1 className="page-title">Vouchers</h1>
          <p className="page-subtitle">Generate, manage and track scratch card vouchers — UGX</p>
        </div>
        <button className="btn btn-primary">Generate Vouchers</button>
      </div>
      <div className="stats-grid" style={{ marginBottom: 20 }}>
        {[
          { label: 'Total Generated', value: '—', color: 'blue' },
          { label: 'Active / Unused', value: '—', color: 'green' },
          { label: 'Redeemed', value: '—', color: 'amber' },
          { label: 'Revenue (UGX)', value: '—', color: 'purple' },
        ].map(s => (
          <div key={s.label} className={`stat-card ${s.color}`}>
            <div className="stat-label">{s.label}</div>
            <div className={`stat-value ${s.color}`}>{s.value}</div>
          </div>
        ))}
      </div>
      <div className="card">
        <div className="card-header"><span className="card-title">Voucher Batches</span></div>
        <div className="table-wrap">
          <table>
            <thead><tr>
              <th>Batch ID</th><th>Tenant</th><th>Package</th><th>Qty</th><th>Price (UGX)</th><th>Redeemed</th><th>Generated</th>
            </tr></thead>
            <tbody><tr><td colSpan={7}><div className="empty-state"><p>No voucher batches generated yet.</p></div></td></tr></tbody>
          </table>
        </div>
      </div>
    </>
  )
}
