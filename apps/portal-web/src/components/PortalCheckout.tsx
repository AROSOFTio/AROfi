'use client'

import { useEffect, useState, useRef, useCallback, type FormEvent } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ArrowRight, Check, Copy, Loader2, LogIn, Share2, Ticket, Wifi } from 'lucide-react'
import { PhoneNumberField } from './PhoneNumberField'
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
  tenantDomain: string
}

const pendingStatuses = ['INITIATED', 'PENDING', 'INDETERMINATE']
// Mirrors COMPANION_VOUCHER_EXPIRY_HOURS in apps/api/.../package-activation.service.ts
const COMPANION_VOUCHER_EXPIRY_LABEL = 'within 60 hours'
const portalStorageKey = 'arofi.portal.access_token'
const paymentReturnStorageKey = 'arofi.portal.payment_return'
// Companion voucher codes survive the auto-connect page navigation here: the
// device connects FIRST (top-level redirect through the MikroTik login), then
// the router sends the browser back to the portal with ?connected=1 and the
// codes are re-shown from this key. Showing them BEFORE connecting used to
// block the buyer's own device from getting online.
const pendingCompanionCodesKey = 'arofi.portal.pending_companion_codes'

function hasUsableReconnect(payment?: PortalPayment | null) {
  return Boolean(payment?.reconnect?.username && payment.reconnect.password)
}

function stashCompanionCodes(codes: string[]) {
  if (typeof window === 'undefined' || codes.length === 0) return
  try {
    localStorage.setItem(pendingCompanionCodesKey, JSON.stringify(codes))
  } catch {
    // storage full — codes are also delivered by WhatsApp, not critical
  }
}

// The MikroTik link-login URL is written to BOTH storages when the captive
// page first opens (sessionStorage can be wiped when low-memory Android kills
// the tab during the USSD/PIN dialog; localStorage survives). Every reconnect
// path must therefore read both, or a payment-return round trip loses the
// login target and auto-connect silently fails.
function readStoredLoginUrl(): string | null {
  if (typeof window === 'undefined') return null
  try {
    return (
      sessionStorage.getItem('arofi.lastLoginUrl') ||
      localStorage.getItem('arofi.lastLoginUrl') ||
      null
    )
  } catch {
    return null
  }
}

function takeStashedCompanionCodes(): string[] {
  if (typeof window === 'undefined') return []
  try {
    const raw = localStorage.getItem(pendingCompanionCodesKey)
    if (!raw) return []
    localStorage.removeItem(pendingCompanionCodesKey)
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed.filter((code): code is string => typeof code === 'string') : []
  } catch {
    return []
  }
}
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
    activeNav: string
    notice: string
    noticeText: string
    iconText: string
    logoRing: string
    connectedPanel: string
    connectedMetric: string
  }
