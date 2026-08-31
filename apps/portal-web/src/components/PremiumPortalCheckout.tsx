'use client'

import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import {
  ArrowRight,
  CalendarDays,
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
  Users,
  Wifi,
} from 'lucide-react'
import type {
  PortalContextResponse,
  PortalLoginResponse,
  PortalPackage,
  PortalPayment,
  PortalRedeemVoucherResponse,
} from '../lib/portal-types'

type TabId = 'voucher' | 'member' | 'multi' | 'tv' | 'recover' | 'promo'
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

type RecoveryResponse = {
  message?: string
  reconnect?: {
    loginUrl?: string | null
    username?: string | null
    password?: string | null
    method?: string
  } | null
}

const API_FALLBACKS = ['https://arofi.net/api', 'http://95.111.234.34:18080/api']
const portalStorageKey = 'arofi.portal.access_token'
const pendingStatuses = ['INITIATED', 'PENDING', 'INDETERMINATE', 'PROCESSING']

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
  const candidates = [
    path,
    ...(configured ? [`${configured}${suffix}`] : []),
    ...API_FALLBACKS.map((base) => `${base}${suffix}`),
  ].filter((value, index, all) => all.indexOf(value) === index)

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
  try {
    return crypto.randomUUID()
  } catch {
    return `portal-${Date.now()}-${Math.random().toString(36).slice(2)}`
  }
}

