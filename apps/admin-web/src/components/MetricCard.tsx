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
      <div className="metric-card-head">
        <span className="label-text">{label}</span>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
          {badge}
          {icon && <span className="metric-card-icon">{icon}</span>}
        </span>
      </div>
      <div className="card-value" style={{ marginBottom: (subtextLeft || subtextRight || children) ? 8 : 0 }}>
        {value}
      </div>
      {(subtextLeft || subtextRight) && (
        <div className="metric-card-meta">
          {subtextLeft ? <span>{subtextLeft}</span> : <span />}
          {subtextRight && <span>{subtextRight}</span>}
        </div>
      )}
      {children}
    </div>
  )
}
