export default function TenantsPage() {
  return (
    <>
      <div className="page-header">
        <div>
          <h1 className="page-title">Tenants</h1>
          <p className="page-subtitle">Manage vendor accounts on the AROFi platform</p>
        </div>
        <button className="btn btn-primary">+ Add Tenant</button>
      </div>
      <div className="card">
        <div className="card-header"><span className="card-title">All Tenants</span></div>
        <div className="table-wrap">
          <table>
            <thead><tr>
              <th>Tenant Name</th><th>Domain</th><th>Hotspots</th><th>Routers</th><th>Balance (UGX)</th><th>Created</th><th>Status</th><th>Actions</th>
            </tr></thead>
            <tbody><tr><td colSpan={8}><div className="empty-state"><p>No tenants registered. Add your first vendor.</p></div></td></tr></tbody>
          </table>
        </div>
      </div>
    </>
  )
}
