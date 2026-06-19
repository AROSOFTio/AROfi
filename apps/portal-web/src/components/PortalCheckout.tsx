'use client'

import { useEffect, useState, useRef, useCallback, type FormEvent } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ArrowRight, Loader2, LogIn, Ticket, Wifi } from 'lucide-react'
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
type PortalTemplateId = 'classic' | 'fresh' | 'midnight' | 'sunrise' | 'minimal'
type ReconnectPayload = {
  method?: string
  loginUrl?: string | null
  username?: string | null
  password?: string | null
}
type HotspotParams = {
  macAddress: string
  clientIp: string
  loginUrl: string
  routerId: string
  routerKey: string
  hotspotServerName: string
}

const pendingStatuses = ['INITIATED', 'PENDING', 'INDETERMINATE']
const portalStorageKey = 'arofi.portal.access_token'
const paymentReturnStorageKey = 'arofi.portal.payment_return'
const portalTemplateStyles: Record<
  PortalTemplateId,
  {
    shell: string
    logoBox: string
    title: string
    panel: string
    input: string
    button: string
    link: string
    packageCard: string
    packagePrice: string
    buyPill: string
    accept: string
    support: string
  }
> = {
  classic: {
    shell: 'rounded-lg border border-slate-200 bg-slate-50 px-5 py-5 shadow-sm sm:px-6',
    logoBox: '',
    title: 'text-emerald-600',
    panel: 'border-slate-300 bg-white',
    input: 'border-slate-300 bg-white focus:border-emerald-500',
    button: 'bg-emerald-500 text-white disabled:bg-slate-300',
    link: 'border-sky-200 bg-sky-50 text-sky-700',
    packageCard: 'border-slate-300 bg-white',
    packagePrice: 'text-emerald-600',
    buyPill: 'border-green-700/50 bg-green-500 text-white',
    accept: 'border-slate-300 bg-white',
    support: 'text-emerald-600',
  },
  fresh: {
    shell: 'rounded-2xl border border-emerald-200 bg-white px-5 py-5 shadow-[0_18px_60px_rgba(16,185,129,0.12)] sm:px-6',
    logoBox: 'rounded-2xl bg-emerald-50 px-3 py-2',
    title: 'text-emerald-700',
    panel: 'border-emerald-200 bg-emerald-50/50',
    input: 'border-emerald-200 bg-white focus:border-emerald-500',
    button: 'bg-emerald-600 text-white disabled:bg-slate-300',
    link: 'border-emerald-200 bg-white text-emerald-700',
    packageCard: 'border-emerald-200 bg-white',
    packagePrice: 'text-emerald-700',
    buyPill: 'border-emerald-700 bg-emerald-600 text-white',
    accept: 'border-emerald-200 bg-white',
    support: 'text-emerald-700',
  },
  midnight: {
    shell: 'rounded-2xl border border-sky-900 bg-slate-950 px-5 py-5 shadow-[0_22px_70px_rgba(2,6,23,0.25)] sm:px-6',
    logoBox: 'rounded-2xl bg-white px-3 py-2',
    title: 'text-sky-300',
    panel: 'border-sky-900 bg-slate-900',
    input: 'border-sky-800 bg-slate-900 text-white placeholder:text-slate-500 focus:border-sky-400',
    button: 'bg-sky-500 text-slate-950 disabled:bg-slate-700',
    link: 'border-sky-800 bg-slate-900 text-sky-200',
    packageCard: 'border-sky-800 bg-slate-900 text-white',
    packagePrice: 'text-sky-300',
    buyPill: 'border-sky-300 bg-sky-400 text-slate-950',
    accept: 'border-sky-800 bg-slate-900 text-white',
    support: 'text-sky-300',
  },
  sunrise: {
    shell: 'rounded-2xl border border-amber-200 bg-orange-50 px-5 py-5 shadow-[0_18px_60px_rgba(245,158,11,0.14)] sm:px-6',
    logoBox: 'rounded-2xl bg-white px-3 py-2',
    title: 'text-amber-700',
    panel: 'border-amber-200 bg-white',
    input: 'border-amber-200 bg-white focus:border-amber-500',
    button: 'bg-amber-500 text-white disabled:bg-slate-300',
    link: 'border-amber-200 bg-white text-amber-700',
    packageCard: 'border-amber-200 bg-white',
    packagePrice: 'text-amber-700',
    buyPill: 'border-amber-700 bg-amber-500 text-white',
    accept: 'border-amber-200 bg-white',
    support: 'text-amber-700',
  },
  minimal: {
    shell: 'rounded-none border border-slate-200 bg-white px-5 py-5 shadow-sm sm:px-6',
    logoBox: '',
    title: 'text-slate-950',
    panel: 'border-slate-200 bg-white',
    input: 'border-slate-300 bg-white focus:border-slate-700',
    button: 'bg-slate-950 text-white disabled:bg-slate-300',
    link: 'border-slate-200 bg-slate-50 text-slate-700',
    packageCard: 'border-slate-200 bg-white',
    packagePrice: 'text-slate-950',
    buyPill: 'border-slate-950 bg-slate-950 text-white',
    accept: 'border-slate-200 bg-white',
    support: 'text-slate-950',
  },
}

function sanitizeUserMessage(msg?: string | null): string {
  if (!msg) return ''
  return msg.replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim().slice(0, 300)
}

const CONTEXT_CACHE_KEY = 'arofi.ctx.v1'

