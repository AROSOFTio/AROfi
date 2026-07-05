'use client'

import { endAdminSession } from '@/lib/admin-session'

export default function AdminSessionControl() {
  async function handleLogout() {
    // Revokes the refresh token and clears the HttpOnly session cookies
    // server-side — browser JS cannot delete HttpOnly cookies itself.
    await endAdminSession()
    window.location.href = '/login'
  }

  return (
    <button type="button" className="btn btn-ghost" onClick={handleLogout} style={{ padding: '6px 10px', fontSize: 12 }}>
      Logout
    </button>
  )
}
