'use client'

import { useState } from 'react'
import AgentVoucherAccountabilityReport from './AgentVoucherAccountabilityReport'
import AgentVoucherIssuancePanel from './AgentVoucherIssuancePanel'
import VouchersManager from './VouchersManager'

type VoucherView = 'issue' | 'stock' | 'report'

const views: Array<{ key: VoucherView; title: string; description: string; action: string }> = [
  {
    key: 'issue',
    title: 'Issue vouchers',
    description: 'Create owner stock or assign a new batch to one accountable agent.',
    action: 'Start guided issue',
  },
  {
    key: 'stock',
    title: 'Voucher stock',
    description: 'Search, print, inspect, or manage vouchers that already exist.',
    action: 'Open voucher stock',
  },
  {
    key: 'report',
    title: 'Sales accountability',
    description: 'Review redemptions, unsold exposure, agent commission, fees, and net sales.',
    action: 'Open report',
  },
]

export default function VouchersWorkspace() {
  const [activeView, setActiveView] = useState<VoucherView>('issue')

  return (
    <div className="voucher-workspace">
      <style>{`
        .voucher-workspace-header{display:flex;justify-content:space-between;align-items:flex-start;gap:18px;margin-bottom:18px}
        .voucher-workspace-header p{max-width:720px}
        .voucher-action-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px;margin-bottom:18px}
        .voucher-action{appearance:none;text-align:left;border:1px solid var(--border);background:var(--surface);border-radius:16px;padding:18px;cursor:pointer;transition:.18s ease;min-height:150px;display:flex;flex-direction:column}
        .voucher-action:hover{border-color:var(--brand);transform:translateY(-1px);box-shadow:0 10px 28px rgba(15,23,42,.07)}
        .voucher-action.active{border-color:var(--brand);box-shadow:0 0 0 2px rgba(37,99,235,.1)}
        .voucher-action-index{font-size:11px;font-weight:800;letter-spacing:.08em;text-transform:uppercase;color:var(--brand-fg);margin-bottom:12px}
        .voucher-action strong{font-size:17px;color:var(--text-primary);margin-bottom:7px}
        .voucher-action p{font-size:13px;line-height:1.5;color:var(--text-2);margin:0 0 14px}
        .voucher-action span:last-child{margin-top:auto;font-size:12px;font-weight:800;color:var(--brand-fg)}
        .voucher-view-shell{min-width:0}
        @media(max-width:820px){.voucher-action-grid{grid-template-columns:1fr}.voucher-action{min-height:0}.voucher-workspace-header{display:block}}
      `}</style>

      <div className="voucher-workspace-header">
        <div>
          <h1 className="page-title">Vouchers</h1>
          <p className="page-subtitle">Choose one task. Only the selected workspace opens, so issuing, stock management, and reporting never compete on the same page.</p>
        </div>
        <span className="badge badge-success">Redemption records the sale</span>
      </div>

      <nav className="voucher-action-grid" aria-label="Voucher workspace">
        {views.map((view, index) => (
          <button
            type="button"
            key={view.key}
            className={`voucher-action ${activeView === view.key ? 'active' : ''}`}
            onClick={() => setActiveView(view.key)}
            aria-pressed={activeView === view.key}
          >
            <span className="voucher-action-index">Task {index + 1}</span>
            <strong>{view.title}</strong>
            <p>{view.description}</p>
            <span>{activeView === view.key ? 'Open now' : view.action} →</span>
          </button>
        ))}
      </nav>

      <div className="voucher-view-shell">
        {activeView === 'issue' && <AgentVoucherIssuancePanel />}
        {activeView === 'stock' && <VouchersManager />}
        {activeView === 'report' && <AgentVoucherAccountabilityReport />}
      </div>
    </div>
  )
}
