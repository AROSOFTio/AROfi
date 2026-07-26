import { AdminSessionResponse } from '@/lib/admin-types'
import { fetchApi } from '@/lib/api'
import { isResellerWorkspace, isVendorWorkspace } from '@/lib/workspace'
import DashboardShell from '../../components/DashboardShell'
import SessionRecoveryGate from '../../components/SessionRecoveryGate'

export const metadata = {
  title: 'AROFi Admin - Hotspot Billing & Network Management',
  description: 'Enterprise hotspot billing and network management platform. Built by AROSOFT Innovations Ltd.',
}

export const dynamic = 'force-dynamic'

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const session = await fetchApi<AdminSessionResponse>('/auth/me')
  if (!session?.user) {
    // Don't hard-redirect on the first failure — attempt a silent client-side
    // refresh first (see SessionRecoveryGate). Only genuinely dead sessions
    // end up at /login.
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
    <DashboardShell initials={initials} session={session} workspaceTitle={workspaceTitle}>
      {children}
    </DashboardShell>
  )
}
