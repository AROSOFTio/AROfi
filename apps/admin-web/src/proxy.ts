import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { adminAuthCookieName } from './lib/admin-session'

// Only routes under app/(dashboard)/* require a signed-in session. Everything
// else — the marketing homepage, blog, docs, login, register, router setup
// links, PWA/SEO files — is public. This is a denylist of the (dashboard)
// route group's top-level folder names, not an allowlist of public pages,
// so a new public page (blog, docs, ...) never has to be added here to work —
// only a new *protected* top-level route does. Keep in sync with the folder
// names under src/app/(dashboard)/.
const PROTECTED_PREFIXES = [
  '/dashboard',
  '/admin',
  '/agents',
  '/audit-logs',
  '/billing',
  '/compliance',
  '/customers',
  '/disbursements',
  '/earnings',
  '/feature-limits',
  '/feedback',
  '/float',
  '/hotspots',
  '/packages',
  '/payments',
  '/reports',
  '/routers',
  '/sales-by-tenant',
  '/sales-by-business',
  '/sales',
  '/sessions',
  '/settings',
  '/settlements',
  '/support',
  '/tenants',
  '/businesses',
  '/transactions',
  '/users',
  '/vouchers',
]

function isProtectedPath(pathname: string) {
  return PROTECTED_PREFIXES.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`))
}

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl

  if (!isProtectedPath(pathname)) {
    return NextResponse.next()
  }

  const token = request.cookies.get(adminAuthCookieName)?.value
  if (!token) {
    const url = request.nextUrl.clone()
    url.pathname = '/login'
    url.searchParams.set('next', pathname)
    return NextResponse.redirect(url)
  }

  return NextResponse.next()
}

export const config = {
  matcher: ['/((?!api|.*\\..*).*)'],
}