export default function PremiumPortalCheckout() {
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
  const accent = context?.tenant.brandColor?.trim() || '#0964FA'

  const reconnect = useCallback((payload?: { loginUrl?: string | null; username?: string | null; password?: string | null } | null) => {
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
        input.type = 'hidden'
        input.name = name
        input.value = value
        form.appendChild(input)
      }
      document.body.appendChild(form)
      form.submit()
      return true
    } catch {
      return false
    }
  }, [hotspot.loginUrl])

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
        setMessage('Welcome back. Your active package is being reconnected.')
        window.setTimeout(() => reconnect(returning), 150)
      }
    }
    return data
  }, [hotspot, reconnect])

  useEffect(() => {
    const detected = readHotspotParams()
    setHotspot(detected)
    const query = new URLSearchParams(window.location.search)
    const qrVoucher = query.get('voucher') || query.get('code')
    if (qrVoucher) setVoucherCode(normalizeVoucher(qrVoucher))
    const storedToken = localStorage.getItem(portalStorageKey)
    void loadContext(detected, storedToken)
      .catch((caught) => setError(caught instanceof Error ? caught.message : 'Unable to load the portal.'))
      .finally(() => setLoading(false))
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (!payment || !pendingStatuses.includes(payment.status)) return
    const timer = window.setInterval(async () => {
      try {
        const token = payment.statusToken ? `?token=${encodeURIComponent(payment.statusToken)}` : ''
        const response = await apiFetch(`/api/payments/${payment.id}/check-status${token}`, { method: 'POST' })
        if (!response.ok) return
        const fresh = await response.json() as PortalPayment
        setPayment(fresh)
        if (fresh.status === 'FAILED') {
          setError(fresh.statusMessage || 'Payment was not completed.')
          setBusy('')
        }
        if (fresh.activation) {
          setBusy('')
          setCheckoutPackage(null)
          if (isTvPackage(fresh.package as unknown as PortalPackage)) {
            setMessage('Payment confirmed. Reconnect the Smart TV to this Wi-Fi.')
          } else if (fresh.reconnect?.username && fresh.reconnect.password) {
            setMessage('Payment confirmed. Connecting this device now…')
            reconnect(fresh.reconnect)
          } else {
            setMessage('Payment confirmed. Your package is active.')
          }
          void loadContext(hotspot, localStorage.getItem(portalStorageKey), fresh.phoneNumber)
        }
      } catch {}
    }, 2600)
    return () => window.clearInterval(timer)
  }, [payment, hotspot, loadContext, reconnect])

  async function redeemVoucher(event: FormEvent) {
    event.preventDefault()
    setError(''); setMessage('')
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
      if (body.accessToken) localStorage.setItem(portalStorageKey, body.accessToken)
      if (body.reconnect?.username && body.reconnect.password) {
        window.setTimeout(() => reconnect(body.reconnect), 180)
      } else {
        await loadContext(hotspot, body.accessToken, phoneNumber)
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Voucher redemption failed.')
    } finally { setBusy('') }
  }

  async function startTrial(pkg: PortalPackage) {
    setError(''); setMessage(''); setBusy(`trial-${pkg.id}`)
    try {
      const response = await apiFetch('/api/portal/start-trial', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          packageId: pkg.id,
          macAddress: hotspot.macAddress || undefined,
          clientIp: hotspot.clientIp || undefined,
          routerId: hotspot.routerId || undefined,
          routerKey: hotspot.routerKey || undefined,
          hotspotServerName: hotspot.hotspotServerName || undefined,
          loginUrl: hotspot.loginUrl || undefined,
        }),
      })
      const body = await response.json().catch(() => ({})) as { message?: string; reconnect?: RecoveryResponse['reconnect'] }
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
        body: JSON.stringify({
          packageId: checkoutPackage.id,
          phoneNumber: normalizedPhone,
          customerReference: normalizedPhone,
          network,
          idempotencyKey: randomKey(),
          macAddress: tvTarget || hotspot.macAddress || undefined,
          clientIp: hotspot.clientIp || undefined,
          loginUrl: hotspot.loginUrl || undefined,
          routerId: hotspot.routerId || undefined,
          routerKey: hotspot.routerKey || undefined,
          hotspotServerName: hotspot.hotspotServerName || undefined,
        }),
      })
      const body = await response.json().catch(() => ({})) as PortalPayment & { message?: string }
      if (!response.ok) throw new Error(body.message || 'Unable to start Mobile Money payment.')
      setPayment(body)
      setMessage(body.activation ? 'Payment confirmed.' : 'Payment request sent. Approve the Mobile Money prompt on your phone.')
      if (body.activation) {
        setBusy('')
        setCheckoutPackage(null)
        if (body.reconnect?.username && body.reconnect.password) reconnect(body.reconnect)
      }
    } catch (caught) {
      setBusy('')
      setError(caught instanceof Error ? caught.message : 'Payment request failed.')
    }
  }

  async function recoverVoucher(event: FormEvent) {
    event.preventDefault(); setError(''); setMessage('')
    if (!recoverReference.trim()) return setError('Enter the phone number or transaction ID used for the purchase.')
    setBusy('recover')
    try {
      const response = await apiFetch('/api/portal/recover-voucher', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          transactionId: recoverReference.trim(),
          routerKey: hotspot.routerKey || undefined,
          macAddress: hotspot.macAddress || undefined,
          ipAddress: hotspot.clientIp || undefined,
          routerId: hotspot.routerId || undefined,
          hotspotServerName: hotspot.hotspotServerName || undefined,
          loginUrl: hotspot.loginUrl || undefined,
        }),
      })
      const body = await response.json().catch(() => ({})) as RecoveryResponse & { message?: string }
      if (!response.ok) throw new Error(body.message || 'No active access could be recovered.')
      setMessage(body.message || 'Access recovered. Connecting this device now…')
      reconnect(body.reconnect)
    } catch (caught) { setError(caught instanceof Error ? caught.message : 'Recovery failed.') }
    finally { setBusy('') }
  }

  async function memberLogin(event: FormEvent) {
    event.preventDefault(); setError(''); setMessage('')
    if (!phoneNumber.trim()) return setError('Enter the phone number used to buy or redeem access.')
    setBusy('member')
    try {
      const response = await apiFetch('/api/portal/login', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phoneNumber: normalizePhone(phoneNumber) }),
      })
      const body = await response.json().catch(() => ({})) as PortalLoginResponse & { message?: string }
      if (!response.ok) throw new Error(body.message || 'Unable to find an active member session.')
      localStorage.setItem(portalStorageKey, body.accessToken)
      setMessage(body.session.summary.hasActiveAccess ? `Welcome back. ${body.session.summary.activeMinutesRemaining} minutes remain.` : 'Account found. There is no active package on this number right now.')
      await loadContext(hotspot, body.accessToken, body.session.customer.phoneNumber)
    } catch (caught) { setError(caught instanceof Error ? caught.message : 'Member sign-in failed.') }
    finally { setBusy('') }
  }

  function openCheckout(pkg: PortalPackage, preferred?: MobileNetwork) {
    if (preferred && networks.includes(preferred)) setNetwork(preferred)
    setCheckoutPackage(pkg)
    setPayment(null)
    setError(''); setMessage('')
  }

  return (
    <main className="min-h-screen bg-[#f3f7fc] px-0 py-0 text-[#0b1739] sm:px-4 sm:py-6">
      <section className="mx-auto w-full max-w-[880px] overflow-hidden bg-white shadow-[0_24px_70px_rgba(7,26,73,0.12)] sm:rounded-[32px]">
        <header className="relative min-h-[260px] overflow-hidden bg-[#071A49] px-6 pb-8 pt-6 text-white sm:px-10 sm:pb-10 sm:pt-8">
          <div className="absolute inset-0 opacity-80" style={{ background: 'radial-gradient(circle at 80% 15%, rgba(0,196,235,.28), transparent 32%), linear-gradient(130deg,#020b26 0%,#071A49 58%,#0a37a3 100%)' }} />
          <div className="absolute -right-14 top-20 h-48 w-48 rounded-full border border-cyan-300/20" />
          <div className="absolute -right-2 top-24 h-36 w-36 rounded-full border border-blue-300/20" />
          <div className="relative z-10 flex items-start justify-between gap-3">
            <img src={logo} alt={`${tenantName} logo`} className="h-12 max-w-[190px] object-contain object-left drop-shadow-sm sm:h-14 sm:max-w-[240px]" />
            <button type="button" className="flex items-center gap-2 rounded-full border border-white/25 bg-white/5 px-3 py-2 text-xs font-semibold backdrop-blur sm:text-sm">
              <Globe2 className="h-4 w-4" /> English <span aria-hidden>⌄</span>
            </button>
          </div>
          <div className="relative z-10 mt-10 max-w-[480px]">
            <h1 className="text-[32px] font-extrabold tracking-tight sm:text-[42px]">Connect to Wi-Fi</h1>
            <p className="mt-2 flex items-center gap-2 text-sm text-blue-100 sm:text-base"><ShieldCheck className="h-5 w-5 text-cyan-300" /> Fast, secure internet access</p>
            <p className="mt-3 max-w-sm text-xs leading-5 text-blue-200/80">{tenantName}</p>
          </div>
          <div className="absolute bottom-3 right-8 hidden sm:block">
            <div className="relative flex h-36 w-44 items-end justify-center">
              <div className="absolute top-0 text-cyan-300 drop-shadow-[0_0_18px_rgba(0,196,235,.55)]"><Wifi className="h-24 w-24" strokeWidth={2.8} /></div>
              <div className="mb-1 h-12 w-36 rounded-[24px] border border-blue-300/50 bg-gradient-to-b from-blue-500 to-[#092467] shadow-[0_0_28px_rgba(9,100,250,.55)]">
                <div className="mt-8 flex justify-center gap-3"><i className="h-2 w-2 rounded-full bg-cyan-300" /><i className="h-2 w-2 rounded-full bg-cyan-300" /><i className="h-2 w-2 rounded-full bg-cyan-300" /></div>
              </div>
            </div>
          </div>
        </header>

        <nav className="no-scrollbar flex overflow-x-auto border-b border-slate-200 bg-white px-2 sm:px-5" aria-label="Portal sections">
          {([
            ['voucher', Ticket, 'Voucher'], ['member', Users, 'Member'], ['multi', Laptop2, 'Multi-Device'], ['tv', Monitor, 'TV'], ['recover', Search, 'Find My Voucher'], ['promo', Gift, 'Promo'],
          ] as const).map(([id, Icon, label]) => (
            <button key={id} type="button" onClick={() => { setTab(id); setError(''); setMessage('') }} className={`relative flex min-w-[100px] flex-1 flex-col items-center gap-1 px-2 py-4 text-[11px] font-semibold transition sm:text-xs ${tab === id ? 'text-[#0964FA]' : 'text-slate-500'}`}>
              <Icon className="h-5 w-5" /> {label}
              {tab === id && <span className="absolute bottom-0 h-[3px] w-16 rounded-full bg-[#0964FA]" />}
            </button>
          ))}
        </nav>

        <div className="space-y-4 bg-[#f8fbff] p-4 sm:p-6 md:p-7" style={{ '--arofi-accent': accent } as React.CSSProperties}>
          {error && <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-700">{error}</div>}
          {message && <div className="flex items-start gap-2 rounded-2xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm font-semibold text-blue-800"><CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />{message}</div>}
          {loading && <div className="flex min-h-48 items-center justify-center gap-3 rounded-3xl border border-blue-100 bg-white text-sm font-semibold text-slate-500"><Loader2 className="h-5 w-5 animate-spin text-[#0964FA]" /> Loading {tenantName}…</div>}

          {!loading && tab === 'voucher' && (
            <>
              <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-[0_8px_26px_rgba(7,26,73,.05)] sm:p-6">
                <h2 className="flex items-center gap-3 text-lg font-extrabold"><Ticket className="h-6 w-6 text-[#0964FA]" /> Have a voucher?</h2>
                <form onSubmit={redeemVoucher} className="mt-4 grid gap-3 sm:grid-cols-[1fr_auto]">
                  <div className="relative"><Ticket className="absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400" /><input value={voucherCode} onChange={(e) => setVoucherCode(e.target.value)} placeholder="Enter voucher code" autoComplete="off" className="w-full rounded-2xl border border-slate-200 bg-white py-3.5 pl-12 pr-4 text-base outline-none transition focus:border-[#0964FA] focus:ring-4 focus:ring-blue-100" /></div>
                  <button disabled={busy === 'voucher'} className="inline-flex min-h-12 items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-[#0964FA] to-[#0646e6] px-7 font-bold text-white shadow-[0_10px_24px_rgba(9,100,250,.22)] disabled:opacity-60">{busy === 'voucher' ? <Loader2 className="h-4 w-4 animate-spin" /> : <>Connect Now <ArrowRight className="h-5 w-5" /></>}</button>
                </form>
                <p className="mt-4 flex items-center gap-2 text-xs font-medium text-slate-500"><LockKeyhole className="h-4 w-4" /> Secure & encrypted connection</p>
              </section>

              {networks.length > 0 && (
                <section className="rounded-3xl border border-slate-200 bg-white p-5 sm:p-6">
                  <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                    <div><h2 className="text-lg font-extrabold">Quick Pay</h2><p className="mt-1 text-sm text-slate-500">Pay instantly with Mobile Money</p></div>
                    <div className="grid grid-cols-2 gap-3 sm:min-w-[390px]">
                      {networks.includes('MTN') && <button type="button" onClick={() => { setNetwork('MTN'); document.getElementById('portal-plans')?.scrollIntoView({ behavior: 'smooth' }) }} className="rounded-2xl border border-amber-200 bg-[#ffdd54] px-4 py-3 text-sm font-black text-[#071A49]">MTN MoMo <ArrowRight className="ml-2 inline h-4 w-4" /></button>}
                      {networks.includes('AIRTEL') && <button type="button" onClick={() => { setNetwork('AIRTEL'); document.getElementById('portal-plans')?.scrollIntoView({ behavior: 'smooth' }) }} className="rounded-2xl border border-rose-100 bg-rose-50 px-4 py-3 text-sm font-black text-[#e60012]">Airtel Money <ArrowRight className="ml-2 inline h-4 w-4" /></button>}
                    </div>
                  </div>
                </section>
              )}

              <PackageSection id="portal-plans" title="Choose Your Plan" subtitle="Flexible packages to suit your needs" packages={standardPackages} onBuy={openCheckout} empty="No standard internet packages are published right now." />
              {trialPackage && <section className="rounded-3xl border border-cyan-200 bg-gradient-to-r from-blue-50 to-cyan-50 p-5 sm:p-6"><div className="flex items-center justify-between gap-4"><div><div className="text-xs font-bold uppercase tracking-[.15em] text-cyan-700">Try AROFi</div><h3 className="mt-1 text-lg font-extrabold">{trialPackage.name}</h3><p className="mt-1 text-sm text-slate-600">{formatDuration(trialPackage.durationMinutes)} free trial on this device.</p></div><button type="button" onClick={() => void startTrial(trialPackage)} disabled={busy === `trial-${trialPackage.id}`} className="rounded-xl bg-[#071A49] px-4 py-3 text-sm font-bold text-white">{busy === `trial-${trialPackage.id}` ? 'Starting…' : 'Start trial'}</button></div></section>}
            </>
          )}

          {!loading && tab === 'multi' && <PackageSection title="Multi-Device" subtitle="Connect multiple devices under one package" packages={multiPackages} onBuy={openCheckout} empty="No multi-device packages are configured for this Wi-Fi yet." multi />}

          {!loading && tab === 'tv' && (
            <section className="rounded-3xl border border-slate-200 bg-white p-5 sm:p-6">
              <div className="flex items-start gap-3"><div className="rounded-2xl bg-blue-50 p-3 text-[#0964FA]"><Monitor className="h-6 w-6" /></div><div><h2 className="text-xl font-extrabold">Smart TV Access</h2><p className="mt-1 text-sm text-slate-500">Connect a TV that cannot open the Wi-Fi payment portal</p></div></div>
              <div className="mt-5 grid gap-3 text-sm sm:grid-cols-4">{['Select a TV package','Enter the TV wireless MAC','Pay from your phone','Reconnect the TV to Wi-Fi'].map((step, i) => <div key={step} className="rounded-2xl bg-slate-50 p-3"><span className="mb-2 flex h-7 w-7 items-center justify-center rounded-full bg-[#0964FA] text-xs font-black text-white">{i + 1}</span>{step}</div>)}</div>
              <div className="mt-5"><PackageCards packages={tvPackages} onBuy={openCheckout} empty="No Smart TV packages are published right now." /></div>
            </section>
          )}

          {!loading && tab === 'member' && (
            <section className="rounded-3xl border border-slate-200 bg-white p-5 sm:p-7">
              <div className="mx-auto max-w-md text-center"><div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-blue-50 text-[#0964FA]"><Users className="h-7 w-7" /></div><h2 className="mt-4 text-2xl font-extrabold">Member Access</h2><p className="mt-2 text-sm leading-6 text-slate-500">Use the phone number you paid with or used when redeeming your voucher.</p></div>
              <form onSubmit={memberLogin} className="mx-auto mt-6 max-w-md space-y-3"><input type="tel" value={phoneNumber} onChange={(e) => setPhoneNumber(e.target.value)} placeholder="e.g. 07XX XXX XXX" className="w-full rounded-2xl border border-slate-200 px-4 py-3.5 text-base outline-none focus:border-[#0964FA] focus:ring-4 focus:ring-blue-100" /><button disabled={busy === 'member'} className="flex w-full items-center justify-center gap-2 rounded-2xl bg-[#0964FA] px-5 py-3.5 font-bold text-white disabled:opacity-60">{busy === 'member' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Smartphone className="h-5 w-5" />} Sign in & reconnect</button></form>
            </section>
          )}

          {!loading && tab === 'recover' && (
            <section className="rounded-3xl border border-slate-200 bg-white p-5 sm:p-7">
              <div className="flex items-start gap-3"><div className="rounded-2xl bg-blue-50 p-3 text-[#0964FA]"><Search className="h-6 w-6" /></div><div><h2 className="text-xl font-extrabold">Find My Voucher</h2><p className="mt-1 text-sm text-slate-500">Recover active access using your phone number or transaction ID</p></div></div>
              <form onSubmit={recoverVoucher} className="mt-6 grid gap-3 sm:grid-cols-[1fr_auto]"><input value={recoverReference} onChange={(e) => setRecoverReference(e.target.value)} placeholder="Phone number or Transaction ID" className="rounded-2xl border border-slate-200 px-4 py-3.5 outline-none focus:border-[#0964FA] focus:ring-4 focus:ring-blue-100" /><button disabled={busy === 'recover'} className="rounded-2xl bg-[#0964FA] px-6 py-3.5 font-bold text-white disabled:opacity-60">{busy === 'recover' ? 'Recovering…' : 'Recover Voucher'}</button></form>
            </section>
          )}

          {!loading && tab === 'promo' && (
            <section className="rounded-3xl border border-slate-200 bg-white p-7 text-center"><div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-blue-50 text-[#0964FA]"><Gift className="h-7 w-7" /></div><h2 className="mt-4 text-xl font-extrabold">Promotions</h2><p className="mx-auto mt-2 max-w-md text-sm leading-6 text-slate-500">There are no active portal promotions published for this Wi-Fi right now. AROFi will show configured promotions here rather than inventing offers.</p></section>
          )}

          {!loading && (supportPhone || supportEmail) && (
            <section className="rounded-3xl border border-slate-200 bg-white p-5 sm:p-6"><h2 className="text-lg font-extrabold">Need Help?</h2><p className="mt-1 text-sm text-slate-500">Our support team is here for you</p><div className="mt-5 grid gap-3 sm:grid-cols-3">{supportPhone && <a href={`tel:${supportPhone}`} className="flex items-center gap-3 rounded-2xl bg-slate-50 p-4"><Phone className="h-5 w-5 text-[#0964FA]" /><div><div className="text-xs text-slate-500">Call Us</div><strong className="text-sm">{supportPhone}</strong></div></a>}{supportPhone && <a href={supportWhatsApp(supportPhone)} target="_blank" rel="noreferrer" className="flex items-center gap-3 rounded-2xl bg-emerald-50 p-4"><Smartphone className="h-5 w-5 text-emerald-600" /><div><div className="text-xs text-slate-500">WhatsApp</div><strong className="text-sm">{supportPhone}</strong></div></a>}{supportEmail && <a href={`mailto:${supportEmail}`} className="flex items-center gap-3 rounded-2xl bg-slate-50 p-4"><Mail className="h-5 w-5 text-[#0964FA]" /><div className="min-w-0"><div className="text-xs text-slate-500">Email Us</div><strong className="block truncate text-sm">{supportEmail}</strong></div></a>}</div></section>
          )}
        </div>

        <footer className="border-t border-slate-100 bg-white px-5 py-5 text-center text-[11px] text-slate-500"><div className="flex items-center justify-center gap-2"><ShieldCheck className="h-4 w-4 text-[#071A49]" /> Secure payments powered by AROFi</div><div className="mt-1">© {new Date().getFullYear()} AROFi. All rights reserved.</div></footer>
      </section>

      {checkoutPackage && (
        <div className="fixed inset-0 z-50 grid place-items-center overflow-y-auto bg-[#071A49]/70 p-4 backdrop-blur-sm" onMouseDown={(e) => { if (e.target === e.currentTarget && busy !== 'payment') setCheckoutPackage(null) }}>
          <div className="w-full max-w-md rounded-[28px] bg-white p-5 shadow-2xl sm:p-6">
            <div className="flex items-start justify-between gap-4"><div><div className="text-xs font-bold uppercase tracking-[.15em] text-[#0964FA]">Checkout</div><h2 className="mt-1 text-xl font-extrabold">{checkoutPackage.name}</h2><p className="mt-1 text-sm text-slate-500">{formatDuration(checkoutPackage.durationMinutes)} · {formatMoney(checkoutPackage.amountUgx)}</p></div><button type="button" onClick={() => busy !== 'payment' && setCheckoutPackage(null)} className="rounded-xl border border-slate-200 px-3 py-2 text-sm font-bold text-slate-500">✕</button></div>
            <form onSubmit={initiatePayment} className="mt-5 space-y-4">
              {isTvPackage(checkoutPackage) && <label className="block text-sm font-bold">Smart TV Wireless MAC<input value={tvMac} onChange={(e) => setTvMac(normalizeMac(e.target.value))} placeholder="AA:BB:CC:DD:EE:FF" className="mt-2 w-full rounded-2xl border border-slate-200 px-4 py-3 outline-none focus:border-[#0964FA] focus:ring-4 focus:ring-blue-100" /><span className="mt-1 block text-xs font-normal leading-5 text-slate-500">Use the wireless MAC shown in the TV’s Wi-Fi details.</span></label>}
              <label className="block text-sm font-bold">Mobile Money Number<input type="tel" value={phoneNumber} onChange={(e) => setPhoneNumber(e.target.value)} placeholder="07XX XXX XXX" className="mt-2 w-full rounded-2xl border border-slate-200 px-4 py-3 outline-none focus:border-[#0964FA] focus:ring-4 focus:ring-blue-100" /></label>
              <div className="grid grid-cols-2 gap-3">{networks.includes('MTN') && <button type="button" onClick={() => setNetwork('MTN')} className={`rounded-2xl border px-4 py-3 text-sm font-black ${network === 'MTN' ? 'border-[#071A49] bg-[#ffdd54] text-[#071A49]' : 'border-slate-200 bg-white text-slate-500'}`}>MTN MoMo</button>}{networks.includes('AIRTEL') && <button type="button" onClick={() => setNetwork('AIRTEL')} className={`rounded-2xl border px-4 py-3 text-sm font-black ${network === 'AIRTEL' ? 'border-[#e60012] bg-rose-50 text-[#e60012]' : 'border-slate-200 bg-white text-slate-500'}`}>Airtel Money</button>}</div>
              {payment && pendingStatuses.includes(payment.status) && <div className="flex items-center gap-2 rounded-2xl border border-blue-200 bg-blue-50 p-3 text-sm font-semibold text-blue-800"><Loader2 className="h-4 w-4 animate-spin" /> Waiting for Mobile Money approval…</div>}
              <button disabled={busy === 'payment'} className="flex w-full items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-[#0964FA] to-[#0646e6] px-5 py-4 font-extrabold text-white shadow-[0_12px_28px_rgba(9,100,250,.22)] disabled:opacity-60">{busy === 'payment' ? <Loader2 className="h-5 w-5 animate-spin" /> : <ArrowRight className="h-5 w-5" />} {busy === 'payment' ? 'Waiting for PIN…' : `Pay ${formatMoney(checkoutPackage.amountUgx)}`}</button>
            </form>
          </div>
        </div>
      )}
    </main>
  )
}

function PackageSection({ id, title, subtitle, packages, onBuy, empty, multi = false }: { id?: string; title: string; subtitle: string; packages: PortalPackage[]; onBuy: (pkg: PortalPackage) => void; empty: string; multi?: boolean }) {
  return <section id={id} className="rounded-3xl border border-slate-200 bg-white p-5 sm:p-6"><div className="flex items-start gap-3"><div className="rounded-2xl bg-blue-50 p-3 text-[#0964FA]">{multi ? <Laptop2 className="h-6 w-6" /> : <CalendarDays className="h-6 w-6" />}</div><div><h2 className="text-xl font-extrabold">{title}</h2><p className="mt-1 text-sm text-slate-500">{subtitle}</p></div></div><div className="mt-5"><PackageCards packages={packages} onBuy={onBuy} empty={empty} multi={multi} /></div></section>
}

function PackageCards({ packages, onBuy, empty, multi = false }: { packages: PortalPackage[]; onBuy: (pkg: PortalPackage) => void; empty: string; multi?: boolean }) {
  if (packages.length === 0) return <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 p-6 text-center text-sm text-slate-500">{empty}</div>
  return <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{packages.map((pkg) => <article key={pkg.id} className="flex min-h-[190px] flex-col rounded-2xl border border-slate-200 bg-white p-4 shadow-[0_4px_16px_rgba(7,26,73,.04)]"><div className="flex items-start justify-between gap-2"><div className="flex h-10 w-10 items-center justify-center rounded-full bg-blue-50 text-[#0964FA]">{multi ? <Laptop2 className="h-5 w-5" /> : isTvPackage(pkg) ? <Monitor className="h-5 w-5" /> : <Wifi className="h-5 w-5" />}</div>{pkg.isFeatured && <span className="rounded-full bg-cyan-50 px-2 py-1 text-[10px] font-bold uppercase text-cyan-700">Popular</span>}</div><h3 className="mt-3 font-extrabold">{pkg.name}</h3><p className="mt-1 text-xs text-slate-500">{formatDuration(pkg.durationMinutes)}{(pkg.deviceLimit ?? 1) > 1 ? ` · Up to ${pkg.deviceLimit} devices` : ''}</p><div className="mt-2 text-xl font-black text-[#0646e6]">{formatMoney(pkg.amountUgx)}</div><button type="button" onClick={() => onBuy(pkg)} className="mt-auto w-full rounded-xl bg-gradient-to-r from-[#0964FA] to-[#0646e6] px-3 py-2.5 text-sm font-bold text-white">Buy Now</button></article>)}</div>
}
