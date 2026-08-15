'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { LayoutDashboard, Ticket } from 'lucide-react'
import type { AdminSessionResponse } from '@/lib/admin-types'

export default function AgentSidebar({ user }: { user: AdminSessionResponse['user'] }) {
  const pathname = usePathname()

  return (
    <aside className="sidebar">
      <div className="sidebar-logo">
        <img src="/logo.svg" alt="AROFi" />
        <div>
          <h1>ARO<span>Fi</span></h1>
          <p>Agent Console</p>
          <div style={{ marginTop: 8 }}><span className="badge badge-info">Agent</span></div>
        </div>
      </div>

      {user.tenantName && <div className="tenant-switcher">{user.tenantName}</div>}

      <div className="sidebar-section">
        <Link href="/dashboard" className={`sidebar-group-toggle ${pathname === '/dashboard' ? 'active' : ''}`}>
          <span className="sidebar-group-label"><LayoutDashboard size={17} /> Home & Sell Internet</span>
        </Link>
      </div>

      <div className="sidebar-section">
        <Link href="/vouchers" className={`sidebar-group-toggle ${pathname.startsWith('/vouchers') ? 'active' : ''}`}>
          <span className="sidebar-group-label"><Ticket size={17} /> Offline Vouchers</span>
        </Link>
      </div>

      <div style={{ marginTop: 'auto', padding: '14px 15px 18px', color: 'var(--text-3)', fontSize: 11.5, lineHeight: 1.5 }}>
        Your sales, commission and cash accountability are on Home. Business settings and network controls remain with the business owner.
      </div>
    </aside>
  )
}