function readCachedContext(): PortalContextResponse | null {
  try {
    const raw = typeof window !== 'undefined' ? sessionStorage.getItem(CONTEXT_CACHE_KEY) : null
    return raw ? (JSON.parse(raw) as PortalContextResponse) : null
  } catch {
    return null
  }
}

function writeCachedContext(ctx: PortalContextResponse) {
  try {
    sessionStorage.setItem(CONTEXT_CACHE_KEY, JSON.stringify(ctx))
  } catch {
    // storage full — not critical
  }
}

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
    const days = minutes / 1440
    return `${days} ${days === 1 ? 'Day' : 'Days'}`
  }

  if (minutes >= 60 && minutes % 60 === 0) {
    const hours = minutes / 60
    return `${hours} ${hours === 1 ? 'Hour' : 'Hours'}`
  }

  return `${minutes} Min`
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

function normalizeVoucherCode(value?: string | null) {
  return (value ?? '')
    .trim()
    .replace(/[\u2010-\u2015]/g, '-')
    .replace(/\s+/g, '')
    .toUpperCase()
}

function resolvePortalTemplate(template?: string | null): PortalTemplateId {
  return template && template in portalTemplateStyles ? (template as PortalTemplateId) : 'classic'
}

function detectNetwork(phone: string): MobileMoneyNetwork | undefined {
  const normalized = normalizePhone(phone)
  if (normalized.length >= 5) {
    const prefix2 = normalized.slice(3, 5)
    if (['77', '78', '76', '79', '31', '39'].includes(prefix2)) {
      return 'MTN'
    }
    if (['70', '75', '74'].includes(prefix2)) {
      return 'AIRTEL'
    }
  }
  return undefined
}

function extractCheckoutUrl(payment: PortalPayment) {
  if (payment.checkoutUrl) {
    return payment.checkoutUrl
  }

  const payload = payment.responsePayload
  const direct = payload?.checkoutUrl
  if (typeof direct === 'string' && direct.trim()) {
    return direct.trim()
  }

  const gateway = payload?.gateway
  if (gateway && typeof gateway === 'object' && !Array.isArray(gateway)) {
    const nested = (gateway as Record<string, unknown>).checkoutUrl
    if (typeof nested === 'string' && nested.trim()) {
      return nested.trim()
    }
  }

  return null
}

function getWhatsAppLink(phone?: string | null): string {
  if (!phone) return '#'
  let clean = phone.replace(/\D/g, '')
  if (clean.startsWith('0')) {
    clean = '256' + clean.slice(1)
  } else if (!clean.startsWith('256') && clean.length === 9) {
    clean = '256' + clean
  }
  return `https://wa.me/${clean}`
}

