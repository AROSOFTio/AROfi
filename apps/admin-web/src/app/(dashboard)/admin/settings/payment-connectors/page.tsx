'use client'

import { useEffect, useMemo, useState, type FormEvent } from 'react'
import {
  CheckCircle2,
  Copy,
  CreditCard,
  Globe2,
  KeyRound,
  Loader2,
  Plus,
  RefreshCw,
  ShieldCheck,
  Trash2,
} from 'lucide-react'
import { clientDeleteApi, clientFetchApi, clientPostApi } from '@/lib/client-api'

type AuthType = 'NONE' | 'BEARER_STATIC' | 'API_KEY_HEADER' | 'BASIC' | 'OAUTH2_CLIENT_CREDENTIALS'

type Connector = {
  id: string
  name: string
  countryCode: string
  currency: string
  networkCode: string
  providerName: string
  collectionUrl: string
  statusUrl?: string | null
  authType: AuthType
  credentialsConfigured: boolean
  webhookUrl: string
  supportsCollections: boolean
  supportsDisbursements: boolean
  enabled: boolean
  lastValidatedAt?: string | null
  lastUsedAt?: string | null
}

const initial = {
  name: '',
  countryCode: '',
  currency: '',
  networkCode: '',
  providerName: '',
  collectionUrl: '',
  statusUrl: '',
  authType: 'API_KEY_HEADER' as AuthType,
  headerName: 'X-API-Key',
  apiKey: '',
  token: '',
  username: '',
  password: '',
  tokenUrl: '',
  clientId: '',
  clientSecret: '',
  scope: '',
  amountField: 'amount',
  currencyField: 'currency',
  phoneField: 'phoneNumber',
  referenceField: 'reference',
  narrativeField: 'narrative',
  callbackField: 'callbackUrl',
  statusPath: 'status',
  providerReferencePath: 'reference',
  checkoutUrlPath: 'checkoutUrl',
  messagePath: 'message',
  successStatuses: 'SUCCESS,SUCCESSFUL,COMPLETED,PAID',
  pendingStatuses: 'PENDING,PROCESSING,INITIATED',
  failedStatuses: 'FAILED,REJECTED,DECLINED,ERROR',
}