> = {
  classic: {
    shell: 'rounded-2xl border border-blue-200 bg-blue-50 px-5 py-5 shadow-[0_8px_32px_rgba(37,99,235,0.10)] sm:px-6',
    logoBox: '',
    title: 'text-blue-600',
    panel: 'border-blue-200 bg-white',
    input: 'border-slate-200 bg-slate-50 focus:border-blue-500 focus:ring-[rgba(37,99,235,0.15)]',
    button: 'bg-blue-600 text-white disabled:bg-slate-300',
    link: 'border-blue-200 bg-blue-50 text-blue-700',
    packageCard: 'border-slate-200 bg-white',
    packagePrice: 'text-blue-600',
    buyPill: 'border-blue-700/50 bg-blue-600 text-white',
    accept: 'border-blue-200 bg-white',
    support: 'text-blue-600',
    activeNav: 'border-blue-500 bg-blue-50 text-blue-700',
    notice: 'border-blue-200 bg-blue-50 text-blue-700',
    noticeText: 'text-blue-700',
    iconText: 'text-blue-600',
    logoRing: 'border-blue-500/20 bg-blue-500/10',
    connectedPanel: 'border-slate-200 bg-white',
    connectedMetric: 'border-blue-100 bg-white text-blue-700',
  },
  fresh: {
    shell: 'rounded-2xl border border-emerald-200 bg-emerald-50 px-5 py-5 shadow-[0_8px_32px_rgba(5,150,105,0.10)] sm:px-6',
    logoBox: '',
    title: 'text-emerald-600',
    panel: 'border-emerald-200 bg-white',
    input: 'border-slate-200 bg-slate-50 focus:border-emerald-500',
    button: 'bg-emerald-600 text-white disabled:bg-slate-300',
    link: 'border-emerald-200 bg-emerald-50 text-emerald-700',
    packageCard: 'border-slate-200 bg-white',
    packagePrice: 'text-emerald-600',
    buyPill: 'border-emerald-700/50 bg-emerald-600 text-white',
    accept: 'border-emerald-200 bg-white',
    support: 'text-emerald-600',
    activeNav: 'border-emerald-500 bg-emerald-50 text-emerald-700',
    notice: 'border-emerald-200 bg-emerald-50 text-emerald-700',
    noticeText: 'text-emerald-700',
    iconText: 'text-emerald-600',
    logoRing: 'border-emerald-500/20 bg-emerald-500/10',
    connectedPanel: 'border-slate-200 bg-white',
    connectedMetric: 'border-emerald-100 bg-white text-emerald-700',
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
    activeNav: 'border-sky-500 bg-sky-950 text-sky-200',
    notice: 'border-sky-800 bg-slate-900 text-sky-200',
    noticeText: 'text-sky-200',
    iconText: 'text-sky-300',
    logoRing: 'border-sky-700 bg-slate-900',
    connectedPanel: 'border-slate-800 bg-slate-950 text-white',
    connectedMetric: 'border-sky-800 bg-slate-950 text-sky-300',
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
    activeNav: 'border-amber-500 bg-amber-50 text-amber-700',
    notice: 'border-amber-200 bg-amber-50 text-amber-800',
    noticeText: 'text-amber-700',
    iconText: 'text-amber-600',
    logoRing: 'border-amber-500/20 bg-amber-500/10',
    connectedPanel: 'border-slate-200 bg-white',
    connectedMetric: 'border-amber-100 bg-white text-amber-700',
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
    activeNav: 'border-slate-950 bg-slate-100 text-slate-950',
    notice: 'border-slate-200 bg-slate-50 text-slate-700',
    noticeText: 'text-slate-700',
    iconText: 'text-slate-950',
    logoRing: 'border-slate-200 bg-slate-50',
    connectedPanel: 'border-slate-200 bg-white',
    connectedMetric: 'border-slate-200 bg-white text-slate-950',
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
  const [contextUnresolved, setContextUnresolved] = useState(false)
  const [isPaymentLoading, setIsPaymentLoading] = useState(false)
  const [isVoucherLoading, setIsVoucherLoading] = useState(false)
  const [isLoginLoading, setIsLoginLoading] = useState(false)
  const [errorMessage, setErrorMessage] = useState('')
  const [statusMessage, setStatusMessage] = useState('')
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>('idle')
  const [companionVoucherCodes, setCompanionVoucherCodes] = useState<string[]>([])
  const [copiedVoucherCode, setCopiedVoucherCode] = useState('')
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
    tenantDomain: '',
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
    // Back from a successful MikroTik login (dst pointed here). The device is
    // online — NOW is the time to show any companion voucher codes that were
    // stashed before the connect navigation.
    if (searchParams?.get('connected') === '1') {
      setStatusMessage('You are connected to the internet. Enjoy!')
      const stashed = takeStashedCompanionCodes()
      if (stashed.length > 0) {
        setCompanionVoucherCodes(stashed)
      }
    }
    void bootstrap()
  }, [])

  // Auto-connect when context loads with a returning device that has active
  // access and reconnect credentials — fires once, no user action required.
  useEffect(() => {
    if (!context?.returningDevice?.existingActiveAccess) return
    if (autoConnectAttemptedRef.current) return

    const params = new URLSearchParams(window.location.search)
    // Already online: the router redirected back here with ?connected=1 after a
    // successful login. Do NOT auto-connect again — that would bounce to the
    // router and back forever. Clear the loop timestamp so a genuine future
    // reconnect works.
    if (params.get('connected') === '1') {
      autoConnectAttemptedRef.current = true
      try { sessionStorage.removeItem('arofiAutoConnectAt') } catch {}
      return
    }

    // Loop guard that does NOT block legitimate reconnects. Only skip if we
    // auto-connected just moments ago and landed back here STILL not online —
    // that means the router bounced us straight back (a redirect loop). A real
    // returning device whose bundle is still active (WiFi dropped, customer
    // comes back later) reconnects normally, because that happens far more than
    // a few seconds later. Using a short-lived timestamp instead of a one-shot
    // flag is what lets an active bundle be "remembered" and auto-reconnected.
    let lastAt = 0
    try { lastAt = Number(sessionStorage.getItem('arofiAutoConnectAt') || '0') } catch {}
    if (lastAt && Date.now() - lastAt < 20000) {
      autoConnectAttemptedRef.current = true
      setConnectionStatus('failed')
      setErrorMessage('Auto-login was not accepted by the router. Turn WiFi off and on, or tap Connect Now.')
      return
    }

    const reconnect = context.returningDevice.reconnect
    if (!reconnect?.username || !reconnect?.password) return

    autoConnectAttemptedRef.current = true
    try { sessionStorage.setItem('arofiAutoConnectAt', String(Date.now())) } catch {}
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

      const companionCodes = redemption.companionVoucherCodes ?? []

      if (redemption.reconnect?.username && redemption.reconnect?.password) {
        const effectiveLoginUrl =
          redemption.reconnect.loginUrl ||
          hotspotParams.loginUrl ||
          readStoredLoginUrl()
        if (effectiveLoginUrl) {
          if (typeof window !== 'undefined') sessionStorage.removeItem('arofi.autoConnectCount')
          // Connect FIRST. Companion codes are stashed and re-shown when the
          // router redirects back here (?connected=1) — the popup must never
          // stand between the buyer's device and its internet access.
          stashCompanionCodes(companionCodes)
          setConnectionStatus('reconnecting')
          setStatusMessage(`Voucher ${redemption.voucher.code} redeemed. Connecting this device now...`)
          window.setTimeout(
            () => autoSubmitHotspotLogin({ ...redemption.reconnect, loginUrl: effectiveLoginUrl }),
            100,
          )
          return
        }
      }

      // No auto-connect possible on this path — show the codes right away.
      if (companionCodes.length > 0) {
        setCompanionVoucherCodes(companionCodes)
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
    const waitingForReconnect =
      currentPayment?.status === 'COMPLETED' &&
      Boolean(currentPayment.activation) &&
      !hasUsableReconnect(currentPayment)
    if (!currentPayment || (!pendingStatuses.includes(currentPayment.status) && !waitingForReconnect)) {
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
        tenantDomain: '',
      }
    }
    const params = new URLSearchParams(window.location.search)
    const loginUrl =
      params.get('link-login') ??
      params.get('loginUrl') ??
      params.get('link_login') ??
      params.get('link-login-only') ?? // some MikroTik versions use this directly
      ''

    // Persist loginUrl immediately — it won't be in the URL after redirect, and
    // sessionStorage is cleared on low-memory Android when the browser kills the tab
    // during USSD dialogs. localStorage survives tab restarts so auto-connect works
    // even after the OS suspends the browser during PIN entry.
    if (loginUrl && typeof window !== 'undefined') {
      sessionStorage.setItem('arofi.lastLoginUrl', loginUrl)
      localStorage.setItem('arofi.lastLoginUrl', loginUrl)
    }

    // An explicit ?tenant=/?portal= lets the hosted portal resolve an operator
    // WITHOUT a router redirect — e.g. a direct link or a printed QR code that
    // opens arofi.net/portal. Persisted so it survives the payment-return
    // round trip like the other hotspot params.
    const tenantDomain =
      params.get('tenant') ?? params.get('tenantDomain') ?? params.get('portal') ?? ''
    if (tenantDomain && typeof window !== 'undefined') {
      localStorage.setItem('arofi.tenantDomain', tenantDomain)
    }

    return {
      macAddress: params.get('mac') ?? params.get('client_mac') ?? params.get('mac-address') ?? '',
      clientIp: params.get('ip') ?? params.get('client_ip') ?? '',
      loginUrl,
      routerId: params.get('routerId') ?? '',
      routerKey: params.get('routerKey') ?? '',
      hotspotServerName: params.get('server') ?? params.get('hotspot') ?? '',
      tenantDomain,
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
      tenantDomain: '',
    }

    return {
      macAddress: fallback.macAddress || stored?.macAddress || '',
      clientIp: fallback.clientIp || stored?.clientIp || '',
      loginUrl: fallback.loginUrl || stored?.loginUrl || '',
      routerId: fallback.routerId || stored?.routerId || '',
      routerKey: fallback.routerKey || stored?.routerKey || '',
      hotspotServerName: fallback.hotspotServerName || stored?.hotspotServerName || '',
      tenantDomain: fallback.tenantDomain || stored?.tenantDomain || '',
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
    if (detectedParams.tenantDomain) params.set('tenantDomain', detectedParams.tenantDomain)

    const response = await fetch(`/api/portal/context${params.toString() ? `?${params}` : ''}`, {
      cache: 'no-store',
      headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : undefined,
    })

    if (!response.ok) {
      // A 404 here means no operator could be identified for this portal (no
      // router redirect and no ?tenant= link). Flag it so the UI shows an
      // accurate "open from your WiFi login page" message instead of the
      // misleading "no packages published yet".
      if (response.status === 404) {
        setContextUnresolved(true)
      }
      return
    }

    setContextUnresolved(false)
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

    if (payment.activation && hasUsableReconnect(payment)) {
      setErrorMessage('')
      setStatusMessage('')
      // Payment confirmed — close checkout modal and auto-connect immediately.
      setCheckoutOpen(false)
      await handleCompletedPayment(payment)
      if (typeof window !== 'undefined') {
        window.localStorage.removeItem(paymentReturnStorageKey)
      }
    } else if (payment.activation && !hasUsableReconnect(payment)) {
      setStatusMessage('Payment confirmed. Preparing router login now...')
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
      if (payment.activation && hasUsableReconnect(payment)) {
        // Instantly confirmed (rare edge case)
        setCheckoutOpen(false)
        await handleCompletedPayment(payment)
      } else if (payment.activation) {
        setStatusMessage('Payment confirmed. Preparing router login now...')
        await loadContext(payment.phoneNumber, portalToken, hotspotParams)
      } else {
        setStatusMessage('Enter your Mobile Money PIN on your phone to approve.')
        await loadContext(payment.phoneNumber, portalToken, hotspotParams)
      }
    } catch (error) {
      // Without this, a network/timeout error left the user staring at a
      // silent, un-spinning button with no explanation ("no response at all").
      setErrorMessage(
        error instanceof Error && error.message
          ? error.message
          : 'Could not reach the payment service. Check your connection and try again.',
      )
    } finally {
      setIsPaymentLoading(false)
    }
  }



  async function handleCompletedPayment(payment: PortalPayment) {
    const companionCodes = payment.companionVoucherCodes ?? []

    // Build best possible loginUrl from all sources
    const effectiveLoginUrl =
      payment.reconnect?.loginUrl ||
      hotspotParams.loginUrl ||
      readStoredLoginUrl()

    const hasCredentials = payment.reconnect?.username && payment.reconnect?.password

    if (effectiveLoginUrl && hasCredentials) {
      if (typeof window !== 'undefined') sessionStorage.removeItem('arofi.autoConnectCount')
      // Connect FIRST, show companion codes after the router redirects back
      // here (?connected=1). The popup must never delay the paid device's
      // internet access.
      stashCompanionCodes(companionCodes)
      setConnectionStatus('reconnecting')
      setStatusMessage('')
      autoSubmitHotspotLogin(
        { ...payment.reconnect, loginUrl: effectiveLoginUrl },
        effectiveLoginUrl,
      )
      return
    }

    // No auto-connect possible — show the codes right away.
    if (companionCodes.length > 0) {
      setCompanionVoucherCodes(companionCodes)
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

  function dismissCompanionVoucherPopup() {
    setCompanionVoucherCodes([])
  }

  function handleCopyVoucherCode(code: string) {
    if (typeof navigator !== 'undefined' && navigator.clipboard) {
      navigator.clipboard.writeText(code).catch(() => {})
    }
    setCopiedVoucherCode(code)
    window.setTimeout(() => setCopiedVoucherCode(''), 2000)
  }

  async function handleShareVoucherCodes() {
    const message = `You're connected on AROFi WiFi! Use one of these voucher codes to connect your own device:\n${companionVoucherCodes.join('\n')}`
    if (typeof navigator !== 'undefined' && navigator.share) {
      try {
        await navigator.share({ text: message })
        return
      } catch {
        // user cancelled the native share sheet — fall through to clipboard copy
      }
    }
    handleCopyVoucherCode(companionVoucherCodes.join(', '))
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
      readStoredLoginUrl()

    if (!loginUrl || !reconnect?.username || !reconnect?.password) {
      setConnectionStatus('failed')
      if (reconnect?.username && reconnect?.password) {
        // Have credentials but no login URL — guide user to reconnect WiFi
        // so MikroTik can auto-authenticate via the active RADIUS session
        setErrorMessage(
          `Payment confirmed! Turn WiFi off and on — your device will connect automatically.`
        )
      } else {
        setErrorMessage(
          'Auto-connect needs the WiFi login page to be open. ' +
          'Reconnect to the WiFi network and open this portal again.'
        )
      }
      return
    }

    // Save loginUrl for future sessions on this device — both storages, so it
    // survives the payment-return round trip (see readStoredLoginUrl).
    if (typeof window !== 'undefined') {
      try {
        sessionStorage.setItem('arofi.lastLoginUrl', loginUrl)
        localStorage.setItem('arofi.lastLoginUrl', loginUrl)
      } catch {
        // storage full/blocked — auto-connect still proceeds with this URL
      }
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
      // After a successful hotspot login, keep the customer on the router's
      // own login host (tenantname.wifi / router gateway), never the public
      // online portal. The local login page can then show connected state and
      // avoids leaking users back to arofi.net/portal.
      const connectedDst = new URL(target.toString())
      connectedDst.search = ''
      connectedDst.hash = ''
      connectedDst.searchParams.set('connected', '1')
      target.searchParams.set('dst', connectedDst.toString())
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
      <section className={`rounded-[24px] border border-slate-200 bg-white p-5 shadow-sm sm:p-6 ${portalStyle.panel}`}>
        <div className="flex flex-col gap-5">
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className={`flex h-14 w-14 items-center justify-center rounded-2xl border ${portalStyle.logoRing}`}>
                <img src={context?.tenant.logoUrl || '/logo.png'} alt="AROFi" className="h-10 w-auto" />
              </div>
              <div>
                <p className={`text-xs uppercase tracking-[0.22em] ${portalStyle.support}`}>AROFi Customer Portal</p>
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

            <div className={`hidden rounded-full border px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] sm:block ${activeActivation ? portalStyle.activeNav : statusTone(currentPayment?.status)}`}>
              {activeActivation ? 'Connected' : currentPayment?.status ?? 'Portal Ready'}
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            <Link href="/" className="rounded-full border border-slate-200 bg-white px-4 py-2 text-xs font-semibold uppercase tracking-[0.18em] text-slate-600">
              Buy Access
            </Link>
            <Link href="/login" className={`rounded-full border px-4 py-2 text-xs font-semibold uppercase tracking-[0.18em] ${initialView === 'login' ? portalStyle.activeNav : 'border-slate-200 bg-white text-slate-600'}`}>
              Login
            </Link>
            <Link href="/session" className={`rounded-full border px-4 py-2 text-xs font-semibold uppercase tracking-[0.18em] ${initialView === 'session' ? portalStyle.activeNav : 'border-slate-200 bg-white text-slate-600'}`}>
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
          {!checkoutOpen && statusMessage && !pendingStatuses.includes(currentPayment?.status ?? '') && <div className={`rounded-2xl border px-4 py-3 text-sm ${portalStyle.notice}`}>{statusMessage}</div>}
          {connectionStatus === 'reconnecting' && <div className={`rounded-2xl border px-4 py-3 text-sm ${portalStyle.notice}`}><span className="inline-flex items-center gap-2"><Loader2 className="h-4 w-4 animate-spin" />Connecting to internet...</span></div>}
          {context?.returningDevice?.existingActiveAccess && connectionStatus !== 'reconnecting' && (
            <div className={`rounded-2xl border p-4 text-sm ${portalStyle.notice}`}>
              <div className="font-semibold">Welcome back — your package is still active.</div>
              <div className={`mt-1 ${portalStyle.noticeText}`}>
                {context.returningDevice.activation?.package.name ?? 'Active package'} · expires {formatDate(context.returningDevice.activation?.endsAt)}.
              </div>
              <button type="button" onClick={connectNow} className={`mt-3 inline-flex items-center gap-2 rounded-2xl px-4 py-2 text-sm font-semibold ${portalStyle.button}`}>
                <Wifi className="h-4 w-4" />
                Connect Now
              </button>
            </div>
          )}

          {initialView === 'home' && (
            <section className={`mx-auto w-full max-w-[540px] ${portalStyle.shell}`}>
              <span className="sr-only">AROFi simple portal build 2026-05-16-2328</span>
              <div className="text-center flex flex-col items-center justify-center">
              <div className={`mb-2 animate-pulse flex justify-center items-center ${portalStyle.iconText}`}>
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

              <div className="mt-6 grid gap-3 sm:grid-cols-2">
                {isContextLoading && packages.length === 0 && (
                  <>
                    <div className="h-[54px] animate-pulse rounded-lg border border-slate-100 bg-slate-100" />
                    <div className="h-[54px] animate-pulse rounded-lg border border-slate-100 bg-slate-100" />
                  </>
                )}
                {!isContextLoading && packages.length === 0 && (
                  <div className={`rounded-lg border p-4 text-sm text-slate-500 ${portalStyle.panel}`}>
                    {contextUnresolved
                      ? 'Open this page from your WiFi login screen so we can load the right operator and packages. If you scanned a code, reconnect to the WiFi and try again.'
                      : 'No packages are published for this portal yet.'}
                  </div>
                )}
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

              {(() => {
                // Only show networks that are actually enabled on the platform
                const nets = context?.paymentNetworks ?? ['MTN', 'AIRTEL']
                if (nets.length === 0) return null
                return (
                  <div className={`mt-6 rounded-lg border px-4 py-4 text-center ${portalStyle.accept}`}>
                    <div className={`text-sm font-bold ${resolvePortalTemplate(context?.tenant.portalTemplate) === 'midnight' ? 'text-white' : 'text-slate-700'}`}>We accept:</div>
                    <div className="mt-3 flex flex-wrap items-center justify-center gap-3">
                      {(nets as MobileMoneyNetwork[]).map(n => <NetworkIcon key={n} network={n} />)}
                    </div>
                  </div>
                )
              })()}

              {(() => {
                const phone = context?.tenant.supportPhone ?? context?.tenant.platformSupportPhone
                const email = context?.tenant.supportEmail ?? context?.tenant.platformSupportEmail
                const isMidnight = resolvePortalTemplate(context?.tenant.portalTemplate) === 'midnight'
                if (!phone && !email) return null
                return (
                  <div className={`mt-6 border-t border-slate-300 pt-5 text-center text-xs ${isMidnight ? 'text-slate-300' : 'text-slate-700'} flex flex-col items-center gap-2`}>
                    <div>Need help? Contact support:</div>
                    <div className={`mt-1 font-bold ${portalStyle.support}`}>{phone ?? email}</div>
                    {phone ? (
                      <a
                        href={getWhatsAppLink(phone)}
                        target="_blank"
                        rel="noreferrer"
                        className="mt-2 inline-flex items-center gap-2 rounded-xl bg-[#25D366] px-4 py-2 text-xs font-bold text-white shadow-sm hover:bg-[#20ba5a] transition"
                      >
                        <svg className="h-4 w-4 fill-current" viewBox="0 0 24 24">
                          <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L0 24l6.335-1.662c1.746.953 3.71 1.458 5.706 1.458h.008c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
                        </svg>
                        Chat on WhatsApp
                      </a>
                    ) : (
                      <a href={`mailto:${email}`} className={`mt-2 text-xs font-bold underline ${portalStyle.support}`}>{email}</a>
                    )}
                  </div>
                )
              })()}

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
                      <div className={`mt-3 rounded-lg border px-3 py-3 text-sm ${portalStyle.notice}`}>
                        <div className="flex items-center gap-2 font-semibold">
                          <Loader2 className="h-4 w-4 animate-spin" />
                          {statusMessage}
                        </div>
                        <div className={`mt-1 text-xs ${portalStyle.noticeText}`}>This page will auto-connect once approved.</div>
                      </div>
                    )}

                    <form onSubmit={handlePaymentSubmit} className="mt-4 space-y-3">
                      {/* Network auto-detected by Yo! Uganda — selector hidden */}
                      <label className="block text-sm font-bold text-slate-700">
                        Mobile Money Number
                        <div className="mt-2">
                          <PhoneNumberField
                            value={phoneNumber}
                            onChange={(val) => {
                              setPhoneNumber(val)
                              const detected = detectNetwork(val)
                              if (detected) setSelectedNetwork(detected)
                            }}
                            autoFocus
                            required
                            ugandaOnly
                            mobileOnly
                            className={`w-full rounded-lg border bg-white px-3 py-3 text-base text-slate-950 outline-none focus:ring-2 ${portalStyle.input}`}
                          />
                          {detectNetwork(phoneNumber) && (
                            <div className="mt-2 flex justify-end">
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
                        className={`flex w-full items-center justify-center gap-2 rounded-lg px-4 py-3.5 text-sm font-extrabold transition disabled:bg-slate-300 disabled:text-slate-500 ${portalStyle.button}`}
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
                <div className={`rounded-[28px] border p-6 text-center shadow-sm sm:p-8 ${portalStyle.connectedPanel}`}>
                  <div className={`mx-auto flex h-14 w-14 items-center justify-center rounded-full ${portalStyle.button}`}>
                    <Wifi className="h-7 w-7" />
                  </div>
                  <h2 className="mt-4 text-2xl font-bold text-slate-950">You’re connected</h2>
                  <p className="mt-1 text-sm text-slate-600">{portalSession.activeActivation?.package.name ?? 'Active plan'}</p>
                  <div className={`mt-5 rounded-2xl border p-4 ${portalStyle.connectedMetric}`}>
                    <div className="text-3xl font-extrabold tracking-tight">{portalSession.summary.activeMinutesRemaining} min</div>
                    <div className="mt-1 text-xs font-medium uppercase tracking-wider text-slate-400">time remaining</div>
                  </div>
                  <Link href="/session" className={`mt-5 inline-flex w-full items-center justify-center gap-2 rounded-2xl px-4 py-3.5 text-sm font-semibold transition ${portalStyle.button}`}>
                    Open my session
                    <ArrowRight className="h-4 w-4" />
                  </Link>
                </div>
              ) : (
                // The "already bought" sign-in: one number, one big button.
                <div className="rounded-[28px] border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
                  <div className={`flex h-12 w-12 items-center justify-center rounded-2xl ${portalStyle.link}`}>
                    <LogIn className="h-6 w-6" />
                  </div>
                  <h2 className="mt-4 text-2xl font-bold leading-tight text-slate-950">Already bought access?</h2>
                  <p className="mt-2 text-sm leading-6 text-slate-600">
                    Enter the phone number you paid with or redeemed your voucher on. We’ll reconnect you instantly.
                  </p>
                  <form onSubmit={handleLoginSubmit} className="mt-6 space-y-3">
                    <PhoneNumberField
                      value={phoneNumber}
                      onChange={setPhoneNumber}
                      autoFocus
                      required
                      className={`w-full rounded-2xl border bg-white px-4 py-3.5 text-lg text-slate-950 outline-none transition focus:ring-4 ${portalStyle.input}`}
                    />
                    <button type="submit" disabled={isLoginLoading} className={`inline-flex w-full items-center justify-center gap-2 rounded-2xl px-4 py-3.5 text-base font-semibold transition disabled:bg-slate-300 disabled:text-slate-500 ${portalStyle.button}`}>
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
                    <Link href="/" className={`font-semibold ${portalStyle.support}`}>Buy access</Link>
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
                    <PhoneNumberField value={phoneNumber} onChange={setPhoneNumber} required className={`w-full rounded-2xl border bg-white px-4 py-3 text-slate-950 outline-none ${portalStyle.input}`} />
                    <button type="submit" disabled={isLoginLoading} className={`inline-flex w-full items-center justify-center gap-2 rounded-2xl px-4 py-3 text-sm font-semibold disabled:bg-slate-300 disabled:text-slate-500 ${portalStyle.button}`}>
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

        {companionVoucherCodes.length > 0 && (
          <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/55 px-4">
            <div className="w-full max-w-sm rounded-xl bg-white p-5 shadow-xl">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h2 className="text-lg font-extrabold text-slate-950">
                    {companionVoucherCodes.length === 1 ? 'Bonus code for a friend' : `${companionVoucherCodes.length} bonus codes for your group`}
                  </h2>
                  <p className="mt-1 text-sm text-slate-600">
                    Your package covers {companionVoucherCodes.length + 1} devices. Share {companionVoucherCodes.length === 1 ? 'this code' : 'these codes'} so the others can connect on their own phones.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={dismissCompanionVoucherPopup}
                  className="rounded-md border border-slate-200 px-2 py-1 text-xs font-bold text-slate-600"
                >
                  ✕
                </button>
              </div>

              <div className="mt-4 space-y-2">
                {companionVoucherCodes.map((code) => (
                  <div key={code} className="flex items-center justify-between gap-3 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
                    <span className="font-mono text-sm font-bold tracking-wide text-slate-950">{code}</span>
                    <button
                      type="button"
                      onClick={() => handleCopyVoucherCode(code)}
                      className="inline-flex items-center gap-1 rounded-md border border-slate-300 bg-white px-2 py-1 text-xs font-semibold text-slate-700"
                    >
                      {copiedVoucherCode === code ? <Check className={`h-3.5 w-3.5 ${portalStyle.iconText}`} /> : <Copy className="h-3.5 w-3.5" />}
                      {copiedVoucherCode === code ? 'Copied' : 'Copy'}
                    </button>
                  </div>
                ))}
              </div>

              <p className="mt-3 text-xs text-slate-500">
                Each code works on one device only, and must be used soon — it expires {COMPANION_VOUCHER_EXPIRY_LABEL}.
              </p>

              <div className="mt-4 flex gap-2">
                <button
                  type="button"
                  onClick={handleShareVoucherCodes}
                  className={`inline-flex flex-1 items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-sm font-bold ${portalStyle.button}`}
                >
                  <Share2 className="h-4 w-4" /> Share
                </button>
                <button
                  type="button"
                  onClick={dismissCompanionVoucherPopup}
                  className="rounded-lg border border-slate-300 px-4 py-2.5 text-sm font-bold text-slate-700"
                >
                  Done
                </button>
              </div>
            </div>
          </div>
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
      <span className="inline-flex flex-col items-center justify-center rounded-xl bg-[#ffcc00] px-3 py-1.5 shadow-sm ring-1 ring-black/10" style={{ minWidth: 72 }}>
        <span style={{ fontSize: 15, fontWeight: 900, color: '#001e62', letterSpacing: '-0.02em', lineHeight: 1.1 }}>MTN</span>
        <span style={{ fontSize: 10, fontWeight: 700, color: '#001e62', letterSpacing: '0.04em', lineHeight: 1.2 }}>MoMo</span>
      </span>
    )
  }
  return (
    <span className="inline-flex flex-col items-center justify-center rounded-xl bg-white px-3 py-1.5 shadow-sm ring-1 ring-[#e40613]/30" style={{ minWidth: 72 }}>
      <span style={{ fontSize: 13, fontWeight: 900, color: '#e40613', letterSpacing: '-0.02em', lineHeight: 1.1 }}>airtel</span>
      <span style={{ fontSize: 10, fontWeight: 700, color: '#e40613', letterSpacing: '0.02em', lineHeight: 1.2 }}>Money</span>
    </span>
  )
}
