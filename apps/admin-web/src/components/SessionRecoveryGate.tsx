'use client'

import { useEffect, useState } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { refreshAccessToken } from '@/lib/client-api'

// The dashboard layout's server-side session check (fetchApi('/auth/me'))
// runs on every navigation, calls the API container-to-container, and has
// no retry logic — unlike client-side requests, which already refresh and
// retry once on a 401 (see client-api.ts). A single transient failure on
// that SSR check (a fresh access cookie not yet propagated, a brief
// container-to-container hiccup, anything short of a genuinely dead
// session) used to bounce straight to /login even though the browser's
// session was perfectly fine — "click any button, get logged out."
//
// This renders instead of the dashboard when that SSR check fails: it
// tries the SAME browser-side refresh the rest of the app already relies
// on, then asks Next.js to re-render the server tree (which re-runs the
// SSR check with the now-fresh cookie). Only redirects to /login if the
// refresh itself genuinely fails, or after a couple of attempts — a
// sessionStorage guard prevents an infinite reload loop if the session is
// truly dead for some other reason.
const MAX_RECOVERY_ATTEMPTS = 2
const ATTEMPT_KEY = 'arofi.session_recovery_attempts'

export default function SessionRecoveryGate() {
  const router = useRouter()
  const pathname = usePathname()
  const [state, setState] = useState<'recovering' | 'failed'>('recovering')

  useEffect(() => {
    let cancelled = false

    const attempts = Number.parseInt(sessionStorage.getItem(ATTEMPT_KEY) ?? '0', 10)
    if (attempts >= MAX_RECOVERY_ATTEMPTS) {
      sessionStorage.removeItem(ATTEMPT_KEY)
      setState('failed')
      return
    }
    sessionStorage.setItem(ATTEMPT_KEY, String(attempts + 1))

    refreshAccessToken().then((ok) => {
      if (cancelled) return
      if (ok) {
        sessionStorage.removeItem(ATTEMPT_KEY)
        router.refresh()
      } else {
        setState('failed')
      }
    })

    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (state === 'failed') {
      window.location.href = `/login?next=${encodeURIComponent(pathname)}`
    }
  }, [state, pathname])

  return (
    <div
      style={{
        display: 'flex',
        minHeight: '100vh',
        alignItems: 'center',
        justifyContent: 'center',
        color: 'var(--text-muted, #64748b)',
        fontSize: 14,
      }}
    >
      Restoring your session&hellip;
    </div>
  )
}
