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

const agentAllowedPaths = new Set([
  '/dashboard',
  '/vouchers',
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
  const isAgent = user.role === 'VoucherAgent'
  const basePath = `/${pathname.split('/').filter(Boolean)[0] ?? 'dashboard'}`
  const wrongWorkspace =
    (isAgent && !agentAllowedPaths.has(basePath)) ||
    (!isAgent && isReseller && !resellerAllowedPaths.has(basePath)) ||
    (!isAgent && !isVendor && !isReseller && tenantOnlyPaths.has(basePath)) ||
    (!isAgent && isVendor && platformOnlyPaths.has(basePath))

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
