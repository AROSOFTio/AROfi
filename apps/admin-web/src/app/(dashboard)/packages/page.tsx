export default function PackagesPage() {
  return (
    <>
      <div className="page-header">
        <div>
          <h1 className="page-title">Packages</h1>
          <p className="page-subtitle">Internet packages and pricing — amounts in UGX</p>
        </div>
        <button className="btn btn-primary">+ Create Package</button>
      </div>
      <div className="card">
        <div className="card-header"><span className="card-title">Available Packages</span></div>
        <div className="table-wrap">
          <table>
            <thead><tr>
              <th>Package Name</th><th>Duration</th><th>Data Limit</th><th>Price (UGX)</th><th>Tenant</th><th>Status</th><th>Actions</th>
            </tr></thead>
            <tbody><tr><td colSpan={7}><div className="empty-state"><p>No packages defined. Create your first internet package.</p></div></td></tr></tbody>
          </table>
        </div>
      </div>
    </>
  )
}
