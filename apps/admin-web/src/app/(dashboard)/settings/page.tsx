export default function SettingsPage() {
  return (
    <>
      <div className="page-header">
        <div>
          <h1 className="page-title">Settings</h1>
          <p className="page-subtitle">Platform configuration and integrations</p>
        </div>
        <button className="btn btn-primary">Save Changes</button>
      </div>

      <div className="charts-grid">
        <div className="card">
          <div className="card-header"><span className="card-title">Platform Fees</span></div>
          <div style={{ padding: '20px' }}>
            <div className="form-group">
              <label className="form-label">Mobile Money Fee (%)</label>
              <input className="form-input" type="number" defaultValue={8} min={0} max={100} step={0.1} />
              <p style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>Applied to all MTN & Airtel payments via Yo! Uganda</p>
            </div>
            <div className="form-group">
              <label className="form-label">Voucher Sales Fee (%)</label>
              <input className="form-input" type="number" defaultValue={2} min={0} max={100} step={0.1} />
              <p style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>Applied to all voucher cash sales by agents</p>
            </div>
          </div>
        </div>

        <div className="card">
          <div className="card-header"><span className="card-title">Yo! Uganda Payment Gateway</span></div>
          <div style={{ padding: '20px' }}>
            <div className="form-group">
              <label className="form-label">API Username</label>
              <input className="form-input" type="text" placeholder="yo_api_username" />
            </div>
            <div className="form-group">
              <label className="form-label">API Password</label>
              <input className="form-input" type="password" placeholder="••••••••••" />
            </div>
            <div className="form-group">
              <label className="form-label">API Endpoint</label>
              <input className="form-input" type="url" defaultValue="https://paymentsapi1.yo.co.ug/ybs/task.php" />
            </div>
          </div>
        </div>

        <div className="card">
          <div className="card-header"><span className="card-title">System Information</span></div>
          <div style={{ padding: '20px' }}>
            {[
              { label: 'Platform', value: 'AROFi v1.0' },
              { label: 'Built By', value: 'AROSOFT Innovations Ltd' },
              { label: 'Currency', value: 'UGX (Ugandan Shilling)' },
              { label: 'Primary Country', value: 'Uganda' },
              { label: 'Payment Rails', value: 'MTN, Airtel via Yo! Uganda' },
              { label: 'Network Stack', value: 'FreeRADIUS + MikroTik RouterOS' },
            ].map(i => (
              <div key={i.label} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid var(--border)', fontSize: 13 }}>
                <span style={{ color: 'var(--text-muted)' }}>{i.label}</span>
                <span style={{ color: 'var(--text-primary)', fontWeight: 500 }}>{i.value}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="card">
          <div className="card-header"><span className="card-title">FreeRADIUS Configuration</span></div>
          <div style={{ padding: '20px' }}>
            <div className="form-group">
              <label className="form-label">RADIUS Host</label>
              <input className="form-input" type="text" defaultValue="freeradius" />
            </div>
            <div className="form-group">
              <label className="form-label">Auth Port</label>
              <input className="form-input" type="number" defaultValue={1812} />
            </div>
            <div className="form-group">
              <label className="form-label">Account Port</label>
              <input className="form-input" type="number" defaultValue={1813} />
            </div>
            <div className="form-group">
              <label className="form-label">Shared Secret</label>
              <input className="form-input" type="password" placeholder="••••••••••" />
            </div>
          </div>
        </div>
      </div>
    </>
  )
}
