import { redirect } from 'next/navigation'
import RegisterAgentPanel from '@/components/RegisterAgentPanel'
import AgentActionsPanel from '@/components/AgentActionsPanel'
import AgentSalesControlsPanel from '@/components/AgentSalesControlsPanel'
import type { AdminSessionResponse, AgentItem, PackageCatalogResponse } from '@/lib/admin-types'
import { fetchApi } from '@/lib/api'
import { encodeAgentSalesPolicy } from '@/lib/agent-sales-policy'
import { formatCurrency, getStatusBadgeClass } from '@/lib/format'
import { isVendorWorkspace } from '@/lib/workspace'

export const dynamic = 'force-dynamic'

type HybridAgent = {
  id: string
  code: string
  name: string
  phoneNumber: string
  email?: string | null
  type: string
  status: string
  territory?: string | null
  commissionRateBps: number
  cashLimitUgx: number
  notes?: string | null
  tenant: { id: string; name: string }
  policy: { cashEnabled: boolean; mobileMoneyEnabled: boolean; allowedPackageIds: string[] }
  totalSalesUgx: number
  mobileMoneySalesUgx: number
  cashSalesUgx: number
  commissionUgx: number
  cashToCollectUgx: number
  availableVoucherStock: number
  loginReady: boolean
}

type HybridOverview = {
  summary: {
    activeAgents: number
    totalSalesUgx: number
    mobileMoneySalesUgx: number
    totalCommissionUgx: number
    cashToCollectUgx: number
  }
  agents: HybridAgent[]
}

