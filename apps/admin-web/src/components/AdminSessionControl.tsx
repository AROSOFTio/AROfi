'use client'

import { clearBrowserAdminSession } from '@/lib/admin-session'

const browserApiBase = process.env.NEXT_PUBLIC_API_URL ?? '/api'

export default function AdminSessionControl() {
  async function handleLogout() {
    try {
      await fetch(`${browserApiBase}/auth/logout`, { method: 'POST', credentials: 'include' })
    } catch {
      // Best-effort: even if revocation fails, clearing the local session and
      // leaving still blocks this browser from acting as the user.
    }
    clearBrowserAdminSession()
    window.location.href = '/login'
  }

  return (
    <button type="button" className="btn btn-ghost" onClick={handleLogout} style={{ padding: '6px 10px', fontSize: 12 }}>
      Logout
    </button>
  )
}
