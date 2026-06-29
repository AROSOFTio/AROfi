import KycDocumentsPanel from '@/components/KycDocumentsPanel'
import SettingsManager from '@/components/SettingsManager'
import type { AdminSessionResponse, KycDocumentItem } from '@/lib/admin-types'
import { fetchApi } from '@/lib/api'
import { isVendorWorkspace } from '@/lib/workspace'

export default async function SettingsPage({ searchParams }: { searchParams?: Promise<{ tenantId?: string }> }) {
  const session = await fetchApi<AdminSessionResponse>('/auth/me')
  const isDevAdmin = Boolean(session?.user.permissions.includes('ALL'))
  const isVendor = isVendorWorkspace(session?.user)
  const resolvedSearchParams = await searchParams
  const tenantQuery = isDevAdmin && resolvedSearchParams?.tenantId ? `?tenantId=${resolvedSearchParams.tenantId}` : ''

  const [platformSettings, tenantSettings, subscriptionPlans, subscriptionStatus, kycDocuments] = await Promise.all([
    isDevAdmin ? fetchApi('/system/settings') : Promise.resolve(null),
    isVendor || tenantQuery ? fetchApi(`/system/tenant-settings${tenantQuery}`) : Promise.resolve(null),
    fetchApi('/subscription/plans'),
    isVendor ? fetchApi('/subscription/status') : Promise.resolve(null),
    fetchApi<KycDocumentItem[]>('/system/kyc/documents'),
  ])

  return (
    <>
      <SettingsManager
        user={session?.user ?? { permissions: [] }}
        isVendor={isVendor}
        initialPlatformSettings={platformSettings as never}
        initialTenantSettings={tenantSettings as never}
        initialSubscriptionPlans={subscriptionPlans as never}
        initialSubscriptionStatus={subscriptionStatus as never}
      />
      <KycDocumentsPanel isSuperAdmin={isDevAdmin} initialDocuments={kycDocuments ?? []} />
    </>
  )
}
