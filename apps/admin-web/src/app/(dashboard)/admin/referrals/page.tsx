import { fetchApi } from '@/lib/api'
import { formatCurrency, formatDate, formatTransactionType, getStatusBadgeClass } from '@/lib/format'
import { AdminReferralWithdrawalActions } from '@/components/AdminReferralWithdrawalActions'

export const dynamic = 'force-dynamic'

type AdminReferralOverview = {
  summary: {
    referrers: number
    resellerAccounts: number
    referredCustomers: number
    pendingCommissions: number
    availableWalletBalancesUgx: number
    suspiciousReferrals: number
  }
  profiles: Array<{
    id: string
    code: string
    status: string
    availableBalanceUgx: number
    pendingBalanceUgx: number
    withdrawnAmountUgx: number
    createdAt: string
    user: {
      email: string
      firstName?: string | null
      lastName?: string | null
      accountType: string
      tenant?: { name: string } | null
    }
    _count: { referrals: number; commissions: number; walletTransactions: number }
  }>
  relationships: Array<{
    id: string
    status: string
    suspiciousReason?: string | null
    createdAt: string
    qualifiedAt?: string | null
    referrerProfile: { code: string; user: { email: string } }
    referredTenant?: { name: string } | null
  }>
  commissions: Array<{
    id: string
    status: string
    basisAmountUgx: number
    amountUgx: number
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
}

function displayName(profile: AdminReferralOverview['profiles'][number]) {
  const person = [profile.user.firstName, profile.user.lastName].filter(Boolean).join(' ')
  return person || profile.user.tenant?.name || profile.user.email
}

export default async function AdminReferralManagementPage() {
  const data = await fetchApi<AdminReferralOverview>('/referrals/admin')
  const profiles = data?.profiles ?? []
  const relationships = data?.relationships ?? []
  const commissions = data?.commissions ?? []
  const withdrawals = (data?.walletTransactions ?? []).filter((entry) => entry.type.includes('WITHDRAWAL'))

  return (
    <>
      <div className="page-header">
        <div>
          <h1 className="page-title">Referral Management</h1>
          <p className="page-subtitle">Review referral partners, referred businesses, commission exposure, and suspicious referral signals.</p>
        </div>
      </div>

      {!data && (
        <div className="card">
          <div className="empty-state">
            <p>Referral management data is unavailable right now.</p>
          </div>
        </div>
      )}

      {data && (
        <>
          <div className="stats-grid" style={{ marginBottom: 20 }}>
            {[
              { label: 'Referral Partners', value: `${data.summary.referrers}`, color: 'blue' },
              { label: 'Reseller Accounts', value: `${data.summary.resellerAccounts}`, color: 'green' },
              { label: 'Referred Businesses', value: `${data.summary.referredCustomers}`, color: 'purple' },
              { label: 'Available Balances', value: formatCurrency(data.summary.availableWalletBalancesUgx), color: 'amber' },
            ].map((stat) => (
              <div key={stat.label} className={`stat-card ${stat.color}`}>
                <div className="stat-label">{stat.label}</div>
                <div className={`stat-value ${stat.color}`}>{stat.value}</div>
              </div>
            ))}
          </div>

          <div className="card" style={{ marginBottom: 20 }}>
            <div className="card-header">
              <span className="card-title">Referral Partners</span>
              <span className="badge badge-info">{data.summary.suspiciousReferrals} suspicious</span>
            </div>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Partner</th>
                    <th>Code</th>
                    <th>Account Type</th>
                    <th>Referrals</th>
                    <th>Wallet</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {profiles.length === 0 && (
                    <tr><td colSpan={6}><div className="empty-state"><p>No referral partners yet.</p></div></td></tr>
                  )}
                  {profiles.map((profile) => (
                    <tr key={profile.id}>
                      <td>
                        <div style={{ color: 'var(--text-primary)', fontWeight: 600 }}>{displayName(profile)}</div>
                        <div style={{ color: 'var(--text-muted)', fontSize: 12 }}>{profile.user.email}</div>
                      </td>
                      <td>{profile.code}</td>
                      <td>{formatTransactionType(profile.user.accountType)}</td>
                      <td>{profile._count.referrals}</td>
                      <td>
                        <div>{formatCurrency(profile.availableBalanceUgx)} available</div>
                        <div style={{ color: 'var(--text-muted)', fontSize: 12 }}>{formatCurrency(profile.pendingBalanceUgx)} pending</div>
                      </td>
                      <td><span className={getStatusBadgeClass(profile.status)}>{profile.status.toLowerCase()}</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="card" style={{ marginBottom: 20 }}>
            <div className="card-header">
              <span className="card-title">Referred Businesses</span>
            </div>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Referral Code</th>
                    <th>Business</th>
                    <th>Status</th>
                    <th>Registered</th>
                    <th>Qualified</th>
                  </tr>
                </thead>
                <tbody>
                  {relationships.length === 0 && (
                    <tr><td colSpan={5}><div className="empty-state"><p>No referred businesses yet.</p></div></td></tr>
                  )}
                  {relationships.map((relationship) => (
                    <tr key={relationship.id}>
                      <td>{relationship.referrerProfile.code}</td>
                      <td>
                        <div style={{ color: 'var(--text-primary)', fontWeight: 600 }}>{relationship.referredTenant?.name ?? 'Pending business profile'}</div>
                        {relationship.suspiciousReason && <div style={{ color: 'var(--danger-fg)', fontSize: 12 }}>{relationship.suspiciousReason}</div>}
                      </td>
                      <td><span className={getStatusBadgeClass(relationship.status)}>{relationship.status.toLowerCase()}</span></td>
                      <td style={{ fontSize: 12 }}>{formatDate(relationship.createdAt)}</td>
                      <td style={{ fontSize: 12 }}>{relationship.qualifiedAt ? formatDate(relationship.qualifiedAt) : 'Not yet'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="card">
            <div className="card-header">
              <span className="card-title">Recent Commissions</span>
              <span className="badge badge-info">{data.summary.pendingCommissions} pending</span>
            </div>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Basis</th>
                    <th>Commission</th>
                    <th>Status</th>
                    <th>Date</th>
                  </tr>
                </thead>
                <tbody>
                  {commissions.length === 0 && (
                    <tr><td colSpan={4}><div className="empty-state"><p>No commissions yet.</p></div></td></tr>
                  )}
                  {commissions.map((commission) => (
                    <tr key={commission.id}>
                      <td>{formatCurrency(commission.basisAmountUgx)}</td>
                      <td style={{ color: 'var(--text-primary)', fontWeight: 600 }}>{formatCurrency(commission.amountUgx)}</td>
                      <td><span className={getStatusBadgeClass(commission.status)}>{commission.status.toLowerCase()}</span></td>
                      <td style={{ fontSize: 12 }}>{formatDate(commission.createdAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="card" style={{ marginTop: 20 }}>
            <div className="card-header">
              <span className="card-title">Referral Withdrawals</span>
            </div>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Request</th>
                    <th>Amount</th>
                    <th>Status</th>
                    <th>Date</th>
                    <th>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {withdrawals.length === 0 && (
                    <tr><td colSpan={5}><div className="empty-state"><p>No referral withdrawal requests yet.</p></div></td></tr>
                  )}
                  {withdrawals.map((withdrawal) => (
                    <tr key={withdrawal.id}>
                      <td>{withdrawal.description}</td>
                      <td>{formatCurrency(withdrawal.amountUgx)}</td>
                      <td><span className={getStatusBadgeClass(withdrawal.status)}>{withdrawal.status.toLowerCase()}</span></td>
                      <td style={{ fontSize: 12 }}>{formatDate(withdrawal.createdAt)}</td>
                      <td>{withdrawal.status === 'PENDING' ? <AdminReferralWithdrawalActions transactionId={withdrawal.id} /> : 'No action'}</td>
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
