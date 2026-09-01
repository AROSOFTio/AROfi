'use client'

import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { CheckCircle2, Copy, Loader2, RefreshCw, ShieldCheck, Ticket, Wifi } from 'lucide-react'
import type { PortalContextResponse, PortalPackage, PortalPayment, PortalRedeemVoucherResponse } from '../lib/portal-types'

type Network = 'MTN' | 'AIRTEL'
type AccessCredential = { username: string; password: string; expiresAt?: string | null; source: 'payment' | 'voucher' }
type RadiusContext = {
  routerId: string
  tenantDomain: string
  vendor: string
  macAddress: string
  clientIp: string
  continueUrl: string
}

const pendingStatuses = new Set(['INITIATED', 'PENDING', 'INDETERMINATE', 'PROCESSING'])
const PUBLIC_API_FALLBACKS = ['https://arofi.net/api', 'http://95.111.234.34:18080/api']

export default function RadiusPortalCheckout() {
  const [context, setContext] = useState<PortalContextResponse | null>(null)
  const [radiusContext, setRadiusContext] = useState<RadiusContext>({ routerId: '', tenantDomain: '', vendor: '', macAddress: '', clientIp: '', continueUrl: '' })
  const [packageId, setPackageId] = useState('')
  const [phone, setPhone] = useState('')
  const [network, setNetwork] = useState<Network>('MTN')
  const [voucherCode, setVoucherCode] = useState('')
  const [credential, setCredential] = useState<AccessCredential | null>(null)
  const [payment, setPayment] = useState<PortalPayment | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [copied, setCopied] = useState('')

  const selectedPackage = useMemo(() => context?.packages.find((item) => item.id === packageId) ?? context?.packages[0] ?? null, [context, packageId])
  const paidPackages = (context?.packages ?? []).filter((item) => !item.isTrialEnabled && item.amountUgx > 0)

  useEffect(() => {
    const detected = readRadiusContext()
    setRadiusContext(detected)
    void loadContext(detected)
  }, [])

  useEffect(() => {
    if (!payment || !pendingStatuses.has(payment.status)) return
    let stopped = false
    let timer: ReturnType<typeof window.setTimeout> | undefined

    const poll = async () => {
      if (stopped) return
      try {
        const token = payment.statusToken ? `?token=${encodeURIComponent(payment.statusToken)}` : ''
        const response = await portalApiFetch(`/api/payments/${payment.id}/check-status${token}`, { method: 'POST' })
        if (!response.ok) throw new Error('Could not confirm Mobile Money payment.')
        const next = (await response.json()) as PortalPayment
        if (stopped) return
        setPayment(next)
        if (next.status === 'COMPLETED') {
          const nextCredential = credentialFromPayment(next)
          if (nextCredential) {
            setCredential(nextCredential)
            setMessage('Payment confirmed. Your RADIUS WiFi credentials are ready.')
            setBusy(false)
            return
          }
          setMessage('Payment confirmed. AROFi is preparing the network credential...')
          timer = window.setTimeout(() => void poll(), 1800)
          return
        }
        if (!pendingStatuses.has(next.status)) {
          setError(next.statusMessage || 'Payment was not completed.')
          setBusy(false)
          return
        }
        timer = window.setTimeout(() => void poll(), 1800)
      } catch (caught) {
        if (stopped) return
        setError(caught instanceof Error ? caught.message : 'Could not confirm payment.')
        setBusy(false)
      }
    }

    timer = window.setTimeout(() => void poll(), 1400)
    return () => {
      stopped = true
      if (timer) window.clearTimeout(timer)
    }
  }, [payment?.id, payment?.status, payment?.statusToken])

  async function loadContext(detected: RadiusContext) {
    setError('')
    try {
      const query = new URLSearchParams()
      if (detected.routerId) query.set('routerId', detected.routerId)
      if (detected.tenantDomain) query.set('tenantDomain', detected.tenantDomain)
      if (detected.macAddress) query.set('mac', detected.macAddress)
      if (detected.clientIp) query.set('ip', detected.clientIp)
      const response = await portalApiFetch(`/api/portal/context?${query.toString()}`, { cache: 'no-store' })
      if (!response.ok) throw new Error('AROFi could not identify this WiFi business. Reopen the portal from the WiFi network.')
      const data = (await response.json()) as PortalContextResponse
      setContext(data)
      setPackageId((current) => current || data.packages.find((item) => !item.isTrialEnabled && item.amountUgx > 0)?.id || data.packages[0]?.id || '')
      if (data.paymentNetworks?.length) setNetwork(data.paymentNetworks[0])
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not load WiFi packages.')
    }
  }

  async function buy(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError('')
    setMessage('')
    setCredential(null)
    if (!selectedPackage) return setError('Choose a package.')
    if (!phone.trim()) return setError('Enter the Mobile Money phone number.')
    if (!radiusContext.routerId) return setError('Router identity is missing. Reopen this page from the WiFi sign-in screen.')

    setBusy(true)
    try {
      const response = await portalApiFetch('/api/payments/portal/initiate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          packageId: selectedPackage.id,
          phoneNumber: normalizePhone(phone),
          customerReference: normalizePhone(phone),
          network,
          idempotencyKey: crypto.randomUUID(),
          macAddress: radiusContext.macAddress || undefined,
          clientIp: radiusContext.clientIp || undefined,
          routerId: radiusContext.routerId,
        }),
      })
      const body = (await response.json().catch(() => ({}))) as PortalPayment & { message?: string }
      if (!response.ok) throw new Error(body.message || 'Could not start Mobile Money payment.')
      setPayment(body)
      const instantCredential = credentialFromPayment(body)
      if (body.status === 'COMPLETED' && instantCredential) {
        setCredential(instantCredential)
        setMessage('Payment confirmed. Your RADIUS WiFi credentials are ready.')
        setBusy(false)
      } else if (!pendingStatuses.has(body.status) && body.status !== 'COMPLETED') {
        setError(body.statusMessage || 'Payment was not completed.')
        setBusy(false)
      } else {
        setMessage('Approve the Mobile Money prompt on the paying phone.')
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not start payment.')
      setBusy(false)
    }
  }

  async function redeemVoucher(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError('')
    setMessage('')
    setCredential(null)
    const code = voucherCode.trim().replace(/\s+/g, '').toUpperCase()
    if (!code) return setError('Enter the voucher code.')
    if (!radiusContext.routerId) return setError('Router identity is missing. Reopen this page from the WiFi sign-in screen.')

    setBusy(true)
    try {
      const response = await portalApiFetch('/api/portal/redeem-voucher', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          code,
          phoneNumber: phone ? normalizePhone(phone) : undefined,
          customerReference: phone ? normalizePhone(phone) : undefined,
          macAddress: radiusContext.macAddress || undefined,
          clientIp: radiusContext.clientIp || undefined,
          routerId: radiusContext.routerId,
        }),
      })
      const body = (await response.json().catch(() => ({}))) as PortalRedeemVoucherResponse & { message?: string }
      if (!response.ok) throw new Error(body.message || 'Voucher redemption failed.')
      if (!body.reconnect?.username || !body.reconnect.password) {
        throw new Error('Voucher activated, but RADIUS credentials are not ready yet. Try again shortly.')
      }
      setCredential({ username: body.reconnect.username, password: body.reconnect.password, source: 'voucher' })
      setMessage(`Voucher ${body.voucher.code} activated. Use the credentials below on the WiFi login screen.`)
      setVoucherCode('')
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Voucher redemption failed.')
    } finally {
      setBusy(false)
    }
  }

  async function copy(label: string, value: string) {
    try {
      await navigator.clipboard.writeText(value)
      setCopied(label)
      window.setTimeout(() => setCopied(''), 1400)
    } catch {
      setCopied('')
    }
  }

  return (
    <main className="min-h-screen bg-slate-50 px-4 py-5 text-slate-900">
      <div className="mx-auto grid w-full max-w-md gap-4">
        <section className="overflow-hidden rounded-2xl bg-[#071A49] p-5 text-white shadow-lg">
          <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-[.16em] text-cyan-300"><Wifi size={15} /> AROFi RADIUS Access</div>
          <h1 className="mt-3 text-2xl font-black tracking-tight">Connect to {context?.tenant.name ?? 'WiFi'}</h1>
          <p className="mt-2 text-sm leading-6 text-slate-300">Pay or redeem with AROFi, then use the issued RADIUS credentials on this network&apos;s WiFi login screen.</p>
          <div className="mt-4 flex flex-wrap gap-2 text-[11px] text-slate-300">
            {radiusContext.vendor && <span className="rounded-full border border-white/15 px-2 py-1">{radiusContext.vendor.replaceAll('_', ' ')}</span>}
            {radiusContext.macAddress && <span className="rounded-full border border-white/15 px-2 py-1">Device {radiusContext.macAddress}</span>}
          </div>
        </section>

        {credential ? (
          <section className="rounded-2xl border border-emerald-200 bg-white p-5 shadow-sm">
            <div className="flex items-center gap-2 font-extrabold text-emerald-700"><CheckCircle2 size={20} /> Access ready</div>
            <p className="mt-2 text-sm leading-6 text-slate-600">Enter these credentials in the WiFi/RADIUS login form. They are tied to this paid activation and AROFi session policy.</p>
            <CredentialRow label="Username" value={credential.username} copied={copied === 'username'} onCopy={() => void copy('username', credential.username)} />
            <CredentialRow label="Password" value={credential.password} copied={copied === 'password'} onCopy={() => void copy('password', credential.password)} />
            {radiusContext.continueUrl && (
              <a href={radiusContext.continueUrl} className="mt-4 flex min-h-12 items-center justify-center rounded-xl bg-blue-600 px-4 text-sm font-extrabold text-white no-underline">Return to WiFi login</a>
            )}
            <button type="button" onClick={() => { setCredential(null); setPayment(null); setMessage('') }} className="mt-2 min-h-11 w-full rounded-xl border border-slate-200 bg-white text-sm font-bold text-slate-600">Buy another access</button>
          </section>
        ) : (
          <>
            <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="flex items-center gap-2 font-extrabold"><ShieldCheck size={18} className="text-blue-600" /> Buy internet access</div>
              <form onSubmit={buy} className="mt-4 grid gap-3">
                <label className="grid gap-1.5 text-xs font-bold text-slate-600">Package
                  <select value={packageId} onChange={(event) => setPackageId(event.target.value)} className="min-h-12 rounded-xl border border-slate-200 bg-white px-3 text-sm">
                    {paidPackages.map((item) => <option key={item.id} value={item.id}>{item.name} · {formatDuration(item.durationMinutes)} · {formatCurrency(item.amountUgx)}</option>)}
                  </select>
                </label>
                <label className="grid gap-1.5 text-xs font-bold text-slate-600">Mobile Money phone
                  <input value={phone} onChange={(event) => setPhone(event.target.value)} inputMode="tel" placeholder="07XX XXX XXX" className="min-h-12 rounded-xl border border-slate-200 px-3 text-sm" />
                </label>
                <div className="grid grid-cols-2 gap-2">
                  {(['MTN', 'AIRTEL'] as Network[]).map((item) => (
                    <button key={item} type="button" onClick={() => setNetwork(item)} className={`min-h-11 rounded-xl border text-sm font-extrabold ${network === item ? 'border-blue-600 bg-blue-50 text-blue-700' : 'border-slate-200 bg-white text-slate-600'}`}>{item === 'MTN' ? 'MTN MoMo' : 'Airtel Money'}</button>
                  ))}
                </div>
                <button disabled={busy || !selectedPackage} className="mt-1 flex min-h-12 items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 text-sm font-extrabold text-white disabled:opacity-50">
                  {busy && payment ? <><Loader2 size={16} className="animate-spin" /> Waiting for payment</> : `Pay ${selectedPackage ? formatCurrency(selectedPackage.amountUgx) : ''}`}
                </button>
              </form>
            </section>

            <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="flex items-center gap-2 font-extrabold"><Ticket size={18} className="text-cyan-600" /> Already have a voucher?</div>
              <form onSubmit={redeemVoucher} className="mt-3 grid gap-3">
                <input value={voucherCode} onChange={(event) => setVoucherCode(event.target.value)} placeholder="Enter voucher code" className="min-h-12 rounded-xl border border-slate-200 px-3 text-center font-mono text-sm font-bold uppercase tracking-wider" />
                <button disabled={busy} className="min-h-11 rounded-xl border border-blue-200 bg-blue-50 text-sm font-extrabold text-blue-700 disabled:opacity-50">Redeem voucher</button>
              </form>
            </section>
          </>
        )}

        {message && <div className="rounded-xl border border-blue-200 bg-blue-50 p-3 text-sm text-blue-700">{pendingStatuses.has(payment?.status ?? '') && <RefreshCw size={14} className="mr-2 inline animate-spin" />}{message}</div>}
        {error && <div className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">{error}</div>}
        <p className="px-2 text-center text-[11px] leading-5 text-slate-500">AROFi handles payment, voucher activation and RADIUS access. The router/controller remains responsible for presenting or returning to its own RADIUS login screen where required.</p>
      </div>
    </main>
  )
}

