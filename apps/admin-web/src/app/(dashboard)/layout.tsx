import type { Metadata } from 'next'
import Sidebar from '../../components/Sidebar'

export const metadata: Metadata = {
  title: 'AROFi Admin – Hotspot Billing & Network Management',
  description: 'Enterprise hotspot billing and network management platform. Built by AROSOFT Innovations Ltd.',
}

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <Sidebar />
      <div className="main-content">
        <header className="topbar">
          <span className="topbar-title">AROFi Platform</span>
          <div className="topbar-actions">
            <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>admin@arosoft.io</span>
            <div className="avatar">SA</div>
          </div>
        </header>
        <div className="content">
          {children}
        </div>
      </div>
    </>
  )
}
