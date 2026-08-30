'use client'

import { useEffect, useMemo, useState } from 'react'
import { Banknote, CheckCircle2, Copy, Smartphone, Ticket, Wifi, X } from 'lucide-react'
import { clientPostApi } from '@/lib/client-api'

type SellPackage = {
  id: string
  name: string
  code: string
  durationMinutes: number
  activePriceUgx: number
}

type AgentPolicy = {
  cashEnabled: boolean
  mobileMoneyEnabled: boolean
  allowedPackageIds: string[]
}

type CashSaleResult = {
  status: 'COMPLETED'
  saleId: string
  amountUgx: number
  commissionUgx: number
  cashToRemitUgx: number
  voucherCode?: string
  activationId?: string
  message: string
}

type MobileMoneyResult = {
  id: string
  status: string
  statusMessage?: string
  amountUgx: number
  fulfillment: 'ACTIVATE_NOW' | 'VOUCHER_LATER'
  voucherCode?: string
  activationId?: string
  customerPhoneNumber?: string
  payingPhoneNumber: string
  network: 'MTN' | 'AIRTEL'
}

type SaleResult = CashSaleResult | MobileMoneyResult

type Props = {
  packages: SellPackage[]
  policy: AgentPolicy
  cashToRemitUgx: number
  cashRemainingBeforeLimitUgx: number | null
  commissionRateBps: number
  defaultOpen?: boolean
}

const pendingPaymentStatuses = new Set(['INITIATED', 'PENDING', 'INDETERMINATE', 'PROCESSING'])

