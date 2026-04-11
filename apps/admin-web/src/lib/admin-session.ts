export const adminAuthCookieName = 'arofi_admin_token'

export function getBrowserAdminToken() {
  if (typeof document === 'undefined') {
    return null
  }

  const cookie = document.cookie
    .split('; ')
    .find((item) => item.startsWith(`${adminAuthCookieName}=`))

  if (!cookie) {
    return null
  }

  return decodeURIComponent(cookie.split('=').slice(1).join('='))
}

export function setBrowserAdminSession(token: string) {
  if (typeof document === 'undefined') {
    return
  }

  const secureFlag = window.location.protocol === 'https:' ? '; Secure' : ''
  document.cookie = `${adminAuthCookieName}=${encodeURIComponent(token)}; Path=/; Max-Age=2592000; SameSite=Lax${secureFlag}`
}

export function clearBrowserAdminSession() {
  if (typeof document === 'undefined') {
    return
  }

  document.cookie = `${adminAuthCookieName}=; Path=/; Max-Age=0; SameSite=Lax`
}
