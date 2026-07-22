import React from 'react'

interface StatusDotProps {
  status: 'online' | 'active' | 'success' | 'warning' | 'degraded' | 'offline' | 'danger'
  label?: string
}

export default function StatusDot({ status, label }: StatusDotProps) {
  const normStatus = status.toLowerCase()
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 13, color: 'var(--text-secondary)' }}>
      <span className={`status-dot ${normStatus}`} />
      {label && <span>{label}</span>}
    </span>
  )
}
