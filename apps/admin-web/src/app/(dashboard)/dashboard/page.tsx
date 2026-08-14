import DashboardHome from '@/components/DashboardHome'
import PlatformCommandCenter from '@/components/PlatformCommandCenter'
import VendorBusinessDashboard from '@/components/VendorBusinessDashboard'
import { getAdminSession } from '@/lib/api'
import { isResellerWorkspace, isVendorWorkspace } from '@/lib/workspace'

export default async function DashboardAliasPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | undefined>>
}) {
  const session = await getAdminSession()
  const isVendor = isVendorWorkspace(session?.user)
  const isReseller = isResellerWorkspace(session?.user)
  const resolvedSearchParams = await searchParams

  if (!isVendor && !isReseller) {
    return <PlatformCommandCenter />
  }

  if (isVendor) {
    return <VendorBusinessDashboard session={session} searchParams={resolvedSearchParams} />
  }

  return <DashboardHome searchParams={resolvedSearchParams} />
}
