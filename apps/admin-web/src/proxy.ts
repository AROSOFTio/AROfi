import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { adminAuthCookieName } from './lib/admin-session'

// The public marketing site, blog, blog articles and docs share the root with
// the signed-in app (blog articles live at "/<slug>"), so an allowlist of
// public paths can't work — a slug like "/how-to-start-a-wifi-business" is
// indistinguishable from an app route by prefix. Instead we PROTECT only the
// known app/admin sections and leave everything else public. That keeps the
// blog, articles, docs and marketing pages reachable without login (and
// crawlable by Google), while /dashboard, /customers, /settings, etc. still
// require a session.
const PROTECTED_PREFIXES = [
  '/dashboard',
  '/admin',
  '/customers',
  '/packages',
  '/vouchers',
  '/routers',
  '/hotspots',
  '/payments',
  '/disbursements',
  '/settlements',
  '/earnings',
  '/billing',
  '/float',
  '/agents',
  '/users',
  '/settings',
  '/reports',
  '/sessions',
  '/transactions',
  '/audit-logs',
  '/tenants',
  '/sales',
  '/feature-limits',
  '/setup',
  '/support',
]

function requiresAuth(pathname: string) {
  return PROTECTED_PREFIXES.some((prefix) => pathname === prefix || pathname.startsWith(prefix + '/'))
}

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl

  // Public by default (marketing home, /blog, /blog articles at /<slug>, /docs,
  // /login, /register, robots/sitemap, static assets). Only the app sections
  // above require a session.
  if (!requiresAuth(pathname)) {
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
