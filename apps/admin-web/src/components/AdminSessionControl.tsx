'use client'

const authCookieName = 'arofi_admin_token'

export default function AdminSessionControl() {
  function handleLogout() {
    document.cookie = `${authCookieName}=; Path=/; Max-Age=0; SameSite=Lax`
    localStorage.removeItem('access_token')
    window.location.href = '/login'
  }

  return (
    <button type="button" className="btn btn-ghost" onClick={handleLogout} style={{ padding: '6px 10px', fontSize: 12 }}>
      Logout
    </button>
  )
}
