export default function RoutersPage() {
  return (
    <>
      <div className="page-header">
        <div>
          <h1 className="page-title">Routers</h1>
          <p className="page-subtitle">MikroTik & RouterOS device management</p>
        </div>
        <button className="btn btn-primary">+ Add Router</button>
      </div>
      <div className="card">
        <div className="card-header"><span className="card-title">Registered Routers</span></div>
        <div className="table-wrap">
          <table>
            <thead><tr>
              <th>Router Name</th><th>IP Address</th><th>Tenant</th><th>Model</th><th>Status</th><th>Last Seen</th><th>Actions</th>
            </tr></thead>
            <tbody><tr><td colSpan={7}><div className="empty-state"><p>No routers registered. Connect your first MikroTik device.</p></div></td></tr></tbody>
          </table>
        </div>
      </div>
    </>
  )
}
