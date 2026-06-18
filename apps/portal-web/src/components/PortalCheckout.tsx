'use client'

import { useEffect, useState, useRef, useCallback, type FormEvent } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ArrowLeft, ArrowRight, Loader2, LogIn, Ticket, Wifi, Send, Search, CheckCircle, Clock } from 'lucide-react'
import type {
  PortalContextResponse,
  PortalCustomerSession,
  PortalLoginResponse,
  PortalPackage,
  PortalPayment,
  PortalRedeemVoucherResponse,
} from '../lib/portal-types'

type PortalView = 'home' | 'login' | 'session' | 'buy' | 'support'
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

type SupportTicket = {
  id: string
  reference: string
  subject: string
  category: string
  priority: string
  status: string
  phoneNumber?: string | null
  createdAt: string
  updatedAt: string
  latestResponseAt?: string | null
  resolvedAt?: string | null
  messages: Array<{
    id: string
    authorName: string
    authorRole: string
    body: string
    createdAt: string
  }>
}

const pendingStatuses = ['INITIATED', 'PENDING', 'INDETERMINATE']
const portalStorageKey = 'arofi.portal.access_token'
const paymentReturnStorageKey = 'arofi.portal.payment_return'

const supportCategories = [
  'Router setup',
  'Payment issue',
  'Customer connection',
  'Voucher issue',
  'Wallet withdrawal',
  'Billing question',
  'Other',
]

const ticketStatuses = ['OPEN', 'IN_PROGRESS', 'PENDING_CUSTOMER', 'RESOLVED', 'CLOSED']

function statusLabel(status: string) {
  return status.replace(/_/g, ' ').toLowerCase().replace(/^\w/, (c) => c.toUpperCase())
}

