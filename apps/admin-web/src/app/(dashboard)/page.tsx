import type { AdminSessionResponse } from '@/lib/admin-types'
import { fetchApi } from '@/lib/api'
import { isResellerWorkspace, isVendorWorkspace } from '@/lib/workspace'
import { DashboardAutoRefresh } from '../../components/DashboardAutoRefresh'
import DashboardHome from '../../components/DashboardHome'

export const metadata = {
  title: 'AROFi Admin – Dashboard',
  description: 'Platform overview for AROFi Hotspot Billing & Network Management.',
}

export default async function DashboardPage({ searchParams }: { searchParams?: Promise<Record<string, string | undefined>> }) {
  const [resolvedSearchParams, session] = await Promise.all([
    searchParams,
    fetchApi<AdminSessionResponse>('/auth/me'),
  ])
  const alreadyRefreshesInsideDashboard =
    isVendorWorkspace(session?.user) || isResellerWorkspace(session?.user)

  return (
    <>
      {!alreadyRefreshesInsideDashboard && <DashboardAutoRefresh />}
      <DashboardHome searchParams={resolvedSearchParams} />
    </>
  )
}
