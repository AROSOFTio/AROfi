'use client'

import { useEffect, useState, type FormEvent } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ArrowRight, Loader2, LogIn, Receipt, Smartphone, Ticket, Wifi } from 'lucide-react'
import type {
  PortalContextResponse,
  PortalCustomerSession,
  PortalLoginResponse,
  PortalPackage,
  PortalPayment,
  PortalRedeemVoucherResponse,
} from '../lib/portal-types'

type PortalView = 'home' | 'login' | 'session'
type MobileMoneyNetwork = 'MTN' | 'AIRTEL'
type ConnectionStatus = 'idle' | 'connecting' | 'reconnecting' | 'failed'
type HotspotParams = {
  macAddress: string
  clientIp: string
  loginUrl: string
  routerId: string
  hotspotServerName: string
}

const pendingStatuses = ['INITIATED', 'PENDING', 'INDETERMINATE']
const portalStorageKey = 'arofi.portal.access_token'

function formatCurrency(value: number) {
  return `UGX ${new Intl.NumberFormat('en-UG').format(value)}`
}

function formatDate(value?: string | null) {
  if (!value) {
    return 'N/A'
  }

  return new Intl.DateTimeFormat('en-UG', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value))
}

function formatDuration(minutes: number) {
  if (minutes >= 1440 && minutes % 1440 === 0) {
    return `${minutes / 1440} day`
  }

  if (minutes >= 60 && minutes % 60 === 0) {
    return `${minutes / 60} hour`
  }

  return `${minutes} min`
}

function formatMegabytes(value: number) {
  if (value >= 1024) {
    return `${(value / 1024).toFixed(1)} GB`
  }

  return `${value.toFixed(value >= 100 ? 0 : 1)} MB`
}

function statusTone(status?: string | null) {
  switch ((status ?? '').toUpperCase()) {
    case 'ACTIVE':
    case 'COMPLETED':
      return 'border-emerald-200 bg-emerald-50 text-emerald-700'
    case 'FAILED':
    case 'CANCELLED':
    case 'EXPIRED':
      return 'border-rose-200 bg-rose-50 text-rose-700'
    default:
      return 'border-amber-200 bg-amber-50 text-amber-700'
  }
}

async function readJson<T>(response: Response): Promise<T> {
  return (await response.json()) as T
}

function normalizePhone(value: string) {
  const digits = value.replace(/\D/g, '')
  if (digits.startsWith('256')) return digits
  if (digits.startsWith('0')) return `256${digits.slice(1)}`
  return digits
}

function detectNetwork(phone: string): MobileMoneyNetwork | undefined {
  const normalized = normalizePhone(phone)
  const prefix = normalized.slice(3, 6)

  if (['770', '771', '772', '773', '774', '775', '776', '777', '778', '779', '780', '781', '782', '783', '784'].includes(prefix)) {
    return 'MTN'
  }

  if (['700', '701', '702', '703', '704', '705', '706', '707', '708', '709', '750', '751', '752', '753', '754', '755'].includes(prefix)) {
    return 'AIRTEL'
  }

  return undefined
}

