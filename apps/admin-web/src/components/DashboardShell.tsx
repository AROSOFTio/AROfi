'use client'

import { useEffect, useState } from 'react'
import { usePathname } from 'next/navigation'
import type { AdminSessionResponse } from '@/lib/admin-types'
import { refreshAccessToken } from '@/lib/client-api'
import AdminSessionControl from './AdminSessionControl'
import NotificationBell from './NotificationBell'
import Sidebar from './Sidebar'
import WorkspaceRouteGuard from './WorkspaceRouteGuard'

// The access token expires in 1h; refreshing every 45min while the tab stays
// open means an active user never sees a forced logout, and it keeps the
// cookie SSR reads fresh too (server components can't refresh it themselves).
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
          <div className="topbar-actions" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <NotificationBell />
            <div style={{ position: 'relative' }}>
            <button
              type="button"
              onClick={() => setProfileDropdownOpen(!profileDropdownOpen)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                background: 'transparent',
                border: 'none',
                cursor: 'pointer',
                padding: '4px 8px',
                borderRadius: 8,
                transition: 'background 0.2s',
                outline: 'none',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = 'var(--bg-hover)'
              }}
              onMouseLeave={(e) => {
                if (!profileDropdownOpen) {
                  e.currentTarget.style.background = 'transparent'
                }
              }}
            >
              <div className="avatar" style={{ margin: 0 }}>{initials}</div>
              <svg
                width="12"
                height="12"
                viewBox="0 0 24 24"
                fill="none"
                stroke="var(--text-secondary)"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                style={{
                  transform: profileDropdownOpen ? 'rotate(180deg)' : 'rotate(0deg)',
                  transition: 'transform 0.2s',
                }}
              >
                <polyline points="6 9 12 15 18 9" />
              </svg>
            </button>

            {profileDropdownOpen && (
              <>
                <div
                  style={{
                    position: 'fixed',
                    top: 0,
                    left: 0,
                    right: 0,
                    bottom: 0,
                    zIndex: 999,
                  }}
                  onClick={() => setProfileDropdownOpen(false)}
                />
                <div
                  style={{
                    position: 'absolute',
                    top: 'calc(100% + 8px)',
                    right: 0,
                    width: 240,
                    background: 'var(--bg-card)',
                    border: '1px solid var(--border)',
                    borderRadius: 12,
                    boxShadow: 'var(--shadow-md)',
                    padding: 16,
                    zIndex: 1000,
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 12,
                  }}
                >
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                    <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-1)' }}>
                      {session.user.displayName}
                    </span>
                    <span style={{ fontSize: 11, color: 'var(--text-muted)', wordBreak: 'break-all' }}>
                      {session.user.email}
                    </span>
                  </div>
                  <div style={{ borderTop: '1px solid var(--border)', margin: '4px 0' }} />
                  <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                    <AdminSessionControl />
                  </div>
                </div>
              </>
            )}
            </div>
          </div>
        </header>
        <WorkspaceRouteGuard user={session.user}>
          <div className="content">{children}</div>
        </WorkspaceRouteGuard>
      </div>
    </div>
  )
}
