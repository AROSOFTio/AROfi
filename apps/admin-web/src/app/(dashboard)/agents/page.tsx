export default function AgentsPage() {
  return (
    <>
      <div className="page-header">
        <div>
          <h1 className="page-title">Agents</h1>
          <p className="page-subtitle">Field agents and float management — UGX</p>
        </div>
        <button className="btn btn-primary">+ Add Agent</button>
      </div>
      <div className="card">
        <div className="card-header"><span className="card-title">Registered Agents</span></div>
        <div className="table-wrap">
          <table>
            <thead><tr>
              <th>Agent Name</th><th>Phone</th><th>Tenant</th><th>Float Balance (UGX)</th><th>Sales (UGX)</th><th>Status</th><th>Actions</th>
            </tr></thead>
            <tbody><tr><td colSpan={7}><div className="empty-state"><p>No agents registered yet.</p></div></td></tr></tbody>
          </table>
        </div>
      </div>
    </>
  )
}
