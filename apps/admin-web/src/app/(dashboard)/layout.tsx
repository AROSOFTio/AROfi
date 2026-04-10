import { AdminSessionResponse } from '@/lib/admin-types'
import { fetchApi } from '@/lib/api'
import { redirect } from 'next/navigation'
import AdminSessionControl from '../../components/AdminSessionControl'
import Sidebar from '../../components/Sidebar'
import ThemeToggle from '../../components/ThemeToggle'

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

  const initials = session.user.email
    .split('@')[0]
    .split(/[.\-_]/)
    .filter(Boolean)
    .slice(0, 2)
    .map((segment) => segment[0]?.toUpperCase() ?? '')
    .join('')
    .slice(0, 2) || 'AD'

  return (
    <>
      <Sidebar />
      <div className="main-content">
        <header className="topbar">
          <span className="topbar-title">AROFi Platform</span>
          <div className="topbar-actions">
            <ThemeToggle />
            <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>{session.user.email}</span>
            <div className="avatar">{initials}</div>
            <AdminSessionControl />
          </div>
        </header>
        <div className="content">{children}</div>
      </div>
    </>
  )
}