function CredentialRow({ label, value, copied, onCopy }: { label: string; value: string; copied: boolean; onCopy: () => void }) {
  return (
    <div className="mt-3 rounded-xl border border-slate-200 bg-slate-50 p-3">
      <div className="text-[10px] font-bold uppercase tracking-wider text-slate-500">{label}</div>
      <div className="mt-1 flex items-center justify-between gap-3"><strong className="break-all font-mono text-sm">{value}</strong><button type="button" onClick={onCopy} className="flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs font-bold text-slate-600"><Copy size={12} />{copied ? 'Copied' : 'Copy'}</button></div>
    </div>
  )
}

function readRadiusContext(): RadiusContext {
  if (typeof window === 'undefined') return { routerId: '', tenantDomain: '', vendor: '', macAddress: '', clientIp: '', continueUrl: '' }
  const params = new URLSearchParams(window.location.search)
  const first = (...keys: string[]) => keys.map((key) => params.get(key)?.trim()).find(Boolean) ?? ''
  return {
    routerId: first('routerId', 'router'),
    tenantDomain: first('tenant', 'tenantDomain', 'portal'),
    vendor: first('vendor'),
    macAddress: normalizeMac(first('mac', 'client_mac', 'clientMac', 'mac-address', 'sta', 'id')),
    clientIp: first('ip', 'client_ip', 'clientIp'),
    continueUrl: safeContinueUrl(first('continue', 'redirect', 'redirectUrl', 'url', 'target', 'originalUrl')),
  }
}

