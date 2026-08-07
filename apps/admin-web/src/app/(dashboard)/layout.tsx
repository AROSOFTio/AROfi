import { AdminSessionResponse } from '@/lib/admin-types'
import { fetchApi } from '@/lib/api'
import { isResellerWorkspace, isVendorWorkspace } from '@/lib/workspace'
import DashboardShell from '../../components/DashboardShell'
import PremiumUiStyles from '../../components/PremiumUiStyles'
import SessionRecoveryGate from '../../components/SessionRecoveryGate'

export const metadata = {
  title: 'AROFi Admin - Hotspot Billing & Network Management',
  description: 'Enterprise hotspot billing and network management platform. Built by AROSOFT Innovations Ltd.',
}

export const dynamic = 'force-dynamic'

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const session = await fetchApi<AdminSessionResponse>('/auth/me')
  if (!session?.user) {
    return <SessionRecoveryGate />
  }

  const initials = session.user.displayName
    .split(/[\s.\-_]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((segment) => segment[0]?.toUpperCase() ?? '')
    .join('')
    .slice(0, 2) || 'AD'

  const workspaceTitle = isResellerWorkspace(session.user)
    ? 'Referral Partner Console'
    : isVendorWorkspace(session.user) && session.user.tenantName
      ? `${session.user.tenantName} Console`
      : 'AROFi Developer Admin'

  return (
    <>
      <PremiumUiStyles />
      <DashboardShell initials={initials} session={session} workspaceTitle={workspaceTitle}>
        {children}
      </DashboardShell>
    </>
  )
}
