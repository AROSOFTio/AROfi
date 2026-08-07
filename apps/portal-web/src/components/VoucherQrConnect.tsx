'use client'

import { useEffect, useMemo, useState } from 'react'
import { Loader2, Wifi } from 'lucide-react'

const ROUTER_GATEWAY = '10.55.0.1'

type VoucherQrConnectProps = {
  voucher: string
  /**
   * Kept for backwards compatibility with already printed QR links. The router
   * login target is deliberately the numeric gateway because Android private
   * DNS and public resolvers cannot resolve tenant-local *.wifi hostnames.
   */
  hotspotHost?: string
}

export default function VoucherQrConnect({ voucher }: VoucherQrConnectProps) {
  const [redirecting, setRedirecting] = useState(true)
  const cleanVoucher = voucher.trim().toUpperCase()

  const targets = useMemo(() => {
    if (typeof window === 'undefined') {
      return { localUrl: '#', fallbackUrl: '#' }
    }

    const fallbackUrl = new URL('/portal', window.location.origin)
    fallbackUrl.searchParams.set('voucher', cleanVoucher)
    fallbackUrl.searchParams.set('intent', 'connect')

    const localUrl = new URL(`http://${ROUTER_GATEWAY}/login`)
    localUrl.searchParams.set('voucher', cleanVoucher)

    return {
      localUrl: localUrl.toString(),
      fallbackUrl: fallbackUrl.toString(),
    }
  }, [cleanVoucher])

  useEffect(() => {
    if (!cleanVoucher || targets.localUrl === '#') {
      setRedirecting(false)
      return
    }

    const timer = window.setTimeout(() => {
      const isAndroid = /Android/i.test(window.navigator.userAgent)
      if (isAndroid) {
        const intentUrl =
          `intent://${ROUTER_GATEWAY}/login?voucher=${encodeURIComponent(cleanVoucher)}` +
          `#Intent;scheme=http;S.browser_fallback_url=${encodeURIComponent(targets.fallbackUrl)};end`
        window.location.replace(intentUrl)
        return
      }
      window.location.replace(targets.localUrl)
    }, 450)

    return () => window.clearTimeout(timer)
  }, [cleanVoucher, targets])

  return (
    <main className="grid min-h-screen place-items-center bg-gradient-to-b from-blue-50 to-emerald-50 px-4 py-10 text-slate-950">
      <section className="w-full max-w-md rounded-2xl border border-blue-200 bg-white p-6 text-center shadow-xl">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-blue-50 text-blue-600">
          {redirecting ? <Loader2 className="h-7 w-7 animate-spin" /> : <Wifi className="h-7 w-7" />}
        </div>
        <h1 className="mt-4 text-xl font-extrabold">Connecting your voucher</h1>
        <p className="mt-2 text-sm leading-6 text-slate-600">
          Keep the venue WiFi connected. AROFi is opening the router login page and applying voucher <strong>{cleanVoucher || 'code'}</strong>.
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
          If the router page does not open, connect to the venue WiFi first, return here, and tap “Connect voucher now”.
        </p>
      </section>
    </main>
  )
}
