import SettingsManager from '@/components/SettingsManager'
import type { AdminSessionResponse } from '@/lib/admin-types'
import { fetchApi } from '@/lib/api'
import { isVendorWorkspace } from '@/lib/workspace'

export default async function SettingsPage({ searchParams }: { searchParams?: Promise<{ tenantId?: string }> }) {
  const session = await fetchApi<AdminSessionResponse>('/auth/me')
  const isDevAdmin = Boolean(session?.user.permissions.includes('ALL'))
  const isVendor = isVendorWorkspace(session?.user)
  const resolvedSearchParams = await searchParams
  const tenantQuery = isDevAdmin && resolvedSearchParams?.tenantId ? `?tenantId=${resolvedSearchParams.tenantId}` : ''

  const [platformSettings, tenantSettings, subscriptionPlans, subscriptionStatus] = await Promise.all([
    isDevAdmin ? fetchApi('/system/settings') : Promise.resolve(null),
    isVendor || tenantQuery ? fetchApi(`/system/tenant-settings${tenantQuery}`) : Promise.resolve(null),
    fetchApi('/subscription/plans'),
    isVendor ? fetchApi('/subscription/status') : Promise.resolve(null),
  ])

  return (
    <SettingsManager
      user={session?.user ?? { permissions: [] }}
      isVendor={isVendor}
      initialPlatformSettings={platformSettings as never}
      initialTenantSettings={tenantSettings as never}
      initialSubscriptionPlans={subscriptionPlans as never}
      initialSubscriptionStatus={subscriptionStatus as never}
    />
  )
}
