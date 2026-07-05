// The admin access token lives in an HttpOnly cookie set by the API
// (apps/api auth.module.ts setAdminAccessCookie). Page JavaScript can neither
// read nor write it — XSS cannot exfiltrate the session. This module only
// keeps the cookie NAME (server components and the proxy read the cookie via
// Next's server-side APIs, where HttpOnly cookies are visible) and the
// logout/redirect helpers.
export const adminAuthCookieName = 'arofi_admin_token'

const apiBase = process.env.NEXT_PUBLIC_API_URL ?? '/api'

// Ends the session server-side: revokes the refresh token and clears both
// HttpOnly cookies. Browser JS cannot delete HttpOnly cookies itself.
export async function endAdminSession() {
  try {
    await fetch(`${apiBase}/auth/logout`, {
      method: 'POST',
      credentials: 'include',
    })
  } catch {
    // Offline/API down — the short-lived access cookie expires on its own.
  }
}

// Single-domain: marketing, app, portal and docs all live on arofi.net now
// (the old app.arofi.net subdomain is retired and 301s here), so these are
// always same-origin relative paths — no cross-domain jump.
export function getAppDashboardUrl() {
  return '/dashboard'
}

export function getAppLoginUrl() {
  return '/login'
}
