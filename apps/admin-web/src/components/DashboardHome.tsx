import {
  AdminSessionResponse,
  BillingOverviewResponse,
  RouterOverviewResponse,
  SessionOverviewResponse,
  TenantOverviewResponse,
  VouchersOverviewResponse,
  PackageCatalogResponse,
} from '@/lib/admin-types'
import OnboardingWizard from '@/components/OnboardingWizard'
import { fetchApi } from '@/lib/api'
import { formatCurrency, formatDate, formatMegabytes, getStatusBadgeClass } from '@/lib/format'
import { isVendorWorkspace } from '@/lib/workspace'
import { DashboardAutoRefresh } from '@/components/DashboardAutoRefresh'
import { RevenueChart } from '@/components/charts/RevenueChart'
import { SalesMixChart } from '@/components/charts/SalesMixChart'
import { RouterUsageChart } from '@/components/charts/RouterUsageChart'
import { Cpu, Database, Users, Wallet, CreditCard, ArrowUpRight, CheckCircle2, AlertCircle } from 'lucide-react'
import type { CSSProperties, ReactNode } from 'react'

type DashboardSearchParams = { range?: string; from?: string; to?: string }

export default async function DashboardHome({ searchParams }: { searchParams?: DashboardSearchParams }) {
  const session = await fetchApi<AdminSessionResponse>('/auth/me')
  const isVendor = isVendorWorkspace(session?.user)

  if (isVendor) {
    return <VendorDashboard session={session} searchParams={searchParams} />
  }

  return <PlatformDashboard />
}

