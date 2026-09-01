'use client'

export default function BackupRecoveryError({ reset }: { reset: () => void }) {
  return (
    <div className="card" style={{ padding: 20 }}>
      <h2 style={{ marginTop: 0 }}>Backup & Recovery unavailable</h2>
      <p className="field-hint">The recovery API could not be loaded. No restore action was attempted.</p>
      <button className="btn btn-primary" type="button" onClick={reset}>Try Again</button>
    </div>
  )
}
