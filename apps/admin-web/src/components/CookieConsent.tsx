'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'

const CONSENT_KEY = 'arofi-cookie-consent-v1'

export default function CookieConsent() {
  const [visible, setVisible] = useState(false)
  const [detailsOpen, setDetailsOpen] = useState(false)

  useEffect(() => {
    setVisible(!window.localStorage.getItem(CONSENT_KEY))
  }, [])

  const save = (choice: 'essential' | 'all') => {
    window.localStorage.setItem(CONSENT_KEY, choice)
    document.cookie = `${CONSENT_KEY}=${choice}; Max-Age=31536000; Path=/; SameSite=Lax`
    setVisible(false)
  }

  if (!visible) return null

  return (
    <aside className="cookie-consent" aria-label="Cookie preferences" role="dialog" aria-live="polite">
      <div className="cookie-consent-copy">
        <strong>Your privacy matters</strong>
        <p>
          We use essential cookies to keep AROFi secure, remember your session and save preferences. We do not use advertising cookies.
          {' '}<Link href="/privacy">Privacy Policy</Link>
        </p>
        {detailsOpen && (
          <p className="cookie-consent-details">
            Essential cookies include secure sign-in and basic site preferences. Optional analytics are currently off; if added, they will stay off until you choose to allow them.
          </p>
        )}
      </div>
      <div className="cookie-consent-actions">
        <button type="button" className="cookie-consent-link" onClick={() => setDetailsOpen((open) => !open)}>
          {detailsOpen ? 'Hide details' : 'Cookie settings'}
        </button>
        <button type="button" className="btn btn-ghost" onClick={() => save('essential')}>Essential only</button>
        <button type="button" className="btn btn-primary" onClick={() => save('all')}>Accept all</button>
      </div>
    </aside>
  )
}
