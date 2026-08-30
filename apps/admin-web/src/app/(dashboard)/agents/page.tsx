import { redirect } from 'next/navigation'
import RegisterAgentPanel from '@/components/RegisterAgentPanel'
import AgentActionsPanel from '@/components/AgentActionsPanel'
import AgentLoginPanel from '@/components/AgentLoginPanel'
import AgentSalesControlsPanel from '@/components/AgentSalesControlsPanel'
import type { AgentItem, PackageCatalogResponse } from '@/lib/admin-types'
import { fetchApi, getAdminSession } from '@/lib/api'
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

function isTrialPackage(pkg: PackageCatalogResponse['items'][number]) {
  const haystack = `${pkg.name} ${pkg.code} ${pkg.description ?? ''}`.toLowerCase()
  return Boolean(pkg.isTrialEnabled) || (pkg.activePriceUgx ?? 0) <= 0 || haystack.includes('trial')
}

export default async function AgentsPage() {
  const session = await getAdminSession()
  if (session?.user.role === 'VoucherAgent') redirect('/dashboard')

  const canManageBusinessAgents = isVendorWorkspace(session?.user)
  const [overview, packages] = await Promise.all([
    fetchApi<HybridOverview>('/agent-sales/overview'),
    canManageBusinessAgents
      ? fetchApi<PackageCatalogResponse>('/packages').catch(() => null)
      : Promise.resolve<PackageCatalogResponse | null>(null),
  ])
  const activePackages = (packages?.items ?? []).filter((pkg) => pkg.status === 'ACTIVE' && !isTrialPackage(pkg))

  return (
    <div style={{ display: 'grid', gap: 14 }}>
      <div className="page-header" style={{ marginBottom: 0 }}>
        <div>
          <h1 className="page-title">Agents</h1>
          <p className="page-subtitle">Manage sellers, commissions, cash due and voucher stock.</p>
        </div>
        {canManageBusinessAgents && <RegisterAgentPanel />}
      </div>

      <div className="stats-grid">
        <Stat label="Active Agents" value={`${overview?.summary.activeAgents ?? 0}`} tone="blue" />
        <Stat label="Total Sales" value={formatCurrency(overview?.summary.totalSalesUgx ?? 0)} tone="green" />
        <Stat label="Commission" value={formatCurrency(overview?.summary.totalCommissionUgx ?? 0)} tone="purple" />
        <Stat label="Cash to Collect" value={formatCurrency(overview?.summary.cashToCollectUgx ?? 0)} tone="amber" />
      </div>

      <div className="card" style={{ margin: 0, padding: '11px 14px', display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
        <strong style={{ fontSize: 12.5 }}>Agent workflow:</strong>
        <span style={{ color: 'var(--text-muted)', fontSize: 12 }}>Agent signs in at arofi.net/login → taps Sell WiFi / Internet → chooses a package → gives the customer the generated access code.</span>
      </div>

      <div className="card" style={{ margin: 0 }}>
        <div className="card-header">
          <span className="card-title">Agent Accounts</span>
          <span style={{ color: 'var(--text-muted)', fontSize: 11.5 }}>{overview?.agents.length ?? 0} registered</span>
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Agent</th>
                <th>Sales</th>
                <th>Commission</th>
                <th>Cash Due</th>
                <th>Voucher Stock</th>
                <th>Access</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {(!overview?.agents || overview.agents.length === 0) && (
                <tr><td colSpan={8}><div className="empty-state"><p>No Agents registered yet.</p></div></td></tr>
              )}
              {(overview?.agents ?? []).map((agent) => {
                const actionAgent = toAgentItem(agent)
                return (
                  <tr key={agent.id}>
                    <td>
                      <div style={{ fontWeight: 750, color: 'var(--text-primary)' }}>{agent.name}</div>
                      <div style={{ fontSize: 11.5, color: 'var(--text-muted)', marginTop: 2 }}>{agent.code} · {agent.phoneNumber}</div>
                      <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>{agent.email || 'No login email'}</div>
                    </td>
                    <td>
                      <strong>{formatCurrency(agent.totalSalesUgx)}</strong>
                      <div style={{ fontSize: 10.5, color: 'var(--text-muted)', marginTop: 3 }}>Cash {formatCurrency(agent.cashSalesUgx)} · MoMo {formatCurrency(agent.mobileMoneySalesUgx)}</div>
                    </td>
                    <td><strong style={{ color: 'var(--success-fg)' }}>{formatCurrency(agent.commissionUgx)}</strong><div style={{ fontSize: 10.5, color: 'var(--text-muted)', marginTop: 3 }}>{(agent.commissionRateBps / 100).toFixed(1)}% rate</div></td>
                    <td><strong style={{ color: agent.cashToCollectUgx > 0 ? 'var(--warn-fg)' : 'var(--success-fg)' }}>{formatCurrency(agent.cashToCollectUgx)}</strong></td>
                    <td><strong>{agent.availableVoucherStock}</strong></td>
                    <td>
                      <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
                        {agent.policy.cashEnabled && <span className="badge badge-info">Cash</span>}
                        {agent.policy.mobileMoneyEnabled && <span className="badge badge-success">Mobile Money</span>}
                      </div>
                    </td>
                    <td><span className={getStatusBadgeClass(agent.status)}>{agent.status.toLowerCase()}</span></td>
                    <td>
                      <div style={{ display: 'grid', gap: 6, minWidth: 150 }}>
                        {canManageBusinessAgents && <AgentLoginPanel agent={{ id: agent.id, name: agent.name, email: agent.email }} loginReady={agent.loginReady} />}
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
    </div>
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

function Stat({ label, value, tone }: { label: string; value: string; tone: string }) {
  return (
    <div className={`stat-card ${tone}`}>
      <div className="stat-label">{label}</div>
      <div className={`stat-value ${tone}`}>{value}</div>
    </div>
  )
}