export default function EnterprisePaymentConnectorsPage() {
  const [connectors, setConnectors] = useState<Connector[]>([])
  const [form, setForm] = useState(initial)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [busyId, setBusyId] = useState('')
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [advanced, setAdvanced] = useState(false)
  const [copied, setCopied] = useState('')

  async function load() {
    setLoading(true)
    setError('')
    try {
      setConnectors(await clientFetchApi<Connector[]>('/enterprise-payment-connectors'))
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not load payment connectors.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void load()
  }, [])

  const auth = useMemo(() => {
    switch (form.authType) {
      case 'BEARER_STATIC':
        return { type: form.authType, token: form.token }
      case 'API_KEY_HEADER':
        return { type: form.authType, headerName: form.headerName || 'X-API-Key', apiKey: form.apiKey }
      case 'BASIC':
        return { type: form.authType, username: form.username, password: form.password }
      case 'OAUTH2_CLIENT_CREDENTIALS':
        return {
          type: form.authType,
          tokenUrl: form.tokenUrl,
          clientId: form.clientId,
          clientSecret: form.clientSecret,
          scope: form.scope || undefined,
          tokenField: 'access_token',
        }
      default:
        return { type: 'NONE' as const }
    }
  }, [form])

  async function create(event: FormEvent) {
    event.preventDefault()
    setSaving(true)
    setError('')
    setNotice('')
    try {
      const created = await clientPostApi<Connector>('/enterprise-payment-connectors', {
        name: form.name,
        countryCode: form.countryCode.toUpperCase(),
        currency: form.currency.toUpperCase(),
        networkCode: form.networkCode.toUpperCase(),
        providerName: form.providerName,
        collectionUrl: form.collectionUrl,
        statusUrl: form.statusUrl || undefined,
        collectionMethod: 'POST',
        statusMethod: 'GET',
        auth,
        fields: {
          amount: form.amountField,
          currency: form.currencyField,
          phone: form.phoneField,
          reference: form.referenceField,
          narrative: form.narrativeField || undefined,
          callbackUrl: form.callbackField || undefined,
        },
        response: {
          status: form.statusPath,
          providerReference: form.providerReferencePath || undefined,
          checkoutUrl: form.checkoutUrlPath || undefined,
          message: form.messagePath || undefined,
        },
        statusMap: {
          success: csv(form.successStatuses),
          pending: csv(form.pendingStatuses),
          failed: csv(form.failedStatuses),
        },
        supportsCollections: true,
        supportsDisbursements: false,
        enabled: true,
      })
      setConnectors((current) => [created, ...current])
      setForm(initial)
      setAdvanced(false)
      setNotice(`${created.name} added.`)
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not add payment connector.')
    } finally {
      setSaving(false)
    }
  }

  async function validateConnector(id: string) {
    setBusyId(id)
    setError('')
    setNotice('')
    try {
      await clientPostApi(`/enterprise-payment-connectors/${id}/validate`, {}, { timeoutMs: 25_000 })
      setNotice('Connector configuration validated.')
      await load()
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Connector validation failed.')
    } finally {
      setBusyId('')
    }
  }

  async function remove(id: string) {
    if (!window.confirm('Remove this payment connector?')) return
    setBusyId(id)
    setError('')
    try {
      await clientDeleteApi(`/enterprise-payment-connectors/${id}`)
      setConnectors((current) => current.filter((item) => item.id !== id))
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not remove connector.')
    } finally {
      setBusyId('')
    }
  }

  async function copy(id: string, value: string) {
    await navigator.clipboard.writeText(value)
    setCopied(id)
    window.setTimeout(() => setCopied(''), 1300)
  }

  return (
    <div className="epc-shell">
      <style>{`
        .epc-shell{display:grid;gap:14px;max-width:1180px;font-family:"Segoe UI",SegoeUI,Arial,sans-serif}
        .epc-head{display:flex;align-items:flex-start;justify-content:space-between;gap:14px}
        .epc-head h1{margin:0;font-size:25px;letter-spacing:-.035em;color:var(--text-1)}
        .epc-head p{margin:5px 0 0;color:var(--text-3);font-size:12.5px;line-height:1.45;max-width:720px}
        .epc-badge{display:inline-flex;align-items:center;gap:6px;padding:7px 10px;border:1px solid #c7d2fe;border-radius:999px;background:#eef2ff;color:#3730a3;font-size:10px;font-weight:800;white-space:nowrap}
        .epc-grid{display:grid;grid-template-columns:minmax(0,1.05fr) minmax(340px,.95fr);gap:12px;align-items:start}
        .epc-card{border:1px solid var(--border);border-radius:12px;background:var(--bg-card);padding:15px;box-shadow:0 2px 8px rgba(15,23,42,.025)}
        .epc-card h2{margin:0;font-size:14px;color:var(--text-1)}
        .epc-card-head{display:flex;justify-content:space-between;align-items:center;gap:10px;margin-bottom:13px}
        .epc-form{display:grid;gap:10px}.epc-row{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:9px}.epc-row.three{grid-template-columns:repeat(3,minmax(0,1fr))}
        .epc-field{display:grid;gap:5px}.epc-field label{font-size:10px;color:var(--text-3);font-weight:750}.epc-field input,.epc-field select{width:100%;height:36px;padding:0 10px;border:1px solid var(--border);border-radius:8px;background:var(--bg-card);color:var(--text-1);font:inherit;font-size:12px;outline:none}.epc-field input:focus,.epc-field select:focus{border-color:#2563eb;box-shadow:0 0 0 2px rgba(37,99,235,.09)}
        .epc-actions{display:flex;gap:8px;align-items:center;flex-wrap:wrap}.epc-btn{height:34px;border-radius:8px;border:1px solid var(--border);padding:0 12px;background:var(--bg-card);color:var(--text-1);font-weight:750;font-size:11px;display:inline-flex;align-items:center;gap:6px;cursor:pointer}.epc-btn.primary{background:#2563eb;border-color:#2563eb;color:white}.epc-btn.danger{color:#b91c1c}.epc-btn:disabled{opacity:.55;cursor:not-allowed}
        .epc-advanced{padding-top:10px;border-top:1px solid var(--border);display:grid;gap:10px}.epc-toggle{border:0;background:transparent;color:#2563eb;padding:0;font-size:11px;font-weight:750;cursor:pointer;text-align:left}
        .epc-list{display:grid;gap:9px}.epc-item{border:1px solid var(--border);border-radius:10px;padding:12px;display:grid;gap:9px}.epc-item-top{display:flex;justify-content:space-between;gap:10px;align-items:flex-start}.epc-name{font-size:13px;font-weight:820;color:var(--text-1)}.epc-meta{margin-top:3px;color:var(--text-3);font-size:10.5px}.epc-status{font-size:9px;font-weight:800;padding:4px 7px;border-radius:999px;background:#ecfdf5;color:#047857}.epc-url{display:flex;align-items:center;gap:6px;background:var(--surface-muted);border-radius:7px;padding:7px 8px;font-family:ui-monospace,SFMono-Regular,Consolas,monospace;font-size:9.5px;color:var(--text-2);overflow:hidden}.epc-url span{white-space:nowrap;overflow:hidden;text-overflow:ellipsis;flex:1}.epc-copy{border:0;background:transparent;color:#2563eb;cursor:pointer;display:grid;place-items:center;padding:2px}
        .epc-empty{padding:28px 10px;text-align:center;color:var(--text-3);font-size:12px}.epc-note,.epc-error{border-radius:8px;padding:9px 10px;font-size:11px}.epc-note{background:#eff6ff;color:#1d4ed8;border:1px solid #dbeafe}.epc-error{background:#fff1f2;color:#be123c;border:1px solid #ffe4e6}.epc-security{display:flex;gap:8px;align-items:flex-start;color:var(--text-3);font-size:10.5px;line-height:1.45;padding-top:2px}.epc-security svg{flex:0 0 auto;margin-top:1px}
        @media(max-width:900px){.epc-grid{grid-template-columns:1fr}.epc-head{flex-direction:column}}
        @media(max-width:620px){.epc-row,.epc-row.three{grid-template-columns:1fr}.epc-card{padding:12px}.epc-head h1{font-size:22px}}
      `}</style>

      <header className="epc-head">
        <div>
          <h1>Payment API Connectors</h1>
          <p>Connect an Enterprise business to its own mobile-money or payment provider API in any country using a standards-based REST connector.</p>
        </div>
        <span className="epc-badge"><Globe2 size={13} /> ENTERPRISE · GLOBAL</span>
      </header>

      {error && <div className="epc-error">{error}</div>}
      {notice && <div className="epc-note"><CheckCircle2 size={13} style={{ verticalAlign: 'middle', marginRight: 5 }} />{notice}</div>}

      <div className="epc-grid">
        <section className="epc-card">
          <div className="epc-card-head"><h2><Plus size={15} style={{ verticalAlign: 'middle', marginRight: 6 }} />Add your API</h2></div>
          <form className="epc-form" onSubmit={create}>
            <div className="epc-row">
              <Field label="Connector name"><input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Safaricom M-Pesa Kenya" /></Field>
              <Field label="Provider"><input required value={form.providerName} onChange={(e) => setForm({ ...form, providerName: e.target.value })} placeholder="Safaricom Daraja" /></Field>
            </div>
            <div className="epc-row three">
              <Field label="Country"><input required maxLength={2} value={form.countryCode} onChange={(e) => setForm({ ...form, countryCode: e.target.value.toUpperCase() })} placeholder="KE" /></Field>
              <Field label="Currency"><input required maxLength={12} value={form.currency} onChange={(e) => setForm({ ...form, currency: e.target.value.toUpperCase() })} placeholder="KES" /></Field>
              <Field label="Mobile-money network"><input required value={form.networkCode} onChange={(e) => setForm({ ...form, networkCode: e.target.value.toUpperCase() })} placeholder="MPESA" /></Field>
            </div>
            <Field label="Collection endpoint"><input required type="url" value={form.collectionUrl} onChange={(e) => setForm({ ...form, collectionUrl: e.target.value })} placeholder="https://api.provider.com/v1/collect" /></Field>
            <Field label="Status endpoint"><input type="url" value={form.statusUrl} onChange={(e) => setForm({ ...form, statusUrl: e.target.value })} placeholder="https://api.provider.com/v1/status/{{reference}}" /></Field>

            <div className="epc-row">
              <Field label="Authentication">
                <select value={form.authType} onChange={(e) => setForm({ ...form, authType: e.target.value as AuthType })}>
                  <option value="API_KEY_HEADER">API key header</option>
                  <option value="BEARER_STATIC">Bearer token</option>
                  <option value="BASIC">Basic auth</option>
                  <option value="OAUTH2_CLIENT_CREDENTIALS">OAuth2 client credentials</option>
                  <option value="NONE">No auth</option>
                </select>
              </Field>
              {form.authType === 'API_KEY_HEADER' && <Field label="Header"><input value={form.headerName} onChange={(e) => setForm({ ...form, headerName: e.target.value })} /></Field>}
            </div>

            {form.authType === 'API_KEY_HEADER' && <Field label="API key"><input required type="password" autoComplete="new-password" value={form.apiKey} onChange={(e) => setForm({ ...form, apiKey: e.target.value })} /></Field>}
            {form.authType === 'BEARER_STATIC' && <Field label="Bearer token"><input required type="password" autoComplete="new-password" value={form.token} onChange={(e) => setForm({ ...form, token: e.target.value })} /></Field>}
            {form.authType === 'BASIC' && <div className="epc-row"><Field label="Username"><input required value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value })} /></Field><Field label="Password"><input required type="password" autoComplete="new-password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} /></Field></div>}
            {form.authType === 'OAUTH2_CLIENT_CREDENTIALS' && <>
              <Field label="OAuth token endpoint"><input required type="url" value={form.tokenUrl} onChange={(e) => setForm({ ...form, tokenUrl: e.target.value })} /></Field>
              <div className="epc-row"><Field label="Client ID"><input required value={form.clientId} onChange={(e) => setForm({ ...form, clientId: e.target.value })} /></Field><Field label="Client secret"><input required type="password" autoComplete="new-password" value={form.clientSecret} onChange={(e) => setForm({ ...form, clientSecret: e.target.value })} /></Field></div>
              <Field label="Scope"><input value={form.scope} onChange={(e) => setForm({ ...form, scope: e.target.value })} /></Field>
            </>}

            <button className="epc-toggle" type="button" onClick={() => setAdvanced((value) => !value)}>{advanced ? 'Hide API mapping' : 'API field mapping'}</button>
            {advanced && <div className="epc-advanced">
              <div className="epc-row three">
                <Field label="Amount field"><input value={form.amountField} onChange={(e) => setForm({ ...form, amountField: e.target.value })} /></Field>
                <Field label="Currency field"><input value={form.currencyField} onChange={(e) => setForm({ ...form, currencyField: e.target.value })} /></Field>
                <Field label="Phone field"><input value={form.phoneField} onChange={(e) => setForm({ ...form, phoneField: e.target.value })} /></Field>
              </div>
              <div className="epc-row three">
                <Field label="Reference field"><input value={form.referenceField} onChange={(e) => setForm({ ...form, referenceField: e.target.value })} /></Field>
                <Field label="Narrative field"><input value={form.narrativeField} onChange={(e) => setForm({ ...form, narrativeField: e.target.value })} /></Field>
                <Field label="Callback field"><input value={form.callbackField} onChange={(e) => setForm({ ...form, callbackField: e.target.value })} /></Field>
              </div>
              <div className="epc-row">
                <Field label="Response status path"><input value={form.statusPath} onChange={(e) => setForm({ ...form, statusPath: e.target.value })} /></Field>
                <Field label="Provider reference path"><input value={form.providerReferencePath} onChange={(e) => setForm({ ...form, providerReferencePath: e.target.value })} /></Field>
              </div>
              <div className="epc-row">
                <Field label="Checkout URL path"><input value={form.checkoutUrlPath} onChange={(e) => setForm({ ...form, checkoutUrlPath: e.target.value })} /></Field>
                <Field label="Message path"><input value={form.messagePath} onChange={(e) => setForm({ ...form, messagePath: e.target.value })} /></Field>
              </div>
              <Field label="Success values"><input value={form.successStatuses} onChange={(e) => setForm({ ...form, successStatuses: e.target.value })} /></Field>
              <Field label="Pending values"><input value={form.pendingStatuses} onChange={(e) => setForm({ ...form, pendingStatuses: e.target.value })} /></Field>
              <Field label="Failed values"><input value={form.failedStatuses} onChange={(e) => setForm({ ...form, failedStatuses: e.target.value })} /></Field>
            </div>}

            <div className="epc-actions">
              <button className="epc-btn primary" type="submit" disabled={saving}>{saving ? <Loader2 size={13} className="animate-spin" /> : <CreditCard size={13} />} Add Connector</button>
            </div>
            <div className="epc-security"><ShieldCheck size={14} /><span>API credentials are encrypted server-side. Production endpoints must use HTTPS and private/local destinations are rejected.</span></div>
          </form>
        </section>

        <section className="epc-card">
          <div className="epc-card-head"><h2>Connected APIs</h2><button className="epc-btn" type="button" onClick={() => void load()} disabled={loading}><RefreshCw size={12} className={loading ? 'animate-spin' : ''} /> Refresh</button></div>
          {loading ? <div className="epc-empty"><Loader2 className="animate-spin" size={20} /></div> : connectors.length === 0 ? <div className="epc-empty">No Enterprise payment APIs connected.</div> : <div className="epc-list">
            {connectors.map((connector) => <article className="epc-item" key={connector.id}>
              <div className="epc-item-top">
                <div><div className="epc-name">{connector.name}</div><div className="epc-meta">{connector.countryCode} · {connector.currency} · {connector.networkCode} · {connector.providerName}</div></div>
                <span className="epc-status">{connector.enabled ? 'ACTIVE' : 'OFF'}</span>
              </div>
              <div className="epc-meta"><KeyRound size={11} style={{ verticalAlign: 'middle', marginRight: 4 }} />{connector.authType.replaceAll('_', ' ')} · {connector.lastValidatedAt ? 'validated' : 'not validated'}</div>
              <div className="epc-url"><span>{connector.webhookUrl}</span><button className="epc-copy" type="button" onClick={() => void copy(connector.id, connector.webhookUrl)}>{copied === connector.id ? <CheckCircle2 size={13} /> : <Copy size={13} />}</button></div>
              <div className="epc-actions">
                <button className="epc-btn" type="button" disabled={busyId === connector.id} onClick={() => void validateConnector(connector.id)}>{busyId === connector.id ? <Loader2 size={12} className="animate-spin" /> : <ShieldCheck size={12} />} Validate</button>
                <button className="epc-btn danger" type="button" disabled={busyId === connector.id} onClick={() => void remove(connector.id)}><Trash2 size={12} /> Remove</button>
              </div>
            </article>)}
          </div>}
        </section>
      </div>
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <div className="epc-field"><label>{label}</label>{children}</div>
}

function csv(value: string) {
  return value.split(',').map((item) => item.trim()).filter(Boolean)
}