export default async function AgentsPage() {
  const session = await fetchApi<AdminSessionResponse>('/auth/me')
  if (session?.user.role === 'VoucherAgent') redirect('/dashboard')

  const [overview, packages] = await Promise.all([
    fetchApi<HybridOverview>('/agent-sales/overview'),
    fetchApi<PackageCatalogResponse>('/packages').catch(() => null),
  ])
  const canManageBusinessAgents = isVendorWorkspace(session?.user)
  const activePackages = (packages?.items ?? []).filter((pkg) => pkg.status === 'ACTIVE')

  return (
    <>
      <div className="page-header">
        <div>
          <h1 className="page-title">Agents</h1>
          <p className="page-subtitle">Hybrid agent sales: printed vouchers, live cash activation, Mobile Money, commission and cash accountability.</p>
        </div>
        {canManageBusinessAgents && <RegisterAgentPanel />}
      </div>

      <div className="stats-grid" style={{ marginBottom: 16 }}>
        <Stat label="Active Agents" value={`${overview?.summary.activeAgents ?? 0}`} tone="blue" note="Enabled seller accounts" />
        <Stat label="Agent Sales" value={formatCurrency(overview?.summary.totalSalesUgx ?? 0)} tone="green" note={`Mobile Money ${formatCurrency(overview?.summary.mobileMoneySalesUgx ?? 0)}`} />
        <Stat label="Agent Commission" value={formatCurrency(overview?.summary.totalCommissionUgx ?? 0)} tone="purple" note="Earned across cash and online sales" />
        <Stat label="Cash to Collect" value={formatCurrency(overview?.summary.cashToCollectUgx ?? 0)} tone="amber" note="After agent commission and settlements" />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12, marginBottom: 16 }}>
        <ModeCard icon="⚡" title="Activate Now" text="Customer requests a 6-digit device code from the captive portal. The agent completes Cash or Mobile Money and the same device connects." />
        <ModeCard icon="🎟" title="Voucher for Later" text="Generate one voucher only after Cash confirmation or provider-confirmed Mobile Money. The package starts when the voucher is redeemed." />
        <ModeCard icon="🖨" title="Offline / PDF Vouchers" text="Your existing printed voucher workflow stays available for agents without reliable internet or smartphones." />
      </div>

      <div className="card">
        <div className="card-header">
          <div>
            <span className="card-title">Agent Sales & Accountability</span>
            <div style={{ color: 'var(--text-muted)', fontSize: 12, marginTop: 3 }}>Cash limits block only new cash sales. Mobile Money can continue because the agent never holds that money.</div>
          </div>
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Agent</th>
                <th>Login</th>
                <th>Commission</th>
                <th>Permissions</th>
                <th>Cash Limit</th>
                <th>Sales</th>
                <th>Cash to Collect</th>
                <th>Offline Stock</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {(!overview?.agents || overview.agents.length === 0) && (
                <tr><td colSpan={10}><div className="empty-state"><p>No agents have been registered yet.</p></div></td></tr>
              )}
              {(overview?.agents ?? []).map((agent) => {
                const actionAgent = toAgentItem(agent)
                return (
                  <tr key={agent.id}>
                    <td>
                      <div style={{ fontWeight: 700, color: 'var(--text-primary)' }}>{agent.name}</div>
                      <div style={{ fontSize: 11.5, color: 'var(--text-muted)' }}>{agent.code} · {agent.phoneNumber}</div>
                      {agent.territory && <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{agent.territory}</div>}
                    </td>
                    <td>
                      {agent.loginReady ? (
                        <><span className="badge badge-success">Ready</span><div style={{ fontSize: 11, marginTop: 4, color: 'var(--text-muted)' }}>{agent.email}</div></>
                      ) : <span className="badge badge-warning">No login</span>}
                    </td>
                    <td style={{ fontWeight: 700 }}>{(agent.commissionRateBps / 100).toFixed(1)}%<div style={{ fontSize: 11, fontWeight: 400, color: 'var(--text-muted)' }}>{formatCurrency(agent.commissionUgx)} earned</div></td>
                    <td style={{ fontSize: 12 }}>
                      <div>{agent.policy.cashEnabled ? '✓ Cash' : '— Cash'}</div>
                      <div>{agent.policy.mobileMoneyEnabled ? '✓ Mobile Money' : '— Mobile Money'}</div>
                      <div style={{ color: 'var(--text-muted)' }}>{agent.policy.allowedPackageIds.length ? `${agent.policy.allowedPackageIds.length} package(s)` : 'All packages'}</div>
                    </td>
                    <td>{agent.cashLimitUgx > 0 ? formatCurrency(agent.cashLimitUgx) : 'No limit'}</td>
                    <td>
                      <div style={{ fontWeight: 700 }}>{formatCurrency(agent.totalSalesUgx)}</div>
                      <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>MM {formatCurrency(agent.mobileMoneySalesUgx)}</div>
                    </td>
                    <td><strong style={{ color: agent.cashToCollectUgx > 0 ? 'var(--warn-fg)' : 'var(--success-fg)' }}>{formatCurrency(agent.cashToCollectUgx)}</strong></td>
                    <td>{agent.availableVoucherStock}</td>
                    <td><span className={getStatusBadgeClass(agent.status)}>{agent.status.toLowerCase()}</span></td>
                    <td>
                      <div style={{ display: 'grid', gap: 7 }}>
                        {canManageBusinessAgents && (
                          <AgentSalesControlsPanel
                            agentId={agent.id}
                            policy={agent.policy}
                            cashLimitUgx={agent.cashLimitUgx}
                            cashToCollectUgx={agent.cashToCollectUgx}
                            packages={activePackages.map((pkg) => ({ id: pkg.id, name: pkg.name }))}
                          />
                        )}
                        <AgentActionsPanel agent={actionAgent} canManage={canManageBusinessAgents} />
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>
    </>
  )
}

function toAgentItem(agent: HybridAgent): AgentItem {
  return {
    id: agent.id,
    code: agent.code,
    name: agent.name,
    phoneNumber: agent.phoneNumber,
    email: agent.email,
    type: agent.type,
    status: agent.status,
    territory: agent.territory,
    commissionRateBps: agent.commissionRateBps,
    floatLimitUgx: agent.cashLimitUgx,
    notes: encodeAgentSalesPolicy(agent.notes ?? '', agent.policy),
    createdAt: new Date().toISOString(),
    tenant: agent.tenant,
    wallet: null,
    walletBalanceUgx: 0,
    availableFloatUgx: 0,
    accruedCommissionUgx: agent.commissionUgx,
    settledCommissionUgx: 0,
    lifetimeSalesUgx: agent.totalSalesUgx,
    voucherSalesUgx: agent.cashSalesUgx,
    voucherAgentPayUgx: agent.commissionUgx,
    cashToCollectUgx: agent.cashToCollectUgx,
    lifetimeCommissionUgx: agent.commissionUgx,
    totalDisbursedUgx: 0,
  }
}

function Stat({ label, value, note, tone }: { label: string; value: string; note: string; tone: string }) {
  return (
    <div className={`stat-card ${tone}`}>
      <div className="stat-label">{label}</div>
      <div className={`stat-value ${tone}`}>{value}</div>
      <div style={{ fontSize: 11.5, color: 'var(--text-muted)', marginTop: 5 }}>{note}</div>
    </div>
  )
}

function ModeCard({ icon, title, text }: { icon: string; title: string; text: string }) {
  return (
    <div className="card" style={{ margin: 0, padding: 15 }}>
      <div style={{ display: 'flex', gap: 9, alignItems: 'center', marginBottom: 7 }}><span style={{ fontSize: 20 }}>{icon}</span><strong>{title}</strong></div>
      <p style={{ margin: 0, color: 'var(--text-muted)', fontSize: 12.5, lineHeight: 1.55 }}>{text}</p>
    </div>
  )
}
