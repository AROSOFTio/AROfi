'use client'

import {
  ArrowLeft,
  Banknote,
  CalendarDays,
  Check,
  CheckCircle2,
  Copy,
  Home,
  Landmark,
  MessageCircle,
  Send,
  ShoppingBag,
  Smartphone,
  TrendingUp,
  UserRound,
  Wallet,
  WalletCards,
  Wifi,
} from 'lucide-react'
import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { clientFetchApi, clientPostApi } from '@/lib/client-api'
import { formatCurrency, formatDate } from '@/lib/format'
import styles from './AgentMobileConsole.module.css'

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

export type AgentConsoleData = {
  agent: {
    id: string
    code: string
    name: string
    email?: string | null
    phoneNumber: string
    status: string
    commissionRateBps: number
    cashLimitUgx: number
    policy: AgentPolicy
  }
  summary: {
    todaySalesUgx: number
    monthSalesUgx: number
    todayCommissionUgx: number
    totalCommissionUgx: number
    cashToRemitUgx: number
    cashRemainingBeforeLimitUgx: number | null
    availableOfflineVouchers: number
  }
  recentSales: Array<{
    id: string
    amountUgx: number
    customerReference?: string | null
    packageName: string
    voucherCode?: string | null
    paymentMethod: 'CASH' | 'MOBILE_MONEY'
    fulfillment: string
    commissionUgx: number
    createdAt: string
  }>
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
type View = 'home' | 'sell' | 'reconciliation' | 'account'
type SellStage = 'FORM' | 'CASH_REVIEW' | 'WAITING' | 'SUCCESS'
type SaleResult = CashSaleResult | MobileMoneyResult

const pendingStatuses = new Set(['INITIATED', 'PENDING', 'PROCESSING', 'INDETERMINATE'])

export default function AgentMobileConsole({ data, packages }: { data: AgentConsoleData; packages: SellPackage[] }) {
  const [view, setView] = useState<View>('home')
  const [packageId, setPackageId] = useState(packages[0]?.id ?? '')
  const [paymentMethod, setPaymentMethod] = useState<'MOBILE_MONEY' | 'CASH'>(data.agent.policy.mobileMoneyEnabled ? 'MOBILE_MONEY' : 'CASH')
  const [customerPhoneNumber, setCustomerPhoneNumber] = useState('')
  const [payingPhoneNumber, setPayingPhoneNumber] = useState('')
  const [network, setNetwork] = useState<'MTN' | 'AIRTEL'>('MTN')
  const [sellStage, setSellStage] = useState<SellStage>('FORM')
  const [waitingPayment, setWaitingPayment] = useState<MobileMoneyResult | null>(null)
  const [saleResult, setSaleResult] = useState<SaleResult | null>(null)
  const [sellBusy, setSellBusy] = useState(false)
  const [sellError, setSellError] = useState('')
  const [copied, setCopied] = useState(false)

  const [accounting, setAccounting] = useState<Accounting | null>(null)
  const [accountingLoading, setAccountingLoading] = useState(false)
  const [accountingError, setAccountingError] = useState('')
  const [reconAction, setReconAction] = useState<'deposit' | 'withdraw' | null>(null)
  const [depositAmount, setDepositAmount] = useState('')
  const [depositPhone, setDepositPhone] = useState(data.agent.phoneNumber)
  const [withdrawPhone, setWithdrawPhone] = useState(data.agent.phoneNumber)
  const [reconNetwork, setReconNetwork] = useState<'MTN' | 'AIRTEL'>('MTN')
  const [reconBusy, setReconBusy] = useState<'deposit' | 'withdraw' | null>(null)
  const [reconMessage, setReconMessage] = useState('')

  const selectedPackage = useMemo(
    () => packages.find((pkg) => pkg.id === packageId) ?? packages[0] ?? null,
    [packages, packageId],
  )
  const agentSharePercent = Math.max(0, Math.min(100, data.agent.commissionRateBps / 100))
  const ownerSharePercent = Math.max(0, 100 - agentSharePercent)
  const expectedCommissionUgx = selectedPackage
    ? Math.floor((selectedPackage.activePriceUgx * data.agent.commissionRateBps) / 10000)
    : 0
  const expectedOwnerShareUgx = selectedPackage ? Math.max(0, selectedPackage.activePriceUgx - expectedCommissionUgx) : 0
  const cashLimitWouldBlock =
    data.summary.cashRemainingBeforeLimitUgx !== null &&
    expectedOwnerShareUgx > data.summary.cashRemainingBeforeLimitUgx

  useEffect(() => {
    const syncHash = () => {
      const hash = window.location.hash.replace('#', '')
      if (hash === 'sell' || hash === 'reconciliation' || hash === 'account') setView(hash)
      else setView('home')
    }
    syncHash()
    window.addEventListener('hashchange', syncHash)
    return () => window.removeEventListener('hashchange', syncHash)
  }, [])

  useEffect(() => {
    if (view === 'reconciliation' && !accounting && !accountingLoading) void loadAccounting()
  }, [view, accounting, accountingLoading])

  useEffect(() => {
    if (!waitingPayment || !pendingStatuses.has(waitingPayment.status)) return
    let stopped = false
    let timer: ReturnType<typeof window.setTimeout> | undefined

    const poll = async () => {
      if (stopped) return
      try {
        const next = await clientPostApi<MobileMoneyResult>(`/agent-sales/me/mobile-money/${waitingPayment.id}/status`, {})
        if (stopped) return
        setWaitingPayment(next)
        if (next.status === 'COMPLETED') {
          setSaleResult(next)
          setSellStage('SUCCESS')
          setSellBusy(false)
          return
        }
        if (!pendingStatuses.has(next.status)) {
          setSellError(next.statusMessage || 'Payment was not completed.')
          setSellStage('FORM')
          setSellBusy(false)
          return
        }
        timer = window.setTimeout(() => void poll(), 2000)
      } catch (error) {
        if (stopped) return
        setSellError(error instanceof Error ? error.message : 'Could not confirm payment.')
        setSellStage('FORM')
        setSellBusy(false)
      }
    }

    timer = window.setTimeout(() => void poll(), 1200)
    return () => {
      stopped = true
      if (timer) window.clearTimeout(timer)
    }
  }, [waitingPayment?.id, waitingPayment?.status])

  function navigate(next: View) {
    setView(next)
    const hash = next === 'home' ? '' : `#${next}`
    window.history.replaceState(null, '', `${window.location.pathname}${window.location.search}${hash}`)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  function resetSale() {
    setSellStage('FORM')
    setSaleResult(null)
    setWaitingPayment(null)
    setSellError('')
    setCopied(false)
    setCustomerPhoneNumber('')
    setPayingPhoneNumber('')
    setPaymentMethod(data.agent.policy.mobileMoneyEnabled ? 'MOBILE_MONEY' : 'CASH')
  }

  async function beginSale(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setSellError('')
    if (!selectedPackage) return setSellError('No package is available.')
    if (!customerPhoneNumber.trim()) return setSellError('Enter customer phone number.')
    if (paymentMethod === 'CASH' && cashLimitWouldBlock) return setSellError('Cash limit reached. Deposit outstanding cash or use Mobile Money.')
    if (paymentMethod === 'MOBILE_MONEY' && !data.agent.policy.mobileMoneyEnabled) return setSellError('Mobile Money selling is disabled.')
    if (paymentMethod === 'CASH' && !data.agent.policy.cashEnabled) return setSellError('Cash selling is disabled.')

    if (paymentMethod === 'CASH') {
      setSellStage('CASH_REVIEW')
      return
    }

    const paymentPhone = (payingPhoneNumber || customerPhoneNumber).trim()
    if (!paymentPhone) return setSellError('Enter the paying phone number.')
    setSellBusy(true)
    setSellStage('WAITING')
    try {
      const payment = await clientPostApi<MobileMoneyResult>('/agent-sales/me/mobile-money', {
        packageId: selectedPackage.id,
        customerPhoneNumber: customerPhoneNumber.trim(),
        payingPhoneNumber: paymentPhone,
        fulfillment: 'VOUCHER_LATER',
        network,
      })
      setWaitingPayment(payment)
      if (payment.status === 'COMPLETED') {
        setSaleResult(payment)
        setSellStage('SUCCESS')
        setSellBusy(false)
      } else if (!pendingStatuses.has(payment.status)) {
        setSellError(payment.statusMessage || 'Payment was not completed.')
        setSellStage('FORM')
        setSellBusy(false)
      }
    } catch (error) {
      setSellError(error instanceof Error ? error.message : 'Could not start Mobile Money payment.')
      setSellStage('FORM')
      setSellBusy(false)
    }
  }

  async function confirmCashReceived() {
    if (!selectedPackage || cashLimitWouldBlock) return
    setSellError('')
    setSellBusy(true)
    try {
      const sale = await clientPostApi<CashSaleResult>('/agent-sales/me/cash-sale', {
        packageId: selectedPackage.id,
        customerPhoneNumber: customerPhoneNumber.trim(),
        fulfillment: 'VOUCHER_LATER',
      })
      setSaleResult(sale)
      setSellStage('SUCCESS')
    } catch (error) {
      setSellError(error instanceof Error ? error.message : 'Cash sale could not be completed.')
    } finally {
      setSellBusy(false)
    }
  }

  async function copyCode() {
    const code = saleResult && 'voucherCode' in saleResult ? saleResult.voucherCode : undefined
    if (!code) return
    try {
      await navigator.clipboard.writeText(code)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1600)
    } catch {
      setCopied(false)
    }
  }

  function sendCodeSms() {
    const code = saleResult && 'voucherCode' in saleResult ? saleResult.voucherCode : undefined
    if (!code) return
    const message = encodeURIComponent(`Your AROFi WiFi code is ${code}. Connect to WiFi and enter this code.`)
    window.location.href = `sms:${customerPhoneNumber}?&body=${message}`
  }

  function sendCodeWhatsApp() {
    const code = saleResult && 'voucherCode' in saleResult ? saleResult.voucherCode : undefined
    if (!code) return
    const message = encodeURIComponent(`Your AROFi WiFi code is ${code}. Connect to WiFi and enter this code.`)
    const phone = normalizeUgandaPhone(customerPhoneNumber)
    window.open(`https://wa.me/${phone}?text=${message}`, '_blank', 'noopener,noreferrer')
  }

  async function loadAccounting() {
    setAccountingLoading(true)
    setAccountingError('')
    try {
      const next = await clientFetchApi<Accounting>('/agent-accounting/me')
      setAccounting(next)
      setDepositAmount(next.summary.cashAvailableToDepositUgx > 0 ? String(next.summary.cashAvailableToDepositUgx) : '')
      setDepositPhone((current) => current || next.agent.phoneNumber)
      setWithdrawPhone((current) => current || next.agent.phoneNumber)
    } catch (error) {
      setAccountingError(error instanceof Error ? error.message : 'Could not load reconciliation.')
    } finally {
      setAccountingLoading(false)
    }
  }

  async function pollProvider(path: string) {
    for (let attempt = 0; attempt < 40; attempt += 1) {
      await new Promise((resolve) => window.setTimeout(resolve, 2000))
      const next = await clientPostApi<ProviderAction>(path, {})
      if (!pendingStatuses.has(next.status)) return next
    }
    throw new Error('Still processing. Check again shortly.')
  }

  async function depositCash() {
    if (!accounting) return
    const amountUgx = Math.round(Number(depositAmount || 0))
    if (amountUgx <= 0 || amountUgx > accounting.summary.cashAvailableToDepositUgx) {
      setAccountingError(`Enter an amount up to ${formatCurrency(accounting.summary.cashAvailableToDepositUgx)}.`)
      return
    }
    setReconBusy('deposit')
    setAccountingError('')
    setReconMessage('')
    try {
      const started = await clientPostApi<ProviderAction>('/agent-accounting/me/cash-deposits', {
        amountUgx,
        phoneNumber: depositPhone,
        network: reconNetwork,
      })
      const final = pendingStatuses.has(started.status)
        ? await pollProvider(`/agent-accounting/me/cash-deposits/${started.id}/status`)
        : started
      if (final.status !== 'COMPLETED') throw new Error('Deposit was not completed.')
      setReconMessage(`${formatCurrency(final.amountUgx)} deposited.`)
      setReconAction(null)
      await loadAccounting()
    } catch (error) {
      setAccountingError(error instanceof Error ? error.message : 'Could not complete deposit.')
    } finally {
      setReconBusy(null)
    }
  }

  async function withdrawCommission() {
    if (!accounting || accounting.summary.mobileMoneyCommissionAvailableUgx <= 0) return
    setReconBusy('withdraw')
    setAccountingError('')
    setReconMessage('')
    try {
      const started = await clientPostApi<ProviderAction>('/agent-accounting/me/commission-withdrawals', {
        phoneNumber: withdrawPhone,
        network: reconNetwork,
      })
      const final = pendingStatuses.has(started.status)
        ? await pollProvider(`/agent-accounting/me/commission-withdrawals/${started.id}/status`)
        : started
      if (final.status !== 'COMPLETED') throw new Error('Withdrawal was not completed.')
      setReconMessage(`${formatCurrency(final.amountUgx)} withdrawn.`)
      setReconAction(null)
      await loadAccounting()
    } catch (error) {
      setAccountingError(error instanceof Error ? error.message : 'Could not complete withdrawal.')
    } finally {
      setReconBusy(null)
    }
  }

  const initials = data.agent.name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('') || 'AG'

  return (
    <div className={styles.shell}>
      <div className={styles.mobileHeader}>
        <div className={styles.mobileBrand}>
          <img src="/logo.svg" alt="AROFi" />
          <div><strong>AroFi</strong><span>Agent Portal</span></div>
        </div>
        <div className={styles.mobileAgentBadge}>{initials}</div>
      </div>

      <div className={styles.desktopTitle}>
        <div><h1>Agent Portal</h1><p>{data.agent.name} · {data.agent.code}</p></div>
        <span className={styles.statusPill}>{data.agent.status.toLowerCase()}</span>
      </div>

      {view === 'home' && (
        <main className={styles.view}>
          <div className={styles.heroRow}>
            <div><div className={styles.eyebrow}>Home</div><h2>Welcome, {firstName(data.agent.name)}</h2></div>
            <button type="button" className={styles.primaryButton} onClick={() => navigate('sell')}>Sell Internet</button>
          </div>

          <div className={styles.kpiGrid}>
            <Kpi icon={<TrendingUp size={15} />} label="Sales Today" value={formatCurrency(data.summary.todaySalesUgx)} />
            <Kpi icon={<CalendarDays size={15} />} label="This Month" value={formatCurrency(data.summary.monthSalesUgx)} />
            <Kpi icon={<Wallet size={15} />} label="My Commission" value={formatCurrency(data.summary.totalCommissionUgx)} />
            <Kpi icon={<Landmark size={15} />} label="To Deposit" value={formatCurrency(data.summary.cashToRemitUgx)} />
          </div>

          <div className={styles.card}>
            <div className={styles.cardHeader}>
              <span className={styles.cardTitle}>Recent Sales</span>
              <button type="button" className={styles.linkButton} onClick={() => navigate('reconciliation')}>Reconcile</button>
            </div>
            <div className={styles.saleList}>
              {data.recentSales.length === 0 && <div className={styles.empty}>No sales yet.</div>}
              {data.recentSales.slice(0, 6).map((sale) => (
                <div className={styles.saleRow} key={sale.id}>
                  <div className={`${styles.saleIcon} ${sale.paymentMethod === 'CASH' ? styles.cash : ''}`}>
                    {sale.paymentMethod === 'CASH' ? <Banknote size={17} /> : <Wifi size={17} />}
                  </div>
                  <div className={styles.saleMain}>
                    <strong>{displayPhone(sale.customerReference)}</strong>
                    <span>{sale.packageName} · {sale.paymentMethod === 'CASH' ? 'Cash' : 'Mobile Money'}</span>
                  </div>
                  <div className={styles.saleAmount}>
                    <strong>{formatCurrency(sale.amountUgx)}</strong>
                    <span className={styles.successText}>Completed</span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <button type="button" className={`${styles.primaryButton} ${styles.sellCta}`} onClick={() => navigate('sell')}>
            <Wifi size={18} /> Sell Internet
          </button>
        </main>
      )}

      {view === 'sell' && (
        <main className={styles.view}>
          <ScreenHeader title="Sell Internet" onBack={() => navigate('home')} />

          {sellStage === 'FORM' && (
            <form className={styles.formCard} onSubmit={beginSale}>
              <span className={styles.sectionLabel}>Payment Method</span>
              <div className={styles.paymentGrid}>
                <button
                  type="button"
                  disabled={!data.agent.policy.mobileMoneyEnabled}
                  className={`${styles.paymentChoice} ${paymentMethod === 'MOBILE_MONEY' ? styles.active : ''}`}
                  onClick={() => setPaymentMethod('MOBILE_MONEY')}
                >
                  <Smartphone size={23} /> Mobile Money
                </button>
                <button
                  type="button"
                  disabled={!data.agent.policy.cashEnabled}
                  className={`${styles.paymentChoice} ${styles.cash} ${paymentMethod === 'CASH' ? styles.active : ''}`}
                  onClick={() => setPaymentMethod('CASH')}
                >
                  <Banknote size={23} /> Cash
                </button>
              </div>

              <div style={{ height: 16 }} />
              <span className={styles.sectionLabel}>Select Package</span>
              <div className={styles.packageList}>
                {packages.map((pkg) => (
                  <button
                    type="button"
                    key={pkg.id}
                    className={`${styles.packageChoice} ${packageId === pkg.id ? styles.active : ''}`}
                    onClick={() => setPackageId(pkg.id)}
                  >
                    <div className={styles.packageName}><strong>{pkg.name}</strong><span>{formatDuration(pkg.durationMinutes)}</span></div>
                    <span className={styles.packagePrice}>{formatCurrency(pkg.activePriceUgx)}</span>
                    <span className={styles.radioDot} />
                  </button>
                ))}
                {packages.length === 0 && <div className={styles.empty}>No packages assigned.</div>}
              </div>

              <div style={{ height: 16 }} />
              <div className={styles.fieldGrid}>
                <div className={styles.field}>
                  <label>Customer phone number</label>
                  <input
                    className={styles.input}
                    inputMode="tel"
                    value={customerPhoneNumber}
                    onChange={(event) => {
                      setCustomerPhoneNumber(event.target.value)
                      if (!payingPhoneNumber) setPayingPhoneNumber(event.target.value)
                    }}
                    placeholder="07XX XXX XXX"
                  />
                </div>
                {paymentMethod === 'MOBILE_MONEY' && (
                  <div className={styles.field}>
                    <label>Paying phone number</label>
                    <input className={styles.input} inputMode="tel" value={payingPhoneNumber} onChange={(event) => setPayingPhoneNumber(event.target.value)} placeholder="Same or different phone" />
                  </div>
                )}
              </div>

              {paymentMethod === 'MOBILE_MONEY' && (
                <div className={styles.field} style={{ marginTop: 10 }}>
                  <label>Network</label>
                  <select className={styles.select} value={network} onChange={(event) => setNetwork(event.target.value as 'MTN' | 'AIRTEL')}>
                    <option value="MTN">MTN Mobile Money</option>
                    <option value="AIRTEL">Airtel Money</option>
                  </select>
                </div>
              )}

              {sellError && <div className={styles.error}>{sellError}</div>}
              <div className={styles.formActions}>
                <button type="submit" className={styles.primaryButton} disabled={sellBusy || !selectedPackage}>
                  {paymentMethod === 'CASH' ? 'Continue' : 'Request Payment'}
                </button>
              </div>
            </form>
          )}

          {sellStage === 'CASH_REVIEW' && selectedPackage && (
            <div className={styles.cashReview}>
              <div className={styles.cardTitle}>Cash Sale</div>
              <div className={styles.reviewRows}>
                <ReviewRow label="Package" value={`${selectedPackage.name} · ${formatDuration(selectedPackage.durationMinutes)}`} />
                <ReviewRow label="Customer" value={customerPhoneNumber} />
                <ReviewRow label="Amount to collect" value={formatCurrency(selectedPackage.activePriceUgx)} />
                <ReviewRow label={`Agent share (${formatPercent(agentSharePercent)})`} value={formatCurrency(expectedCommissionUgx)} />
                <ReviewRow label={`Owner share (${formatPercent(ownerSharePercent)})`} value={formatCurrency(expectedOwnerShareUgx)} />
              </div>

              <div className={styles.progressSteps}>
                <ProgressStep number="1" label="Created" state="done" />
                <ProgressStep number="2" label="Cash Received" state="active" />
                <ProgressStep number="3" label="Activated" state="idle" />
              </div>

              <div className={styles.confirmAmount}><span>Cash to collect</span><strong>{formatCurrency(selectedPackage.activePriceUgx)}</strong></div>
              {sellError && <div className={styles.error}>{sellError}</div>}
              <div className={styles.formActions}>
                <button type="button" className={styles.outlineButton} onClick={() => setSellStage('FORM')} disabled={sellBusy}>Back</button>
                <button type="button" className={styles.primaryButton} onClick={() => void confirmCashReceived()} disabled={sellBusy || cashLimitWouldBlock}>
                  {sellBusy ? 'Activating…' : 'Confirm Cash Received'}
                </button>
              </div>
            </div>
          )}

          {sellStage === 'WAITING' && (
            <div className={styles.saleSuccess}>
              <div className={styles.successHead}><Smartphone size={23} /> Payment Pending</div>
              <div className={styles.confirmAmount}><span>Mobile Money</span><strong>{selectedPackage ? formatCurrency(selectedPackage.activePriceUgx) : '—'}</strong></div>
              <div className={styles.muted}>Waiting for provider confirmation…</div>
              {sellError && <div className={styles.error}>{sellError}</div>}
            </div>
          )}

          {sellStage === 'SUCCESS' && saleResult && (
            <SaleSuccess
              result={saleResult}
              customerPhoneNumber={customerPhoneNumber}
              copied={copied}
              onCopy={() => void copyCode()}
              onSms={sendCodeSms}
              onWhatsApp={sendCodeWhatsApp}
              onDone={() => window.location.reload()}
            />
          )}
        </main>
      )}

      {view === 'reconciliation' && (
        <main className={styles.view}>
          <ScreenHeader title="Reconciliation" onBack={() => navigate('home')} />
          {accountingLoading && <div className={styles.card}>Loading…</div>}
          {accountingError && <div className={styles.error}>{accountingError}</div>}
          {accounting && (
            <>
              <div className={styles.reconGrid}>
                <ReconMetric label="Cash Collected" value={formatCurrency(accounting.summary.cashSalesUgx)} />
                <ReconMetric label={`Agent Share (${formatPercent(agentSharePercent)})`} value={formatCurrency(accounting.summary.cashCommissionUgx)} />
                <ReconMetric label={`Owner Share (${formatPercent(ownerSharePercent)})`} value={formatCurrency(accounting.summary.cashLiabilityUgx)} />
                <ReconMetric label="To Deposit" value={formatCurrency(accounting.summary.cashOutstandingUgx)} />
              </div>

              <div className={styles.splitCard}>
                <div className={styles.cardTitle}>Split Summary</div>
                <div className={styles.splitTop} style={{ marginTop: 12 }}>
                  <span>{formatPercent(ownerSharePercent)} Owner · {formatCurrency(accounting.summary.cashLiabilityUgx)}</span>
                  <span>{formatPercent(agentSharePercent)} Agent · {formatCurrency(accounting.summary.cashCommissionUgx)}</span>
                </div>
                <div className={styles.splitBar}>
                  <span className={styles.ownerBar} style={{ width: `${ownerSharePercent}%` }} />
                  <span className={styles.agentBar} style={{ width: `${agentSharePercent}%` }} />
                </div>
              </div>

              <div className={styles.walletStrip}>
                <div className={styles.walletBox}><span>My Wallet</span><strong>{formatCurrency(accounting.summary.mobileMoneyCommissionAvailableUgx)}</strong></div>
                <div className={styles.walletBox}><span>Deposit Status</span><strong className={accounting.summary.cashOutstandingUgx > 0 ? styles.pending : ''}>{accounting.summary.cashOutstandingUgx > 0 ? 'Pending' : 'Clear'}</strong></div>
              </div>

              <div className={styles.actionGrid}>
                <button type="button" className={styles.primaryButton} onClick={() => setReconAction(reconAction === 'deposit' ? null : 'deposit')} disabled={accounting.summary.cashAvailableToDepositUgx <= 0}>Deposit Cash</button>
                <button type="button" className={styles.outlineButton} onClick={() => setReconAction(reconAction === 'withdraw' ? null : 'withdraw')} disabled={accounting.summary.mobileMoneyCommissionAvailableUgx <= 0}>Withdraw Commission</button>
              </div>

              {reconAction === 'deposit' && (
                <div className={styles.actionPanel}>
                  <span className={styles.sectionLabel}>Deposit Cash</span>
                  <div className={styles.fieldGrid}>
                    <div className={styles.field}><label>Amount</label><input className={styles.input} inputMode="numeric" value={depositAmount} onChange={(event) => setDepositAmount(event.target.value)} /></div>
                    <div className={styles.field}><label>Phone</label><input className={styles.input} inputMode="tel" value={depositPhone} onChange={(event) => setDepositPhone(event.target.value)} /></div>
                  </div>
                  <div className={styles.field} style={{ marginTop: 9 }}><label>Network</label><select className={styles.select} value={reconNetwork} onChange={(event) => setReconNetwork(event.target.value as 'MTN' | 'AIRTEL')}><option value="MTN">MTN</option><option value="AIRTEL">Airtel</option></select></div>
                  <div className={styles.formActions}><button type="button" className={styles.primaryButton} onClick={() => void depositCash()} disabled={reconBusy !== null}>{reconBusy === 'deposit' ? 'Processing…' : 'Deposit'}</button></div>
                </div>
              )}

              {reconAction === 'withdraw' && (
                <div className={styles.actionPanel}>
                  <span className={styles.sectionLabel}>Withdraw Commission</span>
                  <div className={styles.fieldGrid}>
                    <div className={styles.field}><label>Available</label><input className={styles.input} value={formatCurrency(accounting.summary.mobileMoneyCommissionAvailableUgx)} disabled /></div>
                    <div className={styles.field}><label>Phone</label><input className={styles.input} inputMode="tel" value={withdrawPhone} onChange={(event) => setWithdrawPhone(event.target.value)} /></div>
                  </div>
                  <div className={styles.field} style={{ marginTop: 9 }}><label>Network</label><select className={styles.select} value={reconNetwork} onChange={(event) => setReconNetwork(event.target.value as 'MTN' | 'AIRTEL')}><option value="MTN">MTN</option><option value="AIRTEL">Airtel</option></select></div>
                  <div className={styles.formActions}><button type="button" className={styles.primaryButton} onClick={() => void withdrawCommission()} disabled={reconBusy !== null}>{reconBusy === 'withdraw' ? 'Processing…' : 'Withdraw'}</button></div>
                </div>
              )}

              {reconMessage && <div className={styles.card} style={{ color: '#15864c', fontWeight: 750 }}>{reconMessage}</div>}

              <div className={styles.card}>
                <div className={styles.cardHeader}><span className={styles.cardTitle}>Recent Reconciliation</span></div>
                <div className={styles.reconList}>
                  {accounting.recentSettlements.length === 0 && accounting.recentWithdrawals.length === 0 && <div className={styles.empty}>No reconciliation activity yet.</div>}
                  {accounting.recentSettlements.slice(0, 4).map((item) => (
                    <div className={styles.reconRow} key={`${item.reference}-${item.createdAt}`} style={{ gridTemplateColumns: 'minmax(0,1fr) auto' }}>
                      <div className={styles.reconMain}><strong>{formatDate(item.createdAt)}</strong><span>Cash deposit · {item.reference}</span></div>
                      <div className={styles.saleAmount}><strong>{formatCurrency(item.payableAmountUgx)}</strong><span className={styles.successText}>Deposited</span></div>
                    </div>
                  ))}
                  {accounting.recentWithdrawals.slice(0, 4).map((item) => (
                    <div className={styles.reconRow} key={item.id} style={{ gridTemplateColumns: 'minmax(0,1fr) auto' }}>
                      <div className={styles.reconMain}><strong>{formatDate(item.createdAt)}</strong><span>Commission withdrawal</span></div>
                      <div className={styles.saleAmount}><strong>{formatCurrency(item.amountUgx)}</strong><span className={styles.successText}>{prettyStatus(item.status)}</span></div>
                    </div>
                  ))}
                </div>
              </div>
            </>
          )}
        </main>
      )}

      {view === 'account' && (
        <main className={styles.view}>
          <ScreenHeader title="Account" onBack={() => navigate('home')} />
          <div className={styles.accountCard}>
            <div className={styles.accountHero}>
              <div className={styles.accountAvatar}>{initials}</div>
              <div><strong>{data.agent.name}</strong><span>{data.agent.code}</span></div>
            </div>
            <div className={styles.accountRows}>
              <div className={styles.accountRow}><span>Phone</span><strong>{displayPhone(data.agent.phoneNumber)}</strong></div>
              <div className={styles.accountRow}><span>Status</span><strong>{prettyStatus(data.agent.status)}</strong></div>
              <div className={styles.accountRow}><span>Commission</span><strong>{formatPercent(agentSharePercent)}</strong></div>
              <div className={styles.accountRow}><span>Cash Limit</span><strong>{data.agent.cashLimitUgx > 0 ? formatCurrency(data.agent.cashLimitUgx) : 'No limit'}</strong></div>
            </div>
          </div>
          <div className={styles.accountActions}>
            <a className={styles.outlineButton} href="/settings?tab=Password" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', textDecoration: 'none' }}>Password & Security</a>
            <a className={styles.outlineButton} href="/support" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', textDecoration: 'none' }}>Support</a>
          </div>
        </main>
      )}

      <nav className={styles.bottomNav} aria-label="Agent navigation">
        <NavButton active={view === 'home'} icon={<Home />} label="Home" onClick={() => navigate('home')} />
        <NavButton active={view === 'sell'} icon={<ShoppingBag />} label="Sell" onClick={() => navigate('sell')} />
        <NavButton active={view === 'reconciliation'} icon={<WalletCards />} label="Recon" onClick={() => navigate('reconciliation')} />
        <NavButton active={view === 'account'} icon={<UserRound />} label="Account" onClick={() => navigate('account')} />
      </nav>
    </div>
  )
}

function Kpi({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className={styles.kpiCard}>
      <div className={styles.kpiTop}><span>{label}</span><span className={styles.kpiIcon}>{icon}</span></div>
      <strong className={styles.kpiValue}>{value}</strong>
      <div className={styles.sparkline} />
    </div>
  )
}

function ScreenHeader({ title, onBack }: { title: string; onBack: () => void }) {
  return <div className={styles.screenHeader}><button type="button" className={styles.backButton} onClick={onBack}><ArrowLeft size={18} /></button><h2>{title}</h2></div>
}

function ReviewRow({ label, value }: { label: string; value: string }) {
  return <div className={styles.reviewRow}><span>{label}</span><strong>{value}</strong></div>
}

function ProgressStep({ number, label, state }: { number: string; label: string; state: 'done' | 'active' | 'idle' }) {
  return <div className={`${styles.progressStep} ${state === 'done' ? styles.done : state === 'active' ? styles.active : ''}`}><span className={styles.stepDot}>{state === 'done' ? <Check size={12} /> : number}</span><span>{label}</span></div>
}

function ReconMetric({ label, value }: { label: string; value: string }) {
  return <div className={styles.reconCard}><span>{label}</span><strong>{value}</strong></div>
}

function SaleSuccess({
  result,
  customerPhoneNumber,
  copied,
  onCopy,
  onSms,
  onWhatsApp,
  onDone,
}: {
  result: SaleResult
  customerPhoneNumber: string
  copied: boolean
  onCopy: () => void
  onSms: () => void
  onWhatsApp: () => void
  onDone: () => void
}) {
  const code = 'voucherCode' in result ? result.voucherCode : undefined
  const isCash = 'cashToRemitUgx' in result
  return (
    <div className={styles.saleSuccess}>
      <div className={styles.successHead}><CheckCircle2 size={24} /> {isCash ? 'Cash Confirmed' : 'Payment Successful'}</div>
      <div className={styles.reviewRows}>
        <ReviewRow label="Customer" value={customerPhoneNumber} />
        <ReviewRow label="Amount" value={formatCurrency(result.amountUgx)} />
        <ReviewRow label="Payment" value={isCash ? 'Cash' : 'Mobile Money'} />
      </div>
      {code ? (
        <>
          <div className={styles.codeCard}><span>Customer WiFi Code</span><strong>{code}</strong></div>
          <div className={styles.shareGrid}>
            <button type="button" className={styles.iconAction} onClick={onCopy}><Copy size={15} /> {copied ? 'Copied' : 'Copy Code'}</button>
            <button type="button" className={styles.iconAction} onClick={onSms}><MessageCircle size={15} /> Send SMS</button>
            <button type="button" className={`${styles.iconAction} ${styles.whatsapp}`} onClick={onWhatsApp}><Send size={15} /> WhatsApp</button>
          </div>
        </>
      ) : (
        <div className={styles.codeCard}><span>Status</span><strong style={{ fontSize: 18, letterSpacing: 0 }}>Access Activated</strong></div>
      )}
      <button type="button" className={styles.primaryButton} style={{ width: '100%', marginTop: 12 }} onClick={onDone}>Done</button>
    </div>
  )
}

function NavButton({ active, icon, label, onClick }: { active: boolean; icon: React.ReactNode; label: string; onClick: () => void }) {
  return <button type="button" className={`${styles.navButton} ${active ? styles.active : ''}`} onClick={onClick}>{icon}<span>{label}</span></button>
}

function firstName(name: string) {
  return name.trim().split(/\s+/)[0] || 'Agent'
}

function displayPhone(value?: string | null) {
  if (!value) return 'Customer'
  return value.startsWith('256') ? `0${value.slice(3)}` : value
}

function normalizeUgandaPhone(value: string) {
  const digits = value.replace(/\D/g, '')
  if (digits.startsWith('256')) return digits
  if (digits.startsWith('0')) return `256${digits.slice(1)}`
  return digits
}

function formatDuration(minutes: number) {
  if (minutes % 1440 === 0) return `${minutes / 1440} day${minutes === 1440 ? '' : 's'}`
  if (minutes % 60 === 0) return `${minutes / 60} hour${minutes === 60 ? '' : 's'}`
  return `${minutes} min`
}

function formatPercent(value: number) {
  return `${Number.isInteger(value) ? value.toFixed(0) : value.toFixed(1)}%`
}

function prettyStatus(value: string) {
  return value.replaceAll('_', ' ').toLowerCase().replace(/(^|\s)\S/g, (letter) => letter.toUpperCase())
}
