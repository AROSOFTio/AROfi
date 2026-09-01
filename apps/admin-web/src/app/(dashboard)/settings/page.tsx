import { redirect } from 'next/navigation'
import KycDocumentsPanel from '@/components/KycDocumentsPanel'
import SettingsManager from '@/components/SettingsManager'
import type { AdminSessionResponse, KycDocumentItem } from '@/lib/admin-types'
import { fetchApi } from '@/lib/api'
import { isVendorWorkspace } from '@/lib/workspace'

export default async function SettingsPage({ searchParams }: { searchParams?: Promise<{ tenantId?: string; tab?: string }> }) {
  const session = await fetchApi<AdminSessionResponse>('/auth/me')
  if (session?.user.role === 'VoucherAgent') redirect('/agent-settings')

  const isDevAdmin = Boolean(session?.user.permissions.includes('ALL'))
  const isVendor = isVendorWorkspace(session?.user)
  const resolvedSearchParams = await searchParams
  const tenantQuery = isDevAdmin && resolvedSearchParams?.tenantId ? `?tenantId=${resolvedSearchParams.tenantId}` : ''

  const [platformSettings, tenantSettings, subscriptionPlans, subscriptionStatus, kycDocuments] = await Promise.all([
    isDevAdmin ? fetchApi('/system/settings') : Promise.resolve(null),
    isVendor || tenantQuery ? fetchApi(`/system/tenant-settings${tenantQuery}`) : Promise.resolve(null),
    fetchApi('/subscription/plans'),
    isVendor ? fetchApi('/subscription/status') : Promise.resolve(null),
    resolvedSearchParams?.tab === 'Security'
      ? fetchApi<KycDocumentItem[]>('/system/kyc/documents')
      : Promise.resolve([]),
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
      {resolvedSearchParams?.tab === 'Security' && (
        <KycDocumentsPanel isSuperAdmin={isDevAdmin} initialDocuments={kycDocuments ?? []} />
      )}
    </>
  )
}
