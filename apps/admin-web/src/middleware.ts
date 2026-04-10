import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

const authCookieName = 'arofi_admin_token'

function isPublicPath(pathname: string) {
  return pathname === '/login' || pathname.startsWith('/_next') || pathname === '/favicon.ico'
}

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl
  const token = request.cookies.get(authCookieName)?.value

  if (isPublicPath(pathname)) {
    if (pathname === '/login' && token) {
      const url = request.nextUrl.clone()
      url.pathname = '/dashboard'
      return NextResponse.redirect(url)
    }
    return NextResponse.next()
  }

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
