import { redirect } from 'next/navigation'
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
  const user = session?.user

  if (user?.role === 'VoucherAgent') {
    return <AgentDashboard />
  }

  const isVendor = isVendorWorkspace(user)
  const isReseller = isResellerWorkspace(user)

  if (!isVendor && !isReseller) {
    if (user?.role === 'Support' || user?.role === 'ReadOnlySupport') redirect('/support')
    if (user?.role === 'NetworkOperator') redirect('/admin/router')
    if (user?.role === 'FinanceManager') redirect('/earnings')
    return <PlatformCommandCenter />
  }

  return <DashboardHome searchParams={await searchParams} />
}