'use client'

import { useLayoutEffect } from 'react'

const PORTAL_CONTEXT_TIMEOUT_MS = 4_000

function requestUrl(input: RequestInfo | URL) {
  if (typeof input === 'string') return input
  if (input instanceof URL) return input.toString()
  return input.url
}

function isPortalContextRequest(input: RequestInfo | URL, init?: RequestInit) {
  const method = (init?.method ?? (input instanceof Request ? input.method : 'GET')).toUpperCase()
  if (method !== 'GET') return false
  return requestUrl(input).includes('/api/portal/context')
}

/**
 * Small production guard around the captive portal's very first API request.
 *
 * First-time customers have no stored portal token/session to fall back to.
 * If a proxy/API hop stalls, or returns a temporary 5xx, the existing apiFetch
 * helper can otherwise remain stuck on its first candidate and the package
 * screen appears to load forever. We only harden GET /portal/context here so
 * payment, voucher and activation requests keep their original semantics.
 */
export default function PortalResilience() {
  useLayoutEffect(() => {
    const originalFetch = window.fetch.bind(window)

    const resilientFetch: typeof window.fetch = async (input, init) => {
      if (!isPortalContextRequest(input, init)) {
        return originalFetch(input, init)
      }

      const controller = new AbortController()
      const timer = window.setTimeout(() => controller.abort(), PORTAL_CONTEXT_TIMEOUT_MS)

      let removeAbortListener: (() => void) | undefined
      const upstreamSignal = init?.signal
      if (upstreamSignal) {
        const abortFromUpstream = () => controller.abort(upstreamSignal.reason)
        if (upstreamSignal.aborted) abortFromUpstream()
        else {
          upstreamSignal.addEventListener('abort', abortFromUpstream, { once: true })
          removeAbortListener = () => upstreamSignal.removeEventListener('abort', abortFromUpstream)
        }
      }

      try {
        const response = await originalFetch(input, { ...init, signal: controller.signal })

        // Let normal 4xx responses reach the portal so it can show useful
        // business/router identification messages. Temporary server/proxy
        // failures should fall through to apiFetch's next candidate instead.
        if (response.status >= 500 || response.status === 408 || response.status === 429) {
          throw new Error(`Temporary portal service failure (HTTP ${response.status})`)
        }

        return response
      } finally {
        window.clearTimeout(timer)
        removeAbortListener?.()
      }
    }

    window.fetch = resilientFetch
    return () => {
      if (window.fetch === resilientFetch) window.fetch = originalFetch
    }
  }, [])

  return (
    <style jsx global>{`
      /* Keep the customer entry area calm and premium: solid navy, no heavy
         radial/linear wash, no oversized animated halo. */
      main > section > header {
        background: #071a49 !important;
        border-bottom: 1px solid rgba(255, 255, 255, 0.09);
        box-shadow: inset 0 -1px 0 rgba(255, 255, 255, 0.03);
      }

      main > section > header > div.absolute.inset-0 {
        display: none !important;
      }

      main > section > header > div.absolute.bottom-4 {
        opacity: 0.72;
        transform: scale(0.78);
        transform-origin: right bottom;
      }

      main > section > header > div.absolute.bottom-4 span {
        display: none !important;
      }
    `}</style>
  )
}
