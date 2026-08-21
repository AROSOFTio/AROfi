'use client'

import { useEffect, useState } from 'react'
import { clientFetchApi } from '@/lib/client-api'
import { formatCurrency, formatDate } from '@/lib/format'

type StockResponse = {
  summary: { assigned: number; available: number; sold: number; redeemed: number }
  batches: Array<{
    id: string
    batchNumber: string
    package: { id: string; name: string; code: string }
    quantity: number
    faceValueUgx: number
    available: number
    sold: number
    redeemed: number
    status: string
    createdAt: string
    expiresAt?: string | null
  }>
}

export default function AgentAssignedVoucherStock() {
  const [data, setData] = useState<StockResponse | null>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    clientFetchApi<StockResponse>('/agent-voucher-stock/me')
      .then(setData)
      .catch((requestError) => setError(requestError instanceof Error ? requestError.message : 'Unable to load your assigned voucher stock.'))
  }, [])

  if (error) return <div className="card"><div style={{ color: 'var(--danger-fg)', padding: 16 }}>{error}</div></div>

  const summary = data?.summary ?? { assigned: 0, available: 0, sold: 0, redeemed: 0 }

  return (
    <div>
      <div className="stats-grid" style={{ marginBottom: 14 }}>
        <Stat label="Assigned Vouchers" value={summary.assigned} />
        <Stat label="Available Offline" value={summary.available} />
        <Stat label="Sold" value={summary.sold} />
        <Stat label="Redeemed" value={summary.redeemed} />
      </div>

      <div className="card" style={{ margin: 0 }}>
        <div className="card-header">
          <div>
            <span className="card-title">My Assigned Offline Stock</span>
            <div style={{ color: 'var(--text-muted)', fontSize: 12, marginTop: 3 }}>These batches were created and assigned to you by the business owner. You cannot create or generate voucher stock.</div>
          </div>
        </div>
        <div className="table-wrap">
          <table>
            <thead><tr><th>Batch</th><th>Package</th><th>Face Value</th><th>Assigned</th><th>Available</th><th>Sold</th><th>Redeemed</th><th>Status</th><th>Assigned On</th></tr></thead>
            <tbody>
              {!data && <tr><td colSpan={9}>Loading assigned voucher stock...</td></tr>}
              {data && data.batches.length === 0 && <tr><td colSpan={9}><div className="empty-state"><p>No offline voucher stock has been assigned to you yet.</p></div></td></tr>}
              {data?.batches.map((batch) => (
                <tr key={batch.id}>
                  <td style={{ fontWeight: 700 }}>{batch.batchNumber}</td>
                  <td>{batch.package.name}</td>
                  <td>{formatCurrency(batch.faceValueUgx)}</td>
                  <td>{batch.quantity}</td>
                  <td><strong>{batch.available}</strong></td>
                  <td>{batch.sold}</td>
                  <td>{batch.redeemed}</td>
                  <td><span className="badge badge-info">{batch.status.toLowerCase()}</span></td>
                  <td style={{ color: 'var(--text-muted)', fontSize: 12 }}>{formatDate(batch.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

function Stat({ label, value }: { label: string; value: number }) {
  return <div className="stat-card blue"><div className="stat-label">{label}</div><div className="stat-value blue">{value}</div></div>
}
