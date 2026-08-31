import { fetchApi } from '@/lib/api'
import VendorWithdrawalsPanel from '@/components/VendorWithdrawalsPanel'
import WithdrawalOperationsPanel from '@/components/WithdrawalOperationsPanel'

export const dynamic = 'force-dynamic'

export default async function EarningsPage() {
  const payoutProfile = await fetchApi<any>('/wallets/payouts/profile/me')

  return (
    <>
      <div className="page-header">
        <div>
          <h1 className="page-title">Wallet & Earnings</h1>
          <p className="page-subtitle">Manage payout credentials, register mobile money numbers, and withdraw your earnings.</p>
        </div>
      </div>
      <VendorWithdrawalsPanel initialProfile={payoutProfile} />
      <WithdrawalOperationsPanel initialWithdrawals={payoutProfile?.recentWithdrawals ?? []} />
    </>
  )
}
