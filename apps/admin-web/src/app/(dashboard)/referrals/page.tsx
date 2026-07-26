import { fetchApi } from '@/lib/api'
import { formatCurrency, formatDate, getStatusBadgeClass } from '@/lib/format'
import { ReferralWithdrawalPanel } from '@/components/ReferralWithdrawalPanel'
import { ReferralShareCard } from '@/components/ReferralShareCard'

export const dynamic = 'force-dynamic'

type ReferralDashboard = {
  profile: {
    code: string
    status: string
    referralLink: string
    availableBalanceUgx: number
    pendingBalanceUgx: number
    withdrawnAmountUgx: number
    registeredPayoutPhone?: string | null
  }
  summary: {
    totalReferredAccounts: number
    pendingReferrals: number
    successfulReferrals: number
    rejectedOrInvalidReferrals: number
    totalReferralEarningsUgx: number
    pendingCommissionUgx: number
    availableWalletBalanceUgx: number
    withdrawnAmountUgx: number
  }
  referrals: Array<{
    id: string
    status: string
    referredBusiness?: string | null
    referredPerson?: string | null
    suspiciousReason?: string | null
    createdAt: string
    qualifiedAt?: string | null
  }>
  commissions: Array<{
    id: string
    status: string
    basisAmountUgx: number
    rateBps: number
    amountUgx: number
    holdUntil?: string | null
    availableAt?: string | null
    createdAt: string
  }>
  walletTransactions: Array<{
    id: string
    type: string
    status: string
    amountUgx: number
    description: string
    createdAt: string
  }>
  payoutNumbers: Array<{
    id: string
    network: string
    normalizedPhone: string
    label?: string | null
    isPrimary: boolean
  }>
}

export default async function ReferralProgrammePage() {
  const data = await fetchApi<ReferralDashboard>('/referrals/me')
  const profile = data?.profile
  const referrals = data?.referrals ?? []
  const commissions = data?.commissions ?? []
  const walletTransactions = data?.walletTransactions ?? []

  return (
    <>
      <div className="page-header">
        <div>
          <h1 className="page-title">Referral Programme</h1>
          <p className="page-subtitle">Share AROFi, track signups, and withdraw earned commissions.</p>
        </div>
      </div>

      {!data && (
        <div className="card">
          <div className="empty-state">
            <p>Referral programme data is unavailable right now.</p>
          </div>
        </div>
      )}

      {data && (
        <>
          <div className="stats-grid">
            {[
              { label: 'Referred Businesses', value: `${data.summary.totalReferredAccounts}`, color: 'blue' },
              { label: 'Successful Referrals', value: `${data.summary.successfulReferrals}`, color: 'green' },
              { label: 'Available Wallet', value: formatCurrency(data.summary.availableWalletBalanceUgx), color: 'amber' },
              { label: 'Total Earnings', value: formatCurrency(data.summary.totalReferralEarningsUgx), color: 'purple' },
            ].map((stat) => (
              <div key={stat.label} className={`stat-card ${stat.color}`}>
                <div className="stat-label">{stat.label}</div>
                <div className={`stat-value ${stat.color}`}>{stat.value}</div>
              </div>
            ))}
          </div>

          <ReferralShareCard
            code={profile?.code}
            referralLink={profile?.referralLink}
            status={profile?.status}
            statusClassName={profile ? getStatusBadgeClass(profile.status) : undefined}
          />

          <ReferralWithdrawalPanel availableBalanceUgx={data.summary.availableWalletBalanceUgx} payoutNumbers={data.payoutNumbers ?? []} />

          <div className="card">
            <div className="card-header">
              <span className="card-title">Referred Businesses</span>
            </div>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Business</th>
                    <th>Contact</th>
                    <th>Status</th>
                    <th>Registered</th>
                    <th>Qualified</th>
                  </tr>
                </thead>
                <tbody>
                  {referrals.length === 0 && (
                    <tr><td colSpan={5}><div className="empty-state"><p>No referred businesses yet.</p></div></td></tr>
                  )}
                  {referrals.map((item) => (
                    <tr key={item.id}>
                      <td>{item.referredBusiness ?? 'Pending business profile'}</td>
                      <td>{item.referredPerson ?? 'Not provided'}</td>
                      <td><span className={getStatusBadgeClass(item.status)}>{item.status.toLowerCase()}</span></td>
                      <td style={{ fontSize: 12 }}>{formatDate(item.createdAt)}</td>
                      <td style={{ fontSize: 12 }}>{item.qualifiedAt ? formatDate(item.qualifiedAt) : 'Not yet'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="card">
            <div className="card-header">
              <span className="card-title">Commissions</span>
              <span className="badge badge-info">Pending {formatCurrency(data.summary.pendingCommissionUgx)}</span>
            </div>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Basis</th>
                    <th>Rate</th>
                    <th>Commission</th>
                    <th>Status</th>
                    <th>Available</th>
                  </tr>
                </thead>
                <tbody>
                  {commissions.length === 0 && (
                    <tr><td colSpan={5}><div className="empty-state"><p>No referral commissions yet.</p></div></td></tr>
                  )}
                  {commissions.map((commission) => (
                    <tr key={commission.id}>
                      <td>{formatCurrency(commission.basisAmountUgx)}</td>
                      <td>{(commission.rateBps / 100).toFixed(2)}%</td>
                      <td style={{ color: 'var(--text-primary)', fontWeight: 600 }}>{formatCurrency(commission.amountUgx)}</td>
                      <td><span className={getStatusBadgeClass(commission.status)}>{commission.status.toLowerCase()}</span></td>
                      <td style={{ fontSize: 12 }}>{formatDate(commission.availableAt ?? commission.holdUntil ?? commission.createdAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="card">
            <div className="card-header">
              <span className="card-title">Referral Wallet Activity</span>
              <span className="badge badge-info">Withdrawn {formatCurrency(data.summary.withdrawnAmountUgx)}</span>
            </div>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Activity</th>
                    <th>Amount</th>
                    <th>Status</th>
                    <th>Date</th>
                  </tr>
                </thead>
                <tbody>
                  {walletTransactions.length === 0 && (
                    <tr><td colSpan={4}><div className="empty-state"><p>No referral wallet activity yet.</p></div></td></tr>
                  )}
                  {walletTransactions.map((entry) => (
                    <tr key={entry.id}>
                      <td>
                        <div style={{ color: 'var(--text-primary)', fontWeight: 600 }}>{entry.type.toLowerCase().replaceAll('_', ' ')}</div>
                        <div style={{ color: 'var(--text-muted)', fontSize: 12 }}>{entry.description}</div>
                      </td>
                      <td>{formatCurrency(entry.amountUgx)}</td>
                      <td><span className={getStatusBadgeClass(entry.status)}>{entry.status.toLowerCase()}</span></td>
                      <td style={{ fontSize: 12 }}>{formatDate(entry.createdAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </>
  )
}