export default function AgentSellPanel({
  packages,
  policy,
  cashToRemitUgx,
  cashRemainingBeforeLimitUgx,
  commissionRateBps,
  defaultOpen = false,
}: Props) {
  const [open, setOpen] = useState(defaultOpen)
  const [packageId, setPackageId] = useState(packages[0]?.id ?? '')
  const [customerPhoneNumber, setCustomerPhoneNumber] = useState('')
  const [payingPhoneNumber, setPayingPhoneNumber] = useState('')
  const [fulfillment, setFulfillment] = useState<'ACTIVATE_NOW' | 'VOUCHER_LATER'>('VOUCHER_LATER')
  const [paymentMethod, setPaymentMethod] = useState<'CASH' | 'MOBILE_MONEY'>(policy.cashEnabled ? 'CASH' : 'MOBILE_MONEY')
  const [claimCode, setClaimCode] = useState('')
  const [network, setNetwork] = useState<'MTN' | 'AIRTEL'>('MTN')
  const [busy, setBusy] = useState(false)
  const [waitingPayment, setWaitingPayment] = useState<MobileMoneyResult | null>(null)
  const [result, setResult] = useState<SaleResult | null>(null)
  const [error, setError] = useState('')
  const [copied, setCopied] = useState(false)

  const selectedPackage = useMemo(() => packages.find((pkg) => pkg.id === packageId) ?? packages[0] ?? null, [packages, packageId])
  const expectedCommissionUgx = selectedPackage
    ? Math.floor((selectedPackage.activePriceUgx * commissionRateBps) / 10000)
    : 0
  const expectedCashRemitUgx = selectedPackage ? Math.max(0, selectedPackage.activePriceUgx - expectedCommissionUgx) : 0
  const cashLimitWouldBlock =
    paymentMethod === 'CASH' &&
    cashRemainingBeforeLimitUgx !== null &&
    expectedCashRemitUgx > cashRemainingBeforeLimitUgx

  useEffect(() => {
    if (defaultOpen) setOpen(true)
  }, [defaultOpen])

  useEffect(() => {
    if (!waitingPayment || !pendingPaymentStatuses.has(waitingPayment.status)) return

    let stopped = false
    let timer: ReturnType<typeof window.setTimeout> | undefined
    const poll = async () => {
      if (stopped) return
      try {
        const next = await clientPostApi<MobileMoneyResult>(`/agent-sales/me/mobile-money/${waitingPayment.id}/status`, {})
        if (stopped) return
        setWaitingPayment(next)
        if (next.status === 'COMPLETED') {
          setResult(next)
          setBusy(false)
          return
        }
        if (!pendingPaymentStatuses.has(next.status)) {
          setError(next.statusMessage || 'Mobile Money payment was not completed.')
          setBusy(false)
          return
        }
        timer = window.setTimeout(() => void poll(), 2000)
      } catch (requestError) {
        if (stopped) return
        setError(requestError instanceof Error ? requestError.message : 'Could not confirm the Mobile Money payment.')
        setBusy(false)
      }
    }

    timer = window.setTimeout(() => void poll(), 1200)
    return () => {
      stopped = true
      if (timer) window.clearTimeout(timer)
    }
  }, [waitingPayment?.id, waitingPayment?.status])

  function resetSale() {
    setResult(null)
    setWaitingPayment(null)
    setError('')
    setCopied(false)
    setCustomerPhoneNumber('')
    setPayingPhoneNumber('')
    setClaimCode('')
    setFulfillment('VOUCHER_LATER')
    setPaymentMethod(policy.cashEnabled ? 'CASH' : 'MOBILE_MONEY')
  }

  function resetAndClose() {
    if (busy && waitingPayment && pendingPaymentStatuses.has(waitingPayment.status)) return
    setOpen(false)
    resetSale()
  }

  function openSeller() {
    resetSale()
    setOpen(true)
  }

  async function sell(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError('')
    setResult(null)

    if (!selectedPackage) {
      setError('No package is available for your Agent account.')
      return
    }
    if (fulfillment === 'ACTIVATE_NOW' && claimCode.replace(/\D/g, '').length !== 6) {
      setError('Enter the 6-digit code shown on the customer WiFi page.')
      return
    }
    if (paymentMethod === 'CASH' && cashLimitWouldBlock) {
      setError('This cash sale would exceed your unsettled cash limit. Use Mobile Money or settle outstanding cash first.')
      return
    }
    if (paymentMethod === 'MOBILE_MONEY' && !payingPhoneNumber.trim()) {
      setError('Enter the phone number that will approve the Mobile Money payment.')
      return
    }

    setBusy(true)
    try {
      const customerPhone = customerPhoneNumber.trim() || undefined
      if (paymentMethod === 'CASH') {
        const sale = await clientPostApi<CashSaleResult>('/agent-sales/me/cash-sale', {
          packageId: selectedPackage.id,
          customerPhoneNumber: customerPhone,
          fulfillment,
          claimCode: fulfillment === 'ACTIVATE_NOW' ? claimCode.replace(/\D/g, '') : undefined,
        })
        setResult(sale)
        setBusy(false)
        return
      }

      const payment = await clientPostApi<MobileMoneyResult>('/agent-sales/me/mobile-money', {
        packageId: selectedPackage.id,
        customerPhoneNumber: customerPhone,
        payingPhoneNumber: payingPhoneNumber.trim(),
        fulfillment,
        claimCode: fulfillment === 'ACTIVATE_NOW' ? claimCode.replace(/\D/g, '') : undefined,
        network,
      })
      setWaitingPayment(payment)
      if (payment.status === 'COMPLETED') {
        setResult(payment)
        setBusy(false)
      } else if (!pendingPaymentStatuses.has(payment.status)) {
        setError(payment.statusMessage || 'Mobile Money payment was not completed.')
        setBusy(false)
      }
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Could not complete this sale.')
      setBusy(false)
    }
  }

  async function copyVoucher() {
    const voucherCode = result && 'voucherCode' in result ? result.voucherCode : undefined
    if (!voucherCode) return
    try {
      await navigator.clipboard.writeText(voucherCode)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1800)
    } catch {
      setCopied(false)
    }
  }

  function shareVoucher() {
    const voucherCode = result && 'voucherCode' in result ? result.voucherCode : undefined
    if (!voucherCode) return
    const packageName = selectedPackage?.name ?? 'WiFi access'
    const message = encodeURIComponent(`AROFi WiFi access\nPackage: ${packageName}\nCode: ${voucherCode}\n\nConnect to the WiFi and enter this code on the sign-in page.`)
    window.open(`https://wa.me/?text=${message}`, '_blank', 'noopener,noreferrer')
  }

  const resultVoucherCode = result && 'voucherCode' in result ? result.voucherCode : undefined

  return (
    <>
      <button
        type="button"
        className="primary-button"
        onClick={openSeller}
        style={{ minHeight: 68, fontSize: 18, fontWeight: 900, width: '100%', letterSpacing: '.01em' }}
        disabled={packages.length === 0}
      >
        <Wifi size={22} /> SELL WIFI / INTERNET
      </button>

      {open && (
        <div className="modal-overlay" role="dialog" aria-modal="true">
          <div className="modal-card agent-sell-modal">
            <button className="modal-close" type="button" onClick={resetAndClose} disabled={busy && Boolean(waitingPayment)}><X size={16} /> Close</button>
            <div className="modal-kicker">Agent Sale</div>
            <h2 className="modal-title">Sell WiFi / Internet</h2>

            {result ? (
              <div className="agent-sale-success">
                <CheckCircle2 size={52} style={{ color: 'var(--success-fg)' }} />
                <h3>{resultVoucherCode ? 'Give this code to the customer' : 'Customer connected'}</h3>

                {resultVoucherCode ? (
                  <>
                    <p>The customer connects to the WiFi and enters this code on the AROFi sign-in page. No phone number is required.</p>
                    <div className="agent-voucher-code">{resultVoucherCode}</div>
                    <div className="agent-success-actions">
                      <button type="button" className="btn btn-ghost" onClick={() => void copyVoucher()}><Copy size={16} /> {copied ? 'Copied' : 'Copy code'}</button>
                      <button type="button" className="btn btn-primary" onClick={shareVoucher}>Share code</button>
                    </div>
                  </>
                ) : (
                  <p>The waiting device has been activated. It should connect automatically from its captive WiFi window.</p>
                )}

                {'cashToRemitUgx' in result && (
                  <div className="agent-result-grid">
                    <ResultMetric label="Sale" value={`UGX ${result.amountUgx.toLocaleString()}`} />
                    <ResultMetric label="Your commission" value={`UGX ${result.commissionUgx.toLocaleString()}`} />
                    <ResultMetric label="Cash to remit" value={`UGX ${result.cashToRemitUgx.toLocaleString()}`} />
                  </div>
                )}

                <div className="agent-success-actions" style={{ marginTop: 18 }}>
                  <button type="button" className="btn btn-ghost" onClick={resetSale}>Sell another</button>
                  <button type="button" className="btn btn-primary" onClick={() => window.location.reload()}>Done</button>
                </div>
              </div>
            ) : (
              <form onSubmit={sell}>
                <SectionTitle step="1" title="Choose package" />
                <div className="agent-package-grid">
                  {packages.map((pkg) => (
                    <button
                      key={pkg.id}
                      type="button"
                      onClick={() => setPackageId(pkg.id)}
                      className={packageId === pkg.id ? 'agent-package active' : 'agent-package'}
                    >
                      <strong>{pkg.name}</strong>
                      <span>{formatDuration(pkg.durationMinutes)}</span>
                      <b>UGX {pkg.activePriceUgx.toLocaleString()}</b>
                    </button>
                  ))}
                </div>

                <SectionTitle step="2" title="Give access" />
                <div className="agent-choice-grid">
                  <ChoiceButton
                    active={fulfillment === 'VOUCHER_LATER'}
                    icon={<Ticket size={22} />}
                    title="Give Access Code"
                    text="Best for walk-ins, laptops and customers without a phone number."
                    onClick={() => setFulfillment('VOUCHER_LATER')}
                  />
                  <ChoiceButton
                    active={fulfillment === 'ACTIVATE_NOW'}
                    icon={<Wifi size={22} />}
                    title="Connect Waiting Device"
                    text="Use the 6-digit number shown on the customer's WiFi portal."
                    onClick={() => setFulfillment('ACTIVATE_NOW')}
                  />
                </div>

                {fulfillment === 'ACTIVATE_NOW' && (
                  <div className="agent-claim-box">
                    <strong>Customer's 6-digit device code</strong>
                    <p>Customer connects to the WiFi → opens the AROFi portal → taps <strong>Ask an Agent to Activate Me</strong> → tells you the 6-digit number.</p>
                    <input className="form-input agent-claim-input" inputMode="numeric" maxLength={7} value={claimCode} onChange={(event) => setClaimCode(formatClaimCode(event.target.value))} placeholder="482 719" required />
                  </div>
                )}

                <div className="form-group" style={{ marginTop: 14 }}>
                  <label className="form-label">Customer phone <span style={{ color: 'var(--text-muted)', fontWeight: 500 }}>(optional)</span></label>
                  <input
                    className="form-input"
                    inputMode="tel"
                    value={customerPhoneNumber}
                    onChange={(event) => setCustomerPhoneNumber(event.target.value)}
                    placeholder="Skip if customer only needs a code"
                  />
                  <div style={{ color: 'var(--text-muted)', fontSize: 11, marginTop: 4 }}>Only used for customer lookup/delivery. It is not required to sell a WiFi code.</div>
                </div>

                <SectionTitle step="3" title="Payment" />
                <div className="agent-choice-grid">
                  <ChoiceButton
                    active={paymentMethod === 'CASH'}
                    disabled={!policy.cashEnabled}
                    icon={<Banknote size={22} />}
                    title="Cash"
                    text={policy.cashEnabled ? 'Customer pays you cash.' : 'Cash selling is disabled.'}
                    onClick={() => setPaymentMethod('CASH')}
                  />
                  <ChoiceButton
                    active={paymentMethod === 'MOBILE_MONEY'}
                    disabled={!policy.mobileMoneyEnabled}
                    icon={<Smartphone size={22} />}
                    title="Mobile Money"
                    text={policy.mobileMoneyEnabled ? 'Send a payment prompt to the paying phone.' : 'Mobile Money selling is disabled.'}
                    onClick={() => setPaymentMethod('MOBILE_MONEY')}
                  />
                </div>

                {paymentMethod === 'CASH' && selectedPackage && (
                  <div className="agent-result-grid" style={{ marginTop: 10 }}>
                    <ResultMetric label="Customer pays" value={`UGX ${selectedPackage.activePriceUgx.toLocaleString()}`} />
                    <ResultMetric label="You keep" value={`UGX ${expectedCommissionUgx.toLocaleString()}`} />
                    <ResultMetric label="You remit" value={`UGX ${expectedCashRemitUgx.toLocaleString()}`} />
                  </div>
                )}

                {paymentMethod === 'CASH' && cashRemainingBeforeLimitUgx !== null && cashLimitWouldBlock && (
                  <p style={{ color: 'var(--danger-fg)', fontSize: 12, marginTop: 8 }}>Cash limit reached. Use Mobile Money or deposit outstanding cash first.</p>
                )}

                {paymentMethod === 'MOBILE_MONEY' && (
                  <div className="agent-payment-grid">
                    <div className="form-group">
                      <label className="form-label">Phone paying with Mobile Money</label>
                      <input className="form-input" inputMode="tel" value={payingPhoneNumber} onChange={(event) => setPayingPhoneNumber(event.target.value)} placeholder="0772 123 456" required />
                    </div>
                    <div className="form-group">
                      <label className="form-label">Network</label>
                      <select className="form-input" value={network} onChange={(event) => setNetwork(event.target.value as 'MTN' | 'AIRTEL')}>
                        <option value="MTN">MTN</option>
                        <option value="AIRTEL">Airtel</option>
                      </select>
                    </div>
                  </div>
                )}

                {waitingPayment && pendingPaymentStatuses.has(waitingPayment.status) && (
                  <div className="agent-waiting-box"><strong>Waiting for Mobile Money approval…</strong><span>The payer should approve the prompt on their phone.</span></div>
                )}

                {error && <p style={{ color: 'var(--danger-fg)', fontSize: 13, marginTop: 12 }}>{error}</p>}

                <button type="submit" className="primary-button" style={{ width: '100%', marginTop: 16, minHeight: 54, fontWeight: 900 }} disabled={busy || packages.length === 0 || (!policy.cashEnabled && !policy.mobileMoneyEnabled)}>
                  {busy
                    ? paymentMethod === 'MOBILE_MONEY' ? 'Waiting for payment…' : 'Creating access…'
                    : paymentMethod === 'CASH'
                      ? fulfillment === 'VOUCHER_LATER' ? 'CONFIRM CASH & CREATE CODE' : 'CONFIRM CASH & CONNECT'
                      : 'SEND MOBILE MONEY PROMPT'}
                </button>
              </form>
            )}
          </div>

          <style>{`
            .agent-sell-modal{max-width:720px;max-height:94vh;overflow-y:auto}
            .agent-package-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px}
            .agent-package{border:1.5px solid var(--border);background:var(--bg-card);border-radius:12px;padding:12px;text-align:left;cursor:pointer;display:grid;gap:3px;color:var(--text-primary)}
            .agent-package.active{border-color:var(--brand);background:var(--brand-soft)}
            .agent-package strong{font-size:14px}.agent-package span{color:var(--text-muted);font-size:11px}.agent-package b{margin-top:3px;color:var(--brand);font-size:13px}
            .agent-choice-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:9px}
            .agent-choice{border:1.5px solid var(--border);background:var(--bg-card);border-radius:12px;padding:13px;text-align:left;cursor:pointer;color:var(--text-primary)}
            .agent-choice.active{border-color:var(--brand);background:var(--brand-soft)}
            .agent-choice:disabled{opacity:.5;cursor:not-allowed}
            .agent-choice-icon{color:var(--brand)}.agent-choice strong{display:block;margin-top:5px}.agent-choice span{display:block;color:var(--text-muted);font-size:11.5px;margin-top:3px;line-height:1.35}
            .agent-claim-box{margin-top:10px;border:1px solid var(--brand);border-radius:12px;padding:13px;background:var(--brand-soft)}
            .agent-claim-box p{color:var(--text-muted);font-size:11.5px;line-height:1.45;margin:4px 0 9px}.agent-claim-input{text-align:center;font-size:22px!important;font-weight:900;letter-spacing:.12em}
            .agent-result-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px}
            .agent-payment-grid{display:grid;grid-template-columns:minmax(0,1fr) 140px;gap:10px;margin-top:10px}
            .agent-waiting-box{margin-top:12px;border:1px solid var(--brand);border-radius:10px;padding:12px;display:grid;gap:3px}.agent-waiting-box span{font-size:11.5px;color:var(--text-muted)}
            .agent-sale-success{padding:18px 0 4px;display:grid;place-items:center;text-align:center}.agent-sale-success h3{margin:9px 0 0;font-size:22px}.agent-sale-success p{margin:6px 0 0;color:var(--text-muted);max-width:500px;line-height:1.5}
            .agent-voucher-code{width:100%;max-width:470px;margin:18px auto 8px;border:2px solid var(--brand);background:var(--brand-soft);border-radius:16px;padding:20px 12px;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:34px;font-weight:950;letter-spacing:.1em;color:var(--brand);overflow-wrap:anywhere}
            .agent-success-actions{display:flex;gap:8px;justify-content:center;flex-wrap:wrap}
            @media(max-width:620px){.agent-sell-modal{width:calc(100vw - 18px)!important;padding:16px!important}.agent-package-grid{grid-template-columns:repeat(2,minmax(0,1fr))}.agent-choice-grid{grid-template-columns:1fr}.agent-payment-grid{grid-template-columns:1fr}.agent-result-grid{grid-template-columns:1fr}.agent-voucher-code{font-size:28px}.modal-title{font-size:22px!important}}
          `}</style>
        </div>
      )}
    </>
  )
}

