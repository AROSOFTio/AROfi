import React from 'react'

interface WalletSummaryProps {
  title?: string
  balance: string
  accountOwner?: string
  payoutNetwork?: string
  buttonLabel?: string
  onWithdraw?: () => void
  type?: 'vendor' | 'platform'
}

export default function WalletSummary({
  title = 'AROFi Wallet',
  balance,
  accountOwner = 'AroFi WiFi',
  payoutNetwork = 'MTN Line',
  buttonLabel = 'Withdraw Funds >',
  type = 'vendor',
}: WalletSummaryProps) {
  return (
    <div className="ui-card" style={{ padding: '20px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
        <span style={{ fontSize: 16 }}>💳</span>
        <span className="section-title" style={{ fontSize: 15 }}>{title}</span>
      </div>

      <div style={{ marginBottom: 16 }}>
        <div className="label-text" style={{ marginBottom: 4 }}>Available Balance</div>
        <div className="card-value" style={{ fontSize: 26 }}>{balance}</div>
      </div>

      {type === 'vendor' && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 20, fontSize: 12 }}>
          <div>
            <div className="label-text">Account Owner</div>
            <div style={{ fontWeight: 500, color: 'var(--text-primary)', marginTop: 2 }}>{accountOwner}</div>
          </div>
          <div>
            <div className="label-text">Payout Network</div>
            <div style={{ fontWeight: 500, color: 'var(--text-primary)', marginTop: 2 }}>{payoutNetwork}</div>
          </div>
        </div>
      )}

      <button className="btn btn-primary" style={{ width: '100%', padding: '10px', fontSize: 13, fontWeight: 500 }}>
        {buttonLabel}
      </button>
    </div>
  )
}
