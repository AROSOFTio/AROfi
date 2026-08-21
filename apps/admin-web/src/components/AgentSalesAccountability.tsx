'use client'

import { useEffect, useState } from 'react'
import { clientFetchApi, clientPostApi } from '@/lib/client-api'
import { formatCurrency, formatDate } from '@/lib/format'

type Accounting = {
  agent: { id: string; name: string; code: string; phoneNumber: string; commissionRateBps: number }
  summary: {
    cashSalesUgx: number
    mobileMoneySalesUgx: number
    totalSalesUgx: number
    cashCommissionUgx: number
    mobileMoneyCommissionUgx: number
    totalCommissionUgx: number
    mobileMoneyCommissionAvailableUgx: number
    mobileMoneyCommissionPendingFundingUgx: number
    pendingCommissionWithdrawalUgx: number
    cashLiabilityUgx: number
    cashSettledUgx: number
    cashOutstandingUgx: number
    pendingCashDepositUgx: number
    cashAvailableToDepositUgx: number
  }
  recentSettlements: Array<{ payableAmountUgx: number; createdAt: string; reference: string }>
  recentWithdrawals: Array<{ id: string; amountUgx: number; status: string; destinationReference?: string | null; createdAt: string }>
}

type ProviderAction = { id: string; status: string; amountUgx: number }
const waitingStatuses = new Set(['INITIATED', 'PENDING', 'PROCESSING', 'INDETERMINATE'])

