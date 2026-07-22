import React from 'react'
import Link from 'next/link'
import { Store, Ticket, FileText, Router } from 'lucide-react'

export default function CommandBar() {
  const actions = [
    { title: 'Sell', desc: 'Sell a voucher to a walk-in customer', icon: <Store size={18} />, href: '/vouchers' },
    { title: 'Vouchers', desc: 'Generate a new voucher batch', icon: <Ticket size={18} />, href: '/vouchers' },
    { title: 'Reports', desc: 'Export sales, vouchers & payouts', icon: <FileText size={18} />, href: '/reports' },
    { title: 'Add Router', desc: 'Register a new hotspot router', icon: <Router size={18} />, href: '/routers' },
  ]

  return (
    <div className="command-bar">
      {actions.map((act) => (
        <Link key={act.title} href={act.href} className="command-item">
          <div className="command-icon">
            {act.icon}
          </div>
          <div>
            <div className="command-title">{act.title}</div>
            <div className="command-desc">{act.desc}</div>
          </div>
        </Link>
      ))}
    </div>
  )
}
