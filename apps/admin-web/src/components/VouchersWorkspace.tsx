'use client'

import { useMemo, useState } from 'react'
import AgentAssignedVoucherStock from './AgentAssignedVoucherStock'
import AgentSalesAccountability from './AgentSalesAccountability'
import AgentVoucherAccountabilityReport from './AgentVoucherAccountabilityReport'
import AgentVoucherIssuancePanel from './AgentVoucherIssuancePanel'
import VouchersManager from './VouchersManager'

type VoucherView = 'issue' | 'stock' | 'report'

type Props = { isAgent?: boolean }

export default function VouchersWorkspace({ isAgent = false }: Props) {
  const views = useMemo<Array<{ key: VoucherView; title: string }>>(
    () => isAgent
      ? [{ key: 'stock', title: 'Offline Stock' }, { key: 'report', title: 'My Sales' }]
      : [{ key: 'issue', title: 'Issue' }, { key: 'stock', title: 'Stock' }, { key: 'report', title: 'Sales' }],
    [isAgent],
  )
  const [activeView, setActiveView] = useState<VoucherView>(isAgent ? 'stock' : 'issue')

  return (
    <div className="voucher-workspace">
      <style>{`
        .voucher-workspace-header{display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:14px}
        .voucher-tabs{display:inline-flex;gap:3px;padding:3px;border:1px solid var(--border);border-radius:10px;background:var(--bg-card);margin-bottom:14px}
        .voucher-tab{min-width:92px;height:36px;padding:0 16px;border:0;border-radius:7px;background:transparent;color:var(--text-2);font:600 13px var(--ui-font);cursor:pointer;transition:background .15s,color .15s}
        .voucher-tab:hover{background:var(--bg-hover);color:var(--text-1)}
        .voucher-tab.active{background:var(--brand);color:#fff}
        .voucher-view-shell{min-width:0}
        @media(max-width:640px){.voucher-workspace-header{align-items:flex-start}.voucher-tabs{display:grid;grid-template-columns:repeat(2,1fr);width:100%}.voucher-tab{min-width:0;padding:0 8px}}
      `}</style>

      <div className="voucher-workspace-header">
        <div>
          <h1 className="page-title">{isAgent ? 'Offline Vouchers' : 'Vouchers'}</h1>
          {isAgent && <p className="page-subtitle">Only voucher stock assigned to you by the business owner is available here. Agents cannot create templates or generate voucher batches.</p>}
        </div>
      </div>

      <nav className="voucher-tabs" aria-label="Voucher sections">
        {views.map((view) => (
          <button type="button" key={view.key} className={`voucher-tab ${activeView === view.key ? 'active' : ''}`} onClick={() => setActiveView(view.key)} aria-pressed={activeView === view.key}>
            {view.title}
          </button>
        ))}
      </nav>

      <div className="voucher-view-shell">
        {!isAgent && activeView === 'issue' && <AgentVoucherIssuancePanel />}
        {activeView === 'stock' && (isAgent ? <AgentAssignedVoucherStock /> : <VouchersManager />)}
        {activeView === 'report' && (isAgent ? <AgentSalesAccountability /> : <AgentVoucherAccountabilityReport />)}
      </div>
    </div>
  )
}
