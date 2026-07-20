'use client'

import { useState } from 'react'
import { clientFetchApi, clientPostApi } from '@/lib/client-api'
import { formatCurrency } from '@/lib/format'
import { PhoneNumberField } from '@/components/PhoneNumberField'

type PackageOption = {
  id: string
  name: string
  code: string
  activePriceUgx: number
}

type AgentOption = {
  id: string
  code: string
  name: string
  status: string
}

type SaleResult = {
  voucher: { code: string; faceValueUgx: number }
  billingTransaction: { grossAmountUgx: number }
}

export default function SellVoucherPanel() {
  const [isOpen, setIsOpen] = useState(false)
  const [loadingOptions, setLoadingOptions] = useState(false)
  const [packages, setPackages] = useState<PackageOption[]>([])
  const [agents, setAgents] = useState<AgentOption[]>([])
  const [packageId, setPackageId] = useState('')
  const [agentId, setAgentId] = useState('')
  const [customerReference, setCustomerReference] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<SaleResult | null>(null)

  async function open() {
    setIsOpen(true)
    setError(null)
    setResult(null)
    setLoadingOptions(true)
    try {
      const [packageData, agentData] = await Promise.all([
        clientFetchApi<{ items: PackageOption[] }>('/packages'),
        clientFetchApi<{ agents: AgentOption[] }>('/agents/overview'),
      ])
      setPackages(packageData.items ?? [])
      setAgents((agentData.agents ?? []).filter((agent) => agent.status === 'ACTIVE'))
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Could not load packages')
    } finally {
      setLoadingOptions(false)
    }
  }

  function close() {
    setIsOpen(false)
    setPackageId('')
    setAgentId('')
    setCustomerReference('')
    setError(null)
    if (result) {
      window.location.reload()
    }
  }

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError(null)
    setIsSubmitting(true)

    try {
      const sale = await clientPostApi<SaleResult>('/vouchers/sell', {
        packageId,
        customerReference: customerReference.trim(),
        agentId: agentId || undefined,
      })
      setResult(sale)
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Could not complete this sale')
    } finally {
      setIsSubmitting(false)
    }
  }

  function sellAnother() {
    setResult(null)
    setCustomerReference('')
  }

  return (
    <>
      <button className="primary-button" type="button" onClick={() => void open()}>
        + Sell Voucher
      </button>

      {isOpen && (
        <div className="modal-overlay" role="dialog" aria-modal="true">
          <div className="modal-card">
            <button className="modal-close" type="button" onClick={close}>Close</button>
            <div className="modal-kicker">Point of Sale</div>
            <h2 className="modal-title">Sell Voucher</h2>

            {result ? (
              <div style={{ marginTop: 18 }}>
                <div
                  style={{
                    border: '1px dashed var(--border)',
                    borderRadius: 10,
                    padding: 18,
                    textAlign: 'center',
                    background: 'var(--surface-muted, #f8fafc)',
                  }}
                >
                  <div style={{ fontSize: 12, color: 'var(--text-muted)', letterSpacing: 0.5, textTransform: 'uppercase' }}>Voucher Code</div>
                  <div style={{ fontSize: 28, fontWeight: 800, fontFamily: 'monospace', margin: '6px 0', color: 'var(--text-primary)' }}>
                    {result.voucher.code}
                  </div>
                  <div style={{ fontSize: 14, color: 'var(--text-2)' }}>{formatCurrency(result.voucher.faceValueUgx)}</div>
                </div>
                <p style={{ color: 'var(--text-muted)', fontSize: 13, marginTop: 14 }}>
                  Sale recorded successfully{agentId ? ' and attributed to the selected agent for commission.' : '.'} Give this code to the customer to redeem on the hotspot portal.
                </p>
                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 18 }}>
                  <button className="secondary-button" type="button" onClick={sellAnother}>Sell Another</button>
                  <button className="primary-button" type="button" onClick={close}>Done</button>
                </div>
              </div>
            ) : (
              <form onSubmit={submit} style={{ marginTop: 18 }}>
                <div className="form-grid">
                  <div className="form-group">
                    <label className="form-label">Package</label>
                    <select className="form-input" value={packageId} onChange={(event) => setPackageId(event.target.value)} required disabled={loadingOptions}>
                      <option value="">Select package</option>
                      {packages.map((pkg) => (
                        <option key={pkg.id} value={pkg.id}>
                          {pkg.name} - {formatCurrency(pkg.activePriceUgx)}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="form-group">
                    <label className="form-label">Agent (optional)</label>
                    <select className="form-input" value={agentId} onChange={(event) => setAgentId(event.target.value)} disabled={loadingOptions}>
                      <option value="">No agent - direct sale</option>
                      {agents.map((agent) => (
                        <option key={agent.id} value={agent.id}>
                          {agent.name} ({agent.code})
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="form-group">
                    <label className="form-label">Customer Phone Number</label>
                    <PhoneNumberField
                      value={customerReference}
                      onChange={setCustomerReference}
                      required
                      ugandaOnly
                      mobileOnly
                    />
                  </div>
                </div>
                <p style={{ color: 'var(--text-muted)', fontSize: 13, marginTop: 12 }}>
                  Picks the next available unused voucher for this package and marks it sold. Attributing an agent accrues their commission automatically.
                </p>
                {error && <p style={{ color: 'var(--danger-fg)', marginTop: 10, fontSize: 13 }}>{error}</p>}
                {!loadingOptions && packages.length === 0 && (
                  <p style={{ color: 'var(--danger-fg)', marginTop: 10, fontSize: 13 }}>
                    No packages found. Create a package before selling vouchers.
                  </p>
                )}
                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 18 }}>
                  <button className="secondary-button" type="button" onClick={close}>Cancel</button>
                  <button className="primary-button" type="submit" disabled={isSubmitting || loadingOptions || !packageId}>
                    {isSubmitting ? 'Processing sale...' : 'Complete Sale'}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}
    </>
  )
}
