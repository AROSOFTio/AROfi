'use client'

import { usePathname, useRouter } from 'next/navigation'
import { useEffect } from 'react'
import type { AdminSessionResponse } from '@/lib/admin-types'
import { isResellerWorkspace, isVendorWorkspace } from '@/lib/workspace'

const tenantOnlyPaths = new Set([
  '/billing',
  '/customers',
  '/feedback',
  '/float',
  '/hotspots',
  '/packages',
  '/reports',
  '/sales',
  '/sessions',
  '/settlements',
  '/transactions',
  '/vouchers',
])

const platformOnlyPaths = new Set([
  '/audit-logs',
  '/feature-limits',
  '/tenants',
  '/businesses',
])

const resellerAllowedPaths = new Set([
  '/dashboard',
  '/referrals',
  '/support',
])

export default function WorkspaceRouteGuard({
  user,
  children,
}: {
  user: AdminSessionResponse['user']
  children: React.ReactNode
}) {
  const pathname = usePathname()
  const router = useRouter()
  const isVendor = isVendorWorkspace(user)
  const isReseller = isResellerWorkspace(user)
  const basePath = `/${pathname.split('/').filter(Boolean)[0] ?? 'dashboard'}`
  const wrongWorkspace =
    (isReseller && !resellerAllowedPaths.has(basePath)) ||
    (!isVendor && !isReseller && tenantOnlyPaths.has(basePath)) ||
    (isVendor && platformOnlyPaths.has(basePath))

  useEffect(() => {
    if (wrongWorkspace) {
      router.replace('/dashboard')
    }
  }, [router, wrongWorkspace])

  if (wrongWorkspace) {
    return null
  }

  return <>{children}</>
}
