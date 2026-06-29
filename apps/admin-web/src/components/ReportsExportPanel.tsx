'use client'

import { useState } from 'react'
import { Download } from 'lucide-react'

const browserApiBase = process.env.NEXT_PUBLIC_API_URL ?? '/api'

type ExportDefinition = {
  key: string
  label: string
  description: string
  path: string
  supportsDateRange: boolean
}

const exports: ExportDefinition[] = [
  {
    key: 'sales',
    label: 'Sales',
    description: 'Mobile money and voucher sales, with fees and net revenue per transaction.',
    path: '/billing/sales/export.csv',
    supportsDateRange: true,
  },
  {
    key: 'ledger',
    label: 'Ledger',
    description: 'Every billing transaction posted to the ledger, including reversals and adjustments.',
    path: '/billing/transactions/export.csv',
    supportsDateRange: true,
  },
  {
    key: 'payments',
    label: 'Payments',
    description: 'Mobile money payment attempts and their provider status, regardless of outcome.',
    path: '/payments/export.csv',
    supportsDateRange: true,
  },
  {
    key: 'disbursements',
    label: 'Disbursements',
    description: 'Agent and vendor payouts, including which settlement run each one belongs to.',
    path: '/agents/disbursements/export.csv',
    supportsDateRange: false,
  },
]

export default function ReportsExportPanel() {
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')

  function buildHref(definition: ExportDefinition) {
    if (!definition.supportsDateRange || (!from && !to)) {
      return `${browserApiBase}${definition.path}`
    }
    const params = new URLSearchParams()
    if (from) params.set('from', from)
    if (to) params.set('to', to)
    return `${browserApiBase}${definition.path}?${params.toString()}`
  }

  return (
    <div className="card">
      <div className="card-header">
        <span className="card-title">Export Data</span>
      </div>
      <div style={{ padding: '0 20px 8px', display: 'flex', gap: 16, alignItems: 'flex-end', flexWrap: 'wrap' }}>
        <div className="form-group">
          <label className="form-label">From</label>
          <input className="form-input" type="date" value={from} onChange={(event) => setFrom(event.target.value)} />
        </div>
        <div className="form-group">
          <label className="form-label">To</label>
          <input className="form-input" type="date" value={to} onChange={(event) => setTo(event.target.value)} />
        </div>
        <p style={{ color: 'var(--text-muted)', fontSize: 12, marginBottom: 10 }}>
          Leave blank to export everything within your plan&apos;s reporting window. Disbursements aren&apos;t date-filtered yet.
        </p>
      </div>
      <div style={{ padding: '8px 20px 20px', display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))' }}>
        {exports.map((definition) => (
          <a
            key={definition.key}
            className="secondary-button"
            href={buildHref(definition)}
            target="_blank"
            rel="noreferrer"
            style={{ display: 'flex', flexDirection: 'column', gap: 4, alignItems: 'flex-start', padding: 14, height: 'auto' }}
          >
            <span style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 700 }}>
              <Download size={14} /> {definition.label} CSV
            </span>
            <span style={{ fontSize: 12, color: 'var(--text-muted)', fontWeight: 400, textAlign: 'left' }}>{definition.description}</span>
          </a>
        ))}
      </div>
    </div>
  )
}
