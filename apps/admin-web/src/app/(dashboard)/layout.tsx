import { AdminSessionResponse } from '@/lib/admin-types'
import { fetchApi } from '@/lib/api'
import { redirect } from 'next/navigation'
import DashboardShell from '../../components/DashboardShell'

export const metadata = {
  title: 'AROFi Admin - Hotspot Billing & Network Management',
  description: 'Enterprise hotspot billing and network management platform. Built by AROSOFT Innovations Ltd.',
}

export const dynamic = 'force-dynamic'

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const session = await fetchApi<AdminSessionResponse>('/auth/me')
  if (!session?.user) {
    redirect('/login')
  }

  const initials = session.user.displayName
    .split(/[\s.\-_]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((segment) => segment[0]?.toUpperCase() ?? '')
    .join('')
    .slice(0, 2) || 'AD'

  const workspaceTitle = session.user.tenantName ? `${session.user.tenantName} Console` : 'AROFi Platform'

  return (
    <DashboardShell initials={initials} session={session} workspaceTitle={workspaceTitle}>
      {children}
    </DashboardShell>
  )
}
