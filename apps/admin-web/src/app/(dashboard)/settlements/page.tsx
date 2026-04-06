export default function SettlementsPage() {
  return (
    <>
      <div className="page-header">
        <div>
          <h1 className="page-title">Settlements</h1>
          <p className="page-subtitle">Tenant disbursements — UGX (after 8% / 2% platform fee deduction)</p>
        </div>
        <button className="btn btn-primary">Process Settlement</button>
      </div>
      <div className="card">
        <div className="card-header"><span className="card-title">Settlement History</span></div>
        <div className="table-wrap">
          <table>
            <thead><tr>
              <th>Settlement ID</th><th>Tenant</th><th>Gross (UGX)</th><th>Fee (UGX)</th><th>Net Disbursed (UGX)</th><th>Method</th><th>Status</th><th>Date</th>
            </tr></thead>
            <tbody><tr><td colSpan={8}><div className="empty-state"><p>No settlements processed yet.</p></div></td></tr></tbody>
          </table>
        </div>
      </div>
    </>
  )
}
