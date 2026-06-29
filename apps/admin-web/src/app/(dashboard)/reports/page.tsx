import ReportsExportPanel from '@/components/ReportsExportPanel'

export default function ReportsPage() {
  return (
    <>
      <div className="page-header">
        <div>
          <h1 className="page-title">Reports</h1>
          <p className="page-subtitle">Export financial data for reconciliation, accounting, or tax filing. Use the Sales, Payments, Sessions, and Billing screens for live filtered views.</p>
        </div>
      </div>
      <ReportsExportPanel />
    </>
  )
}
