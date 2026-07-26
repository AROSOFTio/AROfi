'use client'

import { useState } from 'react'

type ReferralShareCardProps = {
  code?: string | null
  referralLink?: string | null
  status?: string | null
  statusClassName?: string
}

export function ReferralShareCard({ code, referralLink, status, statusClassName }: ReferralShareCardProps) {
  const [message, setMessage] = useState('')
  const link = referralLink ?? ''
  const shareText = `Join AROFi with my referral code ${code ?? ''}: ${link}`.trim()

  async function copy(value: string, label: string) {
    if (!value) return
    await navigator.clipboard.writeText(value)
    setMessage(`${label} copied`)
    window.setTimeout(() => setMessage(''), 1800)
  }

  async function share() {
    if (!link) return
    if (navigator.share) {
      await navigator.share({ title: 'Join AROFi', text: shareText, url: link })
      return
    }
    await copy(shareText, 'Share text')
  }

  return (
    <div className="card referral-share-card">
      <div className="card-header">
        <span className="card-title">Your Referral Link</span>
        {status && <span className={statusClassName}>{status.toLowerCase()}</span>}
      </div>
      <div className="card-body referral-link-card">
        <div className="referral-share-top">
          <div>
            <div className="stat-label">Referral Code</div>
            <div className="referral-code">{code}</div>
          </div>
          <button type="button" className="btn btn-ghost" onClick={() => copy(code ?? '', 'Code')} disabled={!code}>
            Copy Code
          </button>
        </div>

        <div className="referral-link-row">
          <input className="input referral-link-input" readOnly value={link} aria-label="Referral link" />
          <button type="button" className="btn btn-primary" onClick={() => copy(link, 'Link')} disabled={!link}>
            Copy Link
          </button>
        </div>

        <div className="referral-share-actions" aria-label="Share referral link">
          <button type="button" className="btn btn-ghost" onClick={share} disabled={!link}>Share</button>
          <a className="btn btn-ghost" href={`https://wa.me/?text=${encodeURIComponent(shareText)}`} target="_blank" rel="noreferrer">WhatsApp</a>
          <a className="btn btn-ghost" href={`mailto:?subject=${encodeURIComponent('Join AROFi')}&body=${encodeURIComponent(shareText)}`}>Email</a>
          <a className="btn btn-ghost" href={`https://twitter.com/intent/tweet?text=${encodeURIComponent(shareText)}`} target="_blank" rel="noreferrer">X</a>
        </div>

        <p className="field-hint">Share your link. Earn when a referred business activates Pro.</p>
        {message && <span className="badge badge-success referral-copy-status">{message}</span>}
      </div>
    </div>
  )
}
