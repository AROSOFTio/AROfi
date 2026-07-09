'use client'

import { useEffect, useMemo, useState } from 'react'
import { Download, FileSpreadsheet, FileText, Table2 } from 'lucide-react'
import { clientFetchApi } from '@/lib/client-api'

const browserApiBase = process.env.NEXT_PUBLIC_API_URL ?? '/api'

type ReportType = 'sales' | 'disbursements' | 'vouchers'

type ReportDefinition = {
  key: ReportType
  label: string
  description: string
  statusOptions: string[]
  hasChannel: boolean
}

const reportTypes: ReportDefinition[] = [
  {
    key: 'sales',
    label: 'Sales',
    description: 'Mobile money and voucher sales, with status, channel, and reference detail.',
    statusOptions: ['COMPLETED', 'PENDING', 'FAILED', 'REVERSED'],
    hasChannel: true,
  },
  {
    key: 'disbursements',
    label: 'Disbursements',
    description: 'Agent and vendor payouts, including method, status, and destination.',
    statusOptions: ['PENDING', 'PROCESSING', 'COMPLETED', 'FAILED', 'CANCELLED'],
    hasChannel: false,
  },
  {
    key: 'vouchers',
    label: 'Vouchers',
    description: 'Every generated voucher with its sale and redemption status.',
    statusOptions: ['GENERATED', 'PRINTED', 'SOLD', 'REDEEMED', 'EXPIRED', 'VOID'],
    hasChannel: false,
  },
]

type PreviewResponse = {
  total: number
  columns: string[]
  rows: Array<Array<string | number>>
}

function formatCell(header: string, value: string | number) {
  if (typeof value === 'number' && /UGX/i.test(header)) {
    return `UGX ${new Intl.NumberFormat('en-US').format(value)}`
  }
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T/.test(value)) {
    return new Intl.DateTimeFormat('en-UG', { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }).format(new Date(value))
  }
  return value === '' ? '-' : value
}

export default function ReportsExportPanel() {
  const [activeType, setActiveType] = useState<ReportType>('sales')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [status, setStatus] = useState('')
  const [channel, setChannel] = useState('')
  const [search, setSearch] = useState('')
  const [preview, setPreview] = useState<PreviewResponse | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const activeDefinition = useMemo(() => reportTypes.find((r) => r.key === activeType)!, [activeType])

  const queryString = useMemo(() => {
    const params = new URLSearchParams()
    if (from) params.set('from', from)
    if (to) params.set('to', to)
    if (status) params.set('status', status)
    if (channel) params.set('channel', channel)
    if (search) params.set('search', search)
    return params
  }, [from, to, status, channel, search])

  useEffect(() => {
    setStatus('')
    setChannel('')
  }, [activeType])

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)
    const timeout = window.setTimeout(() => {
      clientFetchApi<PreviewResponse>(`/reports/${activeType}/preview?${queryString.toString()}`)
        .then((data) => {
          if (!cancelled) setPreview(data)
        })
        .catch((requestError) => {
          if (!cancelled) setError(requestError instanceof Error ? requestError.message : 'Unable to load report preview')
        })
        .finally(() => {
          if (!cancelled) setLoading(false)
        })
    }, 300)
    return () => {
      cancelled = true
      window.clearTimeout(timeout)
    }
  }, [activeType, queryString])

  function downloadUrl(format: 'csv' | 'xlsx' | 'pdf') {
    const params = new URLSearchParams(queryString)
    params.set('format', format)
    return `${browserApiBase}/reports/${activeType}/export?${params.toString()}`
  }

  return (
    <div className="card">
      <div className="card-header">
        <span className="card-title">Reports</span>
      </div>

      <div style={{ padding: '0 20px 12px', display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        {reportTypes.map((report) => (
          <button
            key={report.key}
            type="button"
            className={activeType === report.key ? 'btn btn-primary' : 'btn btn-ghost'}
            onClick={() => setActiveType(report.key)}
          >
            {report.label}
          </button>
        ))}
      </div>

      <p style={{ padding: '0 20px', margin: '0 0 14px', color: 'var(--text-muted)', fontSize: 13 }}>{activeDefinition.description}</p>

      <div style={{ padding: '0 20px 16px', display: 'flex', gap: 14, alignItems: 'flex-end', flexWrap: 'wrap' }}>
        <div className="form-group">
          <label className="form-label">From</label>
          <input className="form-input" type="date" value={from} onChange={(event) => setFrom(event.target.value)} />
        </div>
        <div className="form-group">
          <label className="form-label">To</label>
          <input className="form-input" type="date" value={to} onChange={(event) => setTo(event.target.value)} />
        </div>
        <div className="form-group">
          <label className="form-label">Status</label>
          <select className="form-input" value={status} onChange={(event) => setStatus(event.target.value)}>
            <option value="">Any status</option>
            {activeDefinition.statusOptions.map((option) => (
              <option key={option} value={option}>{option}</option>
            ))}
          </select>
        </div>
        {activeDefinition.hasChannel && (
          <div className="form-group">
            <label className="form-label">Channel</label>
            <select className="form-input" value={channel} onChange={(event) => setChannel(event.target.value)}>
              <option value="">Any channel</option>
              <option value="MOBILE_MONEY">Mobile Money</option>
              <option value="VOUCHER">Voucher</option>
            </select>
          </div>
        )}
        <div className="form-group" style={{ minWidth: 200 }}>
          <label className="form-label">Search</label>
          <input className="form-input" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Phone, code, or reference" />
        </div>
      </div>

      <div style={{ padding: '0 20px 16px', display: 'flex', gap: 10, flexWrap: 'wrap' }}>
        <a className="secondary-button" href={downloadUrl('csv')} target="_blank" rel="noreferrer" style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
          <Table2 size={14} /> Download CSV
        </a>
        <a className="secondary-button" href={downloadUrl('xlsx')} target="_blank" rel="noreferrer" style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
          <FileSpreadsheet size={14} /> Download Excel
        </a>
        <a className="secondary-button" href={downloadUrl('pdf')} target="_blank" rel="noreferrer" style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
          <FileText size={14} /> Download PDF
        </a>
      </div>

      {error && <p style={{ padding: '0 20px', color: 'var(--danger-fg)', fontSize: 13 }}>{error}</p>}

      <div className="table-wrap" style={{ padding: '0 20px 20px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
          <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
            {loading ? 'Loading preview...' : preview ? `${preview.total} record(s) match these filters - showing first ${preview.rows.length}` : ''}
          </span>
          <Download size={14} style={{ color: 'var(--text-muted)' }} />
        </div>
        <table>
          <thead>
            <tr>
              {(preview?.columns ?? []).map((header) => (
                <th key={header}>{header}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {preview && preview.rows.length === 0 && !loading && (
              <tr>
                <td colSpan={preview.columns.length || 1}>
                  <div className="empty-state">
                    <p>No records match these filters.</p>
                  </div>
                </td>
              </tr>
            )}
            {preview?.rows.map((row, rowIndex) => (
              <tr key={rowIndex}>
                {row.map((cell, cellIndex) => (
                  <td key={cellIndex} style={{ fontSize: 12 }}>{formatCell(preview.columns[cellIndex], cell)}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
