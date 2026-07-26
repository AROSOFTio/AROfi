import React from 'react'

interface MetricCardProps {
  label: string
  value: string
  subtextLeft?: string
  subtextRight?: string
  icon?: React.ReactNode
  badge?: React.ReactNode
  children?: React.ReactNode
  variant?: 'default' | 'vibrant'
}

export default function MetricCard({
  label,
  value,
  subtextLeft,
  subtextRight,
  icon,
  badge,
  children,
}: MetricCardProps) {
  return (
    <div className="ui-card metric-card">
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
        <span className="label-text">{label}</span>
        {icon && <div style={{ color: 'var(--brand)', opacity: 0.85 }}>{icon}</div>}
        {badge}
      </div>
      <div className="card-value" style={{ marginBottom: (subtextLeft || subtextRight || children) ? 8 : 0 }}>
        {value}
      </div>
      {(subtextLeft || subtextRight) && (
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: 'var(--text-muted)' }}>
          {subtextLeft && <span>{subtextLeft}</span>}
          {subtextRight && <span>{subtextRight}</span>}
        </div>
      )}
      {children}
    </div>
  )
}
