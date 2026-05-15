export default function ReportsPage() {
  return (
    <>
      <div className="page-header">
        <div>
          <h1 className="page-title">Reports</h1>
          <p className="page-subtitle">Use the Sales, Payments, Sessions, Vouchers, and Billing screens for live filtered operational reporting.</p>
        </div>
      </div>
      <div className="card">
        <div style={{ padding: 20, color: 'var(--text-secondary)', lineHeight: 1.7 }}>
          Scheduled report generation is hidden from production navigation until export jobs are backed by server-side report definitions.
        </div>
      </div>
    </>
  )
}
