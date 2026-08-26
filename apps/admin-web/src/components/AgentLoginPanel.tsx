'use client'

import { useState } from 'react'
import { clientPostApi } from '@/lib/client-api'

type Props = {
  agent: {
    id: string
    name: string
    email?: string | null
  }
  loginReady: boolean
}

export default function AgentLoginPanel({ agent, loginReady }: Props) {
  const [open, setOpen] = useState(false)
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [created, setCreated] = useState(false)

  const email = agent.email?.trim().toLowerCase() ?? ''

  async function createLogin(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!email) return
    setBusy(true)
    setError('')
    try {
      await clientPostApi(`/agents/${agent.id}/provision-login`, {
        temporaryPassword: password,
      })
      setCreated(true)
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Could not create Agent login')
    } finally {
      setBusy(false)
    }
  }

  function done() {
    if (created) {
      window.location.reload()
      return
    }
    setOpen(false)
    setError('')
    setPassword('')
  }

  return (
    <>
      <button
        type="button"
        className={loginReady ? 'btn btn-ghost' : 'btn btn-primary'}
        onClick={() => setOpen(true)}
        disabled={!email}
        title={!email ? 'Add an email to this Agent profile first' : undefined}
      >
        {loginReady ? 'Login Details' : email ? 'Create Login' : 'Add Email First'}
      </button>

      {open && (
        <div className="modal-overlay" role="dialog" aria-modal="true">
          <div className="modal-card" style={{ maxWidth: 620 }}>
            <button className="modal-close" type="button" onClick={done} disabled={busy}>Close</button>
            <div className="modal-kicker">Agent Online Selling</div>
            <h2 className="modal-title">{loginReady || created ? 'Agent Login Details' : 'Create Agent Login'}</h2>

            {(loginReady || created) ? (
              <div style={{ display: 'grid', gap: 14 }}>
                <div className="form-grid">
                  <ReadOnlyField label="Login URL" value="https://arofi.net/login" />
                  <ReadOnlyField label="Login Email" value={email} />
                  {created && <ReadOnlyField label="Temporary Password" value={password} />}
                </div>
                <div style={{ border: '1px solid var(--border)', borderRadius: 10, padding: 13, background: 'var(--bg-soft)' }}>
                  <strong style={{ fontSize: 13 }}>What the Agent does after login</strong>
                  <ol style={{ color: 'var(--text-muted)', fontSize: 12.5, lineHeight: 1.65, margin: '7px 0 0', paddingLeft: 20 }}>
                    <li>Sign in with this email at <strong>/login</strong>. AROFi sends the sign-in verification code to the Agent email.</li>
                    <li>Open <strong>Sell Internet</strong> on the Agent Dashboard.</li>
                    <li>Choose a package and choose <strong>Activate Now</strong> or <strong>Voucher for Later</strong>.</li>
                    <li>Choose <strong>Cash</strong> or <strong>Mobile Money</strong>.</li>
                    <li>For Mobile Money, enter the paying MTN/Airtel number. The payer approves the prompt. AROFi creates the voucher or activates the customer only after provider confirmation.</li>
                  </ol>
                </div>
                <button type="button" className="primary-button" onClick={done}>Done</button>
              </div>
            ) : (
              <form onSubmit={createLogin}>
                <p style={{ color: 'var(--text-muted)', fontSize: 13, lineHeight: 1.55, marginTop: 0 }}>
                  This Agent profile has an email but no active Voucher Agent login. AROFi will create or safely restore the login for this exact Agent and business.
                </p>
                <ReadOnlyField label="Agent Login Email" value={email} />
                <div className="form-group" style={{ marginTop: 12 }}>
                  <label className="form-label">Temporary Password</label>
                  <input
                    className="form-input"
                    type="password"
                    minLength={8}
                    required
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    placeholder="At least 8 characters"
                  />
                </div>
                {error && <p style={{ color: 'var(--danger-fg)', fontSize: 13, marginTop: 10 }}>{error}</p>}
                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 18 }}>
                  <button type="button" className="secondary-button" onClick={done} disabled={busy}>Cancel</button>
                  <button type="submit" className="primary-button" disabled={busy}>{busy ? 'Creating...' : 'Create Agent Login'}</button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}
    </>
  )
}

function ReadOnlyField({ label, value }: { label: string; value: string }) {
  return (
    <div className="form-group">
      <label className="form-label">{label}</label>
      <input className="form-input" value={value} readOnly onFocus={(event) => event.currentTarget.select()} />
    </div>
  )
}
