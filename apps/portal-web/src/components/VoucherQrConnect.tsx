'use client'

import { useEffect, useMemo, useState } from 'react'
import { Loader2, Wifi } from 'lucide-react'

const ROUTER_GATEWAY = '10.55.0.1'

type VoucherQrConnectProps = {
  voucher: string
  hotspotHost?: string
}

function sanitizeHotspotHost(value: string | undefined) {
  const raw = (value ?? '').trim()
  if (!raw) return null

  try {
    const parsed = new URL(raw.includes('://') ? raw : `http://${raw}`)
    const hostname = parsed.hostname.trim().toLowerCase()
    if (!hostname || hostname === 'localhost') return null
    if (!/^[a-z0-9.-]+$/i.test(hostname)) return null
    return hostname
  } catch {
    return null
  }
}

export default function VoucherQrConnect({ voucher, hotspotHost }: VoucherQrConnectProps) {
  const [redirecting, setRedirecting] = useState(true)
  const cleanVoucher = voucher.trim().toUpperCase()
  const localHost = useMemo(() => sanitizeHotspotHost(hotspotHost), [hotspotHost])

  const targets = useMemo(() => {
    if (typeof window === 'undefined') {
      return { localUrl: '#', fallbackUrl: '#' }
    }

    const fallbackUrl = new URL('/portal', window.location.origin)
    fallbackUrl.searchParams.set('voucher', cleanVoucher)
    fallbackUrl.searchParams.set('intent', 'connect')
    if (localHost) fallbackUrl.searchParams.set('host', localHost)

    // Use the branded router-local DNS name first. It is served directly by
    // MikroTik and gives the quickest captive-portal hand-off. The numeric
    // gateway remains only as a fallback for old QR codes without a host.
    const localUrl = new URL(`http://${localHost ?? ROUTER_GATEWAY}/login`)
    localUrl.searchParams.set('voucher', cleanVoucher)

    return {
      localUrl: localUrl.toString(),
      fallbackUrl: fallbackUrl.toString(),
    }
  }, [cleanVoucher, localHost])

  useEffect(() => {
    if (!cleanVoucher || targets.localUrl === '#') {
      setRedirecting(false)
      return
    }

    // Redirect immediately: the QR already contains the voucher code, so the
    // router login page can redeem it without another tap or manual entry.
    const isAndroid = /Android/i.test(window.navigator.userAgent)
    if (isAndroid && localHost) {
      const intentUrl =
        `intent://${localHost}/login?voucher=${encodeURIComponent(cleanVoucher)}` +
        `#Intent;scheme=http;S.browser_fallback_url=${encodeURIComponent(targets.fallbackUrl)};end`
      window.location.replace(intentUrl)
      return
    }

    window.location.replace(targets.localUrl)
  }, [cleanVoucher, localHost, targets])

  return (
    <main className="grid min-h-screen place-items-center bg-gradient-to-b from-blue-50 to-emerald-50 px-4 py-10 text-slate-950">
      <section className="w-full max-w-md rounded-2xl border border-blue-200 bg-white p-6 text-center shadow-xl">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-blue-50 text-blue-600">
          {redirecting ? <Loader2 className="h-7 w-7 animate-spin" /> : <Wifi className="h-7 w-7" />}
        </div>
        <h1 className="mt-4 text-xl font-extrabold">Connecting your voucher</h1>
        <p className="mt-2 text-sm leading-6 text-slate-600">
          Keep the venue WiFi connected. AROFi is applying voucher <strong>{cleanVoucher || 'code'}</strong> automatically.
        </p>

        {!cleanVoucher && (
          <div className="mt-4 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-700">
            This QR code does not contain a voucher code.
          </div>
        )}

        {cleanVoucher && (
          <div className="mt-5 grid gap-3">
            <a href={targets.localUrl} className="rounded-xl bg-blue-600 px-4 py-3 text-sm font-extrabold text-white">
              Connect voucher now
            </a>
            <a href={targets.fallbackUrl} className="rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm font-bold text-slate-700">
              Open the portal instead
            </a>
          </div>
        )}

        <p className="mt-4 text-xs leading-5 text-slate-500">
          Stay connected to the venue WiFi while the voucher is applied.
        </p>
      </section>
    </main>
  )
}
