'use client'

import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import {
  ArrowRight,
  CheckCircle2,
  Gift,
  Globe2,
  Laptop2,
  Loader2,
  LockKeyhole,
  Mail,
  Monitor,
  Phone,
  Search,
  ShieldCheck,
  Smartphone,
  Ticket,
  Wifi,
} from 'lucide-react'
import type {
  PortalContextResponse,
  PortalPackage,
  PortalPayment,
  PortalRedeemVoucherResponse,
} from '../lib/portal-types'

type TabId = 'voucher' | 'multi' | 'tv' | 'recover' | 'promo'
type MobileNetwork = 'MTN' | 'AIRTEL'
type HotspotParams = {
  macAddress: string
  clientIp: string
  loginUrl: string
  routerId: string
  routerKey: string
  hotspotServerName: string
  tenantDomain: string
}
type ReconnectPayload = {
  loginUrl?: string | null
  username?: string | null
  password?: string | null
}
type RecoveryResponse = { message?: string; reconnect?: ReconnectPayload | null }

const API_FALLBACKS = ['https://arofi.net/api', 'http://95.111.234.34:18080/api']
const PORTAL_TOKEN_KEY = 'arofi.portal.access_token'
const PENDING_STATUSES = ['INITIATED', 'PENDING', 'INDETERMINATE', 'PROCESSING']
const PAYMENT_WAIT_LIMIT_MS = 90_000

function normalizeApiBase(value?: string | null) {
  const trimmed = value?.trim().replace(/\/$/, '')
  if (!trimmed || trimmed === '/api') return null
  return trimmed.endsWith('/api') ? trimmed : `${trimmed}/api`
}

function isJson(response: Response) {
  return response.headers.get('content-type')?.toLowerCase().includes('application/json')
}

async function apiFetch(apiPath: string, init?: RequestInit) {
  const path = apiPath.startsWith('/api/') ? apiPath : `/api${apiPath.startsWith('/') ? apiPath : `/${apiPath}`}`
  const suffix = path.slice(4)
  const configured = normalizeApiBase(process.env.NEXT_PUBLIC_API_URL)
  const candidates = [path, ...(configured ? [`${configured}${suffix}`] : []), ...API_FALLBACKS.map((base) => `${base}${suffix}`)]
    .filter((value, index, all) => all.indexOf(value) === index)

  let lastError: unknown
  for (const candidate of candidates) {
    try {
      const response = await fetch(candidate, init)
      if (isJson(response)) return response
      lastError = new Error(`AROFi returned a non-JSON response (HTTP ${response.status}).`)
    } catch (error) {
      lastError = error
    }
  }
  throw lastError instanceof Error ? lastError : new Error('Cannot reach the AROFi portal service.')
}

function readHotspotParams(): HotspotParams {
  if (typeof window === 'undefined') {
    return { macAddress: '', clientIp: '', loginUrl: '', routerId: '', routerKey: '', hotspotServerName: '', tenantDomain: '' }
  }
  const query = new URLSearchParams(window.location.search)
  const first = (...names: string[]) => names.map((name) => query.get(name)?.trim()).find(Boolean) ?? ''
  const loginUrl = first('link-login', 'link-login-only', 'loginUrl', 'login-url', 'linkLogin')
  if (loginUrl) {
    try {
      sessionStorage.setItem('arofi.lastLoginUrl', loginUrl)
      localStorage.setItem('arofi.lastLoginUrl', loginUrl)
    } catch {}
  }
  return {
    macAddress: first('mac', 'macAddress', 'clientMac'),
    clientIp: first('ip', 'clientIp'),
    loginUrl,
    routerId: first('routerId', 'router'),
    routerKey: first('routerKey', 'key', 'registrationKey'),
    hotspotServerName: first('server', 'server-name', 'hotspotServerName'),
    tenantDomain: first('tenantDomain', 'domain'),
  }
}

function normalizePhone(value: string) {
  const digits = value.replace(/\D/g, '')
  if (digits.startsWith('256')) return digits
  if (digits.startsWith('0')) return `256${digits.slice(1)}`
  if (/^7\d{8}$/.test(digits)) return `256${digits}`
  return digits
}

function normalizeMac(value: string) {
  const compact = value.replace(/[^a-fA-F0-9]/g, '').toUpperCase().slice(0, 12)
  return compact.match(/.{1,2}/g)?.join(':') ?? ''
}

function normalizeVoucher(value: string) {
  return value.trim().replace(/[\u2010-\u2015]/g, '-').replace(/\s+/g, '').toUpperCase()
}

function formatMoney(value: number) {
  return `UGX ${new Intl.NumberFormat('en-UG').format(value)}`
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
  return `${minutes} min`
}

function isTvPackage(pkg: PortalPackage) {
  const text = `${pkg.name} ${pkg.code} ${pkg.description ?? ''}`.toLowerCase()
  return text.includes('tv') || text.includes('smart') || text.includes('stream')
}

