export default function CustomersPage() {
  return (
    <>
      <div className="page-header">
        <div>
          <h1 className="page-title">Customers</h1>
          <p className="page-subtitle">Hotspot end-users across all tenants</p>
        </div>
        <button className="btn btn-ghost">Export CSV</button>
      </div>
      <div className="card">
        <div className="card-header"><span className="card-title">All Customers</span></div>
        <div className="table-wrap">
          <table>
            <thead><tr>
              <th>Phone / MAC</th><th>Tenant</th><th>Last Package</th><th>Total Spent (UGX)</th><th>Sessions</th><th>Last Active</th>
            </tr></thead>
            <tbody><tr><td colSpan={6}><div className="empty-state"><p>No customer data yet. Customers appear once sessions begin.</p></div></td></tr></tbody>
          </table>
        </div>
      </div>
    </>
  )
}