function SectionTitle({ step, title }: { step: string; title: string }) {
  return <div style={{ fontSize: 13px, fontWeight: 850, margin: '18px 0 8px' }}><span style={{ color: 'var(--brand)', marginRight: 6 }}>{step}.</span>{title}</div>
}

function ChoiceButton({ active, icon, title, text, onClick, disabled = false }: { active: boolean; icon: React.ReactNode; title: string; text: string; onClick: () => void; disabled?: boolean }) {
  return (
    <button type="button" disabled={disabled} onClick={onClick} className={active ? 'agent-choice active' : 'agent-choice'}>
      <span className="agent-choice-icon">{icon}</span>
      <strong>{title}</strong>
      <span>{text}</span>
    </button>
  )
}

function ResultMetric({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ border: '1px solid var(--border)', borderRadius: 10, padding: 10, textAlign: 'left', width: '100%' }}>
      <div style={{ fontSize: 10.5, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '.04em' }}>{label}</div>
      <strong style={{ display: 'block', marginTop: 3, fontSize: 13 }}>{value}</strong>
    </div>
  )
}

function formatDuration(minutes: number) {
  if (minutes % 1440 === 0) return `${minutes / 1440} day${minutes === 1440 ? '' : 's'}`
  if (minutes % 60 === 0) return `${minutes / 60} hour${minutes === 60 ? '' : 's'}`
  return `${minutes} min`
}

function formatClaimCode(value: string) {
  const digits = value.replace(/\D/g, '').slice(0, 6)
  return digits.length > 3 ? `${digits.slice(0, 3)} ${digits.slice(3)}` : digits
}
