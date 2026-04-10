'use client'

import { clearBrowserAdminSession } from '@/lib/admin-session'

export default function AdminSessionControl() {
  function handleLogout() {
    clearBrowserAdminSession()
    window.location.href = '/login'
  }

  return (
    <button type="button" className="btn btn-ghost" onClick={handleLogout} style={{ padding: '6px 10px', fontSize: 12 }}>
      Logout
    </button>
  )
}