export default function PortalCheckout({ initialView = 'home' }: { initialView?: PortalView }) {
  const router = useRouter()
  const [context, setContext] = useState<PortalContextResponse | null>(null)
  const [portalSession, setPortalSession] = useState<PortalCustomerSession | null>(null)
  const [portalToken, setPortalToken] = useState<string | null>(null)
  const [selectedPackage, setSelectedPackage] = useState<PortalPackage | null>(null)
  const [currentPayment, setCurrentPayment] = useState<PortalPayment | null>(null)
  const [phoneNumber, setPhoneNumber] = useState('')
  const [customerReference, setCustomerReference] = useState('')
  const [voucherCode, setVoucherCode] = useState('')
  const [isBooting, setIsBooting] = useState(true)
  const [isPaymentLoading, setIsPaymentLoading] = useState(false)
  const [isVoucherLoading, setIsVoucherLoading] = useState(false)
  const [isLoginLoading, setIsLoginLoading] = useState(false)
  const [errorMessage, setErrorMessage] = useState('')
  const [statusMessage, setStatusMessage] = useState('')
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>('idle')
  const [autoConnectAttempted, setAutoConnectAttempted] = useState(false)
  const [hotspotParams, setHotspotParams] = useState<HotspotParams>({
    macAddress: '',
    clientIp: '',
    loginUrl: '',
    routerId: '',
    hotspotServerName: '',
  })

  useEffect(() => {
    void bootstrap()
  }, [])

  useEffect(() => {
    if (!currentPayment || !pendingStatuses.includes(currentPayment.status)) {
      return
    }

    const interval = window.setInterval(() => void handleCheckPaymentStatus(currentPayment.id, currentPayment.statusToken), 5000)
    return () => window.clearInterval(interval)
  }, [currentPayment])

  useEffect(() => {
    if (!context?.returningDevice?.existingActiveAccess || autoConnectAttempted) {
      return
    }

    setAutoConnectAttempted(true)
    setConnectionStatus(portalSession ? 'reconnecting' : 'connecting')
    setStatusMessage(portalSession ? 'Welcome back. Reconnecting you now...' : 'Access confirmed. Connecting you now...')
    const timeout = window.setTimeout(() => {
      setConnectionStatus('failed')
      setErrorMessage('Automatic HotSpot login did not complete. Tap Connect Now to retry.')
    }, 4500)
    window.setTimeout(() => {
      autoSubmitHotspotLogin(context.returningDevice?.reconnect)
    }, 350)

    return () => window.clearTimeout(timeout)
  }, [context?.returningDevice?.existingActiveAccess, autoConnectAttempted, portalSession])

  async function bootstrap() {
    setIsBooting(true)
    const detected = readHotspotParams()
    setHotspotParams(detected)
    const storedToken = typeof window === 'undefined' ? null : window.localStorage.getItem(portalStorageKey)

    if (storedToken) {
      const session = await loadPortalSession(storedToken)
      if (session) {
        await loadContext(session.customer.phoneNumber, storedToken, detected)
        setIsBooting(false)
        return
      }
    }

    await loadContext(undefined, undefined, detected)
    setIsBooting(false)
  }

  function readHotspotParams() {
    if (typeof window === 'undefined') {
      return {
        macAddress: '',
        clientIp: '',
        loginUrl: '',
        routerId: '',
        hotspotServerName: '',
      }
    }

    const params = new URLSearchParams(window.location.search)
    return {
      macAddress: params.get('mac') ?? params.get('client_mac') ?? params.get('mac-address') ?? '',
      clientIp: params.get('ip') ?? params.get('client_ip') ?? '',
      loginUrl: params.get('link-login') ?? params.get('loginUrl') ?? params.get('link_login') ?? '',
      routerId: params.get('routerId') ?? '',
      hotspotServerName: params.get('server') ?? params.get('hotspot') ?? '',
    }
  }

  async function loadContext(phone?: string, accessToken?: string | null, detectedParams = hotspotParams) {
    const params = new URLSearchParams()
    if (phone) {
      params.set('phoneNumber', phone)
    }
    if (detectedParams.macAddress) params.set('mac', detectedParams.macAddress)
    if (detectedParams.clientIp) params.set('ip', detectedParams.clientIp)
    if (detectedParams.routerId) params.set('routerId', detectedParams.routerId)
    if (detectedParams.loginUrl) params.set('loginUrl', detectedParams.loginUrl)

    const response = await fetch(`/api/portal/context${params.toString() ? `?${params}` : ''}`, {
      cache: 'no-store',
      headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : undefined,
    })

    if (!response.ok) {
      return
    }

    const data = await readJson<PortalContextResponse>(response)
    setContext(data)
    if (data.returningDevice?.existingActiveAccess) {
      setStatusMessage('Welcome back. Your package is still active.')
      setAutoConnectAttempted(false)
    }
    setCurrentPayment(data.latestPayment ?? null)
    setSelectedPackage((previous) => {
      if (previous) {
        return data.packages.find((item) => item.id === previous.id) ?? data.packages[0] ?? null
      }

      return data.packages[0] ?? null
    })

    if (data.session) {
      setPortalSession(data.session)
      setPhoneNumber(data.session.customer.phoneNumber)
      setCustomerReference(data.session.customer.customerReference ?? '')
    }
  }

  async function loadPortalSession(accessToken: string) {
    const response = await fetch('/api/portal/session', {
      cache: 'no-store',
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    })

    if (!response.ok) {
      if (typeof window !== 'undefined') {
        window.localStorage.removeItem(portalStorageKey)
      }
      setPortalToken(null)
      setPortalSession(null)
      return null
    }

    const session = await readJson<PortalCustomerSession>(response)
    setPortalToken(accessToken)
    setPortalSession(session)
    setPhoneNumber(session.customer.phoneNumber)
    setCustomerReference(session.customer.customerReference ?? '')
    return session
  }

  async function loginWithPhone(phone: string, navigateToSession = false) {
    const response = await fetch('/api/portal/login', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ phoneNumber: phone }),
    })

    const body = await response.json().catch(() => ({}))
    if (!response.ok) {
      throw new Error((body as { message?: string }).message ?? 'Unable to sign into the portal.')
    }

    const loginResponse = body as PortalLoginResponse
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(portalStorageKey, loginResponse.accessToken)
    }
    setPortalToken(loginResponse.accessToken)
    setPortalSession(loginResponse.session)
    setPhoneNumber(loginResponse.session.customer.phoneNumber)
    setCustomerReference(loginResponse.session.customer.customerReference ?? '')
    await loadContext(loginResponse.session.customer.phoneNumber, loginResponse.accessToken)
    setStatusMessage('Portal login successful. Your access details are now available.')

    if (navigateToSession) {
      router.push('/session')
    }
  }

  async function handleCheckPaymentStatus(paymentId: string, statusToken?: string | null) {
    const token = statusToken ?? currentPayment?.statusToken
    const response = await fetch(`/api/payments/${paymentId}/check-status${token ? `?token=${encodeURIComponent(token)}` : ''}`, {
      method: 'POST',
    })

    if (!response.ok) {
      return
    }

    const payment = await readJson<PortalPayment>(response)
    setCurrentPayment(payment)

    if (payment.activation) {
      await loginWithPhone(payment.phoneNumber, initialView !== 'home')
    } else if (payment.status === 'FAILED') {
      setErrorMessage(payment.statusMessage ?? 'The payment did not complete successfully.')
    }

    await loadContext(payment.phoneNumber, portalToken)
  }

  async function handlePaymentSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setErrorMessage('')
    setStatusMessage('')

    if (!selectedPackage) {
      setErrorMessage('Choose a package before sending the payment prompt.')
      return
    }

    if (!phoneNumber.trim()) {
      setErrorMessage('Enter the customer phone number for payment verification and session matching.')
      return
    }

    setIsPaymentLoading(true)

    try {
      const normalizedPhone = normalizePhone(phoneNumber)
      const response = await fetch('/api/payments/portal/initiate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          packageId: selectedPackage.id,
          phoneNumber: normalizedPhone,
          customerReference: customerReference || normalizedPhone,
          provider: 'PESAPAL',
          method: 'MOBILE_MONEY',
          network: detectNetwork(normalizedPhone),
          idempotencyKey: crypto.randomUUID(),
          macAddress: hotspotParams.macAddress || undefined,
          clientIp: hotspotParams.clientIp || undefined,
          loginUrl: hotspotParams.loginUrl || undefined,
          routerId: hotspotParams.routerId || undefined,
          hotspotServerName: hotspotParams.hotspotServerName || undefined,
        }),
      })

      const body = await response.json().catch(() => ({}))
      if (!response.ok) {
        setErrorMessage((body as { message?: string }).message ?? 'Unable to start the payment request.')
        return
      }

      const payment = body as PortalPayment
      setCurrentPayment(payment)

      setStatusMessage('Payment request sent. Approve it on your phone to activate the package.')
      if (payment.activation) {
        await loginWithPhone(payment.phoneNumber, true)
      } else {
        await loadContext(payment.phoneNumber, portalToken)
      }
    } finally {
      setIsPaymentLoading(false)
    }
  }

  async function handleVoucherRedeem() {
    setErrorMessage('')
    setStatusMessage('')

    if (!voucherCode.trim()) {
      setErrorMessage('Enter your voucher code before redeeming.')
      return
    }

    setIsVoucherLoading(true)

    try {
      const response = await fetch('/api/portal/redeem-voucher', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          code: voucherCode.trim(),
          phoneNumber: phoneNumber || undefined,
          customerReference: customerReference || phoneNumber || undefined,
          macAddress: hotspotParams.macAddress || undefined,
          clientIp: hotspotParams.clientIp || undefined,
          loginUrl: hotspotParams.loginUrl || undefined,
          routerId: hotspotParams.routerId || undefined,
          hotspotServerName: hotspotParams.hotspotServerName || undefined,
        }),
      })

      const body = await response.json().catch(() => ({}))
      if (!response.ok) {
        setErrorMessage((body as { message?: string }).message ?? 'Voucher redemption failed.')
        return
      }

      const redemption = body as PortalRedeemVoucherResponse
      setVoucherCode('')
      setStatusMessage(`Voucher ${redemption.voucher.code} redeemed successfully.`)

      if (redemption.accessToken && redemption.session) {
        if (typeof window !== 'undefined') {
          window.localStorage.setItem(portalStorageKey, redemption.accessToken)
        }
        setPortalToken(redemption.accessToken)
        setPortalSession(redemption.session)
        setPhoneNumber(redemption.session.customer.phoneNumber)
        setCustomerReference(redemption.session.customer.customerReference ?? '')
        await loadContext(redemption.session.customer.phoneNumber, redemption.accessToken)
        router.push('/session')
      } else if (phoneNumber) {
        await loadContext(phoneNumber, portalToken)
      } else {
        await loadContext()
      }
    } finally {
      setIsVoucherLoading(false)
    }
  }

  async function handleLoginSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setErrorMessage('')
    setStatusMessage('')

    if (!phoneNumber.trim()) {
      setErrorMessage('Enter the same phone number used to buy or redeem access.')
      return
    }

    setIsLoginLoading(true)

    try {
      await loginWithPhone(phoneNumber, initialView !== 'home')
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Portal login failed.')
    } finally {
      setIsLoginLoading(false)
    }
  }

  async function handleLogout() {
    if (typeof window !== 'undefined') {
      window.localStorage.removeItem(portalStorageKey)
    }
    setPortalToken(null)
    setPortalSession(null)
    setCurrentPayment(null)
    setStatusMessage('Portal session signed out.')
    await loadContext()

    if (initialView === 'session') {
      router.push('/login')
    }
  }

  function autoSubmitHotspotLogin(reconnect = context?.returningDevice?.reconnect) {
    if (!reconnect?.loginUrl || !reconnect.username || !reconnect.password) {
      setErrorMessage('Reconnect is available, but this browser did not receive a MikroTik login URL. Reopen the captive portal from the WiFi network.')
      setConnectionStatus('failed')
      return
    }

    const form = document.createElement('form')
    form.method = 'POST'
    form.action = reconnect.loginUrl
    for (const [name, value] of Object.entries({ username: reconnect.username, password: reconnect.password })) {
      const input = document.createElement('input')
      input.type = 'hidden'
      input.name = name
      input.value = value ?? ''
      form.appendChild(input)
    }
    document.body.appendChild(form)
    form.submit()
  }

  function connectNow() {
    setConnectionStatus('reconnecting')
    setErrorMessage('')
    autoSubmitHotspotLogin()
  }

  const activeActivation = portalSession?.activeActivation ?? context?.activeActivation ?? null
  const packages = context?.packages ?? []

  return (
    <div className="flex flex-1 flex-col gap-6">
      <section className="rounded-[28px] border border-emerald-200 bg-white p-5 shadow-[0_18px_60px_rgba(15,23,42,0.10)] backdrop-blur sm:p-6">
        <div className="flex flex-col gap-5">
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="flex h-14 w-14 items-center justify-center rounded-2xl border border-emerald-500/20 bg-emerald-500/10">
                <img src={context?.tenant.logoUrl || '/logo.png'} alt="AROFi" className="h-10 w-auto" />
              </div>
              <div>
                <p className="text-xs uppercase tracking-[0.22em] text-emerald-700">AROFi Customer Portal</p>
                <h1 className="mt-2 text-2xl font-semibold text-slate-950 sm:text-3xl">
                  {context?.tenant.name ?? 'AROFi Hotspot Access'}
                </h1>
                <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">
                  Buy packages, redeem vouchers, sign in with your phone number, and monitor your hotspot session from one mobile-friendly experience.
                </p>
                {(context?.tenant.supportPhone || context?.tenant.supportEmail) && (
                  <p className="mt-2 text-xs text-slate-500">
                    Support: {context?.tenant.supportPhone ?? context?.tenant.supportEmail}
                  </p>
                )}
              </div>
            </div>

            <div className={`hidden rounded-full border px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] sm:block ${statusTone(activeActivation ? 'ACTIVE' : currentPayment?.status)}`}>
              {activeActivation ? 'Connected' : currentPayment?.status ?? 'Portal Ready'}
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            <Link href="/" className={`rounded-full border px-4 py-2 text-xs font-semibold uppercase tracking-[0.18em] ${initialView === 'home' ? 'border-emerald-500 bg-emerald-50 text-emerald-700' : 'border-slate-200 bg-white text-slate-600'}`}>
              Buy Access
            </Link>
            <Link href="/login" className={`rounded-full border px-4 py-2 text-xs font-semibold uppercase tracking-[0.18em] ${initialView === 'login' ? 'border-emerald-500 bg-emerald-50 text-emerald-700' : 'border-slate-200 bg-white text-slate-600'}`}>
              Login
            </Link>
            <Link href="/session" className={`rounded-full border px-4 py-2 text-xs font-semibold uppercase tracking-[0.18em] ${initialView === 'session' ? 'border-emerald-500 bg-emerald-50 text-emerald-700' : 'border-slate-200 bg-white text-slate-600'}`}>
              Session
            </Link>
            {portalSession && (
              <button
                type="button"
                onClick={() => void handleLogout()}
                className="rounded-full border border-slate-200 bg-white px-4 py-2 text-xs font-semibold uppercase tracking-[0.18em] text-slate-600"
              >
                Sign Out
              </button>
            )}
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            <SummaryCard label="Live access" value={activeActivation ? 'Active' : 'Ready to buy'} helper={activeActivation ? formatDate(activeActivation.endsAt) : `${packages.length} package${packages.length === 1 ? '' : 's'} available`} />
            <SummaryCard label="Selected plan" value={selectedPackage?.name ?? activeActivation?.package.name ?? 'Choose a plan'} helper={selectedPackage ? formatCurrency(selectedPackage.amountUgx) : 'Mobile money prompt sent to your phone'} />
            <SummaryCard label="Usage tracked" value={portalSession ? formatMegabytes(portalSession.summary.totalDataUsedMb) : '0 MB'} helper={portalSession ? `${portalSession.summary.recentSessionCount} recent sessions` : 'Login unlocks session insights'} />
          </div>
        </div>
      </section>

      {isBooting ? (
        <div className="flex min-h-[220px] items-center justify-center rounded-[28px] border border-slate-200 bg-white text-sm text-slate-600">
          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          Loading portal...
        </div>
      ) : (
        <>
          {errorMessage && <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{errorMessage}</div>}
          {statusMessage && <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">{statusMessage}</div>}
          {connectionStatus === 'connecting' && <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">Payment confirmed. Connecting you now...</div>}
          {connectionStatus === 'reconnecting' && <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">Reconnecting your device to the internet...</div>}
          {context?.returningDevice?.existingActiveAccess && (
            <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800">
              <div className="font-semibold">Welcome back. Your package is still active.</div>
              <div className="mt-1 text-emerald-700">
                {context.returningDevice.activation?.package.name ?? 'Active package'} expires {formatDate(context.returningDevice.activation?.endsAt)}.
              </div>
              <button type="button" onClick={connectNow} className="mt-3 inline-flex items-center gap-2 rounded-2xl bg-emerald-600 px-4 py-2 text-sm font-semibold text-white">
                <Wifi className="h-4 w-4" />
                {connectionStatus === 'failed' ? 'Connect Now' : 'Reconnect to internet'}
              </button>
            </div>
          )}

          {initialView === 'home' && (
            <div className="grid gap-6 xl:grid-cols-[1.05fr_0.95fr]">
              <section className="rounded-[28px] border border-slate-200 bg-white p-5 sm:p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs uppercase tracking-[0.18em] text-slate-500">Packages</p>
                    <h2 className="mt-2 text-xl font-semibold text-slate-950">Choose your internet plan</h2>
                  </div>
                  <Smartphone className="h-5 w-5 text-slate-500" />
                </div>

                <div className="mt-5 grid gap-3">
                  {packages.length === 0 && <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-500">No packages are published for this portal yet.</div>}
                  {packages.map((pkg) => (
                    <button
                      key={pkg.id}
                      type="button"
                      onClick={() => setSelectedPackage(pkg)}
                      className={`rounded-2xl border p-4 text-left ${selectedPackage?.id === pkg.id ? 'border-emerald-400 bg-emerald-500/10' : 'border-slate-200 bg-slate-50'}`}
                    >
                      <div className="flex items-start justify-between gap-4">
                        <div>
                          <div className="text-base font-semibold text-slate-950">{pkg.name}</div>
                          <div className="mt-1 text-xs uppercase tracking-[0.15em] text-slate-500">{pkg.code}</div>
                          <div className="mt-2 text-sm text-slate-600">{pkg.description || 'Fast, secure hotspot internet access.'}</div>
                          <div className="mt-3 text-xs text-slate-500">
                            {formatDuration(pkg.durationMinutes)} . {pkg.dataLimitMb ? `${pkg.dataLimitMb} MB` : 'Unlimited data'}
                            {pkg.deviceLimit ? ` . ${pkg.deviceLimit} device(s)` : ''}
                          </div>
                        </div>
                        <div className="text-lg font-bold text-emerald-600">{formatCurrency(pkg.amountUgx)}</div>
                      </div>
                    </button>
                  ))}
                </div>
              </section>

              <div className="space-y-6">
                <section className="rounded-[28px] border border-slate-200 bg-white p-5 sm:p-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-xs uppercase tracking-[0.18em] text-slate-500">Checkout</p>
                      <h2 className="mt-2 text-xl font-semibold text-slate-950">Pay with your phone</h2>
                    </div>
                    <Receipt className="h-5 w-5 text-slate-500" />
                  </div>
                  <form onSubmit={handlePaymentSubmit} className="mt-5 space-y-4">
                    <input value={phoneNumber} onChange={(event) => setPhoneNumber(event.target.value)} placeholder="Phone number, e.g. 0772000000" className="w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 text-slate-950 outline-none focus:border-emerald-500" />
                    <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">
                      {selectedPackage
                        ? `${selectedPackage.name} . ${formatCurrency(selectedPackage.amountUgx)} . ${formatDuration(selectedPackage.durationMinutes)}`
                        : 'Choose a package first.'}
                    </div>
                    <button type="submit" disabled={isPaymentLoading || !selectedPackage} className="inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-emerald-600 px-4 py-3 text-sm font-semibold text-white disabled:bg-slate-300 disabled:text-slate-500">
                      {isPaymentLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowRight className="h-4 w-4" />}
                      {isPaymentLoading ? 'Sending prompt...' : selectedPackage ? `Pay ${formatCurrency(selectedPackage.amountUgx)}` : 'Pay now'}
                    </button>
                    {currentPayment && (
                      <button
                        type="button"
                        onClick={() => handleCheckPaymentStatus(currentPayment.id, currentPayment.statusToken)}
                        className="mt-3 w-full rounded-xl border border-emerald-500/40 bg-emerald-500/10 py-2 text-sm text-emerald-700 transition-colors hover:bg-emerald-500/20"
                      >
                        I approved payment - check status
                      </button>
                    )}
                  </form>
                  {currentPayment && (
                    <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <div className="font-semibold text-slate-950">{currentPayment.package.name}</div>
                          <div className="mt-1 text-slate-500">
                            {formatCurrency(currentPayment.amountUgx)} . {currentPayment.phoneNumber}
                          </div>
                        </div>
                        <span className={`rounded-full border px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] ${statusTone(currentPayment.status)}`}>
                          {currentPayment.status}
                        </span>
                      </div>
                    </div>
                  )}
                </section>

                <section className="rounded-[28px] border border-slate-200 bg-white p-5 sm:p-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-xs uppercase tracking-[0.18em] text-slate-500">Voucher</p>
                      <h2 className="mt-2 text-xl font-semibold text-slate-950">Redeem existing code</h2>
                    </div>
                    <Ticket className="h-5 w-5 text-slate-500" />
                  </div>
                  <div className="mt-5 space-y-3">
                    <input value={voucherCode} onChange={(event) => setVoucherCode(event.target.value)} placeholder="Voucher code" className="w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 text-slate-950 outline-none focus:border-emerald-500" />
                    <button type="button" onClick={() => void handleVoucherRedeem()} disabled={isVoucherLoading} className="inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-slate-100 px-4 py-3 text-sm font-semibold text-slate-950 disabled:bg-slate-300 disabled:text-slate-500">
                      {isVoucherLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Ticket className="h-4 w-4" />}
                      {isVoucherLoading ? 'Redeeming...' : 'Redeem voucher'}
                    </button>
                  </div>
                </section>
              </div>
            </div>
          )}

          {initialView === 'login' && (
            <section className="grid gap-6 lg:grid-cols-[0.95fr_1.05fr]">
              <div className="rounded-[28px] border border-slate-200 bg-white p-5 sm:p-6">
                <p className="text-xs uppercase tracking-[0.18em] text-slate-500">Portal login</p>
                <h2 className="mt-2 text-2xl font-semibold text-slate-950">Sign in with your access number</h2>
                <p className="mt-3 text-sm leading-6 text-slate-600">
                  Use the same phone number that paid for the package or redeemed the voucher. We'll load your current access and recent usage automatically.
                </p>
                <form onSubmit={handleLoginSubmit} className="mt-6 space-y-4">
                  <input value={phoneNumber} onChange={(event) => setPhoneNumber(event.target.value)} placeholder="Phone number" className="w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 text-slate-950 outline-none focus:border-emerald-500" />
                  <button type="submit" disabled={isLoginLoading} className="inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-emerald-600 px-4 py-3 text-sm font-semibold text-white disabled:bg-slate-300 disabled:text-slate-500">
                    {isLoginLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <LogIn className="h-4 w-4" />}
                    {isLoginLoading ? 'Signing in...' : 'Sign in'}
                  </button>
                </form>
              </div>

              <div className="rounded-[28px] border border-slate-200 bg-white p-5 sm:p-6">
                <p className="text-xs uppercase tracking-[0.18em] text-slate-500">Current customer state</p>
                <h2 className="mt-2 text-2xl font-semibold text-slate-950">
                  {portalSession?.summary.hasActiveAccess ? 'Access is active' : 'No active portal session'}
                </h2>
                <div className="mt-5 rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">
                  {portalSession ? (
                    <>
                      <div>Phone: {portalSession.customer.phoneNumber}</div>
                      <div className="mt-2">Package: {portalSession.activeActivation?.package.name ?? 'Awaiting activation'}</div>
                      <div className="mt-2">Remaining time: {portalSession.summary.activeMinutesRemaining} min</div>
                      <Link href="/session" className="mt-4 inline-flex items-center gap-2 font-semibold text-emerald-700">
                        Open session dashboard
                        <ArrowRight className="h-4 w-4" />
                      </Link>
                    </>
                  ) : (
                    <div>Buy a package or redeem a voucher first, then sign in here to view your session.</div>
                  )}
                </div>
              </div>
            </section>
          )}

          {initialView === 'session' && (
            <section className="grid gap-6 xl:grid-cols-[0.95fr_1.05fr]">
              <div className="rounded-[28px] border border-slate-200 bg-white p-5 sm:p-6">
                <p className="text-xs uppercase tracking-[0.18em] text-slate-500">Session overview</p>
                <h2 className="mt-2 text-2xl font-semibold text-slate-950">
                  {portalSession ? 'Your active internet session' : 'Sign in to view your session'}
                </h2>
                {portalSession ? (
                  <div className="mt-5 space-y-3 text-sm text-slate-600">
                    <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                      <div>Phone: {portalSession.customer.phoneNumber}</div>
                      <div className="mt-2">Package: {portalSession.activeActivation?.package.name ?? 'Awaiting activation'}</div>
                      <div className="mt-2">Expires: {portalSession.activeActivation ? formatDate(portalSession.activeActivation.endsAt) : 'N/A'}</div>
                      <div className="mt-2">Recent usage: {formatMegabytes(portalSession.summary.totalDataUsedMb)}</div>
                    </div>

                    {portalSession.recentSessions.map((session) => (
                      <div key={session.id} className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                        <div className="flex items-center justify-between gap-3">
                          <div>
                            <div className="font-semibold text-slate-950">{session.packageName}</div>
                            <div className="mt-1 text-xs text-slate-500">{formatDate(session.startedAt)}</div>
                          </div>
                          <span className={`rounded-full border px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] ${statusTone(session.status)}`}>{session.status}</span>
                        </div>
                        <div className="mt-3 text-sm text-slate-500">
                          {formatMegabytes(session.dataUsedMb)} used . {session.hotspot?.name ?? 'Hotspot pending'}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <form onSubmit={handleLoginSubmit} className="mt-6 space-y-4">
                    <input value={phoneNumber} onChange={(event) => setPhoneNumber(event.target.value)} placeholder="Phone number" className="w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 text-slate-950 outline-none focus:border-emerald-500" />
                    <button type="submit" disabled={isLoginLoading} className="inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-emerald-600 px-4 py-3 text-sm font-semibold text-white disabled:bg-slate-300 disabled:text-slate-500">
                      {isLoginLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Wifi className="h-4 w-4" />}
                      {isLoginLoading ? 'Signing in...' : 'Load session'}
                    </button>
                  </form>
                )}
              </div>

              <div className="space-y-6">
                <div className="rounded-[28px] border border-slate-200 bg-white p-5 sm:p-6">
                  <p className="text-xs uppercase tracking-[0.18em] text-slate-500">Recent payments</p>
                  <div className="mt-5 space-y-3">
                    {(portalSession?.recentPayments ?? []).length === 0 && <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-500">No recent mobile money payments were found for this phone number yet.</div>}
                    {(portalSession?.recentPayments ?? []).map((payment) => (
                      <div key={payment.id} className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <div className="font-semibold text-slate-950">{payment.package.name}</div>
                            <div className="mt-1 text-sm text-slate-500">{formatCurrency(payment.amountUgx)} . {formatDate(payment.createdAt)}</div>
                          </div>
                          <span className={`rounded-full border px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] ${statusTone(payment.status)}`}>{payment.status}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="rounded-[28px] border border-slate-200 bg-white p-5 sm:p-6">
                  <p className="text-xs uppercase tracking-[0.18em] text-slate-500">Recent voucher redemptions</p>
                  <div className="mt-5 space-y-3">
                    {(portalSession?.recentVoucherRedemptions ?? []).length === 0 && <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-500">Voucher redemption history will appear here after codes are used on this phone number.</div>}
                    {(portalSession?.recentVoucherRedemptions ?? []).map((redemption) => (
                      <div key={redemption.id} className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                        <div className="font-semibold text-slate-950">{redemption.package.name}</div>
                        <div className="mt-1 text-sm text-slate-500">Voucher {redemption.voucher.code} . {formatDate(redemption.createdAt)}</div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </section>
          )}
        </>
      )}
    </div>
  )
}

function SummaryCard({ label, value, helper }: { label: string; value: string; helper: string }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
      <div className="text-xs uppercase tracking-[0.16em] text-slate-500">{label}</div>
      <div className="mt-2 text-lg font-semibold text-slate-950">{value}</div>
      <div className="mt-1 text-sm text-slate-500">{helper}</div>
    </div>
  )
}
