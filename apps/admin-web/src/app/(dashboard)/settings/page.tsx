export default function SettingsPage() {
  return (
    <>
      <div className="page-header">
        <div>
          <h1 className="page-title">Settings</h1>
          <p className="page-subtitle">Production configuration is controlled through audited environment variables and tenant settings.</p>
        </div>
      </div>
      <div className="card">
        <div style={{ padding: 20, color: 'var(--text-secondary)', lineHeight: 1.7 }}>
          Editable platform settings are hidden until backed by validated API endpoints and audit logging. Configure payment, RADIUS, router, and security values through deployment environment variables.
        </div>
      </div>
    </>
  )
}
