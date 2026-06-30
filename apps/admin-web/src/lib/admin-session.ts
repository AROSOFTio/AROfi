export const adminAuthCookieName = 'arofi_admin_token'

// arofi.net (marketing) and app.arofi.net (product) are different hosts, so a
// host-only cookie set on one is invisible on the other. Scoping it to
// ".arofi.net" makes it valid on every subdomain so a session started during
// signup on arofi.net is already authenticated after the redirect to
// app.arofi.net/dashboard. Any other host (local dev, arofi.arosoftlabs.com,
// dev.arofi.net) keeps the old host-only behavior.
function rootCookieDomain() {
  if (typeof window === 'undefined') {
    return ''
  }
  return window.location.hostname.endsWith('arofi.net') ? '; Domain=.arofi.net' : ''
}

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
  document.cookie = `${adminAuthCookieName}=${encodeURIComponent(token)}; Path=/; Max-Age=2592000; SameSite=Lax${rootCookieDomain()}${secureFlag}`
}

export function clearBrowserAdminSession() {
  if (typeof document === 'undefined') {
    return
  }

  document.cookie = `${adminAuthCookieName}=; Path=/; Max-Age=0; SameSite=Lax${rootCookieDomain()}`
}

// Where signup/login should land the user. On the marketing domain this
// crosses over to the product subdomain; everywhere else (local dev,
// staging, the legacy arosoftlabs.com domain) it stays same-origin.
export function getAppDashboardUrl() {
  if (typeof window !== 'undefined' && window.location.hostname === 'arofi.net') {
    return 'https://app.arofi.net/dashboard'
  }
  return '/dashboard'
}
