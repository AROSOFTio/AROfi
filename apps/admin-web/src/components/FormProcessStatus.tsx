'use client'

import { AlertTriangle, CheckCircle2 } from 'lucide-react'

type FormProcessStatusProps = {
  busy?: boolean
  error?: string | null
  success?: string | null
  text?: string
}

export default function FormProcessStatus({ busy, error, success, text }: FormProcessStatusProps) {
  if (!busy && !error && !success) {
    return null
  }

  const tone = error ? 'danger' : success ? 'success' : 'working'
  const title = error ? 'Action failed' : success ? 'Completed' : 'Processing'

  return (
    <div
      role={error ? 'alert' : 'status'}
      aria-live="polite"
      style={{
        border: `1px solid ${tone === 'danger' ? 'rgba(248, 81, 73, 0.32)' : tone === 'success' ? 'var(--green-mid)' : 'var(--green-mid)'}`,
        borderRadius: 12,
        padding: 14,
        background: tone === 'danger' ? 'var(--danger-bg)' : tone === 'success' ? 'var(--success-bg)' : 'var(--green-light)',
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          color: tone === 'danger' ? 'var(--danger-fg)' : tone === 'success' ? 'var(--success-fg)' : 'var(--green-dark)',
          fontWeight: 800,
        }}
      >
        {busy ? (
          <span
            aria-hidden="true"
            style={{
              width: 14,
              height: 14,
              borderRadius: 999,
              border: '2px solid currentColor',
              borderTopColor: 'transparent',
              display: 'inline-block',
              animation: 'spin 0.8s linear infinite',
            }}
          />
        ) : error ? (
          <AlertTriangle size={16} />
        ) : (
          <CheckCircle2 size={16} />
        )}
        {title}
      </div>
      <div style={{ marginTop: 6, color: 'var(--text-2)', fontSize: 13, lineHeight: 1.5 }}>
        {error || success || text || 'Please wait while AROFi confirms this action.'}
      </div>
    </div>
  )
}
