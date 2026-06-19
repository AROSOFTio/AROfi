'use client'

import { useEffect, useState } from 'react'
import { usePathname } from 'next/navigation'
import type { AdminSessionResponse } from '@/lib/admin-types'
import AdminSessionControl from './AdminSessionControl'
import Sidebar from './Sidebar'
import WorkspaceRouteGuard from './WorkspaceRouteGuard'

type DashboardShellProps = {
  children: React.ReactNode
  initials: string
  session: AdminSessionResponse
  workspaceTitle: string
}

export default function DashboardShell({ children, initials, session, workspaceTitle }: DashboardShellProps) {
  const pathname = usePathname()
  const [menuOpen, setMenuOpen] = useState(false)

  useEffect(() => {
    setMenuOpen(false)
  }, [pathname])

  useEffect(() => {
    document.body.classList.toggle('mobile-nav-locked', menuOpen)
    return () => document.body.classList.remove('mobile-nav-locked')
  }, [menuOpen])

  return (
    <div className={menuOpen ? 'dashboard-shell mobile-nav-open' : 'dashboard-shell'}>
      <button
        type="button"
        className="mobile-nav-backdrop"
        aria-label="Close navigation menu"
        onClick={() => setMenuOpen(false)}
      />
      <Sidebar user={session.user} />
      <button
        type="button"
        className="mobile-nav-close"
        aria-label="Close navigation menu"
        onClick={() => setMenuOpen(false)}
      >
        x
      </button>
      <div className="main-content">
        <header className="topbar">
          <div className="topbar-left">
            <button
              type="button"
              className="mobile-menu-button"
              aria-label="Open navigation menu"
              aria-expanded={menuOpen}
              onClick={() => setMenuOpen(true)}
            >
              <span />
              <span />
              <span />
            </button>
            <span className="topbar-title">{workspaceTitle}</span>
          </div>
          <div className="topbar-actions">
            <div style={{ display: 'grid', gap: 2, textAlign: 'right' }}>
              <span style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>{session.user.displayName}</span>
              <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{session.user.email}</span>
            </div>
            <div className="avatar">{initials}</div>
            <AdminSessionControl />
          </div>
        </header>
        <WorkspaceRouteGuard user={session.user}>
          <div className="content">{children}</div>
        </WorkspaceRouteGuard>
      </div>
    </div>
  )
}