async function PlatformDashboard() {
  const [tenants, routers, payoutProfile] = await Promise.all([
    fetchApi<TenantOverviewResponse>('/tenants'),
    fetchApi<RouterOverviewResponse>('/routers/overview'),
    fetchApi<any>('/wallets/payouts/profile/me'),
  ])

  const tenantItems = tenants?.items ?? []
  const routerItems = routers?.routers ?? []
  const recentHealthChecks = routers?.recentHealthChecks ?? []
  const totalActiveSessions = routerItems.reduce((sum, r) => sum + (r.activeSessions ?? 0), 0)
  const liveRouters = routers?.summary.liveRouters ?? routerItems.filter((r) => r.liveState === 'LIVE').length
  const totalRouters = routers?.summary.totalRouters ?? routerItems.length

  const verifiedNumbers = payoutProfile?.numbers?.filter((item: any) => item.status === 'VERIFIED') ?? []
  const primaryNumber = verifiedNumbers.find((item: any) => item.isPrimary) ?? verifiedNumbers[0] ?? null
  const availableUgx = payoutProfile?.wallet?.balanceUgx ?? 0
  const minimumPayoutUgx = payoutProfile?.rules?.minimumPayoutUgx ?? 0

  return (
    <>
      <div className="page-header">
        <div>
          <h1 className="page-title">Developer Admin Dashboard</h1>
          <p className="page-subtitle">Platform overview — all live data.</p>
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          <a href="/support" className="btn btn-ghost">Support Queue</a>
          <a href="/tenants" className="btn btn-primary">Add Vendor</a>
        </div>
      </div>

      {/* KPI Strip */}
      <div className="stats-grid" style={{ marginBottom: 14 }}>
        <Stat label="Live Routers" value={`${liveRouters} / ${totalRouters}`} color="green" note="Currently sending signals" />
        <Stat label="Active Sessions" value={`${totalActiveSessions}`} color="blue" note="Users online right now" />
        <Stat label="Vendors" value={`${tenants?.summary.totalTenants ?? 0}`} color="purple" note="Business workspaces" />
        <Stat label="Platform Balance" value={formatCurrency(availableUgx)} color="amber" note="Available to withdraw" />
      </div>

      {/* Platform Wallet Panel */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 360px), 1fr))', gap: 12, marginBottom: 14 }}>
        {/* Visual Credit Card Style Wallet Card */}
        <div style={{
          background: 'linear-gradient(135deg, #10B981 0%, #059669 100%)',
          borderRadius: 14,
          padding: '24px 26px',
          color: '#ffffff',
          position: 'relative',
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          minHeight: 228,
          boxShadow: '0 10px 25px -5px rgba(16, 185, 129, 0.35), 0 8px 10px -6px rgba(16, 185, 129, 0.35)',
        }}>
          <div style={{ position: 'absolute', top: -24, right: -24, width: 148, height: 148, borderRadius: '50%', background: 'rgba(255,255,255,0.08)', pointerEvents: 'none' }} />
          <div style={{ position: 'absolute', bottom: -44, left: -24, width: 168, height: 168, borderRadius: '50%', background: 'rgba(255,255,255,0.04)', pointerEvents: 'none' }} />
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', zIndex: 2 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <Wallet size={18} />
              <span style={{ fontSize: 13, fontWeight: 700, letterSpacing: '0.08em', opacity: 0.9 }}>PLATFORM WALLET</span>
            </div>
            <div style={{ display: 'flex', gap: 4 }}>
              <div style={{ width: 18, height: 18, borderRadius: '50%', background: 'rgba(255,255,255,0.75)', mixBlendMode: 'overlay' }} />
              <div style={{ width: 18, height: 18, borderRadius: '50%', background: 'rgba(255,255,255,0.45)', marginLeft: -9, mixBlendMode: 'overlay' }} />
            </div>
          </div>
          <div style={{ zIndex: 2, marginTop: 10 }}>
            <div style={{ fontSize: 12, opacity: 0.85, fontWeight: 500 }}>Platform Revenue Balance</div>
            <div style={{ fontSize: 32, fontWeight: 800, marginTop: 4, letterSpacing: '-0.02em' }}>{formatCurrency(availableUgx)}</div>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', zIndex: 2, marginTop: 10 }}>
            <div>
              <div style={{ fontSize: 9, opacity: 0.7, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Account Owner</div>
              <div style={{ fontSize: 13, fontWeight: 600, marginTop: 2 }}>Dev Admin</div>
            </div>
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontSize: 9, opacity: 0.7, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Payout Network</div>
              <div style={{ fontSize: 13, fontWeight: 600, marginTop: 2 }}>
                {primaryNumber ? `${primaryNumber.network} Line` : 'None Configured'}
              </div>
            </div>
          </div>
        </div>

        {/* Withdrawal Settings */}
        <div className="card" style={{ padding: 15, display: 'flex', flexDirection: 'column', justifyContent: 'space-between', margin: 0 }}>
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
              <span style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-1)' }}>Platform Withdrawal Settings</span>
              <a href="/earnings" style={{ color: 'var(--green)', textDecoration: 'none', fontSize: 12, fontWeight: 600 }}>Manage</a>
            </div>
            <div style={{ display: 'grid', gap: 10 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, borderBottom: '1px solid var(--border-soft)', paddingBottom: 8 }}>
                <span style={{ color: 'var(--text-2)' }}>Primary payout number</span>
                <span style={{ fontWeight: 600, color: 'var(--text-1)', fontFamily: 'monospace' }}>
                  {primaryNumber ? `${primaryNumber.network} - ${primaryNumber.normalizedPhone}` : <span style={{ color: '#ef4444' }}>Not set</span>}
                </span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, borderBottom: '1px solid var(--border-soft)', paddingBottom: 8 }}>
                <span style={{ color: 'var(--text-2)' }}>Secret key verification</span>
                <span>
                  {payoutProfile?.profile?.secretConfigured ? (
                    <span style={{ color: '#16a34a', display: 'inline-flex', alignItems: 'center', gap: 5, fontWeight: 600 }}><CheckCircle2 size={14} /> Set</span>
                  ) : (
                    <span style={{ color: '#f59e0b', display: 'inline-flex', alignItems: 'center', gap: 5, fontWeight: 600 }}><AlertCircle size={14} /> Setup needed</span>
                  )}
                </span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
                <span style={{ color: 'var(--text-2)' }}>Minimum withdrawable</span>
                <span style={{ fontWeight: 600, color: 'var(--text-1)' }}>{minimumPayoutUgx > 0 ? formatCurrency(minimumPayoutUgx) : 'None'}</span>
              </div>
            </div>
          </div>
          <a href="/earnings" className="btn btn-primary btn-block" style={{ marginTop: 14, display: 'inline-flex', gap: 6 }}>
            Withdraw Platform Fees <ArrowUpRight size={16} />
          </a>
        </div>

        {/* Withdrawal History */}
        <div className="card" style={{ padding: 15, margin: 0, display: 'flex', flexDirection: 'column' }}>
          <span style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-1)', marginBottom: 12 }}>Platform Withdrawals</span>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, flex: 1, overflowY: 'auto', maxHeight: 150 }}>
            {(!payoutProfile?.recentWithdrawals || payoutProfile.recentWithdrawals.length === 0) ? (
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'var(--text-muted)', fontSize: 13, padding: '20px 0', gap: 6 }}>
                <CreditCard size={24} style={{ opacity: 0.4 }} />
                <span>No payout history found</span>
              </div>
            ) : (
              payoutProfile.recentWithdrawals.map((item: any) => (
                <div key={item.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 13, paddingBottom: 8, borderBottom: '1px solid var(--border-soft)' }}>
                  <div>
                    <div style={{ fontWeight: 600, color: 'var(--text-1)' }}>{formatCurrency(item.amountUgx)}</div>
                    <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{formatDate(item.createdAt)}</div>
                  </div>
                  <span className={getStatusBadgeClass(item.status)} style={{ fontSize: 11 }}>{item.status.toLowerCase()}</span>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {/* Router Network Live Grid */}
      <div className="card" style={{ marginBottom: 14 }}>
        <div className="card-header">
          <span className="card-title">Router Network</span>
          <a href="/admin/router" className="btn btn-ghost" style={{ padding: '5px 12px', fontSize: 12 }}>Observability</a>
        </div>
        {routerItems.length === 0 ? (
          <div className="empty-state" style={{ padding: 18 }}><p>No routers registered yet.</p></div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 12, padding: '0 20px 20px' }}>
            {routerItems.map((router) => {
              const stateColor = router.liveState === 'LIVE' ? '#16a34a' : router.liveState === 'STALE' ? '#f59e0b' : router.liveState === 'OFFLINE' ? '#ef4444' : '#9aa3b2'
              const stateBg = router.liveState === 'LIVE' ? 'rgba(22,163,74,0.1)' : router.liveState === 'STALE' ? 'rgba(245,158,11,0.1)' : router.liveState === 'OFFLINE' ? 'rgba(239,68,68,0.1)' : 'rgba(156,163,175,0.1)'
              return (
                <a key={router.id} href="/admin/router" style={{ textDecoration: 'none', color: 'inherit' }}>
                  <div style={{ border: '1px solid var(--border)', borderRadius: 10, padding: '14px 16px', background: 'var(--surface)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
                      <div style={{ fontWeight: 700, fontSize: 13, color: 'var(--text-1)', lineHeight: 1.3, flex: 1, marginRight: 8 }}>{router.name}</div>
                      <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 99, background: stateBg, color: stateColor, flexShrink: 0 }}>
                        {router.liveState ?? 'PENDING'}
                      </span>
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--text-3)', marginBottom: 10 }}>{router.tenant?.name ?? '—'}</div>
                    <div style={{ display: 'flex', gap: 14, fontSize: 12 }}>
                      <div>
                        <div style={{ color: 'var(--text-3)', fontSize: 10, textTransform: 'uppercase' }}>Users</div>
                        <div style={{ fontWeight: 700, color: 'var(--text-1)' }}>{router.activeSessions ?? 0}</div>
                      </div>
                      <div>
                        <div style={{ color: 'var(--text-3)', fontSize: 10, textTransform: 'uppercase' }}>Latency</div>
                        <div style={{ fontWeight: 700, color: 'var(--text-1)' }}>
                          {router.latestHealthCheck?.latencyMs != null ? `${router.latestHealthCheck.latencyMs}ms` : '—'}
                        </div>
                      </div>
                      <div style={{ flex: 1 }}>
                        <div style={{ color: 'var(--text-3)', fontSize: 10, textTransform: 'uppercase' }}>Last Signal</div>
                        <div style={{ fontWeight: 600, color: 'var(--text-2)', fontSize: 11 }}>
                          {router.lastSignalAt ? formatDate(router.lastSignalAt) : '—'}
                        </div>
                      </div>
                    </div>
                  </div>
                </a>
              )
            })}
          </div>
        )}
      </div>

      {/* Bottom Tables */}
      <div className="charts-grid">
        <div className="card">
          <div className="card-header">
            <span className="card-title">Vendor Workspaces</span>
            <a href="/tenants" className="btn btn-ghost" style={{ padding: '5px 12px', fontSize: 12 }}>Manage</a>
          </div>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Vendor</th>
                  <th>Routers</th>
                  <th>Users</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {tenantItems.length === 0 && <EmptyRow colSpan={4} text="No vendors have been onboarded yet." />}
                {tenantItems.slice(0, 8).map((tenant) => (
                  <tr key={tenant.id}>
                    <td>
                      <div style={{ fontWeight: 600 }}>{tenant.name}</div>
                      <div style={{ fontSize: 11, color: 'var(--text-3)' }}>{tenant.domain ?? 'No domain'}</div>
                    </td>
                    <td>{tenant.counts.routers}</td>
                    <td>{tenant.counts.users}</td>
                    <td><span className={getStatusBadgeClass(tenant.domain ? 'success' : 'pending')}>{tenant.domain ? 'ready' : 'setup needed'}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="card">
          <div className="card-header">
            <span className="card-title">Recent Health Checks</span>
            <a href="/admin/router" className="btn btn-ghost" style={{ padding: '5px 12px', fontSize: 12 }}>All Routers</a>
          </div>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Router</th>
                  <th>Vendor</th>
                  <th>Status</th>
                  <th>Latency</th>
                  <th>Checked</th>
                </tr>
              </thead>
              <tbody>
                {recentHealthChecks.length === 0 && <EmptyRow colSpan={5} text="No router health checks yet." />}
                {recentHealthChecks.slice(0, 8).map((check) => (
                  <tr key={check.id}>
                    <td>{check.router.name}</td>
                    <td style={{ fontSize: 12, color: 'var(--text-2)' }}>{check.tenant.name}</td>
                    <td><span className={getStatusBadgeClass(check.status)}>{check.status.toLowerCase()}</span></td>
                    <td style={{ fontSize: 12 }}>{check.latencyMs != null ? `${check.latencyMs}ms` : '—'}</td>
                    <td style={{ fontSize: 12 }}>{formatDate(check.checkedAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </>
  )
}

async function VendorDashboard({ session, searchParams }: { session: AdminSessionResponse | null; searchParams?: DashboardSearchParams }) {
  const range = resolveDashboardRange(searchParams)
  const query = new URLSearchParams({ from: range.from.toISOString(), to: range.to.toISOString() }).toString()
  const [billing, routers, sessions, vouchers, payoutProfile, packages, tenantSettings, compliance] = await Promise.all([
    fetchApi<BillingOverviewResponse>(`/billing/overview?${query}`),
    fetchApi<RouterOverviewResponse>('/routers/overview'),
    fetchApi<SessionOverviewResponse>('/sessions/overview'),
    fetchApi<VouchersOverviewResponse>('/vouchers/overview'),
    fetchApi<any>('/wallets/payouts/profile/me'),
    fetchApi<PackageCatalogResponse>('/packages'),
    fetchApi<any>('/system/tenant-settings').catch(() => null),
    fetchApi<{ status: string }>('/compliance/me').catch(() => null),
  ])
  const complianceStatus = compliance?.status ?? 'NOT_SUBMITTED'

  const hasRouter = Boolean(routers?.routers && routers.routers.length > 0)
  const hasPackage = Boolean(packages?.items && packages.items.length > 0)
  const hasVouchers = Boolean(vouchers?.batches && vouchers.batches.length > 0)
  const firstRouter = routers?.routers?.[0] || null

  const prefs = (tenantSettings?.settings?.routerOnboardingPreferences as Record<string, any> | null) ?? {}
  const onboardingCompletedAt = prefs.onboardingCompletedAt
  const selfServiceOnboarding = Boolean(prefs.selfServiceOnboarding)

  // Self-service tenants should be able to leave and come back mid-flow
  // without losing the guided router/package/voucher setup path.
  const onboardingIncomplete =
    selfServiceOnboarding &&
    !onboardingCompletedAt &&
    (!hasRouter || !hasPackage || !hasVouchers)

  const recentTransactions = billing?.recentTransactions ?? []
  const activeSessions = sessions?.activeSessions ?? []
  const routerItems = routers?.routers ?? []
  const now = range.to
  const dateRange = `${formatShortDate(range.from)} - ${formatShortDate(range.to)}`
  const liveRouters = routers?.summary.liveRouters ?? routerItems.filter((router) => router.liveState === 'LIVE').length
  const staleRouters = routers?.summary.staleRouters ?? routerItems.filter((router) => router.liveState === 'STALE').length
  const offlineRouters = routers?.summary.offlineRouters ?? routerItems.filter((router) => router.liveState === 'OFFLINE').length
  const onlineRouters = liveRouters + staleRouters
  const routerStatusLabel = onlineRouters > 0 ? 'Online' : offlineRouters > 0 ? 'Offline' : 'Pending'
  const routerStatusColor = onlineRouters > 0 ? 'var(--green)' : offlineRouters > 0 ? '#ef4444' : '#f59e0b'
  const totalDataUsedMb = activeSessions.reduce((total, item) => total + (item.dataUsedMb ?? 0), 0)

  // Wallet helper calculations
  const verifiedNumbers = payoutProfile?.numbers?.filter((item: any) => item.status === 'VERIFIED') ?? []
  const primaryNumber = verifiedNumbers.find((item: any) => item.isPrimary) ?? verifiedNumbers[0] ?? null
  const availableUgx = payoutProfile?.wallet?.balanceUgx ?? billing?.summary.withdrawableBalanceUgx ?? billing?.summary.walletBalanceUgx ?? 0
  const minimumPayoutUgx = payoutProfile?.rules?.minimumPayoutUgx ?? 0

  return (
    <div className="tenant-dashboard">
      {onboardingIncomplete && (
        <OnboardingWizard
          session={session!}
          initialHasRouter={hasRouter}
          initialRouter={firstRouter}
          initialHasPackage={hasPackage}
          initialHasVouchers={hasVouchers}
          onComplete={async () => {
            'use server'
            // Managed on client side
          }}
        />
      )}
      <DashboardAutoRefresh />
      <div className="dashboard-header">
        <h1 className="page-title">Dashboard</h1>
      </div>

      {complianceStatus !== 'APPROVED' && (
        <a href="/compliance" className={`compliance-banner ${complianceStatus === 'REJECTED' ? 'danger' : ''}`}>
          <strong>
            Compliance Status:{' '}
            {complianceStatus === 'NOT_SUBMITTED'
              ? 'Not Submitted'
              : complianceStatus === 'PENDING_REVIEW'
                ? 'Pending Review'
                : complianceStatus === 'NEEDS_INFO'
                  ? 'Needs More Information'
                  : 'Rejected'}
          </strong>
          <span>
            {complianceStatus === 'NOT_SUBMITTED'
              ? 'Submit your business and hotspot details for verification — AROFi is built for authorised, compliant operators.'
              : complianceStatus === 'PENDING_REVIEW'
                ? 'Your hotspot setup has been submitted for review. Some live selling features may remain limited until approval is completed.'
                : 'Action needed — open the Compliance page to see the reviewer note and resubmit.'}
          </span>
          <span className="compliance-banner-cta">Open Compliance →</span>
        </a>
      )}

      {/* System Insights (with the date filter at its top) and the money KPI
          boxes sit in one row. Platform Fees is intentionally omitted here —
          it's a platform-level number, not something tenants need on their
          own dashboard. Active / Online / Data live in the System Insights
          card only, so they are not repeated in the KPI boxes. */}
      <div className="dashboard-insights-row">
        <DashboardStatTodayMonth
          title="Gross Sales"
          filteredUgx={billing?.summary.grossSalesUgx ?? billing?.summary.totalSalesUgx ?? 0}
          dateRangeLabel={dateRange}
          todayUgx={billing?.summary.todayGrossSalesUgx ?? 0}
          monthUgx={billing?.summary.monthGrossSalesUgx ?? 0}
        />
        <DashboardStatTodayMonth
          title="Net Earnings"
          filteredUgx={billing?.summary.netEarningsUgx ?? billing?.summary.vendorNetUgx ?? 0}
          dateRangeLabel={dateRange}
          todayUgx={billing?.summary.todayNetEarningsUgx ?? 0}
          monthUgx={billing?.summary.monthNetEarningsUgx ?? 0}
        />
        <DashboardStatCompact title="Pending Withdrawals" value={formatCurrency(billing?.summary.pendingWithdrawalUgx ?? 0)} />
        <SystemInsightsCompact
          live={liveRouters > 0}
          activeUsers={billing?.summary.activeUsers ?? sessions?.summary.activeSessions ?? 0}
          onlineRouters={liveRouters}
          dataUsedLabel={formatMegabytes(billing?.summary.dataUsedMb ?? totalDataUsedMb)}
          statusColor={routerStatusColor}
          filter={<DateRangeFilter from={range.from} to={range.to} />}
        />
      </div>

      {/* Modern Wallet Card & Disbursement Settings Panel */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 360px), 1fr))', gap: 12, marginBottom: 4 }}>
        {/* Visual Credit Card Style Wallet Card */}
        <div style={{
          background: 'linear-gradient(135deg, #2563EB 0%, #1D4ED8 100%)',
          borderRadius: 14,
          padding: '24px 26px',
          color: '#ffffff',
          position: 'relative',
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          minHeight: 228,
          boxShadow: '0 10px 25px -5px rgba(37, 99, 235, 0.35), 0 8px 10px -6px rgba(37, 99, 235, 0.35)',
        }}>
          {/* Card background shape accents */}
          <div style={{
            position: 'absolute',
            top: -24,
            right: -24,
            width: 148,
            height: 148,
            borderRadius: '50%',
            background: 'rgba(255, 255, 255, 0.08)',
            pointerEvents: 'none'
          }} />
          <div style={{
            position: 'absolute',
            bottom: -44,
            left: -24,
            width: 168,
            height: 168,
            borderRadius: '50%',
            background: 'rgba(255, 255, 255, 0.04)',
            pointerEvents: 'none'
          }} />

          {/* Top Header */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', zIndex: 2 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <Wallet size={18} />
              <span style={{ fontSize: 13, fontWeight: 700, letterSpacing: '0.08em', opacity: 0.9 }}>AROFi WALLET</span>
            </div>
            <div style={{ display: 'flex', gap: 4 }}>
              <div style={{ width: 18, height: 18, borderRadius: '50%', background: 'rgba(255,255,255,0.75)', mixBlendMode: 'overlay' }} />
              <div style={{ width: 18, height: 18, borderRadius: '50%', background: 'rgba(255,255,255,0.45)', marginLeft: -9, mixBlendMode: 'overlay' }} />
            </div>
          </div>

          {/* Balance */}
          <div style={{ zIndex: 2, marginTop: 10 }}>
            <div style={{ fontSize: 12, opacity: 0.85, fontWeight: 500 }}>Available Balance</div>
            <div style={{ fontSize: 32, fontWeight: 800, marginTop: 4, letterSpacing: '-0.02em' }}>
              {formatCurrency(availableUgx)}
            </div>
          </div>

          {/* Footer Details */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', zIndex: 2, marginTop: 10 }}>
            <div>
              <div style={{ fontSize: 9, opacity: 0.7, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Account Owner</div>
              <div style={{ fontSize: 13, fontWeight: 600, marginTop: 2 }}>{session?.user.tenantName || 'Tenant'}</div>
            </div>
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontSize: 9, opacity: 0.7, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Payout Network</div>
              <div style={{ fontSize: 13, fontWeight: 600, marginTop: 2 }}>
                {primaryNumber ? `${primaryNumber.network} Line` : 'None Configured'}
              </div>
            </div>
          </div>
        </div>

        {/* Disbursement settings & actions */}
        <div className="card" style={{ padding: 15, display: 'flex', flexDirection: 'column', justifyContent: 'space-between', margin: 0 }}>
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
              <span style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-1)' }}>Disbursement Settings</span>
              <a href="/earnings" style={{ color: 'var(--green)', textDecoration: 'none', fontSize: 12, fontWeight: 600 }}>Manage</a>
            </div>

            <div style={{ display: 'grid', gap: 10 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, borderBottom: '1px solid var(--border-soft)', paddingBottom: 8 }}>
                <span style={{ color: 'var(--text-2)' }}>Primary payout number</span>
                <span style={{ fontWeight: 600, color: 'var(--text-1)', fontFamily: 'monospace' }}>
                  {primaryNumber ? `${primaryNumber.network} - ${primaryNumber.normalizedPhone}` : <span style={{ color: '#ef4444' }}>Not set</span>}
                </span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, borderBottom: '1px solid var(--border-soft)', paddingBottom: 8 }}>
                <span style={{ color: 'var(--text-2)' }}>Secret key verification</span>
                <span>
                  {payoutProfile?.profile?.secretConfigured ? (
                    <span style={{ color: '#16a34a', display: 'inline-flex', alignItems: 'center', gap: 5, fontWeight: 600 }}>
                      <CheckCircle2 size={14} /> Set
                    </span>
                  ) : (
                    <span style={{ color: '#f59e0b', display: 'inline-flex', alignItems: 'center', gap: 5, fontWeight: 600 }}>
                      <AlertCircle size={14} /> Setup needed
                    </span>
                  )}
                </span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
                <span style={{ color: 'var(--text-2)' }}>Minimum withdrawable</span>
                <span style={{ fontWeight: 600, color: 'var(--text-1)' }}>
                  {minimumPayoutUgx > 0 ? formatCurrency(minimumPayoutUgx) : 'None'}
                </span>
              </div>
            </div>
          </div>
          <a href="/earnings" className="btn btn-primary btn-block" style={{ marginTop: 14, display: 'inline-flex', gap: 6 }}>
            Withdraw Funds <ArrowUpRight size={16} />
          </a>
        </div>

        {/* Withdrawal History */}
        <div className="card" style={{ padding: 15, margin: 0, display: 'flex', flexDirection: 'column' }}>
          <span style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-1)', marginBottom: 12 }}>Recent Withdrawals</span>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, flex: 1, overflowY: 'auto', maxHeight: 150 }}>
            {(!payoutProfile?.recentWithdrawals || payoutProfile.recentWithdrawals.length === 0) ? (
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'var(--text-muted)', fontSize: 13, padding: '20px 0', gap: 6 }}>
                <CreditCard size={24} style={{ opacity: 0.4 }} />
                <span>No payout history found</span>
              </div>
            ) : (
              payoutProfile.recentWithdrawals.slice(0, 3).map((w: any) => (
                <div key={w.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 13, borderBottom: '1px solid var(--border-soft)', paddingBottom: 8 }}>
                  <div>
                    <div style={{ fontWeight: 600, color: 'var(--text-1)' }}>{formatCurrency(w.amountUgx)}</div>
                    <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{formatDate(w.createdAt)}</div>
                  </div>
                  <span className={getStatusBadgeClass(w.status)}>{w.status.toLowerCase().replace(/_/g, ' ')}</span>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      <div className="dashboard-main-grid">
        <section className="dashboard-panel">
          <div className="dashboard-panel-header">
            <div>
              <div className="dashboard-panel-title">Revenue Overview</div>
              <div className="dashboard-panel-subtitle">{dateRange}</div>
            </div>
          </div>
          <RevenueChart data={billing?.chart ?? []} />
        </section>

        <section className="dashboard-panel">
          <div className="dashboard-panel-header">
            <div>
              <div className="dashboard-panel-title">Recent Sales</div>
              <div className="dashboard-panel-subtitle">You made {recentTransactions.length} sales today.</div>
            </div>
            <a href={`/sales?${query}`} style={{ color: '#9aa3b2', textDecoration: 'none' }}>Open sales</a>
          </div>
          <div className="recent-sales-list">
            {recentTransactions.length === 0 && <div className="empty-state"><p>No recent sales yet.</p></div>}
            {recentTransactions.slice(0, 6).map((transaction) => (
              <div className="recent-sale" key={transaction.id}>
                <div className="sale-avatar">{transaction.voucher ? '[]' : initialsFor(transaction.customerReference ?? 'Customer')}</div>
                <div>
                  <div className="sale-title">{transaction.customerReference ?? transaction.voucher?.code ?? 'Customer'}</div>
                  {transaction.channel === 'MOBILE_MONEY' && transaction.payment?.phoneNumber && transaction.customerReference !== transaction.payment.phoneNumber && (
                    <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '2px' }}>
                      {transaction.payment.phoneNumber}
                    </div>
                  )}
                  <div className="sale-meta">{transaction.package?.name ?? 'Package'} · {transaction.channel?.replace('_', ' ') ?? 'Sale'} · {relativeTime(transaction.createdAt)}</div>
                </div>
                <div className="sale-amount-col">
                  {transaction.grossAmountUgx > 0 ? (
                    <>
                      <div className="sale-amount">+{formatCurrency(transaction.netAmountUgx)}</div>
                      {transaction.feeAmountUgx > 0 && (
                        <div className="sale-fee">fee {formatCurrency(transaction.feeAmountUgx)}</div>
                      )}
                    </>
                  ) : (
                    <div className="sale-redeemed">Redeemed</div>
                  )}
                </div>
              </div>
            ))}
          </div>
          <div className="recent-sales-footer">Showing {Math.min(recentTransactions.length, 20)} recent sales</div>
        </section>
      </div>

      {/* Secondary charts row */}
      <div className="charts-grid" style={{ marginTop: 16 }}>
        <div className="card">
          <div className="card-header">
            <span className="card-title">Sales Mix</span>
            <span style={{ fontSize: 12, color: 'var(--text-3)' }}>{dateRange}</span>
          </div>
          <SalesMixChart
            mobileMoneyUgx={billing?.summary.mobileMoneyGrossUgx ?? 0}
            voucherUgx={billing?.summary.voucherGrossUgx ?? 0}
          />
        </div>
        <div className="card">
          <div className="card-header">
            <span className="card-title">Data Usage by Router</span>
            <span style={{ fontSize: 12, color: 'var(--text-3)' }}>Today</span>
          </div>
          <RouterUsageChart data={sessions?.usageByRouter ?? []} />
        </div>
      </div>
    </div>
  )
}

function relativeTime(iso: string) {
  const then = new Date(iso).getTime()
  if (!Number.isFinite(then)) return ''
  const diffSec = Math.round((Date.now() - then) / 1000)
  if (diffSec < 60) return 'just now'
  const mins = Math.round(diffSec / 60)
  if (mins < 60) return `${mins} min${mins === 1 ? '' : 's'} ago`
  const hours = Math.round(mins / 60)
  if (hours < 24) return `${hours} hour${hours === 1 ? '' : 's'} ago`
  const days = Math.round(hours / 24)
  if (days < 30) return `${days} day${days === 1 ? '' : 's'} ago`
  return new Date(then).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

function resolveDashboardRange(searchParams?: DashboardSearchParams) {
  const now = new Date()
  const key = searchParams?.range ?? 'this-month'
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  if (key === 'today') return { key, from: startOfToday, to: now }
  if (key === 'yesterday') {
    const from = new Date(startOfToday)
    from.setDate(from.getDate() - 1)
    const to = new Date(startOfToday)
    to.setMilliseconds(-1)
    return { key, from, to }
  }
  if (key === 'last-7') {
    const from = new Date(startOfToday)
    from.setDate(from.getDate() - 6)
    return { key, from, to: now }
  }
  if (key === 'last-month') {
    return {
      key,
      from: new Date(now.getFullYear(), now.getMonth() - 1, 1),
      to: new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59, 999),
    }
  }
  if (key === 'custom' && searchParams?.from && searchParams?.to) {
    const from = new Date(searchParams.from)
    const to = new Date(searchParams.to)
    if (Number.isFinite(from.getTime()) && Number.isFinite(to.getTime())) {
      // Include the whole "to" day so a same-day range still shows that day.
      to.setHours(23, 59, 59, 999)
      return { key, from, to }
    }
  }
  return { key: 'this-month', from: new Date(now.getFullYear(), now.getMonth(), 1), to: now }
}

// Real date-range picker + Filter button. Implemented as a plain GET form so it
// works inside this server component with no client JS: submitting navigates to
// /dashboard?range=custom&from=YYYY-MM-DD&to=YYYY-MM-DD.
function DateRangeFilter({ from, to }: { from: Date; to: Date }) {
  const toInput = (date: Date) => {
    const year = date.getFullYear()
    const month = String(date.getMonth() + 1).padStart(2, '0')
    const day = String(date.getDate()).padStart(2, '0')
    return `${year}-${month}-${day}`
  }
  return (
    <form className="date-filter" action="/dashboard" method="get">
      <input type="hidden" name="range" value="custom" />
      <input type="date" name="from" className="form-input date-filter-input" defaultValue={toInput(from)} aria-label="From date" />
      <span className="date-filter-sep">to</span>
      <input type="date" name="to" className="form-input date-filter-input" defaultValue={toInput(to)} aria-label="To date" />
      <button type="submit" className="btn btn-primary date-filter-btn">Filter</button>
    </form>
  )
}

function SystemInsights({
  live,
  activeUsers,
  onlineRouters,
  dataUsedLabel,
  statusColor,
}: {
  live: boolean
  activeUsers: number
  onlineRouters: number
  dataUsedLabel: string
  statusColor: string
}) {
  return (
    <div className="system-insights">
      <div className="system-insights-head">
        <span className="system-insights-title">System Insights</span>
        <span className={`live-pill ${live ? 'is-live' : 'is-offline'}`}>
          <span className="live-dot" style={{ background: live ? '#16a34a' : statusColor }} />
          {live ? 'Live' : 'Offline'}
        </span>
      </div>
      <div className="system-insights-metrics">
        <div className="system-insights-metric"><strong>{activeUsers}</strong><span>Active</span></div>
        <div className="system-insights-metric"><strong>{onlineRouters}</strong><span>Online routers</span></div>
        <div className="system-insights-metric"><strong>{dataUsedLabel}</strong><span>Data usage</span></div>
      </div>
    </div>
  )
}

function SystemInsightsCompact({
  live,
  activeUsers,
  onlineRouters,
  dataUsedLabel,
  statusColor,
  filter,
}: {
  live: boolean
  activeUsers: number
  onlineRouters: number
  dataUsedLabel: string
  statusColor: string
  filter?: ReactNode
}) {
  return (
    <div className="system-insights-card">
      {filter && <div className="system-insights-card-filter">{filter}</div>}
      <div className="system-insights-card-head">
        <span className="system-insights-card-title">System Insights</span>
        <span className={`live-pill-mini ${live ? 'is-live' : 'is-offline'}`}>
          <span className="live-dot-mini" style={{ background: live ? '#16a34a' : statusColor }} />
          {live ? 'Live' : 'Offline'}
        </span>
      </div>
      <div className="system-insights-card-metrics">
        <div className="sic-metric"><Users size={15} /><div><strong>{activeUsers}</strong><span>Active</span></div></div>
        <div className="sic-metric"><Cpu size={15} /><div><strong>{onlineRouters}</strong><span>Online</span></div></div>
        <div className="sic-metric"><Database size={15} /><div><strong>{dataUsedLabel}</strong><span>Data</span></div></div>
      </div>
    </div>
  )
}

function DashboardStatCompact({
  title,
  value,
  mmUgx,
  voucherUgx,
}: {
  title: string
  value: string
  mmUgx?: number
  voucherUgx?: number
}) {
  const hasSplit = (mmUgx !== undefined || voucherUgx !== undefined) && (mmUgx! + (voucherUgx ?? 0)) > 0
  return (
    <div className="tenant-stat-compact">
      <div className="tenant-stat-compact-title">{title}</div>
      <div className="tenant-stat-compact-value">{value}</div>
      {hasSplit && (
        <div className="tenant-stat-compact-split">
          {mmUgx !== undefined && mmUgx > 0 && (
            <span>
              <span className="split-label">MM</span> {formatCurrency(mmUgx)}
            </span>
          )}
          {voucherUgx !== undefined && voucherUgx > 0 && (
            <span>
              <span className="split-label">VRTS</span> {formatCurrency(voucherUgx)}
            </span>
          )}
        </div>
      )}
    </div>
  )
}

function DashboardStatTodayMonth({
  title,
  filteredUgx,
  dateRangeLabel,
  todayUgx,
  monthUgx,
}: {
  title: string
  filteredUgx: number
  dateRangeLabel: string
  todayUgx: number
  monthUgx: number
}) {
  return (
    <div className="tenant-stat-compact">
      <div className="tenant-stat-compact-title">{title}</div>
      <div className="tenant-stat-compact-value">{formatCurrency(filteredUgx)}</div>
      <div style={{ fontSize: 11, color: 'var(--text-3)', marginTop: -2, marginBottom: 4 }}>{dateRangeLabel}</div>
      <div className="tenant-stat-compact-split">
        <span><span className="split-label">Today</span> {formatCurrency(todayUgx)}</span>
        <span style={{ marginLeft: 'auto' }}>
          <span className="split-label">This month</span> {formatCurrency(monthUgx)}
        </span>
      </div>
    </div>
  )
}

function DashboardStat({ title, value, note, icon }: { title: string; value: string; note: string; icon: string }) {
  return (
    <div className="tenant-stat">
      <div className="tenant-stat-icon">{icon}</div>
      <div className="tenant-stat-title">{title}</div>
      <div className="tenant-stat-value">{value}</div>
      <div className="tenant-stat-note">{note}</div>
    </div>
  )
}

function formatShortDate(date: Date) {
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }).format(date)
}

function initialsFor(value: string) {
  return value
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('') || 'C'
}

function relativeDays(value: string) {
  const then = new Date(value).getTime()
  const now = Date.now()
  if (!Number.isFinite(then)) {
    return 'recently'
  }
  const days = Math.max(0, Math.round((now - then) / 86400000))
  if (days === 0) {
    return 'today'
  }
  if (days === 1) {
    return '1 day ago'
  }
  return `${days} days ago`
}

function Stat({ label, value, color, note }: { label: string; value: string; color: string; note: string }) {
  return (
    <div className={`stat-card ${color}`}>
      <div className="stat-label">{label}</div>
      <div className={`stat-value ${color}`}>{value}</div>
      <div className="stat-change">{note}</div>
    </div>
  )
}

function EmptyRow({ colSpan, text }: { colSpan: number; text: string }) {
  return (
    <tr>
      <td colSpan={colSpan}>
        <div className="empty-state" style={{ padding: 16 }}>
          <p>{text}</p>
        </div>
      </td>
    </tr>
  )
}

function Readiness({ label, ready }: { label: string; ready: boolean }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, paddingBottom: 10, borderBottom: '1px solid var(--border)' }}>
      <span style={{ color: 'var(--text-muted)' }}>{label}</span>
      <span className={getStatusBadgeClass(ready ? 'success' : 'pending')}>{ready ? 'ready' : 'needed'}</span>
    </div>
  )
}
