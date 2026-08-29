export default function DashboardLoading() {
  return (
    <div aria-label="Loading dashboard" aria-live="polite" style={{ padding: '18px 20px' }}>
      <div style={{ height: 28, width: 180, borderRadius: 8, background: 'var(--border-soft)', marginBottom: 18 }} />
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12 }}>
        {[0, 1, 2, 3].map((item) => (
          <div key={item} style={{ height: 104, borderRadius: 12, border: '1px solid var(--border)', background: 'var(--bg-card)' }} />
        ))}
      </div>
    </div>
  )
}
