'use client'

import { useEffect, useState } from 'react'
import { usePathname } from 'next/navigation'
import { Headphones, X } from 'lucide-react'
import type { AdminSessionResponse } from '@/lib/admin-types'
import { refreshAccessToken } from '@/lib/client-api'
import AdminSessionControl from './AdminSessionControl'
import AgentSidebar from './AgentSidebar'
import FeedbackPrompt from './FeedbackPrompt'
import NotificationBell from './NotificationBell'
import RouterOnboardingNudge from './RouterOnboardingNudge'
import RouterSupportDock from './RouterSupportDock'
import Sidebar from './Sidebar'
import SupportTicketQuickAccess from './SupportTicketQuickAccess'
import ThemeToggle from './ThemeToggle'
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
  const isAgent = session.user.role === 'VoucherAgent'

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

  const shellClassName = [
    'dashboard-shell',
    menuOpen ? 'mobile-nav-open' : '',
    isAgent ? 'agent-dashboard-shell' : '',
  ].filter(Boolean).join(' ')

  return (
    <div className={shellClassName}>
      {isAgent && (
        <style>{`
          @media (max-width: 820px) {
            .agent-dashboard-shell > .sidebar,
            .agent-dashboard-shell > .mobile-nav-backdrop,
            .agent-dashboard-shell > .mobile-nav-close,
            .agent-dashboard-shell .topbar {
              display: none !important;
            }
            .agent-dashboard-shell .main-content {
              margin-left: 0 !important;
              width: 100% !important;
              min-width: 0 !important;
            }
            .agent-dashboard-shell .content {
              padding: 0 !important;
              margin: 0 !important;
              max-width: none !important;
            }
          }
        `}</style>
      )}
      <button
        type="button"
        className="mobile-nav-backdrop"
        aria-label="Close navigation menu"
        onClick={() => setMenuOpen(false)}
      />
      {isAgent ? <AgentSidebar user={session.user} /> : <Sidebar user={session.user} />}
      <button type="button" className="mobile-nav-close" aria-label="Close navigation menu" onClick={() => setMenuOpen(false)}>
        <X size={18} />
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
              <span /><span /><span />
            </button>
            <span className="topbar-title">{workspaceTitle}</span>
          </div>
          <div className="topbar-actions" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            {!isAgent && <RouterSupportDock user={session.user} />}
            {!isAgent && <SupportTicketQuickAccess user={session.user} />}
            {!isAgent && (
              <button
                type="button"
                className="topbar-ai-support"
                onClick={() => window.dispatchEvent(new Event('arofi:open-chat'))}
                aria-label="Open support chat"
              >
                <Headphones size={15} /><span>Support</span>
              </button>
            )}
            {!isAgent && <ThemeToggle compact />}
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
          <RouterOnboardingNudge enabled={!isAgent && isVendorWorkspace(session.user)} />
          <div className="content">{children}</div>
        </WorkspaceRouteGuard>
        <FeedbackPrompt enabled={!isAgent && isVendorWorkspace(session.user)} />
      </div>
    </div>
  )
}