function statusIndex(status: string) {
  const i = ticketStatuses.indexOf(status)
  return i === -1 ? 0 : i
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

  // Navigation state
  const [view, setView] = useState<PortalView>(initialView)

  // Support states
  const [supportView, setSupportView] = useState<'menu' | 'submit' | 'lookup' | 'ticket'>('menu')
  const [supportTicket, setSupportTicket] = useState<SupportTicket | null>(null)
  const [supportSubmitting, setSupportSubmitting] = useState(false)
  const [supportLoading, setSupportLoading] = useState(false)
  const [supportLookupRef, setSupportLookupRef] = useState('')
  const [supportNewRef, setSupportNewRef] = useState('')
  const [supportError, setSupportError] = useState('')

  useEffect(() => {
    const searchParams = typeof window !== 'undefined' ? new URLSearchParams(window.location.search) : null
    const voucherFromQr = searchParams?.get('voucher') ?? searchParams?.get('code')
    if (voucherFromQr) {
      const code = normalizeVoucherCode(voucherFromQr)
      setVoucherCode(code)
      setQrVoucherCode(code)
      setQrVoucherRedeemAttempted(false)
      setStatusMessage('Voucher loaded from QR. Connecting this device...')
    }
    void bootstrap()
  }, [])

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
        setView('session')
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

    void handleCheckPaymentStatus(currentPayment.id, currentPayment.statusToken)
    const interval = window.setInterval(() => void handleCheckPaymentStatus(currentPayment.id, currentPayment.statusToken), 1500)

    const onVisible = () => {
      if (document.visibilityState !== 'visible') return
      void handleCheckPaymentStatus(currentPayment.id, currentPayment.statusToken)
      window.setTimeout(() => void handleCheckPaymentStatus(currentPayment.id, currentPayment.statusToken), 500)
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
      params.get('link-login-only') ??
      ''

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
    setStatusMessage('Portal login successful.')

    setView('session')
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
      await handleCompletedPayment(payment)
      if (typeof window !== 'undefined') {
        window.localStorage.removeItem(paymentReturnStorageKey)
      }
    } else if (payment.status === 'FAILED') {
      setErrorMessage(sanitizeUserMessage(payment.statusMessage) || 'The payment did not complete successfully.')
    } else if (pendingStatuses.includes(payment.status)) {
      setStatusMessage('Payment is being confirmed. Keep this page open.')
    }

    await loadContext(payment.phoneNumber, portalToken, hotspotParams)
  }

  async function handlePaymentReturn(paymentId: string, statusToken?: string | null) {
    const stored = readStoredPaymentReturn()
    const token = statusToken ?? stored?.statusToken ?? currentPayment?.statusToken
    if (stored?.phoneNumber && !phoneNumber) {
      setPhoneNumber(stored.phoneNumber)
    }
    setStatusMessage('Payment request submitted. Check phone to approve.')
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
      setErrorMessage('Enter the customer phone number for payment.')
      return
    }

    if (!availableNetworks.includes(selectedNetwork)) {
      setErrorMessage(`${selectedNetwork} is not available right now.`)
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
          network: selectedNetwork,
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

      const checkoutUrl = extractCheckoutUrl(payment)
      if (checkoutUrl && typeof window !== 'undefined') {
        setStatusMessage('Opening secure payment checkout...')
        window.localStorage.setItem(paymentReturnStorageKey, JSON.stringify({
          paymentId: payment.id,
          statusToken: payment.statusToken,
          phoneNumber: payment.phoneNumber,
          hotspotParams,
        }))
        window.location.href = checkoutUrl
        return
      }

      setStatusMessage('Payment request sent. Check your phone and approve.')
      if (payment.activation) {
        await handleCompletedPayment(payment)
      } else {
        await loadContext(payment.phoneNumber, portalToken, hotspotParams)
      }
    } finally {
      setIsPaymentLoading(false)
    }
  }

  async function handleCompletedPayment(payment: PortalPayment) {
    setStatusMessage('Payment confirmed! Connecting device now...')

    const effectiveLoginUrl =
      payment.reconnect?.loginUrl ||
      hotspotParams.loginUrl ||
      (typeof window !== 'undefined' ? sessionStorage.getItem('arofi.lastLoginUrl') : null) ||
      null

    const hasCredentials = payment.reconnect?.username && payment.reconnect?.password

    if (effectiveLoginUrl && hasCredentials) {
      if (typeof window !== 'undefined') sessionStorage.removeItem('arofi.autoConnectCount')
      setConnectionStatus('reconnecting')
      window.setTimeout(() => {
        autoSubmitHotspotLogin(
          { ...payment.reconnect, loginUrl: effectiveLoginUrl },
          effectiveLoginUrl,
        )
      }, 250)
      return
    }

    if (hasCredentials && !effectiveLoginUrl) {
      setConnectionStatus('failed')
      setStatusMessage(
        `Payment confirmed! Credentials: ` +
        `Username: ${payment.reconnect!.username} | ` +
        `Password: ${payment.reconnect!.password}. ` +
        `Tap Connect Now to connect.`
      )
      return
    }

    if (payment.phoneNumber) {
      try {
        await loginWithPhone(payment.phoneNumber, false, hotspotParams)
      } catch {
        // ignore
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
      await loginWithPhone(phoneNumber, false, hotspotParams)
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
    setView('home')
  }

  function autoSubmitHotspotLogin(
    reconnect: ReconnectPayload | null | undefined = context?.returningDevice?.reconnect,
    fallbackLoginUrl?: string,
  ) {
    const loginUrl =
      reconnect?.loginUrl ||
      fallbackLoginUrl ||
      hotspotParams.loginUrl ||
      (typeof window !== 'undefined' ? sessionStorage.getItem('arofi.lastLoginUrl') : null) ||
      null

    if (!loginUrl || !reconnect?.username || !reconnect?.password) {
      setConnectionStatus('failed')
      if (reconnect?.username && reconnect?.password) {
        setErrorMessage(
          `Connected! Enter these on the WiFi login page — ` +
          `Username: ${reconnect.username} | Password: ${reconnect.password}`
        )
      } else {
        setErrorMessage(
          'Auto-connect needs the WiFi login page to be open. ' +
          'Reconnect to the WiFi network and try again.'
        )
      }
      return
    }

    if (typeof window !== 'undefined') {
      sessionStorage.setItem('arofi.lastLoginUrl', loginUrl)
    }

    try {
      const target = new URL(loginUrl, window.location.href)
      target.searchParams.set('username', reconnect.username)
      target.searchParams.set('password', reconnect.password)
      target.searchParams.set('dst', 'http://neverssl.com/')
      target.searchParams.set('popup', 'false')
      window.location.href = target.toString()
    } catch {
      setConnectionStatus('failed')
      setErrorMessage('Could not open WiFi login. Tap Connect Now to retry.')
    }
  }

  function connectNow() {
    setConnectionStatus('reconnecting')
    setErrorMessage('')
    autoSubmitHotspotLogin()
  }

  // Support Handlers
  async function handleSupportSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!context?.tenant.id) {
      setSupportError('Portal context not loaded. Please refresh.')
      return
    }
    setSupportSubmitting(true)
    setSupportError('')
    const form = new FormData(event.currentTarget)
    try {
      const res = await fetch('/api/portal/support-tickets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tenantId: context.tenant.id,
          subject: form.get('subject'),
          category: form.get('category'),
          phoneNumber: form.get('phoneNumber') || undefined,
          body: form.get('body') || undefined,
        }),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error((body as { message?: string }).message ?? 'Unable to submit ticket')
      }
      const created = (await res.json()) as SupportTicket
      setSupportTicket(created)
      setSupportNewRef(created.reference)
      setSupportView('ticket')
    } catch (err) {
      setSupportError(err instanceof Error ? err.message : 'Unable to submit ticket')
    } finally {
      setSupportSubmitting(false)
    }
  }

  async function handleSupportLookup(event?: FormEvent<HTMLFormElement>) {
    event?.preventDefault()
    const ref = supportLookupRef.trim().toUpperCase()
    if (!ref) {
      setSupportError('Enter a ticket reference number.')
      return
    }
    setSupportLoading(true)
    setSupportError('')
    try {
      const params = new URLSearchParams({ ...(context?.tenant.id ? { tenantId: context.tenant.id } : {}) })
      const res = await fetch(`/api/portal/support-tickets/by-reference/${encodeURIComponent(ref)}?${params}`, { cache: 'no-store' })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error((body as { message?: string }).message ?? 'Ticket not found')
      }
      setSupportTicket((await res.json()) as SupportTicket)
      setSupportView('ticket')
    } catch (err) {
      setSupportError(err instanceof Error ? err.message : 'Ticket not found')
    } finally {
      setSupportLoading(false)
    }
  }

  async function handleRefreshSupportTicket() {
    if (!supportTicket) return
    setSupportLoading(true)
    try {
      const params = new URLSearchParams({ ...(context?.tenant.id ? { tenantId: context.tenant.id } : {}) })
      const res = await fetch(`/api/portal/support-tickets/by-reference/${encodeURIComponent(supportTicket.reference)}?${params}`, { cache: 'no-store' })
      if (res.ok) {
        setSupportTicket((await res.json()) as SupportTicket)
      }
    } finally {
      setSupportLoading(false)
    }
  }

  const activeActivation = portalSession?.activeActivation ?? context?.activeActivation ?? null
  const packages = context?.packages ?? []
  const availableNetworks = (context?.paymentNetworks?.length ? context.paymentNetworks : ['MTN']) as MobileMoneyNetwork[]

  return (
    <div className="flex flex-1 flex-col items-center justify-center py-4 sm:py-8">
      <section className="w-full max-w-[430px] rounded-3xl border border-slate-100 bg-white/95 p-6 shadow-[0_16px_50px_rgba(15,23,42,0.08)] backdrop-blur-md sm:p-8">
        
        {/* Header: Pulsing Wifi Icon + Tenant branding */}
        <div className="mb-6 flex flex-col items-center gap-2 text-center">
          <div className="relative flex h-14 w-14 items-center justify-center">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-20" />
            <span className="relative flex h-10 w-10 items-center justify-center rounded-full bg-emerald-50 text-emerald-600">
              <Wifi className="h-6 w-6" />
            </span>
          </div>
          <div className="flex h-11 w-11 items-center justify-center rounded-2xl border border-slate-100 bg-white shadow-sm overflow-hidden p-1">
            <img src={context?.tenant.logoUrl || '/logo.png'} alt="Logo" className="h-full w-auto object-contain" />
          </div>
          <h1 className="text-sm font-black uppercase tracking-[0.2em] text-slate-400 opacity-60">
            {context?.tenant.name ?? 'AROFi Hotspot'}
          </h1>
          <p className="text-[11px] font-medium tracking-wide text-slate-400">High-speed internet access</p>
        </div>

        {/* Global Errors and Connected Status Alerts */}
        {errorMessage && (
          <div className="mb-4 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-xs text-rose-700">
            {errorMessage}
          </div>
        )}
        {statusMessage && (
          <div className="mb-4 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-xs text-emerald-700">
            {statusMessage}
          </div>
        )}
        {connectionStatus === 'reconnecting' && (
          <div className="mb-4 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-xs text-emerald-700">
            Reconnecting your device to the internet...
          </div>
        )}

        {context?.returningDevice?.existingActiveAccess && view === 'home' && (
          <div className="mb-5 rounded-2xl border border-emerald-200 bg-emerald-50/50 p-4 text-xs text-slate-700">
            <div className="font-extrabold text-emerald-800">You have active internet access</div>
            <div className="mt-1 font-medium text-slate-500">
              Expires {formatDate(context.returningDevice.activation?.endsAt)}.
            </div>
            <button
              type="button"
              onClick={connectNow}
              className="mt-3 inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-4 py-2.5 font-bold text-white shadow-sm transition hover:bg-emerald-700"
            >
              <Wifi className="h-3.5 w-3.5" />
              Reconnect Device
            </button>
          </div>
        )}

        {/* Main Views Container */}
        <div className="min-h-[220px]">
          
          {/* HOME VIEW */}
          {view === 'home' && (
            <div className="space-y-5">
              <span className="sr-only">AROFi customer portal menu</span>

              {/* 2x2 Action Tiles */}
              <div className="grid grid-cols-2 gap-3">
                {/* Buy Access */}
                <button
                  type="button"
                  onClick={() => {
                    if (packages.length > 0) {
                      setSelectedPackage(packages[0])
                    }
                    setView('buy')
                    setErrorMessage('')
                    setStatusMessage('')
                  }}
                  className="group flex flex-col items-start gap-4 rounded-2xl border border-slate-100 bg-slate-50/50 p-4 text-left shadow-sm transition hover:border-emerald-300 hover:bg-white active:scale-[0.98]"
                >
                  <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-500 text-white shadow-sm transition group-hover:scale-105">
                    <svg className="h-4.5 w-4.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" /></svg>
                  </span>
                  <div>
                    <p className="text-xs font-black text-slate-900 tracking-wide uppercase">Buy Access</p>
                    <p className="mt-1 text-[10px] font-semibold text-slate-400">{packages.length} plans active</p>
                  </div>
                </button>

                {/* Voucher Focus */}
                <button
                  type="button"
                  onClick={() => {
                    const el = document.getElementById('voucher-input-home')
                    el?.focus()
                  }}
                  className="group flex flex-col items-start gap-4 rounded-2xl border border-slate-100 bg-slate-50/50 p-4 text-left shadow-sm transition hover:border-sky-300 hover:bg-white active:scale-[0.98]"
                >
                  <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-sky-500 text-white shadow-sm transition group-hover:scale-105">
                    <Ticket className="h-4.5 w-4.5" />
                  </span>
                  <div>
                    <p className="text-xs font-black text-slate-900 tracking-wide uppercase">Redeem Code</p>
                    <p className="mt-1 text-[10px] font-semibold text-slate-400">Voucher cards</p>
                  </div>
                </button>

                {/* Login / Session */}
                <button
                  type="button"
                  onClick={() => {
                    setView(portalSession ? 'session' : 'login')
                    setErrorMessage('')
                    setStatusMessage('')
                  }}
                  className="group flex flex-col items-start gap-4 rounded-2xl border border-slate-100 bg-slate-50/50 p-4 text-left shadow-sm transition hover:border-indigo-300 hover:bg-white active:scale-[0.98]"
                >
                  <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-indigo-500 text-white shadow-sm transition group-hover:scale-105">
                    <LogIn className="h-4.5 w-4.5" />
                  </span>
                  <div>
                    <p className="text-xs font-black text-slate-900 tracking-wide uppercase">My Session</p>
                    <p className="mt-1 text-[10px] font-semibold text-slate-400">{portalSession ? 'Active' : 'Sign in'}</p>
                  </div>
                </button>

                {/* Support Hub */}
                <button
                  type="button"
                  onClick={() => {
                    setView('support')
                    setSupportView('menu')
                    setSupportError('')
                  }}
                  className="group flex flex-col items-start gap-4 rounded-2xl border border-slate-100 bg-slate-50/50 p-4 text-left shadow-sm transition hover:border-amber-300 hover:bg-white active:scale-[0.98]"
                >
                  <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-amber-500 text-white shadow-sm transition group-hover:scale-105">
                    <svg className="h-4.5 w-4.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M8 10h8m-8 4h5m-9 7l2.6-2.6A2 2 0 018 17h8a2 2 0 002-2V7a2 2 0 00-2-2H6a2 2 0 00-2 2v14z" /></svg>
                  </span>
                  <div>
                    <p className="text-xs font-black text-slate-900 tracking-wide uppercase">Support</p>
                    <p className="mt-1 text-[10px] font-semibold text-slate-400">Get assistance</p>
                  </div>
                </button>
              </div>

              {/* Voucher Quick Entry */}
              <div className="pt-2">
                <div className="flex gap-2">
                  <input
                    id="voucher-input-home"
                    value={voucherCode}
                    onChange={(event) => setVoucherCode(event.target.value)}
                    placeholder="Enter voucher code..."
                    className="min-w-0 flex-1 rounded-xl border border-slate-100 bg-slate-50 px-4 py-3.5 text-sm font-semibold text-slate-800 outline-none transition focus:border-emerald-500 focus:bg-white"
                  />
                  <button
                    type="button"
                    onClick={() => void handleVoucherRedeem()}
                    disabled={isVoucherLoading || !voucherCode.trim()}
                    className="rounded-xl bg-emerald-600 px-5 py-3.5 text-xs font-black tracking-wide text-white uppercase transition hover:bg-emerald-700 disabled:bg-slate-200 disabled:text-slate-400"
                  >
                    {isVoucherLoading ? '...' : 'Go'}
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* BUY VIEW */}
          {view === 'buy' && (
            <div className="space-y-4">
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => setView('home')}
                  className="flex h-8 w-8 items-center justify-center rounded-lg border border-slate-100 hover:bg-slate-50"
                >
                  <ArrowLeft className="h-4 w-4 text-slate-600" />
                </button>
                <h2 className="text-sm font-black text-slate-900 uppercase tracking-wide">Select Package</h2>
              </div>

              {/* Package list */}
              <div className="max-h-[160px] overflow-y-auto pr-1 space-y-2">
                {packages.length === 0 && (
                  <p className="text-xs text-slate-400 py-3 text-center">No packages are currently configured.</p>
                )}
                {packages.map((pkg) => {
                  const isSelected = selectedPackage?.id === pkg.id
                  return (
                    <button
                      key={pkg.id}
                      type="button"
                      onClick={() => setSelectedPackage(pkg)}
                      className={`w-full flex items-center justify-between p-3 rounded-xl border text-left transition ${
                        isSelected
                          ? 'border-emerald-500 bg-emerald-50/50 shadow-sm ring-1 ring-emerald-500'
                          : 'border-slate-100 bg-white hover:border-slate-200'
                      }`}
                    >
                      <div>
                        <p className="font-extrabold text-slate-900 text-xs">{pkg.name}</p>
                        <p className="text-[10px] text-slate-400 mt-0.5">
                          Duration: {formatDuration(pkg.durationMinutes)}
                          {pkg.dataLimitMb ? ` · Limit: ${formatMegabytes(pkg.dataLimitMb)}` : ''}
                        </p>
                      </div>
                      <div className={`font-black text-[10px] px-2 py-1 rounded ${isSelected ? 'bg-emerald-600 text-white' : 'bg-slate-100 text-slate-700'}`}>
                        {formatCurrency(pkg.amountUgx)}
                      </div>
                    </button>
                  )
                })}
              </div>

              {/* Pay form */}
              {selectedPackage && (
                <form onSubmit={handlePaymentSubmit} className="space-y-3 pt-2">
                  <div>
                    <label className="block text-[10px] font-black text-slate-400 uppercase tracking-wider">
                      Mobile Money Number
                    </label>
                    <div className="relative mt-2 flex items-center">
                      <input
                        value={phoneNumber}
                        onChange={(event) => {
                          const val = event.target.value
                          setPhoneNumber(val)
                          const detected = detectNetwork(val)
                          if (detected) {
                            setSelectedNetwork(detected)
                          }
                        }}
                        placeholder="0771234567"
                        className="w-full rounded-xl border border-slate-100 bg-slate-50 px-4 py-3 text-xs font-semibold text-slate-800 outline-none transition focus:border-emerald-500 focus:bg-white"
                      />
                      {detectNetwork(phoneNumber) && (
                        <div className="absolute right-3">
                          {detectNetwork(phoneNumber) === 'MTN' ? (
                            <span className="rounded bg-[#ffcc00] px-2 py-0.5 text-[8px] font-black tracking-wide text-[#0b1f3a] shadow-sm uppercase">
                              MTN
                            </span>
                          ) : (
                            <span className="rounded bg-[#e60012] px-2 py-0.5 text-[8px] font-black text-white shadow-sm uppercase">
                              Airtel
                            </span>
                          )}
                        </div>
                      )}
                    </div>
                  </div>

                  <button
                    type="submit"
                    disabled={isPaymentLoading}
                    className="flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-600 px-4 py-3.5 text-xs font-black tracking-wider text-white uppercase transition hover:bg-emerald-700 disabled:bg-slate-200 disabled:text-slate-400"
                  >
                    {isPaymentLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowRight className="h-4 w-4" />}
                    {isPaymentLoading ? 'Initiating momo...' : `Pay ${formatCurrency(selectedPackage.amountUgx)}`}
                  </button>

                  {currentPayment && pendingStatuses.includes(currentPayment.status) && (
                    <div className="p-3 rounded-xl border border-amber-200 bg-amber-50 text-[11px] text-amber-800 space-y-2">
                      <div className="font-extrabold">Awaiting mobile money approval...</div>
                      <div>Approve the prompt on your phone, then we'll connect you.</div>
                      <button
                        type="button"
                        onClick={() => handleCheckPaymentStatus(currentPayment.id, currentPayment.statusToken)}
                        className="w-full py-1.5 rounded-lg bg-white border border-amber-300 font-extrabold text-amber-700 hover:bg-amber-100/50 uppercase text-[9px]"
                      >
                        Check connection
                      </button>
                    </div>
                  )}
                </form>
              )}
            </div>
          )}

          {/* LOGIN VIEW */}
          {view === 'login' && (
            <div className="space-y-4">
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => setView('home')}
                  className="flex h-8 w-8 items-center justify-center rounded-lg border border-slate-100 hover:bg-slate-50"
                >
                  <ArrowLeft className="h-4 w-4 text-slate-600" />
                </button>
                <h2 className="text-sm font-black text-slate-900 uppercase tracking-wide">Sign In</h2>
              </div>

              <p className="text-[11px] text-slate-500 leading-relaxed">
                Enter the phone number you paid with or redeemed your voucher on. We'll reconnect you instantly.
              </p>

              <form onSubmit={handleLoginSubmit} className="space-y-3 pt-2">
                <div>
                  <label className="block text-[10px] font-black text-slate-400 uppercase tracking-wider">
                    Phone Number
                  </label>
                  <input
                    value={phoneNumber}
                    onChange={(event) => setPhoneNumber(event.target.value)}
                    placeholder="0771234567"
                    inputMode="tel"
                    className="w-full mt-2 rounded-xl border border-slate-100 bg-slate-50 px-4 py-3 text-xs font-semibold text-slate-800 outline-none transition focus:border-emerald-500 focus:bg-white"
                  />
                </div>

                <button
                  type="submit"
                  disabled={isLoginLoading}
                  className="flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-600 px-4 py-3.5 text-xs font-black tracking-wider text-white uppercase transition hover:bg-emerald-700 disabled:bg-slate-200 disabled:text-slate-400"
                >
                  {isLoginLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <LogIn className="h-4 w-4" />}
                  {isLoginLoading ? 'Connecting...' : 'Sign In & Reconnect'}
                </button>
              </form>
            </div>
          )}

          {/* SESSION VIEW */}
          {view === 'session' && (
            <div className="space-y-4">
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => setView('home')}
                  className="flex h-8 w-8 items-center justify-center rounded-lg border border-slate-100 hover:bg-slate-50"
                >
                  <ArrowLeft className="h-4 w-4 text-slate-600" />
                </button>
                <h2 className="text-sm font-black text-slate-900 uppercase tracking-wide">Active Session</h2>
              </div>

              {portalSession ? (
                <div className="space-y-3">
                  <div className="rounded-xl border border-slate-100 bg-slate-50/50 p-3 space-y-1.5 text-xs text-slate-700">
                    <div className="flex justify-between">
                      <span className="font-semibold text-slate-400 uppercase text-[9px] tracking-wider">Phone</span>
                      <span className="font-bold text-slate-800">{portalSession.customer.phoneNumber}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="font-semibold text-slate-400 uppercase text-[9px] tracking-wider">Package</span>
                      <span className="font-bold text-slate-800">{portalSession.activeActivation?.package.name ?? 'Awaiting activation'}</span>
                    </div>
                    {portalSession.activeActivation && (
                      <div className="flex justify-between">
                        <span className="font-semibold text-slate-400 uppercase text-[9px] tracking-wider">Expires</span>
                        <span className="font-bold text-slate-800">{formatDate(portalSession.activeActivation.endsAt)}</span>
                      </div>
                    )}
                    <div className="flex justify-between">
                      <span className="font-semibold text-slate-400 uppercase text-[9px] tracking-wider">Total Usage</span>
                      <span className="font-bold text-slate-800">{formatMegabytes(portalSession.summary.totalDataUsedMb)}</span>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => void handleLogout()}
                    className="w-full py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-xs font-bold text-slate-700 uppercase tracking-wider transition"
                  >
                    Sign Out
                  </button>
                </div>
              ) : (
                <div className="text-center py-4 space-y-3">
                  <p className="text-xs text-slate-400">No active portal session found.</p>
                  <button
                    type="button"
                    onClick={() => setView('login')}
                    className="px-4 py-2 rounded-lg bg-emerald-600 text-white font-bold text-[10px] uppercase tracking-wider"
                  >
                    Sign In Now
                  </button>
                </div>
              )}
            </div>
          )}

          {/* SUPPORT VIEW */}
          {view === 'support' && (
            <div className="space-y-4">
              
              {/* Header with Breadcrumb */}
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => {
                    if (supportView === 'menu') {
                      setView('home')
                    } else if (supportView === 'ticket') {
                      setSupportView('lookup')
                      setSupportTicket(null)
                    } else {
                      setSupportView('menu')
                    }
                    setSupportError('')
                  }}
                  className="flex h-8 w-8 items-center justify-center rounded-lg border border-slate-100 hover:bg-slate-50"
                >
                  <ArrowLeft className="h-4 w-4 text-slate-600" />
                </button>
                <h2 className="text-sm font-black text-slate-900 uppercase tracking-wide">
                  {supportView === 'menu' && 'Support Hub'}
                  {supportView === 'submit' && 'Submit Ticket'}
                  {supportView === 'lookup' && 'Track Ticket'}
                  {supportView === 'ticket' && 'Ticket Details'}
                </h2>
              </div>

              {supportError && (
                <div className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700">
                  {supportError}
                </div>
              )}

              {/* Support Menu */}
              {supportView === 'menu' && (
                <div className="grid grid-cols-2 gap-3 pt-2">
                  <button
                    type="button"
                    onClick={() => {
                      setSupportView('submit')
                      setSupportError('')
                    }}
                    className="flex flex-col items-start gap-4 rounded-2xl border border-slate-100 bg-slate-50/50 p-4 text-left shadow-sm transition hover:border-emerald-300 hover:bg-white"
                  >
                    <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-500 text-white shadow-sm">
                      <Send className="h-4 w-4" />
                    </span>
                    <div>
                      <p className="text-xs font-black text-slate-900 tracking-wide uppercase">Open Ticket</p>
                      <p className="mt-1 text-[9px] font-semibold text-slate-400">Report connection issue</p>
                    </div>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setSupportView('lookup')
                      setSupportError('')
                    }}
                    className="flex flex-col items-start gap-4 rounded-2xl border border-slate-100 bg-slate-50/50 p-4 text-left shadow-sm transition hover:border-sky-300 hover:bg-white"
                  >
                    <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-sky-500 text-white shadow-sm">
                      <Search className="h-4 w-4" />
                    </span>
                    <div>
                      <p className="text-xs font-black text-slate-900 tracking-wide uppercase">Track Status</p>
                      <p className="mt-1 text-[9px] font-semibold text-slate-400">Check existing replies</p>
                    </div>
                  </button>
                </div>
              )}

              {/* Submit Ticket Form */}
              {supportView === 'submit' && (
                <form onSubmit={handleSupportSubmit} className="space-y-3 pt-1">
                  <div>
                    <label className="block text-[10px] font-black text-slate-400 uppercase tracking-wider">Phone (Optional)</label>
                    <input
                      name="phoneNumber"
                      type="tel"
                      className="w-full mt-1.5 rounded-xl border border-slate-100 bg-slate-50 px-4 py-2.5 text-xs font-semibold outline-none focus:border-emerald-500 focus:bg-white"
                      placeholder="0771234567"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-black text-slate-400 uppercase tracking-wider">Category</label>
                    <select
                      name="category"
                      required
                      className="w-full mt-1.5 rounded-xl border border-slate-100 bg-slate-50 px-3 py-2.5 text-xs font-semibold outline-none focus:border-emerald-500 focus:bg-white"
                    >
                      {supportCategories.map((cat) => <option key={cat} value={cat}>{cat}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="block text-[10px] font-black text-slate-400 uppercase tracking-wider">Subject</label>
                    <input
                      name="subject"
                      required
                      maxLength={180}
                      className="w-full mt-1.5 rounded-xl border border-slate-100 bg-slate-50 px-4 py-2.5 text-xs font-semibold outline-none focus:border-emerald-500 focus:bg-white"
                      placeholder="Brief summary of connection issue"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-black text-slate-400 uppercase tracking-wider">Details</label>
                    <textarea
                      name="body"
                      rows={3}
                      maxLength={2000}
                      className="w-full mt-1.5 rounded-xl border border-slate-100 bg-slate-50 px-4 py-2 text-xs font-semibold outline-none focus:border-emerald-500 focus:bg-white"
                      placeholder="Describe what happened..."
                    />
                  </div>

                  <button
                    type="submit"
                    disabled={supportSubmitting}
                    className="flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-600 px-4 py-3 text-xs font-black tracking-wider text-white uppercase transition hover:bg-emerald-700 disabled:bg-slate-200"
                  >
                    {supportSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
                    {supportSubmitting ? 'Submitting...' : 'Submit Support Ticket'}
                  </button>
                </form>
              )}

              {/* Lookup Form */}
              {supportView === 'lookup' && (
                <form onSubmit={handleSupportLookup} className="space-y-4 pt-1">
                  <div>
                    <label className="block text-[10px] font-black text-slate-400 uppercase tracking-wider">Ticket Reference</label>
                    <input
                      value={supportLookupRef}
                      onChange={(e) => setSupportLookupRef(e.target.value)}
                      placeholder="PRT-XXXX-XXXX"
                      required
                      className="w-full mt-1.5 rounded-xl border border-slate-100 bg-slate-50 px-4 py-3 text-xs font-mono uppercase tracking-widest text-slate-800 outline-none focus:border-sky-500 focus:bg-white"
                    />
                  </div>

                  <button
                    type="submit"
                    disabled={supportLoading}
                    className="flex w-full items-center justify-center gap-2 rounded-xl bg-sky-600 px-4 py-3 text-xs font-black tracking-wider text-white uppercase transition hover:bg-sky-700 disabled:bg-slate-200"
                  >
                    {supportLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-3.5 w-3.5" />}
                    {supportLoading ? 'Searching...' : 'Find Ticket'}
                  </button>
                </form>
              )}

              {/* Support Ticket Details */}
              {supportView === 'ticket' && supportTicket && (
                <div className="space-y-4">
                  {supportTicket.reference === supportNewRef && (
                    <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2.5 text-[11px] text-slate-700">
                      <div className="font-extrabold text-emerald-800 flex items-center gap-1.5">
                        <CheckCircle className="h-3.5 w-3.5 text-emerald-600" />
                        Ticket Submitted!
                      </div>
                      <div className="mt-1 font-medium">
                        Reference: <span className="font-mono font-bold text-slate-900">{supportTicket.reference}</span>
                      </div>
                    </div>
                  )}

                  {/* Summary card */}
                  <div className="rounded-xl border border-slate-100 bg-slate-50/50 p-3.5 text-xs text-slate-700 space-y-1.5">
                    <div className="flex justify-between items-center">
                      <span className="font-mono font-bold text-slate-500 uppercase text-[9px] tracking-widest">{supportTicket.reference}</span>
                      <span className={`rounded-full px-2 py-0.5 text-[9px] font-black uppercase tracking-wider ${
                        supportTicket.status === 'RESOLVED' || supportTicket.status === 'CLOSED'
                          ? 'bg-emerald-50 text-emerald-700'
                          : 'bg-sky-50 text-sky-700'
                      }`}>
                        {statusLabel(supportTicket.status)}
                      </span>
                    </div>
                    <div className="font-bold text-slate-900">{supportTicket.subject}</div>
                    <div className="text-[10px] text-slate-400">Opened: {formatDate(supportTicket.createdAt)}</div>
                  </div>

                  {/* Chat / messages */}
                  <div className="flex justify-between items-center">
                    <span className="text-[10px] font-black text-slate-400 uppercase tracking-wider">Updates &amp; Replies</span>
                    <button
                      type="button"
                      onClick={() => void handleRefreshSupportTicket()}
                      disabled={supportLoading}
                      className="flex items-center gap-1 text-[10px] font-bold text-slate-500 hover:text-slate-800"
                    >
                      {supportLoading ? <Loader2 className="h-3 w-3 animate-spin" /> : <Clock className="h-3 w-3" />}
                      Refresh
                    </button>
                  </div>

                  <div className="max-h-[140px] overflow-y-auto space-y-2 pr-1">
                    {supportTicket.messages.length === 0 ? (
                      <p className="text-[11px] text-slate-400 py-4 text-center">No messages yet. Support agent will reply soon.</p>
                    ) : (
                      supportTicket.messages.map((msg) => (
                        <div
                          key={msg.id}
                          className={`rounded-xl p-3 text-xs leading-relaxed ${
                            msg.authorRole === 'Customer'
                              ? 'border border-slate-100 bg-slate-50/40 text-slate-700 ml-4'
                              : 'border border-sky-100 bg-sky-50/50 text-slate-800 mr-4'
                          }`}
                        >
                          <div className="flex justify-between items-center mb-1 text-[9px] font-bold text-slate-400">
                            <span>{msg.authorRole === 'Customer' ? 'You' : 'Agent'}</span>
                            <span>{formatDate(msg.createdAt)}</span>
                          </div>
                          <p>{msg.body}</p>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              )}

            </div>
          )}

        </div>

        {/* Footer Support Contacts */}
        <div className="mt-6 border-t border-slate-100 pt-4 text-center">
          {context?.tenant.supportPhone && (
            <div className="mb-4 flex items-center justify-center gap-4 text-xs">
              <a
                href={`tel:${context.tenant.supportPhone}`}
                className="flex items-center gap-1.5 font-extrabold text-slate-500 hover:text-emerald-600 transition"
              >
                <svg className="h-4 w-4 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" /></svg>
                Call Support
              </a>
              <span className="text-slate-200">|</span>
              <a
                href={getWhatsAppLink(context.tenant.supportPhone)}
                target="_blank"
                rel="noreferrer"
                className="flex items-center gap-1.5 font-extrabold text-[#25D366] hover:text-[#1aad52] transition"
              >
                <svg className="h-4 w-4 fill-current" viewBox="0 0 24 24"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L0 24l6.335-1.662c1.746.953 3.71 1.458 5.706 1.458h.008c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" /></svg>
                WhatsApp Support
              </a>
            </div>
          )}

          {/* Branding Footer Link (link not seen, but clickable text) */}
          <p className="text-[9px] font-black tracking-widest text-slate-300 uppercase">
            Powered By:{' '}
            <a
              href="https://arosoftlabs.com"
              target="_blank"
              rel="noreferrer"
              className="text-slate-400 hover:text-emerald-600 no-underline transition"
            >
              AROSOFT
            </a>
          </p>
        </div>

      </section>
    </div>
  )
}