function isMultiPackage(pkg: PortalPackage) {
  return !isTvPackage(pkg) && (pkg.deviceLimit ?? 1) > 1
}

function isTrialPackage(pkg: PortalPackage) {
  return Boolean(pkg.isTrialEnabled) || pkg.amountUgx <= 0
}

function finishTarget() {
  if (typeof window === 'undefined') return 'http://connectivitycheck.gstatic.com/generate_204'
  const ua = navigator.userAgent || ''
  if (/Windows/i.test(ua)) return 'http://www.msftconnecttest.com/connecttest.txt'
  if (/iPhone|iPad|Macintosh/i.test(ua)) return 'http://captive.apple.com/hotspot-detect.html'
  return 'http://connectivitycheck.gstatic.com/generate_204'
}

function supportWhatsApp(phone: string) {
  let digits = phone.replace(/\D/g, '')
  if (digits.startsWith('0')) digits = `256${digits.slice(1)}`
  if (!digits.startsWith('256') && digits.length === 9) digits = `256${digits}`
  return `https://wa.me/${digits}`
}

function randomKey() {
  try { return crypto.randomUUID() } catch { return `portal-${Date.now()}-${Math.random().toString(36).slice(2)}` }
}

function safeProviderMessage(payment: PortalPayment) {
  const raw = payment.statusMessage?.trim()
  if (raw) return raw.slice(0, 220)
  const provider = payment.providerStatus?.trim()
  if (provider) return `Payment ${provider.toLowerCase()}. Please check the Mobile Money prompt and try again.`
  return 'Payment was not completed. Check the PIN or Mobile Money prompt and try again.'
}

