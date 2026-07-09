'use client'

import { useState } from 'react'

type ComplianceStatus = 'NOT_SUBMITTED' | 'PENDING_REVIEW' | 'APPROVED' | 'REJECTED' | 'NEEDS_INFO'

type Copy = { title: string; body: string; danger?: boolean; dismissible?: boolean }

// UCC has not yet implemented a mandatory hotspot-operator verification
// policy, so this stays informational and optional — never a claim that
// features are limited or blocked, and dismissible for the non-urgent
// states so it doesn't nag every dashboard visit.
const COPY: Record<Exclude<ComplianceStatus, 'APPROVED'>, Copy> = {
  NOT_SUBMITTED: {
    title: 'Optional: verify your business details',
    body: 'Add your business and hotspot details so AROFi has them on file. This is optional — nothing on your dashboard is limited while it\'s pending.',
    dismissible: true,
  },
  PENDING_REVIEW: {
    title: 'Business details submitted — pending review',
    body: 'Your submission is waiting on a reviewer. Everything on your dashboard keeps working as normal in the meantime.',
    dismissible: true,
  },
  NEEDS_INFO: {
    title: 'Compliance: needs more information',
    body: 'A reviewer left a note on your submission — open Compliance to see it and resubmit whenever you\'re ready.',
  },
  REJECTED: {
    title: 'Compliance: submission declined',
    body: 'Your last submission was declined. Open Compliance to see the reviewer note and resubmit.',
    danger: true,
  },
}

export default function ComplianceBanner({ status, tenantId }: { status: ComplianceStatus; tenantId?: string | null }) {
  const copy = status === 'APPROVED' ? null : COPY[status]
  const dismissKey = `arofi_compliance_banner_dismissed_${tenantId ?? 'me'}_${status}`
  const [dismissed, setDismissed] = useState(() => {
    if (typeof window === 'undefined' || !copy?.dismissible) return false
    return localStorage.getItem(dismissKey) === '1'
  })

  if (!copy || dismissed) return null

  return (
    <div style={{ position: 'relative', marginBottom: 14 }}>
      <a href="/compliance" className={`compliance-banner ${copy.danger ? 'danger' : ''}`} style={{ marginBottom: 0, paddingRight: copy.dismissible ? 40 : undefined }}>
        <strong>{copy.title}</strong>
        <span>{copy.body}</span>
        <span className="compliance-banner-cta">Open Compliance →</span>
      </a>
      {copy.dismissible && (
        <button
          type="button"
          aria-label="Dismiss"
          onClick={(event) => {
            event.preventDefault()
            event.stopPropagation()
            setDismissed(true)
            try { localStorage.setItem(dismissKey, '1') } catch {}
          }}
          style={{
            position: 'absolute',
            top: 8,
            right: 8,
            width: 24,
            height: 24,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: 'transparent',
            border: 'none',
            borderRadius: 6,
            cursor: 'pointer',
            color: 'inherit',
            opacity: 0.55,
            fontSize: 15,
          }}
        >
          ✕
        </button>
      )}
    </div>
  )
}