function credentialFromPayment(payment: PortalPayment): AccessCredential | null {
  if (payment.status !== 'COMPLETED' || !payment.reconnect?.username || !payment.reconnect.password) return null
  return { username: payment.reconnect.username, password: payment.reconnect.password, expiresAt: payment.reconnect.expiresAt, source: 'payment' }
}

function normalizeMac(value: string) {
  const compact = value.replace(/[^a-fA-F0-9]/g, '').toUpperCase()
  if (!/^[A-F0-9]{12}$/.test(compact)) return ''
  return compact.match(/.{1,2}/g)?.join(':') ?? ''
}

function safeContinueUrl(value: string) {
  if (!value) return ''
  try {
    const parsed = new URL(value)
    return ['http:', 'https:'].includes(parsed.protocol) ? parsed.toString() : ''
  } catch {
    return ''
  }
}

function normalizePhone(value: string) {
  const digits = value.replace(/\D/g, '')
  if (digits.startsWith('256')) return digits
  if (digits.startsWith('0')) return `256${digits.slice(1)}`
  return digits
}

function formatCurrency(value: number) {
  return `UGX ${new Intl.NumberFormat('en-UG').format(value)}`
}

function formatDuration(minutes: number) {
  if (minutes >= 1440 && minutes % 1440 === 0) return `${minutes / 1440} day${minutes === 1440 ? '' : 's'}`
  if (minutes >= 60 && minutes % 60 === 0) return `${minutes / 60} hour${minutes === 60 ? '' : 's'}`
  return `${minutes} min`
}

