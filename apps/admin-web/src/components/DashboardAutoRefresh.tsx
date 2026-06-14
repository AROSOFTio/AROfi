'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'

// The dashboard is server-rendered, so live/offline status would otherwise only
// change on a manual reload. This soft-refreshes the server data on an interval
// (no full page flash, client state preserved) so router live status and active
// sessions update on their own within seconds.
export function DashboardAutoRefresh({ intervalMs = 20000 }: { intervalMs?: number }) {
  const router = useRouter()
  useEffect(() => {
    const id = setInterval(() => router.refresh(), intervalMs)
    return () => clearInterval(id)
  }, [router, intervalMs])
  return null
}
