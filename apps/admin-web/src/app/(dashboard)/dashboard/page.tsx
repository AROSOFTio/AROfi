import { Suspense } from 'react'
import { redirect } from 'next/navigation'
import AgentDashboard from '@/components/AgentDashboard'
import DashboardHome from '@/components/DashboardHome'
import PlatformCommandCenter from '@/components/PlatformCommandCenter'
import VendorBusinessDashboard from '@/components/VendorBusinessDashboard'
import { getAdminSession } from '@/lib/api'
import { isResellerWorkspace, isVendorWorkspace } from '@/lib/workspace'

function DashboardContentFallback() {
  return (
    <div style={{ padding: '18px 20px', color: 'var(--text-3)', fontSize: 12 }}>
      Loading live data…
    </div>
  )
}

export default async function DashboardAliasPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | undefined>>
}) {
  const session = await getAdminSession()
  const user = session?.user
  const resolvedSearchParams = await searchParams

  if (user?.role === 'VoucherAgent') {
    return (
      <Suspense fallback={<DashboardContentFallback />}>
        <AgentDashboard openSeller={resolvedSearchParams?.sell === '1'} />
      </Suspense>
    )
  }

  const isVendor = isVendorWorkspace(user)
  const isReseller = isResellerWorkspace(user)

  if (!isVendor && !isReseller) {
    if (user?.role === 'Support' || user?.role === 'ReadOnlySupport') redirect('/support')
    if (user?.role === 'NetworkOperator') redirect('/admin/router')
    if (user?.role === 'FinanceManager') redirect('/earnings')
    return (
      <Suspense fallback={<DashboardContentFallback />}>
        <PlatformCommandCenter />
      </Suspense>
    )
  }

  if (isVendor) {
    return (
      <Suspense fallback={<DashboardContentFallback />}>
        <VendorBusinessDashboard session={session} searchParams={resolvedSearchParams} />
      </Suspense>
    )
  }

  return (
    <Suspense fallback={<DashboardContentFallback />}>
      <DashboardHome searchParams={resolvedSearchParams} />
    </Suspense>
  )
}
