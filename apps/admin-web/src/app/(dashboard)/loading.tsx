export default function DashboardLoading() {
  return (
    <div
      aria-label="Loading dashboard"
      aria-live="polite"
      style={{
        padding: '18px 20px',
        color: 'var(--text-3)',
        fontSize: 12,
      }}
    >
      Loading live data…
    </div>
  )
}
