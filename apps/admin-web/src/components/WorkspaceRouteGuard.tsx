'use client'

import { usePathname, useRouter } from 'next/navigation'
import { useEffect } from 'react'
import type { AdminSessionResponse } from '@/lib/admin-types'
import { isVendorWorkspace } from '@/lib/workspace'

const tenantOnlyPaths = new Set([
  '/agents',
  '/billing',
  '/customers',
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
  const basePath = `/${pathname.split('/').filter(Boolean)[0] ?? 'dashboard'}`
  const wrongWorkspace = (!isVendor && tenantOnlyPaths.has(basePath)) || (isVendor && platformOnlyPaths.has(basePath))

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