export default function CompactPortalCheckout() {
  const [tab, setTab] = useState<TabId>('voucher')
  const [context, setContext] = useState<PortalContextResponse | null>(null)
  const [hotspot, setHotspot] = useState<HotspotParams>(() => readHotspotParams())
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState('')
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [voucherCode, setVoucherCode] = useState('')
  const [phoneNumber, setPhoneNumber] = useState('')
  const [recoverReference, setRecoverReference] = useState('')
  const [tvMac, setTvMac] = useState('')
  const [network, setNetwork] = useState<MobileNetwork>('MTN')
  const [checkoutPackage, setCheckoutPackage] = useState<PortalPackage | null>(null)
  const [payment, setPayment] = useState<PortalPayment | null>(null)
  const reconnectSignature = useRef('')
  const roamingAttempted = useRef(false)

  const packages = context?.packages ?? []
  const standardPackages = useMemo(() => packages.filter((pkg) => !isTrialPackage(pkg) && !isTvPackage(pkg) && !isMultiPackage(pkg)), [packages])
  const multiPackages = useMemo(() => packages.filter((pkg) => !isTrialPackage(pkg) && isMultiPackage(pkg)), [packages])
  const tvPackages = useMemo(() => packages.filter((pkg) => !isTrialPackage(pkg) && isTvPackage(pkg)), [packages])
  const trialPackage = useMemo(() => packages.find(isTrialPackage) ?? null, [packages])
  const networks = (context?.paymentNetworks?.length ? context.paymentNetworks : ['MTN', 'AIRTEL']) as MobileNetwork[]
  const supportPhone = context?.tenant.supportPhone ?? context?.tenant.platformSupportPhone ?? ''
  const supportEmail = context?.tenant.supportEmail ?? context?.tenant.platformSupportEmail ?? ''
  const tenantName = context?.tenant.name?.trim() || 'AROFi Wi-Fi'
  const logo = context?.tenant.logoUrl?.trim() || '/brand/arofi-logo-gradient.webp'

  const reconnect = useCallback((payload?: ReconnectPayload | null) => {
    if (!payload?.username || !payload.password || typeof window === 'undefined') return false
    let loginUrl = payload.loginUrl || hotspot.loginUrl
    if (!loginUrl) {
      try { loginUrl = sessionStorage.getItem('arofi.lastLoginUrl') || localStorage.getItem('arofi.lastLoginUrl') || '' } catch {}
    }
    if (!loginUrl) return false
    try {
      const form = document.createElement('form')
      form.method = 'post'
      form.action = new URL(loginUrl, window.location.href).toString()
      form.style.display = 'none'
      for (const [name, value] of Object.entries({ username: payload.username, password: payload.password, dst: finishTarget(), popup: 'false' })) {
        const input = document.createElement('input')
        input.type = 'hidden'; input.name = name; input.value = value; form.appendChild(input)
      }
      document.body.appendChild(form)
      form.submit()
      return true
    } catch { return false }
  }, [hotspot.loginUrl])

  const attemptAuthenticatedRoam = useCallback(async (nextHotspot: HotspotParams, token: string) => {
    if (roamingAttempted.current || !nextHotspot.macAddress) return false
    roamingAttempted.current = true
    try {
      const response = await apiFetch('/api/portal/roam', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          macAddress: nextHotspot.macAddress,
          ipAddress: nextHotspot.clientIp || undefined,
          routerId: nextHotspot.routerId || undefined,
          routerKey: nextHotspot.routerKey || undefined,
          hotspotServerName: nextHotspot.hotspotServerName || undefined,
          loginUrl: nextHotspot.loginUrl || undefined,
        }),
      })
      if (!response.ok) return false
      const body = await response.json() as RecoveryResponse
      if (body.reconnect?.username && body.reconnect.password) {
        setMessage('Active access found on this AROFi network. Roaming to this access point…')
        return reconnect(body.reconnect)
      }
    } catch {}
    return false
  }, [reconnect])

  const loadContext = useCallback(async (nextHotspot = hotspot, token?: string | null, phone?: string) => {
    const query = new URLSearchParams()
    if (nextHotspot.tenantDomain) query.set('tenantDomain', nextHotspot.tenantDomain)
    if (nextHotspot.macAddress) query.set('mac', nextHotspot.macAddress)
    if (nextHotspot.clientIp) query.set('ip', nextHotspot.clientIp)
    if (nextHotspot.routerId) query.set('routerId', nextHotspot.routerId)
    if (nextHotspot.routerKey) query.set('routerKey', nextHotspot.routerKey)
    if (nextHotspot.hotspotServerName) query.set('server', nextHotspot.hotspotServerName)
    if (nextHotspot.loginUrl) query.set('loginUrl', nextHotspot.loginUrl)
    if (phone) query.set('phoneNumber', normalizePhone(phone))
    const response = await apiFetch(`/api/portal/context?${query.toString()}`, {
      cache: 'no-store',
      headers: token ? { Authorization: `Bearer ${token}` } : undefined,
    })
    if (!response.ok) throw new Error(response.status === 404 ? 'Open this portal from the Wi-Fi login screen so AROFi can identify the correct business.' : 'Unable to load this Wi-Fi portal.')
    const data = await response.json() as PortalContextResponse
    setContext(data)

    const returning = data.returningDevice?.reconnect
    if (data.returningDevice?.existingActiveAccess && returning?.username && returning.password) {
      const signature = `${returning.loginUrl ?? ''}|${returning.username}`
      if (reconnectSignature.current !== signature) {
        reconnectSignature.current = signature
        setMessage('Welcome back. Reconnecting your active package…')
        window.setTimeout(() => reconnect(returning), 120)
      }
    } else if (token) {
      void attemptAuthenticatedRoam(nextHotspot, token)
    }
    return data
  }, [hotspot, reconnect, attemptAuthenticatedRoam])

  useEffect(() => {
    const detected = readHotspotParams()
    setHotspot(detected)
    const query = new URLSearchParams(window.location.search)
    const qrVoucher = query.get('voucher') || query.get('code')
    if (qrVoucher) setVoucherCode(normalizeVoucher(qrVoucher))
    const storedToken = localStorage.getItem(PORTAL_TOKEN_KEY)
    void loadContext(detected, storedToken)
      .catch((caught) => setError(caught instanceof Error ? caught.message : 'Unable to load the portal.'))
      .finally(() => setLoading(false))
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (!payment || !PENDING_STATUSES.includes(payment.status)) return
    const createdAt = Number.isFinite(Date.parse(payment.createdAt)) ? Date.parse(payment.createdAt) : Date.now()
    let stopped = false

    const check = async () => {
      if (stopped) return
      if (Date.now() - createdAt >= PAYMENT_WAIT_LIMIT_MS) {
        stopped = true
        setPayment((current) => current ? { ...current, status: 'TIMED_OUT' } : current)
        setBusy('')
        setMessage('')
        setError('Payment could not be confirmed in time. If money was deducted, use Find My Voucher before paying again.')
        return
      }
      try {
        const token = payment.statusToken ? `?token=${encodeURIComponent(payment.statusToken)}` : ''
        const response = await apiFetch(`/api/payments/${payment.id}/check-status${token}`, { method: 'POST' })
        if (!response.ok) return
        const fresh = await response.json() as PortalPayment
        setPayment(fresh)
        if (fresh.status === 'FAILED') {
          stopped = true
          setBusy('')
          setMessage('')
          setError(safeProviderMessage(fresh))
          return
        }
        if (fresh.activation) {
          stopped = true
          setBusy('')
          setCheckoutPackage(null)
          setError('')
          if (isTvPackage(fresh.package as unknown as PortalPackage)) {
            setMessage('Payment confirmed. Reconnect the Smart TV to this Wi-Fi.')
          } else if (fresh.reconnect?.username && fresh.reconnect.password) {
            setMessage('Payment confirmed. Connecting this device now…')
            reconnect(fresh.reconnect)
          } else {
            setMessage('Payment confirmed. Your package is active.')
          }
          void loadContext(hotspot, localStorage.getItem(PORTAL_TOKEN_KEY), fresh.phoneNumber)
          return
        }
        if (!PENDING_STATUSES.includes(fresh.status)) {
          stopped = true
          setBusy('')
          setMessage('')
          setError(safeProviderMessage(fresh))
        }
      } catch {
        // Transient provider/network errors are retried until the bounded deadline.
      }
    }

    void check()
    const timer = window.setInterval(() => void check(), 2600)
    return () => { stopped = true; window.clearInterval(timer) }
  }, [payment?.id, payment?.status, payment?.statusToken, payment?.createdAt, hotspot, loadContext, reconnect])

  async function redeemVoucher(event: FormEvent) {
    event.preventDefault(); setError(''); setMessage('')
    const code = normalizeVoucher(voucherCode)
    if (!code) return setError('Enter your voucher code.')
    setBusy('voucher')
    try {
      const response = await apiFetch('/api/portal/redeem-voucher', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          code,
          phoneNumber: phoneNumber ? normalizePhone(phoneNumber) : undefined,
          customerReference: phoneNumber ? normalizePhone(phoneNumber) : undefined,
          macAddress: hotspot.macAddress || undefined,
          clientIp: hotspot.clientIp || undefined,
          loginUrl: hotspot.loginUrl || undefined,
          routerId: hotspot.routerId || undefined,
          routerKey: hotspot.routerKey || undefined,
          hotspotServerName: hotspot.hotspotServerName || undefined,
        }),
      })
      const body = await response.json().catch(() => ({})) as PortalRedeemVoucherResponse & { message?: string }
      if (!response.ok) throw new Error(body.message || 'Voucher could not be redeemed.')
      setVoucherCode('')
      setMessage(`Voucher ${body.voucher.code} activated successfully.`)
      if (body.accessToken) localStorage.setItem(PORTAL_TOKEN_KEY, body.accessToken)
      if (body.reconnect?.username && body.reconnect.password) window.setTimeout(() => reconnect(body.reconnect), 120)
      else await loadContext(hotspot, body.accessToken, phoneNumber)
    } catch (caught) { setError(caught instanceof Error ? caught.message : 'Voucher redemption failed.') }
    finally { setBusy('') }
  }

  async function startTrial(pkg: PortalPackage) {
    setError(''); setMessage(''); setBusy(`trial-${pkg.id}`)
    try {
      const response = await apiFetch('/api/portal/start-trial', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ packageId: pkg.id, macAddress: hotspot.macAddress || undefined, clientIp: hotspot.clientIp || undefined, routerId: hotspot.routerId || undefined, routerKey: hotspot.routerKey || undefined, hotspotServerName: hotspot.hotspotServerName || undefined, loginUrl: hotspot.loginUrl || undefined }),
      })
      const body = await response.json().catch(() => ({})) as RecoveryResponse
      if (!response.ok) throw new Error(body.message || 'Unable to start the free trial.')
      setMessage('Free trial activated. Connecting now…')
      if (!reconnect(body.reconnect)) await loadContext(hotspot)
    } catch (caught) { setError(caught instanceof Error ? caught.message : 'Unable to start the free trial.') }
    finally { setBusy('') }
  }

  async function initiatePayment(event: FormEvent) {
    event.preventDefault()
    if (!checkoutPackage) return
    setError(''); setMessage('')
    if (!phoneNumber.trim()) return setError('Enter the Mobile Money number that will approve payment.')
    const tvTarget = isTvPackage(checkoutPackage) ? normalizeMac(tvMac) : ''
    if (isTvPackage(checkoutPackage) && !/^(?:[A-F0-9]{2}:){5}[A-F0-9]{2}$/.test(tvTarget)) return setError('Enter a valid Smart TV wireless MAC address.')
    setBusy('payment')
    try {
      const normalizedPhone = normalizePhone(phoneNumber)
      const response = await apiFetch('/api/payments/portal/initiate', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ packageId: checkoutPackage.id, phoneNumber: normalizedPhone, customerReference: normalizedPhone, network, idempotencyKey: randomKey(), macAddress: tvTarget || hotspot.macAddress || undefined, clientIp: hotspot.clientIp || undefined, loginUrl: hotspot.loginUrl || undefined, routerId: hotspot.routerId || undefined, routerKey: hotspot.routerKey || undefined, hotspotServerName: hotspot.hotspotServerName || undefined }),
      })
      const body = await response.json().catch(() => ({})) as PortalPayment & { message?: string }
      if (!response.ok) throw new Error(body.message || 'Unable to start Mobile Money payment.')
      setPayment(body)
      if (body.status === 'FAILED') {
        setBusy(''); setError(safeProviderMessage(body)); return
      }
      setMessage(body.activation ? 'Payment confirmed.' : 'Payment request sent. Approve the Mobile Money prompt on your phone.')
      if (body.activation) {
        setBusy(''); setCheckoutPackage(null)
        if (body.reconnect?.username && body.reconnect.password) reconnect(body.reconnect)
      }
    } catch (caught) { setBusy(''); setError(caught instanceof Error ? caught.message : 'Payment request failed.') }
  }

  async function recoverVoucher(event: FormEvent) {
    event.preventDefault(); setError(''); setMessage('')
    if (!recoverReference.trim()) return setError('Enter the phone number or transaction ID used for the purchase.')
    setBusy('recover')
    try {
      const response = await apiFetch('/api/portal/recover-voucher', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ transactionId: recoverReference.trim(), routerKey: hotspot.routerKey || undefined, macAddress: hotspot.macAddress || undefined, ipAddress: hotspot.clientIp || undefined, routerId: hotspot.routerId || undefined, hotspotServerName: hotspot.hotspotServerName || undefined, loginUrl: hotspot.loginUrl || undefined }),
      })
      const body = await response.json().catch(() => ({})) as RecoveryResponse
      if (!response.ok) throw new Error(body.message || 'No active access could be recovered.')
      setMessage(body.message || 'Access recovered. Connecting this device now…')
      reconnect(body.reconnect)
    } catch (caught) { setError(caught instanceof Error ? caught.message : 'Recovery failed.') }
    finally { setBusy('') }
  }

  function openCheckout(pkg: PortalPackage, preferred?: MobileNetwork) {
    if (preferred && networks.includes(preferred)) setNetwork(preferred)
    setCheckoutPackage(pkg); setPayment(null); setError(''); setMessage(''); setBusy('')
  }

  return (
    <main className="min-h-screen bg-[#eef4fb] text-[#0b1739] sm:px-3 sm:py-3">
      <section className="mx-auto w-full max-w-[880px] overflow-hidden bg-white shadow-[0_18px_55px_rgba(7,26,73,0.10)] sm:rounded-[24px]">
        <header className="relative min-h-[168px] overflow-hidden bg-[#071A49] px-5 pb-5 pt-4 text-white sm:min-h-[190px] sm:px-7 sm:pb-6 sm:pt-5">
          <div className="absolute inset-0 opacity-90" style={{ background: 'radial-gradient(circle at 82% 18%, rgba(0,215,244,.30), transparent 28%), linear-gradient(130deg,#020b26 0%,#071A49 58%,#0a37a3 100%)' }} />
          <div className="relative z-10 flex items-center justify-between gap-3">
            <img src={logo} alt={`${tenantName} logo`} className="h-9 max-w-[150px] object-contain object-left drop-shadow-sm sm:h-11 sm:max-w-[190px]" />
            <button type="button" className="flex items-center gap-1.5 rounded-full border border-white/20 bg-white/5 px-2.5 py-1.5 text-[11px] font-semibold backdrop-blur"><Globe2 className="h-3.5 w-3.5" /> English <span aria-hidden>⌄</span></button>
          </div>
          <div className="relative z-10 mt-5 max-w-[470px] pr-20 sm:mt-6 sm:pr-36">
            <h1 className="text-[27px] font-extrabold tracking-tight sm:text-[34px]">Connect to Wi-Fi</h1>
            <p className="mt-1.5 flex items-center gap-2 text-xs text-blue-100 sm:text-sm"><ShieldCheck className="h-4 w-4 text-cyan-300" /> Fast, secure internet access</p>
            <p className="mt-2 truncate text-[11px] text-blue-200/80 sm:text-xs">{tenantName}</p>
          </div>
          <div className="absolute bottom-4 right-5 z-10 flex h-20 w-20 items-center justify-center sm:right-8 sm:h-28 sm:w-28">
            <span className="absolute h-16 w-16 animate-ping rounded-full border border-cyan-300/20 [animation-duration:2.4s] sm:h-24 sm:w-24" />
            <span className="absolute h-12 w-12 animate-pulse rounded-full bg-cyan-400/10 sm:h-16 sm:w-16" />
            <Wifi className="relative h-12 w-12 animate-pulse text-cyan-300 drop-shadow-[0_0_14px_rgba(0,220,255,.7)] sm:h-16 sm:w-16" strokeWidth={2.6} />
          </div>
        </header>

        <nav className="no-scrollbar grid grid-cols-5 border-b border-slate-200 bg-white px-1" aria-label="Portal sections">
          {([
            ['voucher', Ticket, 'Voucher'],
            ['multi', Laptop2, 'Multi-Device'],
            ['tv', Monitor, 'TV'],
            ['recover', Search, 'Find Voucher'],
            ['promo', Gift, 'Promo'],
          ] as const).map(([id, Icon, label]) => (
            <button key={id} type="button" onClick={() => { setTab(id); setError(''); setMessage('') }} className={`relative flex min-w-0 flex-col items-center gap-1 px-1 py-2.5 text-[9px] font-semibold leading-tight transition sm:py-3 sm:text-[11px] ${tab === id ? 'text-[#0964FA]' : 'text-slate-500'}`}>
              <Icon className="h-4.5 w-4.5 sm:h-5 sm:w-5" strokeWidth={2.2} />
              <span className="truncate">{label}</span>
              {tab === id && <span className="absolute bottom-0 h-[2.5px] w-10 rounded-full bg-[#0964FA] sm:w-14" />}
            </button>
          ))}
        </nav>

        <div className="space-y-3 bg-[#f8fbff] p-3 sm:p-5">
          {error && <div className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2.5 text-xs font-semibold text-rose-700 sm:text-sm">{error}</div>}
          {message && <div className="flex items-start gap-2 rounded-xl border border-blue-200 bg-blue-50 px-3 py-2.5 text-xs font-semibold text-blue-800 sm:text-sm"><CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />{message}</div>}
          {loading && <div className="flex min-h-36 items-center justify-center gap-2 rounded-2xl border border-blue-100 bg-white text-sm font-semibold text-slate-500"><Loader2 className="h-5 w-5 animate-spin text-[#0964FA]" /> Loading {tenantName}…</div>}

          {!loading && tab === 'voucher' && (
            <>
              <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-[0_5px_18px_rgba(7,26,73,.04)] sm:p-5">
                <h2 className="flex items-center gap-2 text-base font-extrabold sm:text-lg"><Ticket className="h-5 w-5 text-[#0964FA]" /> Have a voucher?</h2>
                <form onSubmit={redeemVoucher} className="mt-3 grid gap-2 sm:grid-cols-[1fr_auto]">
                  <div className="relative"><Ticket className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" /><input value={voucherCode} onChange={(e) => setVoucherCode(e.target.value)} placeholder="Enter voucher code" autoComplete="off" className="w-full rounded-xl border border-slate-200 bg-white py-3 pl-10 pr-3 text-sm outline-none transition focus:border-[#0964FA] focus:ring-4 focus:ring-blue-100" /></div>
                  <button disabled={busy === 'voucher'} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-[#0964FA] to-[#0646e6] px-6 text-sm font-bold text-white shadow-[0_8px_18px_rgba(9,100,250,.18)] disabled:opacity-60">{busy === 'voucher' ? <Loader2 className="h-4 w-4 animate-spin" /> : <>Connect Now <ArrowRight className="h-4 w-4" /></>}</button>
                </form>
                <p className="mt-2.5 flex items-center gap-1.5 text-[11px] font-medium text-slate-500"><LockKeyhole className="h-3.5 w-3.5" /> Secure & encrypted connection</p>
              </section>

              <PackageSection id="portal-plans" title="Choose Your Plan" subtitle="Flexible packages to suit your needs" packages={standardPackages} onBuy={openCheckout} empty="No standard internet packages are published right now." />

              {networks.length > 0 && (
                <section className="rounded-2xl border border-slate-200 bg-white p-4 sm:p-5">
                  <div className="mb-3"><h2 className="text-base font-extrabold">Mobile Money</h2><p className="mt-0.5 text-xs text-slate-500">Choose a plan above, then pay with your preferred network.</p></div>
                  <div className="grid grid-cols-2 gap-2.5">
                    {networks.includes('MTN') && <button type="button" onClick={() => setNetwork('MTN')} className={`rounded-xl border px-3 py-2.5 text-xs font-black ${network === 'MTN' ? 'border-[#071A49] bg-[#ffdd54] text-[#071A49]' : 'border-amber-200 bg-amber-50 text-[#071A49]'}`}>MTN MoMo</button>}
                    {networks.includes('AIRTEL') && <button type="button" onClick={() => setNetwork('AIRTEL')} className={`rounded-xl border px-3 py-2.5 text-xs font-black ${network === 'AIRTEL' ? 'border-[#e60012] bg-rose-50 text-[#e60012]' : 'border-rose-100 bg-white text-[#e60012]'}`}>Airtel Money</button>}
                  </div>
                </section>
              )}

              {trialPackage && <section className="rounded-2xl border border-cyan-200 bg-gradient-to-r from-blue-50 to-cyan-50 p-4"><div className="flex items-center justify-between gap-3"><div><div className="text-[10px] font-bold uppercase tracking-[.15em] text-cyan-700">Try AROFi</div><h3 className="mt-0.5 text-sm font-extrabold">{trialPackage.name}</h3><p className="mt-0.5 text-xs text-slate-600">{formatDuration(trialPackage.durationMinutes)} free trial.</p></div><button type="button" onClick={() => void startTrial(trialPackage)} disabled={busy === `trial-${trialPackage.id}`} className="rounded-xl bg-[#071A49] px-3 py-2.5 text-xs font-bold text-white">{busy === `trial-${trialPackage.id}` ? 'Starting…' : 'Start trial'}</button></div></section>}
            </>
          )}

          {!loading && tab === 'multi' && <PackageSection title="Multi-Device" subtitle="Connect several devices with one package" packages={multiPackages} onBuy={openCheckout} empty="No multi-device packages are configured for this Wi-Fi yet." multi />}

          {!loading && tab === 'tv' && (
            <section className="rounded-2xl border border-slate-200 bg-white p-4 sm:p-5">
              <div className="flex items-start gap-2.5"><div className="rounded-xl bg-blue-50 p-2.5 text-[#0964FA]"><Monitor className="h-5 w-5" /></div><div><h2 className="text-lg font-extrabold">Smart TV Access</h2><p className="mt-0.5 text-xs text-slate-500">Pay from a phone for a TV that cannot open this portal.</p></div></div>
              <div className="mt-4"><PackageCards packages={tvPackages} onBuy={openCheckout} empty="No Smart TV packages are published right now." /></div>
            </section>
          )}

          {!loading && tab === 'recover' && (
            <section className="rounded-2xl border border-slate-200 bg-white p-4 sm:p-5">
              <div className="flex items-start gap-2.5"><div className="rounded-xl bg-blue-50 p-2.5 text-[#0964FA]"><Search className="h-5 w-5" /></div><div><h2 className="text-lg font-extrabold">Find My Voucher</h2><p className="mt-0.5 text-xs text-slate-500">Recover active access using your phone number or transaction ID.</p></div></div>
              <form onSubmit={recoverVoucher} className="mt-4 grid gap-2 sm:grid-cols-[1fr_auto]"><input value={recoverReference} onChange={(e) => setRecoverReference(e.target.value)} placeholder="Phone number or Transaction ID" className="rounded-xl border border-slate-200 px-3.5 py-3 text-sm outline-none focus:border-[#0964FA] focus:ring-4 focus:ring-blue-100" /><button disabled={busy === 'recover'} className="rounded-xl bg-[#0964FA] px-5 py-3 text-sm font-bold text-white disabled:opacity-60">{busy === 'recover' ? 'Recovering…' : 'Recover Voucher'}</button></form>
            </section>
          )}

          {!loading && tab === 'promo' && <section className="rounded-2xl border border-slate-200 bg-white p-5 text-center"><Gift className="mx-auto h-7 w-7 text-[#0964FA]" /><h2 className="mt-2 text-lg font-extrabold">Promotions</h2><p className="mx-auto mt-1 max-w-md text-xs leading-5 text-slate-500">Active Wi-Fi promotions will appear here when the operator publishes them.</p></section>}

          {!loading && (supportPhone || supportEmail) && (
            <section className="rounded-2xl border border-slate-200 bg-white p-4"><h2 className="text-sm font-extrabold">Need Help?</h2><div className="mt-3 grid gap-2 sm:grid-cols-3">{supportPhone && <a href={`tel:${supportPhone}`} className="flex items-center gap-2 rounded-xl bg-slate-50 p-3"><Phone className="h-4 w-4 text-[#0964FA]" /><strong className="text-xs">{supportPhone}</strong></a>}{supportPhone && <a href={supportWhatsApp(supportPhone)} target="_blank" rel="noreferrer" className="flex items-center gap-2 rounded-xl bg-emerald-50 p-3"><Smartphone className="h-4 w-4 text-emerald-600" /><strong className="text-xs">WhatsApp</strong></a>}{supportEmail && <a href={`mailto:${supportEmail}`} className="flex min-w-0 items-center gap-2 rounded-xl bg-slate-50 p-3"><Mail className="h-4 w-4 shrink-0 text-[#0964FA]" /><strong className="truncate text-xs">{supportEmail}</strong></a>}</div></section>
          )}
        </div>

        <footer className="border-t border-slate-100 bg-white px-4 py-3 text-center text-[10px] text-slate-500"><div className="flex items-center justify-center gap-1.5"><ShieldCheck className="h-3.5 w-3.5 text-[#071A49]" /> Secure payments powered by AROFi</div></footer>
      </section>

      {checkoutPackage && (
        <div className="fixed inset-0 z-50 grid place-items-center overflow-y-auto bg-[#071A49]/70 p-3 backdrop-blur-sm" onMouseDown={(e) => { if (e.target === e.currentTarget && busy !== 'payment') setCheckoutPackage(null) }}>
          <div className="w-full max-w-sm rounded-[22px] bg-white p-4 shadow-2xl sm:p-5">
            <div className="flex items-start justify-between gap-3"><div><div className="text-[10px] font-bold uppercase tracking-[.15em] text-[#0964FA]">Checkout</div><h2 className="mt-0.5 text-lg font-extrabold">{checkoutPackage.name}</h2><p className="mt-0.5 text-xs text-slate-500">{formatDuration(checkoutPackage.durationMinutes)} · {formatMoney(checkoutPackage.amountUgx)}</p></div><button type="button" onClick={() => busy !== 'payment' && setCheckoutPackage(null)} className="rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-bold text-slate-500">✕</button></div>
            <form onSubmit={initiatePayment} className="mt-4 space-y-3">
              {isTvPackage(checkoutPackage) && <label className="block text-xs font-bold">Smart TV Wireless MAC<input value={tvMac} onChange={(e) => setTvMac(normalizeMac(e.target.value))} placeholder="AA:BB:CC:DD:EE:FF" className="mt-1.5 w-full rounded-xl border border-slate-200 px-3.5 py-3 text-sm outline-none focus:border-[#0964FA] focus:ring-4 focus:ring-blue-100" /></label>}
              <label className="block text-xs font-bold">Mobile Money Number<input type="tel" value={phoneNumber} onChange={(e) => setPhoneNumber(e.target.value)} placeholder="07XX XXX XXX" className="mt-1.5 w-full rounded-xl border border-slate-200 px-3.5 py-3 text-sm outline-none focus:border-[#0964FA] focus:ring-4 focus:ring-blue-100" /></label>
              <div className="grid grid-cols-2 gap-2">{networks.includes('MTN') && <button type="button" onClick={() => setNetwork('MTN')} className={`rounded-xl border px-3 py-2.5 text-xs font-black ${network === 'MTN' ? 'border-[#071A49] bg-[#ffdd54] text-[#071A49]' : 'border-slate-200 bg-white text-slate-500'}`}>MTN MoMo</button>}{networks.includes('AIRTEL') && <button type="button" onClick={() => setNetwork('AIRTEL')} className={`rounded-xl border px-3 py-2.5 text-xs font-black ${network === 'AIRTEL' ? 'border-[#e60012] bg-rose-50 text-[#e60012]' : 'border-slate-200 bg-white text-slate-500'}`}>Airtel Money</button>}</div>
              {payment && PENDING_STATUSES.includes(payment.status) && <div className="flex items-center gap-2 rounded-xl border border-blue-200 bg-blue-50 p-2.5 text-xs font-semibold text-blue-800"><Loader2 className="h-4 w-4 animate-spin" /> Waiting for Mobile Money approval…</div>}
              {payment?.status === 'TIMED_OUT' && <div className="rounded-xl border border-amber-200 bg-amber-50 p-2.5 text-xs font-semibold text-amber-800">Payment confirmation timed out. Check Find My Voucher before trying again.</div>}
              <button disabled={busy === 'payment'} className="flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-[#0964FA] to-[#0646e6] px-4 py-3.5 text-sm font-extrabold text-white shadow-[0_10px_24px_rgba(9,100,250,.20)] disabled:opacity-60">{busy === 'payment' ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowRight className="h-4 w-4" />} {busy === 'payment' ? 'Waiting for PIN…' : `Pay ${formatMoney(checkoutPackage.amountUgx)}`}</button>
            </form>
          </div>
        </div>
      )}
    </main>
  )
}

function PackageSection({ id, title, subtitle, packages, onBuy, empty, multi = false }: { id?: string; title: string; subtitle: string; packages: PortalPackage[]; onBuy: (pkg: PortalPackage) => void; empty: string; multi?: boolean }) {
  return <section id={id} className="rounded-2xl border border-slate-200 bg-white p-4 sm:p-5"><div className="flex items-center gap-2.5"><div className="rounded-xl bg-blue-50 p-2 text-[#0964FA]">{multi ? <Laptop2 className="h-5 w-5" /> : <Ticket className="h-5 w-5" />}</div><div><h2 className="text-base font-extrabold sm:text-lg">{title}</h2><p className="text-xs text-slate-500">{subtitle}</p></div></div><div className="mt-3"><PackageCards packages={packages} onBuy={onBuy} empty={empty} multi={multi} /></div></section>
}

function PackageCards({ packages, onBuy, empty, multi = false }: { packages: PortalPackage[]; onBuy: (pkg: PortalPackage) => void; empty: string; multi?: boolean }) {
  if (packages.length === 0) return <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 p-4 text-center text-xs text-slate-500">{empty}</div>
  return <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3">{packages.map((pkg) => <article key={pkg.id} className="flex min-h-[154px] min-w-0 flex-col rounded-xl border border-slate-200 bg-white p-3 shadow-[0_3px_12px_rgba(7,26,73,.04)]"><div className="flex items-start justify-between gap-1"><div className="flex h-8 w-8 items-center justify-center rounded-full bg-blue-50 text-[#0964FA]">{multi ? <Laptop2 className="h-4 w-4" /> : isTvPackage(pkg) ? <Monitor className="h-4 w-4" /> : <Wifi className="h-4 w-4" />}</div>{pkg.isFeatured && <span className="rounded-full bg-cyan-50 px-1.5 py-0.5 text-[8px] font-bold uppercase text-cyan-700">Popular</span>}</div><h3 className="mt-2 truncate text-sm font-extrabold">{pkg.name}</h3><p className="mt-0.5 text-[10px] text-slate-500">{formatDuration(pkg.durationMinutes)}{(pkg.deviceLimit ?? 1) > 1 ? ` · ${pkg.deviceLimit} devices` : ''}</p><div className="mt-1.5 text-[15px] font-black text-[#0646e6] sm:text-lg">{formatMoney(pkg.amountUgx)}</div><button type="button" onClick={() => onBuy(pkg)} className="mt-auto w-full rounded-lg bg-gradient-to-r from-[#0964FA] to-[#0646e6] px-2 py-2 text-[11px] font-bold text-white sm:text-xs">Buy Now</button></article>)}</div>
}
