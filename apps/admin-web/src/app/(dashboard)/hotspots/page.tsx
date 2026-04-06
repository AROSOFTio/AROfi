export default function HotspotsPage() {
  return (
    <>
      <div className="page-header">
        <div>
          <h1 className="page-title">Hotspots</h1>
          <p className="page-subtitle">Manage captive portal access points (NAS) per tenant</p>
        </div>
        <button className="btn btn-primary">+ Add Hotspot</button>
      </div>
      <div className="card">
        <div className="card-header">
          <span className="card-title">All Hotspots</span>
          <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>0 records</span>
        </div>
        <div className="table-wrap">
          <table>
            <thead><tr>
              <th>Name</th><th>Tenant</th><th>NAS IP</th><th>Secret</th><th>Status</th><th>Actions</th>
            </tr></thead>
            <tbody><tr><td colSpan={6}><div className="empty-state"><p>No hotspots configured yet. Add your first access point.</p></div></td></tr></tbody>
          </table>
        </div>
      </div>
    </>
  )
}
