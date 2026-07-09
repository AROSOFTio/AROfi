import ReportsExportPanel from '@/components/ReportsExportPanel'

export default function ReportsPage() {
  return (
    <>
      <div className="page-header">
        <div>
          <h1 className="page-title">Reports</h1>
          <p className="page-subtitle">Filter sales, disbursements, and vouchers, preview the results, then export to CSV, Excel, or PDF.</p>
        </div>
      </div>
      <ReportsExportPanel />
    </>
  )
}