function normalizeApiBase(value?: string | null) {
  const trimmed = value?.trim().replace(/\/$/, '')
  if (!trimmed || trimmed === '/api') return null
  return trimmed.endsWith('/api') ? trimmed : `${trimmed}/api`
}

function isJsonResponse(response: Response) {
  return response.headers.get('content-type')?.toLowerCase().includes('application/json')
}

async function portalApiFetch(apiPath: string, init?: RequestInit) {
  const path = apiPath.startsWith('/api/') ? apiPath : `/api${apiPath.startsWith('/') ? apiPath : `/${apiPath}`}`
  const suffix = path.slice('/api'.length)
  const configuredBase = normalizeApiBase(process.env.NEXT_PUBLIC_API_URL)
  const candidates = [path, ...(configuredBase ? [`${configuredBase}${suffix}`] : []), ...PUBLIC_API_FALLBACKS.map((base) => `${base}${suffix}`)].filter((url, index, all) => all.indexOf(url) === index)
  let lastError: unknown
  for (const url of candidates) {
    try {
      const response = await fetch(url, init)
      if (isJsonResponse(response)) return response
      lastError = new Error(`Non-JSON response from ${url} (HTTP ${response.status})`)
    } catch (caught) {
      lastError = caught
    }
  }
  throw lastError instanceof Error ? lastError : new Error('Cannot reach the AROFi access service.')
}
