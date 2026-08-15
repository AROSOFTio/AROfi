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
  customerPhoneNumber: string
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
}

const pendingPaymentStatuses = new Set(['INITIATED', 'PENDING', 'INDETERMINATE', 'PROCESSING'])

export default function AgentSellPanel({
  packages,
  policy,
  cashToRemitUgx,
  cashRemainingBeforeLimitUgx,
  commissionRateBps,
}: Props) {
  const [open, setOpen] = useState(false)
  const [packageId, setPackageId] = useState(packages[0]?.id ?? '')
  const [customerPhoneNumber, setCustomerPhoneNumber] = useState('')
  const [payingPhoneNumber, setPayingPhoneNumber] = useState('')
  const [fulfillment, setFulfillment] = useState<'ACTIVATE_NOW' | 'VOUCHER_LATER'>('ACTIVATE_NOW')
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

  function resetAndClose() {
    if (busy && waitingPayment && pendingPaymentStatuses.has(waitingPayment.status)) return
    setOpen(false)
    setResult(null)
    setWaitingPayment(null)
    setError('')
    setCopied(false)
  }

  function openSeller() {
    setError('')
    setResult(null)
    setWaitingPayment(null)
    setFulfillment('ACTIVATE_NOW')
    setClaimCode('')
    setPaymentMethod(policy.cashEnabled ? 'CASH' : 'MOBILE_MONEY')
    setOpen(true)
  }

  async function sell(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError('')
    setResult(null)

    if (!selectedPackage) {
      setError('No package is available for your agent account.')
      return
    }
    if (!customerPhoneNumber.trim()) {
      setError('Enter the customer phone number.')
      return
    }
    if (fulfillment === 'ACTIVATE_NOW' && claimCode.replace(/\D/g, '').length !== 6) {
      setError('Enter the 6-digit activation number shown on the customer device.')
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
      if (paymentMethod === 'CASH') {
        const sale = await clientPostApi<CashSaleResult>('/agent-sales/me/cash-sale', {
          packageId: selectedPackage.id,
          customerPhoneNumber: customerPhoneNumber.trim(),
          fulfillment,
          claimCode: fulfillment === 'ACTIVATE_NOW' ? claimCode.replace(/\D/g, '') : undefined,
        })
        setResult(sale)
        setBusy(false)
        return
      }

      const payment = await clientPostApi<MobileMoneyResult>('/agent-sales/me/mobile-money', {
        packageId: selectedPackage.id,
        customerPhoneNumber: customerPhoneNumber.trim(),
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
    const message = encodeURIComponent(`Your AROFi WiFi voucher is ${voucherCode}. Connect to the WiFi and enter this code when you are ready to use your package.`)
    window.open(`https://wa.me/?text=${message}`, '_blank', 'noopener,noreferrer')
  }

  const resultVoucherCode = result && 'voucherCode' in result ? result.voucherCode : undefined
  const resultIsActivation = result && !resultVoucherCode

  return (
    <>
      <button type="button" className="primary-button" onClick={openSeller} style={{ minHeight: 58, fontSize: 16, fontWeight: 800, width: '100%' }} disabled={packages.length === 0}>
        + SELL INTERNET
      </button>

      {open && (
        <div className="modal-overlay" role="dialog" aria-modal="true">
          <div className="modal-card" style={{ maxWidth: 720, maxHeight: '94vh', overflowY: 'auto' }}>
            <button className="modal-close" type="button" onClick={resetAndClose} disabled={busy && Boolean(waitingPayment)}> <X size={16} /> Close</button>
            <div className="modal-kicker">Agent Sale</div>
            <h2 className="modal-title">Sell Internet</h2>

            {result ? (
              <div style={{ padding: '16px 0 4px' }}>
                <div style={{ display: 'grid', placeItems: 'center', textAlign: 'center', gap: 8 }}>
                  <CheckCircle2 size={48} style={{ color: 'var(--success-fg)' }} />
                  <h3 style={{ margin: 0 }}>{resultVoucherCode ? 'Voucher Ready' : 'Customer Activated'}</h3>
                  <p style={{ margin: 0, color: 'var(--text-muted)', maxWidth: 480, lineHeight: 1.55 }}>
                    {resultVoucherCode
                      ? 'Payment is confirmed and this voucher was created only for this completed sale. The package time starts when the customer redeems it.'
                      : 'The sale is complete. The waiting customer device has received its access credentials and will connect from the captive WiFi window.'}
                  </p>
                </div>

                {resultVoucherCode && (
                  <div style={{ margin: '20px auto 12px', maxWidth: 430, border: '1px solid var(--border)', borderRadius: 12, padding: 18, textAlign: 'center' }}>
                    <div style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '.08em', color: 'var(--text-muted)' }}>Voucher code</div>
                    <div style={{ fontSize: 27, fontWeight: 900, letterSpacing: '.08em', marginTop: 5 }}>{resultVoucherCode}</div>
                    <div style={{ display: 'flex', gap: 8, justifyContent: 'center', marginTop: 14, flexWrap: 'wrap' }}>
                      <button type="button" className="btn btn-ghost" onClick={() => void copyVoucher()}><Copy size={15} /> {copied ? 'Copied' : 'Copy'}</button>
                      <button type="button" className="btn btn-primary" onClick={shareVoucher}>Share WhatsApp</button>
                    </div>
                  </div>
                )}

                {'cashToRemitUgx' in result && (
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 9, marginTop: 18 }}>
                    <ResultMetric label="Sale" value={`UGX ${result.amountUgx.toLocaleString()}`} />
                    <ResultMetric label="Your commission" value={`UGX ${result.commissionUgx.toLocaleString()}`} />
                    <ResultMetric label="Cash to remit" value={`UGX ${result.cashToRemitUgx.toLocaleString()}`} />
                  </div>
                )}

                <button type="button" className="primary-button" style={{ width: '100%', marginTop: 20 }} onClick={() => window.location.reload()}>Done</button>
              </div>
            ) : (
              <form onSubmit={sell}>
                <SectionTitle step="1" title="Choose package" />
                <div style={{ display: 'grid', gap: 8, gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))' }}>
                  {packages.map((pkg) => (
                    <button
                      key={pkg.id}
                      type="button"
                      onClick={() => setPackageId(pkg.id)}
                      style={{
                        border: `1.5px solid ${packageId === pkg.id ? 'var(--brand)' : 'var(--border)'}`,
                        background: packageId === pkg.id ? 'var(--brand-soft)' : 'var(--bg-card)',
                        borderRadius: 10,
                        padding: 12,
                        textAlign: 'left',
                        cursor: 'pointer',
                      }}
                    >
                      <strong style={{ display: 'block' }}>{pkg.name}</strong>
                      <span style={{ color: 'var(--text-muted)', fontSize: 12 }}>{formatDuration(pkg.durationMinutes)} · UGX {pkg.activePriceUgx.toLocaleString()}</span>
                    </button>
                  ))}
                </div>

                <SectionTitle step="2" title="Customer" />
                <div className="form-group">
                  <label className="form-label">Customer phone number</label>
                  <input className="form-input" inputMode="tel" value={customerPhoneNumber} onChange={(event) => {
                    setCustomerPhoneNumber(event.target.value)
                    if (!payingPhoneNumber) setPayingPhoneNumber(event.target.value)
                  }} placeholder="0772 123 456" required />
                </div>

                <SectionTitle step="3" title="How should access be delivered?" />
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 10 }}>
                  <ChoiceButton
                    active={fulfillment === 'ACTIVATE_NOW'}
                    icon={<Wifi size={21} />}
                    title="Activate Now"
                    text="Customer is connected to this WiFi and wants access immediately."
                    onClick={() => setFulfillment('ACTIVATE_NOW')}
                  />
                  <ChoiceButton
                    active={fulfillment === 'VOUCHER_LATER'}
                    icon={<Ticket size={21} />}
                    title="Voucher for Later"
                    text="Create a voucher after this sale; package starts when redeemed."
                    onClick={() => setFulfillment('VOUCHER_LATER')}
                  />
                </div>

                {fulfillment === 'ACTIVATE_NOW' && (
                  <div style={{ marginTop: 10, border: '1px solid var(--border)', borderRadius: 10, padding: 12, background: 'var(--bg-soft)' }}>
                    <strong style={{ fontSize: 13 }}>Customer device activation number</strong>
                    <p style={{ color: 'var(--text-muted)', fontSize: 12, margin: '4px 0 9px', lineHeight: 1.45 }}>
                      On the customer WiFi login page, they tap <strong>Ask an Agent to Activate Me</strong>. Enter the 6-digit number they see. You never need their MAC address.
                    </p>
                    <input className="form-input" inputMode="numeric" maxLength={7} value={claimCode} onChange={(event) => setClaimCode(formatClaimCode(event.target.value))} placeholder="482 719" required />
                  </div>
                )}

                <SectionTitle step="4" title="Payment" />
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 10 }}>
                  <ChoiceButton
                    active={paymentMethod === 'CASH'}
                    disabled={!policy.cashEnabled}
                    icon={<Banknote size={21} />}
                    title="Cash"
                    text={policy.cashEnabled ? 'You collect the customer cash and remit the balance later.' : 'Cash selling is disabled.'}
                    onClick={() => setPaymentMethod('CASH')}
                  />
                  <ChoiceButton
                    active={paymentMethod === 'MOBILE_MONEY'}
                    disabled={!policy.mobileMoneyEnabled}
                    icon={<Smartphone size={21} />}
                    title="Mobile Money"
                    text={policy.mobileMoneyEnabled ? 'Money goes through AROFi; your cash liability stays at zero.' : 'Mobile Money selling is disabled.'}
                    onClick={() => setPaymentMethod('MOBILE_MONEY')}
                  />
                </div>

                {paymentMethod === 'CASH' && selectedPackage && (
                  <div style={{ marginTop: 10, display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 8 }}>
                    <ResultMetric label="Customer pays" value={`UGX ${selectedPackage.activePriceUgx.toLocaleString()}`} />
                    <ResultMetric label="Your commission" value={`UGX ${expectedCommissionUgx.toLocaleString()}`} />
                    <ResultMetric label="Cash to remit" value={`UGX ${expectedCashRemitUgx.toLocaleString()}`} />
                  </div>
                )}

                {paymentMethod === 'CASH' && cashRemainingBeforeLimitUgx !== null && (
                  <p style={{ color: cashLimitWouldBlock ? 'var(--danger-fg)' : 'var(--text-muted)', fontSize: 12, marginTop: 8 }}>
                    Cash outstanding: UGX {cashToRemitUgx.toLocaleString()} · Remaining before limit: UGX {cashRemainingBeforeLimitUgx.toLocaleString()}
                  </p>
                )}

                {paymentMethod === 'MOBILE_MONEY' && (
                  <div style={{ display: 'grid', gap: 10, marginTop: 10, gridTemplateColumns: 'minmax(0, 1fr) 150px' }}>
                    <div className="form-group">
                      <label className="form-label">Paying phone number</label>
                      <input className="form-input" inputMode="tel" value={payingPhoneNumber} onChange={(event) => setPayingPhoneNumber(event.target.value)} placeholder="Can be different from customer" required />
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
                  <div style={{ marginTop: 12, border: '1px solid var(--border)', borderRadius: 10, padding: 12 }}>
                    <strong>Waiting for payment confirmation…</strong>
                    <p style={{ margin: '4px 0 0', color: 'var(--text-muted)', fontSize: 12 }}>The payer must approve the prompt and enter their PIN on their own phone. AROFi will complete the sale only after the provider confirms success.</p>
                  </div>
                )}

                {error && <p style={{ color: 'var(--danger-fg)', fontSize: 13, marginTop: 12 }}>{error}</p>}

                <button type="submit" className="primary-button" style={{ width: '100%', marginTop: 16, minHeight: 48 }} disabled={busy || packages.length === 0 || (!policy.cashEnabled && !policy.mobileMoneyEnabled)}>
                  {busy
                    ? paymentMethod === 'MOBILE_MONEY' ? 'Waiting for Mobile Money…' : 'Completing sale…'
                    : paymentMethod === 'CASH' ? 'Confirm Cash Received' : 'Send Mobile Money Prompt'}
                </button>
              </form>
            )}
          </div>
        </div>
      )}
    </>
  )
}

function SectionTitle({ step, title }: { step: string; title: string }) {
  return <div style={{ fontSize: 13, fontWeight: 800, margin: '18px 0 8px' }}><span style={{ color: 'var(--brand)', marginRight: 6 }}>{step}.</span>{title}</div>
}

function ChoiceButton({ active, icon, title, text, onClick, disabled = false }: { active: boolean; icon: React.ReactNode; title: string; text: string; onClick: () => void; disabled?: boolean }) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      style={{
        border: `1.5px solid ${active ? 'var(--brand)' : 'var(--border)'}`,
        background: active ? 'var(--brand-soft)' : 'var(--bg-card)',
        borderRadius: 10,
        padding: 12,
        textAlign: 'left',
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.5 : 1,
      }}
    >
      <span style={{ color: active ? 'var(--brand)' : 'var(--text-muted)' }}>{icon}</span>
      <strong style={{ display: 'block', marginTop: 5 }}>{title}</strong>
      <span style={{ display: 'block', color: 'var(--text-muted)', fontSize: 11.5, marginTop: 3, lineHeight: 1.4 }}>{text}</span>
    </button>
  )
}

function ResultMetric({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ border: '1px solid var(--border)', borderRadius: 9, padding: 10 }}>
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
