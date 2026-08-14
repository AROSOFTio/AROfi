import AgentDashboard from '@/components/AgentDashboard'
import DashboardHome from '@/components/DashboardHome'
import PlatformCommandCenter from '@/components/PlatformCommandCenter'
import { getAdminSession } from '@/lib/api'
import { isResellerWorkspace, isVendorWorkspace } from '@/lib/workspace'

export default async function DashboardAliasPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | undefined>>
}) {
  const session = await getAdminSession()

  if (session?.user.role === 'VoucherAgent') {
    return <AgentDashboard />
  }

  const isVendor = isVendorWorkspace(session?.user)
  const isReseller = isResellerWorkspace(session?.user)

  if (!isVendor && !isReseller) {
    return <PlatformCommandCenter />
  }

  return <DashboardHome searchParams={await searchParams} />
}
