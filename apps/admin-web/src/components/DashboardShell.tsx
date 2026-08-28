'use client'

import { useEffect, useState } from 'react'
import { usePathname } from 'next/navigation'
import { Headphones } from 'lucide-react'
import type { AdminSessionResponse } from '@/lib/admin-types'
import { refreshAccessToken } from '@/lib/client-api'
import AdminSessionControl from './AdminSessionControl'
import FeedbackPrompt from './FeedbackPrompt'
import NotificationBell from './NotificationBell'
import RouterOnboardingNudge from './RouterOnboardingNudge'
import RouterSupportDock from './RouterSupportDock'
import Sidebar from './Sidebar'
import SupportTicketQuickAccess from './SupportTicketQuickAccess'
import { SESSION_RECOVERY_ATTEMPT_KEY } from './SessionRecoveryGate'
import WorkspaceRouteGuard from './WorkspaceRouteGuard'
import { isVendorWorkspace } from '@/lib/workspace'

const ACCESS_TOKEN_REFRESH_INTERVAL_MS = 45 * 60 * 1000

type DashboardShellProps = {
  children: React.ReactNode
  initials: string
  session: AdminSessionResponse
  workspaceTitle: string
}

export default function DashboardShell({ children, initials, session, workspaceTitle }: DashboardShellProps) {
  const pathname = usePathname()
  const [profileDropdownOpen, setProfileDropdownOpen] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)

  useEffect(() => {
    setMenuOpen(false)
    setProfileDropdownOpen(false)
  }, [pathname])

  useEffect(() => {
    sessionStorage.removeItem(SESSION_RECOVERY_ATTEMPT_KEY)
  }, [])

  useEffect(() => {
    document.body.classList.toggle('mobile-nav-locked', menuOpen)
    return () => document.body.classList.remove('mobile-nav-locked')
  }, [menuOpen])

  useEffect(() => {
    const interval = window.setInterval(() => {
      void refreshAccessToken()
    }, ACCESS_TOKEN_REFRESH_INTERVAL_MS)
    return () => window.clearInterval(interval)
  }, [])

  return (
    <div className={menuOpen ? 'dashboard-shell mobile-nav-open' : 'dashboard-shell'}>
      <button type="button" className="mobile-nav-backdrop" aria-label="Close navigation menu" onClick={() => setMenuOpen(false)} />
      <Sidebar user={session.user} />
      <button type="button" className="mobile-nav-close" aria-label="Close navigation menu" onClick={() => setMenuOpen(false)}>x</button>
      <div className="main-content">
        <header className="topbar">
          <div className="topbar-left">
            <button type="button" className="mobile-menu-button" aria-label="Open navigation menu" aria-expanded={menuOpen} onClick={() => setMenuOpen(true)}>
              <span /><span /><span />
            </button>
            <span className="topbar-title">{workspaceTitle}</span>
          </div>
          <div className="topbar-actions" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <RouterSupportDock user={session.user} />
            <SupportTicketQuickAccess user={session.user} />
            <button type="button" className="topbar-ai-support" onClick={() => window.dispatchEvent(new Event('arofi:open-chat'))} aria-label="Open support chat">
              <Headphones size={15} /><span>Support</span>
            </button>
            <NotificationBell />
            <div style={{ position: 'relative' }}>
              <button type="button" className="topbar-profile-trigger" onClick={() => setProfileDropdownOpen(!profileDropdownOpen)}>
                <div className="avatar" style={{ margin: 0 }}>{initials}</div>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="var(--text-secondary)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ transform: profileDropdownOpen ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform 0.2s' }}>
                  <polyline points="6 9 12 15 18 9" />
                </svg>
              </button>

              {profileDropdownOpen && <>
                <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, zIndex: 999 }} onClick={() => setProfileDropdownOpen(false)} />
                <div className="topbar-profile-menu">
                  <div className="topbar-profile-menu-head">
                    <span className="topbar-profile-name">{session.user.displayName}</span>
                    <span className="topbar-profile-email">{session.user.email}</span>
                  </div>
                  <div className="topbar-profile-divider" />
                  <div className="topbar-profile-actions"><AdminSessionControl /></div>
                </div>
              </>}
            </div>
          </div>
        </header>
        <WorkspaceRouteGuard user={session.user}>
          <RouterOnboardingNudge enabled={isVendorWorkspace(session.user)} />
          <div className="content">{children}</div>
        </WorkspaceRouteGuard>
        <FeedbackPrompt enabled={isVendorWorkspace(session.user)} />
      </div>
    </div>
  )
}
