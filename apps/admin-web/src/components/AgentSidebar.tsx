'use client'

import Link from 'next/link'
import { Home, Settings, ShoppingBag, UserRound, WalletCards } from 'lucide-react'
import type { AdminSessionResponse } from '@/lib/admin-types'

const items = [
  { href: '/dashboard', label: 'Dashboard', icon: Home },
  { href: '/dashboard#sell', label: 'Sell Internet', icon: ShoppingBag },
  { href: '/dashboard#reconciliation', label: 'Reconciliation', icon: WalletCards },
  { href: '/dashboard#account', label: 'Account', icon: UserRound },
  { href: '/agent-settings', label: 'Settings', icon: Settings },
]

export default function AgentSidebar({ user }: { user: AdminSessionResponse['user'] }) {
  return (
    <aside className="sidebar agent-sidebar">
      <div className="sidebar-logo">
        <img src="/logo.svg" alt="AROFi" />
        <div>
          <h1>ARO<span>Fi</span></h1>
          <p>Agent Portal</p>
        </div>
      </div>

      {user.tenantName && <div className="tenant-switcher">{user.tenantName}</div>}

      {items.map((item) => {
        const Icon = item.icon
        return (
          <div className="sidebar-section" key={item.href}>
            <Link href={item.href} className="sidebar-group-toggle">
              <span className="sidebar-group-label"><Icon size={17} /> {item.label}</span>
            </Link>
          </div>
        )
      })}
    </aside>
  )
}