export default function PortalCheckout({ initialView = 'home' }: { initialView?: PortalView }) {
  const router = useRouter()
  const cachedCtx = readCachedContext()
  const [context, setContext] = useState<PortalContextResponse | null>(cachedCtx)
  const [portalSession, setPortalSession] = useState<PortalCustomerSession | null>(null)
  const [portalToken, setPortalToken] = useState<string | null>(null)
  const [selectedPackage, setSelectedPackage] = useState<PortalPackage | null>(cachedCtx?.packages[0] ?? null)
  const [checkoutOpen, setCheckoutOpen] = useState(false)
  const [currentPayment, setCurrentPayment] = useState<PortalPayment | null>(null)
  const [selectedNetwork, setSelectedNetwork] = useState<MobileMoneyNetwork>('MTN')
  const [phoneNumber, setPhoneNumber] = useState('')
  const [customerReference, setCustomerReference] = useState('')
  const [voucherCode, setVoucherCode] = useState('')
  const [isContextLoading, setIsContextLoading] = useState(!cachedCtx)
  const [isPaymentLoading, setIsPaymentLoading] = useState(false)
  const [isVoucherLoading, setIsVoucherLoading] = useState(false)
  const [isLoginLoading, setIsLoginLoading] = useState(false)
  const [errorMessage, setErrorMessage] = useState('')
  const [statusMessage, setStatusMessage] = useState('')
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>('idle')
  const autoConnectAttemptedRef = useRef(false)
  const [qrVoucherCode, setQrVoucherCode] = useState('')
  const [qrVoucherRedeemAttempted, setQrVoucherRedeemAttempted] = useState(false)
  const [hotspotParams, setHotspotParams] = useState<HotspotParams>({
    macAddress: '',
    clientIp: '',
    loginUrl: '',
    routerId: '',
    routerKey: '',
    hotspotServerName: '',
  })
  const [paymentReturnHandled, setPaymentReturnHandled] = useState(false)

  useEffect(() => {
    const searchParams = typeof window !== 'undefined' ? new URLSearchParams(window.location.search) : null
    const voucherFromQr = searchParams?.get('voucher') ?? searchParams?.get('code')
    if (voucherFromQr) {
      const code = normalizeVoucherCode(voucherFromQr)
      setVoucherCode(code)
      setQrVoucherCode(code)
      setQrVoucherRedeemAttempted(false)
    }
    void bootstrap()
  }, [])

  // Auto-connect when context loads with a returning device that has active
  // access and reconnect credentials — fires once, no user action required.
  useEffect(() => {
    if (!context?.returningDevice?.existingActiveAccess) return
    if (autoConnectAttemptedRef.current) return
    const reconnect = context.returningDevice.reconnect
    if (!reconnect?.username || !reconnect?.password) return

    autoConnectAttemptedRef.current = true
    setConnectionStatus('reconnecting')
    autoSubmitHotspotLogin(reconnect)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [context?.returningDevice])

  const handleVoucherRedeem = useCallback(async (overrideCode?: string) => {
    setErrorMessage('')
    setStatusMessage('')

    const codeToRedeem = normalizeVoucherCode(overrideCode ?? voucherCode)
    if (!codeToRedeem) {
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
          code: codeToRedeem,
          phoneNumber: phoneNumber || undefined,
          customerReference: customerReference || phoneNumber || undefined,
          macAddress: hotspotParams.macAddress || undefined,
          clientIp: hotspotParams.clientIp || undefined,
          loginUrl: hotspotParams.loginUrl || undefined,
          routerId: hotspotParams.routerId || undefined,
          routerKey: hotspotParams.routerKey || undefined,
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

      if (redemption.reconnect?.username && redemption.reconnect?.password) {
        const effectiveLoginUrl =
          redemption.reconnect.loginUrl ||
          (typeof window !== 'undefined' ? sessionStorage.getItem('arofi.lastLoginUrl') : null) ||
          hotspotParams.loginUrl ||
          null
        if (effectiveLoginUrl) {
          if (typeof window !== 'undefined') sessionStorage.removeItem('arofi.autoConnectCount')
          setConnectionStatus('reconnecting')
          setStatusMessage(`Voucher ${redemption.voucher.code} redeemed. Connecting this device now...`)
          window.setTimeout(() => autoSubmitHotspotLogin({ ...redemption.reconnect, loginUrl: effectiveLoginUrl }), 100)
          return
        }
      }

      if (redemption.accessToken && redemption.session) {
        if (typeof window !== 'undefined') {
          window.localStorage.setItem(portalStorageKey, redemption.accessToken)
        }
        setPortalToken(redemption.accessToken)
        setPortalSession(redemption.session)
        setPhoneNumber(redemption.session.customer.phoneNumber)
        setCustomerReference(redemption.session.customer.customerReference ?? '')
        await loadContext(redemption.session.customer.phoneNumber, redemption.accessToken, hotspotParams)
        router.push('/session')
      } else if (phoneNumber) {
        await loadContext(phoneNumber, portalToken, hotspotParams)
      } else {
        await loadContext(undefined, undefined, hotspotParams)
      }
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Voucher redemption failed. Please retry.')
    } finally {
      setIsVoucherLoading(false)
    }
  }, [hotspotParams, phoneNumber, customerReference, portalToken, voucherCode])

  useEffect(() => {
    if (!qrVoucherCode || qrVoucherRedeemAttempted || isContextLoading || isVoucherLoading) return
    setQrVoucherRedeemAttempted(true)
    void handleVoucherRedeem(qrVoucherCode)
  }, [qrVoucherCode, qrVoucherRedeemAttempted, isContextLoading, isVoucherLoading, handleVoucherRedeem])

  useEffect(() => {
    if (!currentPayment || !pendingStatuses.includes(currentPayment.status)) {
      return
    }

    // Poll at 800ms for near-instant auto-connect the moment the customer
    // approves the Yo! Uganda Mobile Money PIN on their phone.
    void handleCheckPaymentStatus(currentPayment.id, currentPayment.statusToken)
    const interval = window.setInterval(() => void handleCheckPaymentStatus(currentPayment.id, currentPayment.statusToken), 800)

    // Triple-check when user switches back from their banking app.
    const onVisible = () => {
      if (document.visibilityState !== 'visible') return
      void handleCheckPaymentStatus(currentPayment.id, currentPayment.statusToken)
      window.setTimeout(() => void handleCheckPaymentStatus(currentPayment.id, currentPayment.statusToken), 300)
      window.setTimeout(() => void handleCheckPaymentStatus(currentPayment.id, currentPayment.statusToken), 800)
    }
    document.addEventListener('visibilitychange', onVisible)

    return () => {
      window.clearInterval(interval)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [currentPayment])

  useEffect(() => {
    if (isContextLoading || paymentReturnHandled || typeof window === 'undefined') {
      return
    }

    const params = new URLSearchParams(window.location.search)
    const paymentId = params.get('paymentId')
    if (!paymentId) {
      return
    }

    setPaymentReturnHandled(true)
    void handlePaymentReturn(paymentId, params.get('token'))
  }, [isContextLoading, paymentReturnHandled])



  async function bootstrap() {
    const detected = mergeHotspotParams(readStoredPaymentReturn()?.hotspotParams, readHotspotParams())
    setHotspotParams(detected)
    const storedToken = typeof window === 'undefined' ? null : window.localStorage.getItem(portalStorageKey)

    if (storedToken) {
      const session = await loadPortalSession(storedToken)
      if (session) {
        await loadContext(session.customer.phoneNumber, storedToken, detected)
        setIsContextLoading(false)
        return
      }
    }

    await loadContext(undefined, undefined, detected)
    setIsContextLoading(false)
  }

  function readHotspotParams() {
    if (typeof window === 'undefined') {
      return {
        macAddress: '',
        clientIp: '',
        loginUrl: '',
        routerId: '',
        routerKey: '',
        hotspotServerName: '',
      }
    }
    const params = new URLSearchParams(window.location.search)
    const loginUrl =
      params.get('link-login') ??
      params.get('loginUrl') ??
      params.get('link_login') ??
      params.get('link-login-only') ?? // some MikroTik versions use this directly
      ''

    // Persist loginUrl as soon as we see it — it won't be in the URL after redirect
    if (loginUrl && typeof window !== 'undefined') {
      sessionStorage.setItem('arofi.lastLoginUrl', loginUrl)
    }

    return {
      macAddress: params.get('mac') ?? params.get('client_mac') ?? params.get('mac-address') ?? '',
      clientIp: params.get('ip') ?? params.get('client_ip') ?? '',
      loginUrl,
      routerId: params.get('routerId') ?? '',
      routerKey: params.get('routerKey') ?? '',
      hotspotServerName: params.get('server') ?? params.get('hotspot') ?? '',
    }
  }

  function mergeHotspotParams(stored?: Partial<HotspotParams> | null, detected?: HotspotParams) {
    const fallback = detected ?? {
      macAddress: '',
      clientIp: '',
      loginUrl: '',
      routerId: '',
      routerKey: '',
      hotspotServerName: '',
    }

    return {
      macAddress: fallback.macAddress || stored?.macAddress || '',
      clientIp: fallback.clientIp || stored?.clientIp || '',
      loginUrl: fallback.loginUrl || stored?.loginUrl || '',
      routerId: fallback.routerId || stored?.routerId || '',
      routerKey: fallback.routerKey || stored?.routerKey || '',
      hotspotServerName: fallback.hotspotServerName || stored?.hotspotServerName || '',
    }
  }

  function readStoredPaymentReturn() {
    if (typeof window === 'undefined') {
      return null
    }

    const value = window.localStorage.getItem(paymentReturnStorageKey)
    if (!value) {
      return null
    }

    try {
      return JSON.parse(value) as {
        paymentId?: string
        statusToken?: string | null
        phoneNumber?: string
        hotspotParams?: Partial<HotspotParams>
      }
    } catch {
      return null
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
    if (detectedParams.routerKey) params.set('routerKey', detectedParams.routerKey)
    if (detectedParams.hotspotServerName) params.set('server', detectedParams.hotspotServerName)
    if (detectedParams.loginUrl) params.set('loginUrl', detectedParams.loginUrl)

    const response = await fetch(`/api/portal/context${params.toString() ? `?${params}` : ''}`, {
      cache: 'no-store',
      headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : undefined,
    })

    if (!response.ok) {
      return
    }

    const data = await readJson<PortalContextResponse>(response)
    writeCachedContext(data)
    setContext(data)
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

  async function loginWithPhone(phone: string, navigateToSession = false, detectedParams = hotspotParams) {
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
    await loadContext(loginResponse.session.customer.phoneNumber, loginResponse.accessToken, detectedParams)
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
      setErrorMessage('')
      setStatusMessage('')
      // Payment confirmed — close checkout modal and auto-connect immediately.
      setCheckoutOpen(false)
      await handleCompletedPayment(payment)
      if (typeof window !== 'undefined') {
        window.localStorage.removeItem(paymentReturnStorageKey)
      }
    } else if (payment.status === 'FAILED') {
      setErrorMessage(sanitizeUserMessage(payment.statusMessage) || 'Payment was not completed. Please try again.')
      setStatusMessage('')
    } else if (pendingStatuses.includes(payment.status)) {
      // Keep minimal status — don't flood with poll messages
      setStatusMessage('Waiting for PIN approval on your phone...')
    }

    await loadContext(payment.phoneNumber, portalToken, hotspotParams)
  }

  async function handlePaymentReturn(paymentId: string, statusToken?: string | null) {
    const stored = readStoredPaymentReturn()
    const token = statusToken ?? stored?.statusToken ?? currentPayment?.statusToken
    if (stored?.phoneNumber && !phoneNumber) {
      setPhoneNumber(stored.phoneNumber)
    }
    setStatusMessage('Payment request submitted. Check your phone to approve.')
    await handleCheckPaymentStatus(paymentId, token)
  }

  async function handlePaymentSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setErrorMessage('')
    setStatusMessage('')

    if (!selectedPackage) {
      setErrorMessage('Choose a package before continuing to payment.')
      return
    }

    if (!phoneNumber.trim()) {
      setErrorMessage('Enter the customer phone number for payment verification and session matching.')
      return
    }

    if (!availableNetworks.includes(selectedNetwork)) {
      setErrorMessage(`${selectedNetwork === 'AIRTEL' ? 'Airtel' : 'MTN'} is not available for this portal right now.`)
      return
    }

    setIsPaymentLoading(true)

    try {
      const normalizedPhone = normalizePhone(phoneNumber)
      // Auto-detect network from phone number for Yo! Uganda (handles both MTN & Airtel)
      const detectedNetwork = detectNetwork(normalizedPhone) ?? selectedNetwork
      const response = await fetch('/api/payments/portal/initiate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          packageId: selectedPackage.id,
          phoneNumber: normalizedPhone,
          customerReference: customerReference || normalizedPhone,
          network: detectedNetwork,
          idempotencyKey: crypto.randomUUID(),
          macAddress: hotspotParams.macAddress || undefined,
          clientIp: hotspotParams.clientIp || undefined,
          loginUrl: hotspotParams.loginUrl || undefined,
          routerId: hotspotParams.routerId || undefined,
          routerKey: hotspotParams.routerKey || undefined,
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

      if (payment.status === 'FAILED') {
        setErrorMessage(sanitizeUserMessage(payment.statusMessage) || 'Payment request failed. Please try again.')
        return
      }

      // Yo! Uganda sends a direct USSD push — no checkout redirect needed.
      // Just show the PIN prompt message and start polling.
      if (payment.activation) {
        // Instantly confirmed (rare edge case)
        setCheckoutOpen(false)
        await handleCompletedPayment(payment)
      } else {
        setStatusMessage('Enter your Mobile Money PIN on your phone to approve.')
        await loadContext(payment.phoneNumber, portalToken, hotspotParams)
      }
    } finally {
      setIsPaymentLoading(false)
    }
  }



  async function handleCompletedPayment(payment: PortalPayment) {
    // Build best possible loginUrl from all sources
    const effectiveLoginUrl =
      payment.reconnect?.loginUrl ||
      hotspotParams.loginUrl ||
      (typeof window !== 'undefined' ? sessionStorage.getItem('arofi.lastLoginUrl') : null) ||
      null

    const hasCredentials = payment.reconnect?.username && payment.reconnect?.password

    if (effectiveLoginUrl && hasCredentials) {
      // Auto-connect immediately — no delay, no intermediate message
      if (typeof window !== 'undefined') sessionStorage.removeItem('arofi.autoConnectCount')
      setConnectionStatus('reconnecting')
      setStatusMessage('')
      autoSubmitHotspotLogin(
        { ...payment.reconnect, loginUrl: effectiveLoginUrl },
        effectiveLoginUrl,
      )
      return
    }

    if (hasCredentials && !effectiveLoginUrl) {
      // Has credentials but no login URL — show Connect Now button
      setConnectionStatus('failed')
      setStatusMessage('')
      return
    }

    // No credentials yet — try to get them by logging in with phone number
    if (payment.phoneNumber) {
      try {
        await loginWithPhone(payment.phoneNumber, false, hotspotParams)
      } catch {
        // ignore — session will update on next poll
      }
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
      await loginWithPhone(phoneNumber, initialView !== 'home', hotspotParams)
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
    await loadContext(undefined, undefined, hotspotParams)

    if (initialView === 'session') {
      router.push('/login')
    }
  }

  function autoSubmitHotspotLogin(
    reconnect: ReconnectPayload | null | undefined = context?.returningDevice?.reconnect,
    fallbackLoginUrl?: string,
  ) {
    // Build the best possible loginUrl from all available sources
    const loginUrl =
      reconnect?.loginUrl ||
      fallbackLoginUrl ||
      hotspotParams.loginUrl ||
      (typeof window !== 'undefined' ? sessionStorage.getItem('arofi.lastLoginUrl') : null) ||
      null

    if (!loginUrl || !reconnect?.username || !reconnect?.password) {
      setConnectionStatus('failed')
      if (reconnect?.username && reconnect?.password) {
        // We have credentials but no URL — show them to the user for manual entry
        setErrorMessage(
          `Connected! Enter these on the WiFi login page — ` +
          `Username: ${reconnect.username} | Password: ${reconnect.password}`
        )
      } else {
        setErrorMessage(
          'Auto-connect needs the WiFi login page to be open. ' +
          'Reconnect to the WiFi network and open this portal again.'
        )
      }
      return
    }

    // Save loginUrl for future sessions on this device
    if (typeof window !== 'undefined') {
      sessionStorage.setItem('arofi.lastLoginUrl', loginUrl)
    }

    try {
      // The portal is served over HTTPS but the MikroTik hotspot login is plain
      // HTTP (e.g. http://10.55.0.1/login). A form POST from an HTTPS page to an
      // HTTP target is blocked by browsers as mixed content, which silently
      // breaks auto-connect. A top-level GET navigation is NOT blocked, and the
      // AROFi hotspot profile uses login-by=http-pap, which accepts the
      // username/password as query params. So navigate the whole page to the
      // hotspot login URL — the router authenticates via RADIUS and then sends
      // the device on to the destination.
      const target = new URL(loginUrl, window.location.href)
      target.searchParams.set('username', reconnect.username)
      target.searchParams.set('password', reconnect.password)
      target.searchParams.set('dst', 'http://neverssl.com/')
      target.searchParams.set('popup', 'false')
      window.location.href = target.toString()
    } catch {
      setConnectionStatus('failed')
      setErrorMessage('Could not open the WiFi login page. Tap Connect Now to retry.')
    }
  }

  function connectNow() {
    setConnectionStatus('reconnecting')
    setErrorMessage('')
    autoSubmitHotspotLogin()
  }

  const activeActivation = portalSession?.activeActivation ?? context?.activeActivation ?? null
  const packages = context?.packages ?? []
  const availableNetworks = (context?.paymentNetworks?.length ? context.paymentNetworks : ['MTN']) as MobileMoneyNetwork[]
  const portalStyle = portalTemplateStyles[resolvePortalTemplate(context?.tenant.portalTemplate)]

  return (
    <div className="flex flex-1 flex-col gap-6">
      {initialView !== 'home' && (
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
                {(hotspotParams.clientIp || hotspotParams.macAddress) && (
                  <p className="mt-2 text-xs font-mono text-slate-500">
                    {hotspotParams.clientIp && `IP: ${hotspotParams.clientIp}`}
                    {hotspotParams.clientIp && hotspotParams.macAddress && '  |  '}
                    {hotspotParams.macAddress && `MAC: ${hotspotParams.macAddress.toUpperCase()}`}
                  </p>
                )}
              </div>
            </div>

            <div className={`hidden rounded-full border px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] sm:block ${statusTone(activeActivation ? 'ACTIVE' : currentPayment?.status)}`}>
              {activeActivation ? 'Connected' : currentPayment?.status ?? 'Portal Ready'}
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            <Link href="/" className="rounded-full border border-slate-200 bg-white px-4 py-2 text-xs font-semibold uppercase tracking-[0.18em] text-slate-600">
              Buy Access
            </Link>
            <Link href="/login" className={`rounded-full border px-4 py-2 text-xs font-semibold uppercase tracking-[0.18em] ${initialView === 'login' ? 'border-emerald-500 bg-emerald-50 text-emerald-700' : 'border-slate-200 bg-white text-slate-600'}`}>
              Login
            </Link>
            <Link href="/session" className={`rounded-full border px-4 py-2 text-xs font-semibold uppercase tracking-[0.18em] ${initialView === 'session' ? 'border-emerald-500 bg-emerald-50 text-emerald-700' : 'border-slate-200 bg-white text-slate-600'}`}>
              Session
            </Link>
            <Link href="/support" className="rounded-full border border-slate-200 bg-white px-4 py-2 text-xs font-semibold uppercase tracking-[0.18em] text-slate-600">
              Support
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
            <SummaryCard label="Selected plan" value={selectedPackage?.name ?? activeActivation?.package.name ?? 'Choose a plan'} helper={selectedPackage ? formatCurrency(selectedPackage.amountUgx) : 'Select a network and phone number'} />
            <SummaryCard label="Usage tracked" value={portalSession ? formatMegabytes(portalSession.summary.totalDataUsedMb) : '0 MB'} helper={portalSession ? `${portalSession.summary.recentSessionCount} recent sessions` : 'Login unlocks session insights'} />
          </div>
        </div>
      </section>
      )}

      <>
          {!checkoutOpen && errorMessage && <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{errorMessage}</div>}
          {!checkoutOpen && statusMessage && !pendingStatuses.includes(currentPayment?.status ?? '') && <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">{statusMessage}</div>}
          {connectionStatus === 'reconnecting' && <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700"><span className="inline-flex items-center gap-2"><Loader2 className="h-4 w-4 animate-spin" />Connecting to internet...</span></div>}
          {context?.returningDevice?.existingActiveAccess && connectionStatus !== 'reconnecting' && (
            <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800">
              <div className="font-semibold">Welcome back — your package is still active.</div>
              <div className="mt-1 text-emerald-700">
                {context.returningDevice.activation?.package.name ?? 'Active package'} · expires {formatDate(context.returningDevice.activation?.endsAt)}.
              </div>
              <button type="button" onClick={connectNow} className="mt-3 inline-flex items-center gap-2 rounded-2xl bg-emerald-600 px-4 py-2 text-sm font-semibold text-white">
                <Wifi className="h-4 w-4" />
                Connect Now
              </button>
            </div>
          )}

          {initialView === 'home' && (
            <section className={`mx-auto w-full max-w-[430px] ${portalStyle.shell}`}>
              <span className="sr-only">AROFi simple portal build 2026-05-16-2328</span>
              <div className="text-center flex flex-col items-center justify-center">
              <div className="mb-2 text-emerald-500 animate-pulse flex justify-center items-center">
                <Wifi className="h-12 w-12" />
              </div>
              <div className={`mx-auto mb-2 w-fit ${portalStyle.logoBox}`}>
                <img src={context?.tenant.logoUrl || '/logo.png'} alt="AROFi" className="h-10 w-auto" />
              </div>
              <h1 className={`text-sm font-semibold tracking-wider opacity-60 uppercase mt-1 ${portalStyle.title}`}>
                {context?.tenant.name ?? 'AROFi Hotspot'}
              </h1>
              {(hotspotParams.clientIp || hotspotParams.macAddress) && (
                <div className={`mt-2 text-xs font-medium tracking-wide opacity-80 ${resolvePortalTemplate(context?.tenant.portalTemplate) === 'midnight' ? 'text-slate-300' : 'text-slate-600'}`}>
                  {hotspotParams.clientIp && `IP: ${hotspotParams.clientIp}`}
                  {hotspotParams.clientIp && hotspotParams.macAddress && '  |  '}
                  {hotspotParams.macAddress && `MAC: ${hotspotParams.macAddress.toUpperCase()}`}
                </div>
              )}
            </div>        

              <div className="mt-5 flex gap-2">
                <input value={voucherCode} onChange={(event) => setVoucherCode(event.target.value)} placeholder="Enter your voucher code" className={`min-w-0 flex-1 rounded-lg border px-4 py-3 text-sm outline-none ${portalStyle.input}`} />
                <button type="button" onClick={() => void handleVoucherRedeem()} disabled={isVoucherLoading} className={`rounded-lg px-5 py-3 text-sm font-bold ${portalStyle.button}`}>
                  {isVoucherLoading ? 'Connecting…' : 'Connect'}
                </button>
              </div>

              <Link href="/login" className={`mx-auto mt-4 flex w-fit items-center gap-2 rounded-md border px-4 py-2 text-xs font-medium ${portalStyle.link}`}>
                <LogIn className="h-3 w-3" />
                Already bought? Find My Voucher
              </Link>

              <p className={`mt-5 text-center text-sm ${resolvePortalTemplate(context?.tenant.portalTemplate) === 'midnight' ? 'text-slate-200' : 'text-slate-700'}`}>Select a package and pay with Mobile Money</p>

              <div className="mt-6 grid gap-3">
                {isContextLoading && packages.length === 0 && (
                  <>
                    <div className="h-[54px] animate-pulse rounded-lg border border-slate-100 bg-slate-100" />
                    <div className="h-[54px] animate-pulse rounded-lg border border-slate-100 bg-slate-100" />
                  </>
                )}
                {!isContextLoading && packages.length === 0 && <div className={`rounded-lg border p-4 text-sm text-slate-500 ${portalStyle.panel}`}>No packages are published for this portal yet.</div>}
                {packages.map((pkg) => (
                  <button
                    key={pkg.id}
                    type="button"
                    onClick={() => {
                      setSelectedPackage(pkg)
                      setCheckoutOpen(true)
                      setCurrentPayment(null)
                      setErrorMessage('')
                      setStatusMessage('')
                    }}
                    className={`grid grid-cols-[1fr_auto_auto] items-center gap-3 rounded-lg border px-4 py-3 text-left shadow-sm ${portalStyle.packageCard}`}
                  >
                    <span>
                      <span className={`block text-base font-bold ${resolvePortalTemplate(context?.tenant.portalTemplate) === 'midnight' ? 'text-white' : 'text-slate-700'}`}>{pkg.name}</span>
                      <span className={`block text-xs ${resolvePortalTemplate(context?.tenant.portalTemplate) === 'midnight' ? 'text-slate-400' : 'text-slate-500'}`}>{formatDuration(pkg.durationMinutes)}</span>
                    </span>
                    <span className={`text-sm font-extrabold ${portalStyle.packagePrice}`}>{formatCurrency(pkg.amountUgx)}</span>
                    <span className={`rounded-xl border px-4 py-2 text-sm font-extrabold shadow-sm ${portalStyle.buyPill}`}>BUY</span>
                  </button>
                ))}
              </div>

              <div className={`mt-6 rounded-lg border px-4 py-4 text-center ${portalStyle.accept}`}>
                <div className={`text-sm font-bold ${resolvePortalTemplate(context?.tenant.portalTemplate) === 'midnight' ? 'text-white' : 'text-slate-700'}`}>We accept:</div>
                <div className="mt-3 flex items-center justify-center gap-3">
                  <NetworkIcon network="MTN" />
                  <NetworkIcon network="AIRTEL" />
                </div>
              </div>

              <div className={`mt-6 border-t border-slate-300 pt-5 text-center text-xs ${resolvePortalTemplate(context?.tenant.portalTemplate) === 'midnight' ? 'text-slate-300' : 'text-slate-700'} flex flex-col items-center gap-2`}>
                <div>Need help? Contact support:</div>
                <div className={`mt-1 font-bold ${portalStyle.support}`}>{context?.tenant.supportPhone ?? context?.tenant.supportEmail ?? 'Support contact pending'}</div>
                {context?.tenant.supportPhone && (
                  <a
                    href={getWhatsAppLink(context.tenant.supportPhone)}
                    target="_blank"
                    rel="noreferrer"
                    className="mt-2 inline-flex items-center gap-2 rounded-xl bg-[#25D366] px-4 py-2 text-xs font-bold text-white shadow-sm hover:bg-[#20ba5a] transition"
                  >
                    <svg className="h-4 w-4 fill-current" viewBox="0 0 24 24">
                      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L0 24l6.335-1.662c1.746.953 3.71 1.458 5.706 1.458h.008c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
                    </svg>
                    Chat on WhatsApp
                  </a>
                )}
              </div>

              {checkoutOpen && selectedPackage && (
                <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/55 px-4">
                  <div className="w-full max-w-sm rounded-xl bg-white p-5 shadow-xl">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <h2 className="text-lg font-extrabold text-slate-950">Pay {formatCurrency(selectedPackage.amountUgx)}</h2>
                        <p className="mt-1 text-sm text-slate-600">{selectedPackage.name} · {formatDuration(selectedPackage.durationMinutes)}</p>
                      </div>
                      <button type="button" onClick={() => {
                        setCheckoutOpen(false)
                        setErrorMessage('')
                        setStatusMessage('')
                        setCurrentPayment(null)
                      }} className="rounded-md border border-slate-200 px-2 py-1 text-xs font-bold text-slate-600">✕</button>
                    </div>

                    {errorMessage && <div className="mt-3 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">{errorMessage}</div>}

                    {/* PIN prompt — shown while polling after payment sent */}
                    {statusMessage && pendingStatuses.includes(currentPayment?.status ?? '') && (
                      <div className="mt-3 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-3 text-sm text-emerald-800">
                        <div className="flex items-center gap-2 font-semibold">
                          <Loader2 className="h-4 w-4 animate-spin" />
                          {statusMessage}
                        </div>
                        <div className="mt-1 text-xs text-emerald-600">This page will auto-connect once approved.</div>
                      </div>
                    )}

                    <form onSubmit={handlePaymentSubmit} className="mt-4 space-y-3">
                      {/* Network auto-detected by Yo! Uganda — selector hidden */}
                      <label className="block text-sm font-bold text-slate-700">
                        Mobile Money Number
                        <div className="relative mt-2 flex items-center">
                          <input
                            value={phoneNumber}
                            onChange={(event) => {
                              const val = event.target.value
                              setPhoneNumber(val)
                              const detected = detectNetwork(val)
                              if (detected) setSelectedNetwork(detected)
                            }}
                            placeholder="07XX XXX XXX"
                            inputMode="tel"
                            autoFocus
                            className="w-full rounded-lg border border-slate-300 bg-white pl-4 pr-24 py-3 text-base text-slate-950 outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100"
                          />
                          {detectNetwork(phoneNumber) && (
                            <div className="absolute right-2.5">
                              {detectNetwork(phoneNumber) === 'MTN' ? (
                                <span className="rounded bg-[#ffcc00] px-2 py-1 text-[10px] font-black tracking-wide text-[#0b1f3a] shadow-sm">MTN MoMo</span>
                              ) : (
                                <span className="rounded bg-[#e60012] px-2 py-1 text-[10px] font-black text-white shadow-sm">Airtel Money</span>
                              )}
                            </div>
                          )}
                        </div>
                      </label>

                      <button
                        type="submit"
                        disabled={isPaymentLoading || pendingStatuses.includes(currentPayment?.status ?? '')}
                        className="flex w-full items-center justify-center gap-2 rounded-lg bg-emerald-600 px-4 py-3.5 text-sm font-extrabold text-white transition hover:bg-emerald-700 disabled:bg-slate-300 disabled:text-slate-500"
                      >
                        {isPaymentLoading ? (
                          <><Loader2 className="h-4 w-4 animate-spin" /> Processing...</>
                        ) : pendingStatuses.includes(currentPayment?.status ?? '') ? (
                          <><Loader2 className="h-4 w-4 animate-spin" /> Waiting for PIN...</>
                        ) : (
                          <><ArrowRight className="h-4 w-4" /> Pay with Mobile Money</>
                        )}
                      </button>
                    </form>
                  </div>
                </div>
              )}
            </section>
          )}

          {initialView === 'login' && (
            <section className="mx-auto w-full max-w-md">
              {portalSession?.summary.hasActiveAccess ? (
                // Already signed in with active access — celebrate + route to session.
                <div className="rounded-[28px] border border-blue-200 bg-gradient-to-b from-blue-50 to-white p-6 text-center shadow-sm sm:p-8">
                  <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-blue-600 text-white">
                    <Wifi className="h-7 w-7" />
                  </div>
                  <h2 className="mt-4 text-2xl font-bold text-slate-950">You’re connected</h2>
                  <p className="mt-1 text-sm text-slate-600">{portalSession.activeActivation?.package.name ?? 'Active plan'}</p>
                  <div className="mt-5 rounded-2xl border border-blue-100 bg-white p-4">
                    <div className="text-3xl font-extrabold tracking-tight text-blue-700">{portalSession.summary.activeMinutesRemaining} min</div>
                    <div className="mt-1 text-xs font-medium uppercase tracking-wider text-slate-400">time remaining</div>
                  </div>
                  <Link href="/session" className="mt-5 inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-blue-600 px-4 py-3.5 text-sm font-semibold text-white transition hover:bg-blue-700">
                    Open my session
                    <ArrowRight className="h-4 w-4" />
                  </Link>
                </div>
              ) : (
                // The "already bought" sign-in: one number, one big button.
                <div className="rounded-[28px] border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
                  <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-blue-50 text-blue-600">
                    <LogIn className="h-6 w-6" />
                  </div>
                  <h2 className="mt-4 text-2xl font-bold leading-tight text-slate-950">Already bought access?</h2>
                  <p className="mt-2 text-sm leading-6 text-slate-600">
                    Enter the phone number you paid with or redeemed your voucher on. We’ll reconnect you instantly.
                  </p>
                  <form onSubmit={handleLoginSubmit} className="mt-6 space-y-3">
                    <input
                      value={phoneNumber}
                      onChange={(event) => setPhoneNumber(event.target.value)}
                      placeholder="07XX XXX XXX"
                      inputMode="tel"
                      autoFocus
                      className="w-full rounded-2xl border border-slate-300 bg-white px-4 py-3.5 text-lg text-slate-950 outline-none transition focus:border-blue-500 focus:ring-4 focus:ring-blue-100"
                    />
                    <button type="submit" disabled={isLoginLoading} className="inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-blue-600 px-4 py-3.5 text-base font-semibold text-white transition hover:bg-blue-700 disabled:bg-slate-300 disabled:text-slate-500">
                      {isLoginLoading ? <Loader2 className="h-5 w-5 animate-spin" /> : <LogIn className="h-5 w-5" />}
                      {isLoginLoading ? 'Reconnecting…' : 'Sign in & reconnect'}
                    </button>
                  </form>

                  {portalSession && (
                    <div className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
                      We found {portalSession.customer.phoneNumber}, but it has no active plan right now.
                    </div>
                  )}

                  <div className="mt-6 border-t border-slate-100 pt-5 text-center text-sm text-slate-500">
                    Haven’t bought yet?{' '}
                    <Link href="/" className="font-semibold text-blue-600 hover:text-blue-700">Buy access</Link>
                  </div>
                </div>
              )}
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

function NetworkIcon({ network }: { network: MobileMoneyNetwork }) {
  if (network === 'MTN') {
    return (
      <span className="grid h-10 w-16 place-items-center rounded-full bg-[#ffcc00] text-sm font-black tracking-wide text-[#0b1f3a] shadow-sm ring-1 ring-black/10">
        MTN
      </span>
    )
  }

  return (
    <span className="grid h-10 w-16 place-items-center rounded-full bg-[#e60012] text-xs font-black text-white shadow-sm ring-1 ring-black/10">
      airtel
    </span>
  )
}