export default function AgentSalesAccountability() {
  const [data, setData] = useState<Accounting | null>(null)
  const [depositAmount, setDepositAmount] = useState('')
  const [depositPhone, setDepositPhone] = useState('')
  const [withdrawPhone, setWithdrawPhone] = useState('')
  const [network, setNetwork] = useState<'MTN' | 'AIRTEL'>('MTN')
  const [busy, setBusy] = useState<'deposit' | 'withdraw' | null>(null)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')

  useEffect(() => { void load() }, [])

  async function load() {
    try {
      const next = await clientFetchApi<Accounting>('/agent-accounting/me')
      setData(next)
      setDepositAmount(next.summary.cashAvailableToDepositUgx > 0 ? String(next.summary.cashAvailableToDepositUgx) : '')
      setDepositPhone((current) => current || next.agent.phoneNumber)
      setWithdrawPhone((current) => current || next.agent.phoneNumber)
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Unable to load Agent sales accounting.')
    }
  }

  async function depositCash() {
    if (!data) return
    const amountUgx = Math.round(Number(depositAmount || 0))
    if (amountUgx <= 0 || amountUgx > data.summary.cashAvailableToDepositUgx) {
      setError(`Enter an amount up to ${formatCurrency(data.summary.cashAvailableToDepositUgx)}.`)
      return
    }
    setBusy('deposit'); setError(''); setMessage('Sending the Mobile Money request for your cash deposit...')
    try {
      const started = await clientPostApi<ProviderAction>('/agent-accounting/me/cash-deposits', { amountUgx, phoneNumber: depositPhone, network })
      const final = waitingStatuses.has(started.status) ? await poll(`/agent-accounting/me/cash-deposits/${started.id}/status`) : started
      if (final.status !== 'COMPLETED') throw new Error('The cash deposit was not completed.')
      setMessage(`${formatCurrency(final.amountUgx)} deposited. Your outstanding cash balance was reduced automatically.`)
      await load()
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Could not complete the cash deposit.')
    } finally { setBusy(null) }
  }

  async function withdrawCommission() {
    if (!data || data.summary.mobileMoneyCommissionAvailableUgx <= 0) return
    setBusy('withdraw'); setError(''); setMessage('Sending your Mobile Money commission withdrawal...')
    try {
      const started = await clientPostApi<ProviderAction>('/agent-accounting/me/commission-withdrawals', { phoneNumber: withdrawPhone, network })
      const final = waitingStatuses.has(started.status) ? await poll(`/agent-accounting/me/commission-withdrawals/${started.id}/status`) : started
      if (final.status !== 'COMPLETED') throw new Error('The commission withdrawal was not completed.')
      setMessage(`${formatCurrency(final.amountUgx)} Mobile Money commission paid successfully.`)
      await load()
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Could not complete the commission withdrawal.')
    } finally { setBusy(null) }
  }

  async function poll(path: string): Promise<ProviderAction> {
    for (let attempt = 0; attempt < 40; attempt += 1) {
      await new Promise((resolve) => window.setTimeout(resolve, 2000))
      const next = await clientPostApi<ProviderAction>(path, {})
      if (!waitingStatuses.has(next.status)) return next
    }
    throw new Error('The provider is still processing this request. Refresh this page shortly to see the final status.')
  }

  const summary = data?.summary

  return (
    <div style={{ display: 'grid', gap: 14 }}>
      <div className="stats-grid">
        <Metric label="Cash Sales" value={formatCurrency(summary?.cashSalesUgx ?? 0)} note="Cash collected from customers" />
        <Metric label="Mobile Money Sales" value={formatCurrency(summary?.mobileMoneySalesUgx ?? 0)} note="Paid directly through AroFi" />
        <Metric label="Cash Commission" value={formatCurrency(summary?.cashCommissionUgx ?? 0)} note="Already retained from collected cash" />
        <Metric label="Mobile Money Commission" value={formatCurrency(summary?.mobileMoneyCommissionUgx ?? 0)} note="Earned from Mobile Money sales" />
        <Metric label="Total Commission" value={formatCurrency(summary?.totalCommissionUgx ?? 0)} note="Cash + Mobile Money commission" />
        <Metric label="Cash to Deposit" value={formatCurrency(summary?.cashOutstandingUgx ?? 0)} note={`Settled ${formatCurrency(summary?.cashSettledUgx ?? 0)}`} />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(300px,1fr))', gap: 12 }}>
        <div className="card" style={{ margin: 0, padding: 16 }}>
          <div className="card-title">Deposit Cash Sales</div>
          <p style={{ color: 'var(--text-muted)', fontSize: 12.5, lineHeight: 1.5 }}>
            AroFi already removes your Cash commission from what you owe. Deposit only the remaining cash due. A successful Mobile Money deposit automatically settles the same amount from your outstanding cash.
          </p>
          <div className="form-group"><label className="form-label">Amount to deposit</label><input className="form-input" type="number" min={1} max={summary?.cashAvailableToDepositUgx ?? 0} value={depositAmount} onChange={(event) => setDepositAmount(event.target.value)} /></div>
          <div className="form-group" style={{ marginTop: 8 }}><label className="form-label">Paying phone number</label><input className="form-input" value={depositPhone} onChange={(event) => setDepositPhone(event.target.value)} /></div>
          <Network value={network} onChange={setNetwork} />
          <button type="button" className="btn btn-primary" style={{ width: '100%', marginTop: 10 }} disabled={busy !== null || (summary?.cashAvailableToDepositUgx ?? 0) <= 0} onClick={() => void depositCash()}>
            {busy === 'deposit' ? 'Processing Cash Deposit...' : `Deposit ${formatCurrency(Number(depositAmount || 0))}`}
          </button>
        </div>

        <div className="card" style={{ margin: 0, padding: 16 }}>
          <div className="card-title">Withdraw Mobile Money Commission</div>
          <p style={{ color: 'var(--text-muted)', fontSize: 12.5, lineHeight: 1.5 }}>
            Only commission earned from completed Mobile Money sales is withdrawable here. Cash commission is already kept by you at the time of the Cash sale and cannot be paid twice.
          </p>
          <div style={{ fontSize: 27, fontWeight: 850, margin: '12px 0 4px' }}>{formatCurrency(summary?.mobileMoneyCommissionAvailableUgx ?? 0)}</div>
          <div style={{ color: 'var(--text-muted)', fontSize: 11.5, marginBottom: 10 }}>Available Mobile Money commission</div>
          {(summary?.pendingCommissionWithdrawalUgx ?? 0) > 0 && <div style={{ color: 'var(--text-muted)', fontSize: 11.5, marginBottom: 10 }}>Withdrawal processing: {formatCurrency(summary?.pendingCommissionWithdrawalUgx ?? 0)}</div>}
          {(summary?.mobileMoneyCommissionPendingFundingUgx ?? 0) > 0 && <div style={{ color: 'var(--warn-fg)', fontSize: 11.5, marginBottom: 10 }}>Recorded commission awaiting fully settled business-wallet funds: {formatCurrency(summary?.mobileMoneyCommissionPendingFundingUgx ?? 0)}</div>}
          <div className="form-group"><label className="form-label">Payout phone number</label><input className="form-input" value={withdrawPhone} onChange={(event) => setWithdrawPhone(event.target.value)} /></div>
          <Network value={network} onChange={setNetwork} />
          <button type="button" className="btn btn-primary" style={{ width: '100%', marginTop: 10 }} disabled={busy !== null || (summary?.mobileMoneyCommissionAvailableUgx ?? 0) <= 0} onClick={() => void withdrawCommission()}>
            {busy === 'withdraw' ? 'Processing Withdrawal...' : 'Withdraw Available Commission'}
          </button>
        </div>
      </div>

      {message && <div className="card" style={{ margin: 0, padding: 12, color: 'var(--success-fg)' }}>{message}</div>}
      {error && <div className="card" style={{ margin: 0, padding: 12, color: 'var(--danger-fg)' }}>{error}</div>}

      {(data?.recentWithdrawals.length ?? 0) > 0 && (
        <div className="card" style={{ margin: 0 }}>
          <div className="card-header"><span className="card-title">Recent Commission Withdrawals</span></div>
          <div className="table-wrap"><table><thead><tr><th>Amount</th><th>Phone</th><th>Status</th><th>Date</th></tr></thead><tbody>
            {data?.recentWithdrawals.map((item) => <tr key={item.id}><td>{formatCurrency(item.amountUgx)}</td><td>{item.destinationReference || '—'}</td><td>{item.status.replaceAll('_', ' ')}</td><td>{formatDate(item.createdAt)}</td></tr>)}
          </tbody></table></div>
        </div>
      )}
    </div>
  )
}

function Metric({ label, value, note }: { label: string; value: string; note: string }) {
  return <div className="stat-card blue"><div className="stat-label">{label}</div><div className="stat-value blue" style={{ fontSize: 20 }}>{value}</div><div style={{ color: 'var(--text-muted)', fontSize: 11, marginTop: 4 }}>{note}</div></div>
}

function Network({ value, onChange }: { value: 'MTN' | 'AIRTEL'; onChange: (value: 'MTN' | 'AIRTEL') => void }) {
  return <div className="form-group" style={{ marginTop: 8 }}><label className="form-label">Mobile Money network</label><select className="form-input" value={value} onChange={(event) => onChange(event.target.value as 'MTN' | 'AIRTEL')}><option value="MTN">MTN Mobile Money</option><option value="AIRTEL">Airtel Money</option></select></div>
}
