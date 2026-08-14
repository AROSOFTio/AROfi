'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { Clock3, ShieldCheck, UserRoundCheck, Wifi } from 'lucide-react'

type HotspotContext = {
  macAddress: string
  clientIp: string
  loginUrl: string
  routerId: string
  routerKey: string
  hotspotServerName: string
  tenantDomain: string
  originalDestination: string
}

type ClaimResponse = {
  code: string
  token: string
  expiresAt: string
  businessName: string
  message: string
}

type ClaimStatusResponse = {
  status: 'WAITING' | 'PAYMENT_PENDING' | 'FULFILLED' | 'FAILED' | 'EXPIRED'
  message: string
  expiresAt?: string
  packageName?: string
  reconnect?: {
    loginUrl?: string
    username: string
    password: string
  }
}

const emptyContext: HotspotContext = {
  macAddress: '',
  clientIp: '',
  loginUrl: '',
  routerId: '',
  routerKey: '',
  hotspotServerName: '',
  tenantDomain: '',
  originalDestination: '',
}

export default function AgentActivationClaimEntry() {
  const [hotspot, setHotspot] = useState<HotspotContext>(emptyContext)
  const [claim, setClaim] = useState<ClaimResponse | null>(null)
  const [status, setStatus] = useState<ClaimStatusResponse | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const submittedReconnectRef = useRef(false)

  useEffect(() => {
    setHotspot(readHotspotContext())
  }, [])

  const available = Boolean(
    hotspot.macAddress &&
    hotspot.loginUrl &&
    (hotspot.routerKey || hotspot.routerId),
  )

  const formattedCode = useMemo(() => {
    if (!claim?.code) return ''
    return `${claim.code.slice(0, 3)} ${claim.code.slice(3)}`
  }, [claim?.code])

  useEffect(() => {
    if (!claim?.token || status?.status === 'FULFILLED' || status?.status === 'FAILED' || status?.status === 'EXPIRED') return

    let stopped = false
    let timer: ReturnType<typeof window.setTimeout> | undefined

    const poll = async () => {
      if (stopped) return
      try {
        const response = await fetch(`/api/agent-sales/claims/status?token=${encodeURIComponent(claim.token)}`, {
          cache: 'no-store',
        })
        const body = await response.json().catch(() => ({})) as ClaimStatusResponse & { message?: string }
        if (stopped) return
        if (!response.ok) {
          setError(body.message || 'Could not check the agent activation request.')
          timer = window.setTimeout(() => void poll(), 2500)
          return
        }
        setStatus(body)
        setError('')
        if (body.status === 'FULFILLED' && body.reconnect?.username && body.reconnect?.password) {
          if (!submittedReconnectRef.current) {
            submittedReconnectRef.current = true
            submitRouterLogin(body.reconnect, hotspot)
          }
          return
        }
        if (body.status === 'FAILED' || body.status === 'EXPIRED') return
        timer = window.setTimeout(() => void poll(), 1500)
      } catch {
        if (!stopped) timer = window.setTimeout(() => void poll(), 3000)
      }
    }

    timer = window.setTimeout(() => void poll(), 900)
    return () => {
      stopped = true
      if (timer) window.clearTimeout(timer)
    }
  }, [claim?.token, status?.status, hotspot])

  async function requestAgentActivation() {
    if (!available || busy) return
    setBusy(true)
    setError('')
    submittedReconnectRef.current = false
    try {
      const response = await fetch('/api/agent-sales/claims', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tenantDomain: hotspot.tenantDomain || undefined,
          routerId: hotspot.routerId || undefined,
          routerKey: hotspot.routerKey || undefined,
          macAddress: hotspot.macAddress,
          clientIp: hotspot.clientIp || undefined,
          loginUrl: hotspot.loginUrl,
          hotspotServerName: hotspot.hotspotServerName || undefined,
        }),
      })
      const body = await response.json().catch(() => ({})) as ClaimResponse & { message?: string }
      if (!response.ok) {
        setError(body.message || 'Could not request an agent activation number.')
        return
      }
      setClaim(body)
      setStatus({ status: 'WAITING', message: 'Waiting for an agent to complete your sale.', expiresAt: body.expiresAt })
    } catch {
      setError('Could not reach AROFi. Stay connected to this WiFi and try again.')
    } finally {
      setBusy(false)
    }
  }

  if (!available) return null

  return (
    <section style={{ maxWidth: 720, margin: '0 auto 12px', padding: '0 14px' }} aria-label="Agent activation">
      <div style={{
        border: '1px solid rgba(37,99,235,.18)',
        background: 'rgba(37,99,235,.055)',
        borderRadius: 14,
        padding: 14,
      }}>
        {!claim ? (
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 14, alignItems: 'center', flexWrap: 'wrap' }}>
            <div style={{ minWidth: 0, flex: '1 1 280px' }}>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center', fontWeight: 800, fontSize: 14 }}>
                <UserRoundCheck size={18} /> Ask an Agent to Activate Me
              </div>
              <p style={{ margin: '5px 0 0', fontSize: 12.5, lineHeight: 1.45, opacity: .74 }}>
                Buying from an AROFi agent? Request a short number for this connected device. You never need to tell the agent your MAC address.
              </p>
            </div>
            <button
              type="button"
              onClick={() => void requestAgentActivation()}
              disabled={busy}
              style={{
                border: 0,
                background: '#2563eb',
                color: '#fff',
                borderRadius: 10,
                padding: '11px 15px',
                fontWeight: 800,
                cursor: busy ? 'wait' : 'pointer',
                minWidth: 150,
              }}
            >
              {busy ? 'Requesting…' : 'Get 6-digit number'}
            </button>
          </div>
        ) : (
          <div style={{ display: 'grid', gap: 10 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
              <div>
                <div style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '.08em', opacity: .6 }}>Tell this number to the agent</div>
                <div style={{ fontSize: 31, lineHeight: 1.05, fontWeight: 900, letterSpacing: '.12em', marginTop: 5 }}>{formattedCode}</div>
              </div>
              <StatusPill status={status?.status ?? 'WAITING'} />
            </div>

            <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start', fontSize: 12.5, lineHeight: 1.45 }}>
              {status?.status === 'PAYMENT_PENDING' ? <Clock3 size={17} style={{ flex: '0 0 auto', marginTop: 1 }} /> : <Wifi size={17} style={{ flex: '0 0 auto', marginTop: 1 }} />}
              <span>{status?.message ?? 'Waiting for the agent to complete your sale.'}</span>
            </div>

            <div style={{ display: 'flex', gap: 7, alignItems: 'center', fontSize: 11.5, opacity: .68 }}>
              <ShieldCheck size={14} />
              This number only identifies this waiting WiFi device. Internet starts only after the sale is completed.
            </div>

            {(status?.status === 'FAILED' || status?.status === 'EXPIRED') && (
              <button
                type="button"
                onClick={() => {
                  setClaim(null)
                  setStatus(null)
                  setError('')
                }}
                style={{ border: '1px solid rgba(0,0,0,.12)', borderRadius: 9, padding: '9px 12px', background: '#fff', fontWeight: 700, cursor: 'pointer', justifySelf: 'start' }}
              >
                Request a new number
              </button>
            )}
          </div>
        )}

        {error && <p style={{ color: '#b91c1c', fontSize: 12, margin: '9px 0 0' }}>{error}</p>}
      </div>
    </section>
  )
}

