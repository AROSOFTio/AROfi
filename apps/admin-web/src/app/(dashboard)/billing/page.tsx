export default function BillingPage() {
  return (
    <>
      <div className="page-header">
        <div>
          <h1 className="page-title">Billing & Wallet</h1>
          <p className="page-subtitle">Tenant wallet balances, ledger entries, and fee accounting — UGX</p>
        </div>
      </div>
      <div className="stats-grid" style={{ marginBottom: 20 }}>
        {[
          { label: 'Total Platform Float (UGX)', value: '—', color: 'green' },
          { label: 'Fees Earned 8% MM (UGX)', value: '—', color: 'amber' },
          { label: 'Fees Earned 2% Voucher (UGX)', value: '—', color: 'blue' },
          { label: 'Pending Disburse (UGX)', value: '—', color: 'purple' },
        ].map(s => (
          <div key={s.label} className={`stat-card ${s.color}`}>
            <div className="stat-label">{s.label}</div>
            <div className={`stat-value ${s.color}`}>{s.value}</div>
          </div>
        ))}
      </div>
      <div className="card">
        <div className="card-header"><span className="card-title">Wallet Ledger</span></div>
        <div className="table-wrap">
          <table>
            <thead><tr>
              <th>Tenant</th><th>Entry Type</th><th>Gross (UGX)</th><th>Fee (UGX)</th><th>Net (UGX)</th><th>Balance (UGX)</th><th>Date</th>
            </tr></thead>
            <tbody><tr><td colSpan={7}><div className="empty-state"><p>No ledger entries yet. Transactions will appear here.</p></div></td></tr></tbody>
          </table>
        </div>
      </div>
    </>
  )
}