function StatusPill({ status }: { status: ClaimStatusResponse['status'] }) {
  const label = status === 'PAYMENT_PENDING'
    ? 'Waiting for payment'
    : status === 'FULFILLED'
      ? 'Connecting…'
      : status === 'FAILED'
        ? 'Failed'
        : status === 'EXPIRED'
          ? 'Expired'
          : 'Waiting for agent'
  return (
    <span style={{ border: '1px solid rgba(37,99,235,.2)', borderRadius: 999, padding: '6px 9px', fontSize: 11, fontWeight: 800, whiteSpace: 'nowrap' }}>
      {label}
    </span>
  )
}

function readHotspotContext(): HotspotContext {
  if (typeof window === 'undefined') return emptyContext
  const params = new URLSearchParams(window.location.search)
  const loginUrl =
    params.get('link-login') ??
    params.get('loginUrl') ??
    params.get('link_login') ??
    params.get('link-login-only') ??
    readStorage('arofi.lastLoginUrl') ??
    ''
  const tenantDomain =
    params.get('tenant') ??
    params.get('tenantDomain') ??
    params.get('portal') ??
    readStorage('arofi.tenantDomain') ??
    ''
  return {
    macAddress: params.get('mac') ?? params.get('client_mac') ?? params.get('mac-address') ?? '',
    clientIp: params.get('ip') ?? params.get('client_ip') ?? '',
    loginUrl,
    routerId: params.get('routerId') ?? '',
    routerKey: params.get('routerKey') ?? '',
    hotspotServerName: params.get('server') ?? params.get('hotspot') ?? '',
    tenantDomain,
    originalDestination:
      params.get('link-orig') ??
      params.get('link-orig-esc') ??
      params.get('dst') ??
      params.get('target') ??
      '',
  }
}

function readStorage(key: string) {
  try {
    return window.localStorage.getItem(key)
  } catch {
    return null
  }
}

function submitRouterLogin(
  reconnect: { loginUrl?: string; username: string; password: string },
  hotspot: HotspotContext,
) {
  const loginUrl = reconnect.loginUrl || hotspot.loginUrl
  if (!loginUrl || !reconnect.username || !reconnect.password) return

  const destination = safeDestination(hotspot.originalDestination)
  const form = document.createElement('form')
  form.method = 'POST'
  form.action = loginUrl
  form.target = '_self'
  form.style.display = 'none'

  const fields: Record<string, string> = {
    username: reconnect.username,
    password: reconnect.password,
    dst: destination,
    popup: 'false',
  }
  for (const [name, value] of Object.entries(fields)) {
    const input = document.createElement('input')
    input.type = 'hidden'
    input.name = name
    input.value = value
    form.appendChild(input)
  }

  document.body.appendChild(form)
  form.submit()
}

function safeDestination(value: string) {
  const fallback = 'http://connectivitycheck.gstatic.com/generate_204'
  if (!value) return fallback
  try {
    const decoded = decodeURIComponent(value)
    const url = new URL(decoded)
    if (!['http:', 'https:'].includes(url.protocol)) return fallback
    if (/\.wifi$/i.test(url.hostname) || /^10\.|^192\.168\.|^172\.(1[6-9]|2\d|3[01])\./.test(url.hostname)) return fallback
    return url.toString()
  } catch {
    return fallback
  }
}
