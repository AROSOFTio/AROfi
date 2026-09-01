'use client'

import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { CheckCircle2, Copy, ExternalLink, RefreshCw, Server, ShieldCheck, Wifi } from 'lucide-react'
import { clientFetchApi, clientPostApi } from '@/lib/client-api'
import styles from './RouterCompatibilityCenter.module.css'

type Vendor =
  | 'MIKROTIK'
  | 'RUIJIE_REYEE'
  | 'TP_LINK_OMADA'
  | 'UBIQUITI_UNIFI'
  | 'CISCO'
  | 'HUAWEI'
  | 'D_LINK'
  | 'CAMBIUM'
  | 'GENERIC_RADIUS'

type Capability = { key: string; label: string; support: 'FULL' | 'STANDARD' | 'MODEL_DEPENDENT' }
type Profile = {
  vendor: Vendor
  label: string
  family: string
  integration: 'FIRST_CLASS' | 'RADIUS_PORTAL' | 'STANDARD_RADIUS'
  description: string
  capabilities: Capability[]
  notes: string[]
}
type ProfilesResponse = {
  radius: { host: string | null; authPort: number; accountingPort: number; coaPort: number }
  profiles: Profile[]
  guarantee: string
}
type SetupResponse = {
  router: { id: string; name: string; model: string | null; siteLabel: string | null; nasAddress: string; vendor: Vendor; vendorLabel: string }
  integration: string
  radius: { server: string; authenticationPort: number; accountingPort: number; coaPort: number; sharedSecret: string; nasIdentifier: string }
  portal: { url: string | null; required: boolean; note: string }
  capabilities: Capability[]
  instructions: string[]
  notes: string[]
  verifyEndpoint: string
}
type VerifyResponse = {
  status: 'VERIFIED' | 'PARTIAL' | 'WAITING_FOR_RADIUS'
  checks: { radiusAuthenticationSeen: boolean; accountingSeen: boolean }
  lastAuthAt?: string | null
  lastAccountingAt?: string | null
  next: string
}

const primaryVendors: Vendor[] = ['MIKROTIK', 'RUIJIE_REYEE', 'TP_LINK_OMADA', 'UBIQUITI_UNIFI']
const genericVendors: Vendor[] = ['CISCO', 'HUAWEI', 'D_LINK', 'CAMBIUM', 'GENERIC_RADIUS']

export default function RouterCompatibilityCenter() {
  const [catalog, setCatalog] = useState<ProfilesResponse | null>(null)
  const [vendor, setVendor] = useState<Vendor>('TP_LINK_OMADA')
  const [name, setName] = useState('')
  const [nasAddress, setNasAddress] = useState('')
  const [model, setModel] = useState('')
  const [siteLabel, setSiteLabel] = useState('')
  const [sharedSecret, setSharedSecret] = useState('')
  const [authPort, setAuthPort] = useState('1812')
  const [accountingPort, setAccountingPort] = useState('1813')
  const [coaPort, setCoaPort] = useState('3799')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [setup, setSetup] = useState<SetupResponse | null>(null)
  const [verify, setVerify] = useState<VerifyResponse | null>(null)
  const [copied, setCopied] = useState('')

  useEffect(() => {
    void clientFetchApi<ProfilesResponse>('/router-compatibility/profiles')
      .then((result) => {
        setCatalog(result)
        setAuthPort(String(result.radius.authPort || 1812))
        setAccountingPort(String(result.radius.accountingPort || 1813))
        setCoaPort(String(result.radius.coaPort || 3799))
      })
      .catch((caught) => setError(caught instanceof Error ? caught.message : 'Could not load router compatibility profiles.'))
  }, [])

  const selectedProfile = useMemo(() => catalog?.profiles.find((item) => item.vendor === vendor) ?? null, [catalog, vendor])
  const primaryProfiles = primaryVendors.map((key) => catalog?.profiles.find((item) => item.vendor === key)).filter(Boolean) as Profile[]
  const genericProfiles = genericVendors.map((key) => catalog?.profiles.find((item) => item.vendor === key)).filter(Boolean) as Profile[]

  function chooseVendor(next: Vendor) {
    setVendor(next)
    setSetup(null)
    setVerify(null)
    setError('')
    window.setTimeout(() => document.getElementById('compat-register')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 20)
  }

  async function register(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError('')
    setVerify(null)
    if (vendor === 'MIKROTIK') {
      window.location.href = '/admin/settings/routers?add=true'
      return
    }
    setBusy(true)
    try {
      const result = await clientPostApi<SetupResponse>('/router-compatibility/register', {
        vendor,
        name: name.trim(),
        nasAddress: nasAddress.trim(),
        model: model.trim() || undefined,
        siteLabel: siteLabel.trim() || undefined,
        sharedSecret: sharedSecret.trim() || undefined,
        authPort: Number(authPort),
        accountingPort: Number(accountingPort),
        coaPort: Number(coaPort),
      })
      setSetup(result)
      setSharedSecret(result.radius.sharedSecret)
      window.setTimeout(() => document.getElementById('compat-setup')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 30)
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not register this router/controller.')
    } finally {
      setBusy(false)
    }
  }

  async function verifyConnection() {
    if (!setup) return
    setBusy(true)
    setError('')
    try {
      const result = await clientPostApi<VerifyResponse>(setup.verifyEndpoint, {})
      setVerify(result)
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not verify RADIUS traffic.')
    } finally {
      setBusy(false)
    }
  }

  async function copy(label: string, value: string) {
    try {
      await navigator.clipboard.writeText(value)
      setCopied(label)
      window.setTimeout(() => setCopied(''), 1400)
    } catch {
      setCopied('')
    }
  }

  return (
    <div className={styles.shell}>
      <section className={styles.hero}>
        <div>
          <h1>Runs on the routers you already own</h1>
          <p>
            No rip and replace. MikroTik keeps first-class RouterOS automation. Omada, UniFi, Reyee and standards-based network stacks connect to the same AROFi RADIUS, billing, voucher and accounting core.
          </p>
        </div>
        <div className={styles.heroAside}>
          <strong>One AROFi core</strong>
          Authentication, Mobile Money, vouchers, user sessions, accounting and usage analytics remain centralized even when the access hardware changes.
        </div>
      </section>

      {catalog && (
        <div className={styles.radiusStrip}>
          <strong><Server size={15} style={{ verticalAlign: 'middle', marginRight: 5 }} /> Cloud RADIUS</strong>
          <span className={styles.radiusItem}>Host: {catalog.radius.host || 'server env not configured'}</span>
          <span className={styles.radiusItem}>Auth UDP {catalog.radius.authPort}</span>
          <span className={styles.radiusItem}>Accounting UDP {catalog.radius.accountingPort}</span>
          <span className={styles.radiusItem}>CoA UDP {catalog.radius.coaPort}</span>
        </div>
      )}

      <section className={styles.vendorGrid}>
        {primaryProfiles.map((profile) => (
          <button type="button" className={styles.vendorCard} key={profile.vendor} onClick={() => chooseVendor(profile.vendor)}>
            <div className={styles.vendorMark}>{shortBrand(profile.vendor)}</div>
            <div>
              <div className={styles.vendorName}>{profile.label}</div>
              <div className={styles.vendorFamily}>{profile.family}</div>
              <div className={styles.vendorDescription}>{profile.description}</div>
              <div className={styles.capabilities}>
                {profile.capabilities.slice(0, 4).map((capability) => <span className={styles.capability} key={capability.key}>{capability.label}</span>)}
              </div>
            </div>
            <span className={styles.level}>{profile.integration === 'FIRST_CLASS' ? 'FIRST-CLASS' : 'RADIUS + PORTAL'}</span>
          </button>
        ))}
      </section>

      {genericProfiles.length > 0 && (
        <section className={styles.section}>
          <div className={styles.sectionHeader}>
            <div><h2>Standard RADIUS compatibility</h2><p>Cisco, Huawei, D-Link, Cambium and other NAS/controllers that expose external AAA.</p></div>
          </div>
          <div className={styles.genericRow}>
            {genericProfiles.map((profile) => (
              <button type="button" className={styles.genericTag} key={profile.vendor} onClick={() => chooseVendor(profile.vendor)}>{profile.label}</button>
            ))}
          </div>
        </section>
      )}

      <section className={styles.section} id="compat-register">
        <div className={styles.sectionHeader}>
          <div>
            <h2>Connect router / controller</h2>
            <p>{selectedProfile?.description ?? 'Choose a compatible network stack.'}</p>
          </div>
          {selectedProfile && <span className={styles.level}>{selectedProfile.label}</span>}
        </div>

        {vendor === 'MIKROTIK' ? (
          <div>
            <div className={styles.notice}>MikroTik already has deeper RouterOS automation in AROFi, including the existing setup script, RADIUS provisioning and remote management. Use that path instead of reducing MikroTik to RADIUS-only.</div>
            <div className={styles.actions}><a className={styles.primary} href="/admin/settings/routers?add=true" style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', textDecoration: 'none' }}>Open MikroTik Setup <ExternalLink size={14} style={{ marginLeft: 6 }} /></a></div>
          </div>
        ) : (
          <form onSubmit={register}>
            <div className={styles.formGrid}>
              <div className={styles.field}>
                <label>Router / controller name</label>
                <input value={name} onChange={(event) => setName(event.target.value)} placeholder="Main Hall WiFi" required />
              </div>
              <div className={styles.field}>
                <label>Vendor</label>
                <select value={vendor} onChange={(event) => chooseVendor(event.target.value as Vendor)}>
                  {catalog?.profiles.filter((item) => item.vendor !== 'MIKROTIK').map((profile) => <option value={profile.vendor} key={profile.vendor}>{profile.label}</option>)}
                </select>
              </div>
              <div className={styles.field}>
                <label>NAS source IP / hostname</label>
                <input value={nasAddress} onChange={(event) => setNasAddress(event.target.value)} placeholder="203.0.113.20" required />
              </div>
              <div className={styles.field}>
                <label>Model / controller</label>
                <input value={model} onChange={(event) => setModel(event.target.value)} placeholder={selectedProfile?.family ?? 'Optional'} />
              </div>
              <div className={styles.field}>
                <label>Site label</label>
                <input value={siteLabel} onChange={(event) => setSiteLabel(event.target.value)} placeholder="Kampala Branch" />
              </div>
              <div className={styles.field}>
                <label>RADIUS shared secret</label>
                <input value={sharedSecret} onChange={(event) => setSharedSecret(event.target.value)} placeholder="Leave blank to generate securely" autoComplete="new-password" />
              </div>
              <div className={styles.portGrid}>
                <div className={styles.field}><label>Authentication port</label><input type="number" min={1} max={65535} value={authPort} onChange={(event) => setAuthPort(event.target.value)} /></div>
                <div className={styles.field}><label>Accounting port</label><input type="number" min={1} max={65535} value={accountingPort} onChange={(event) => setAccountingPort(event.target.value)} /></div>
                <div className={styles.field}><label>Disconnect / CoA port</label><input type="number" min={1} max={65535} value={coaPort} onChange={(event) => setCoaPort(event.target.value)} /></div>
              </div>
            </div>
            <div className={styles.notice} style={{ marginTop: 12 }}>
              Use the IP/hostname that the AROFi FreeRADIUS server will see as this NAS. Devices behind CGNAT may require a controller, VPN, public source address or another deployment arrangement that preserves a stable RADIUS client identity.
            </div>
            {error && <div className={styles.error} style={{ marginTop: 10 }}>{error}</div>}
            <div className={styles.actions}><button type="submit" className={styles.primary} disabled={busy}>{busy ? 'Registering…' : 'Register RADIUS Device'}</button></div>
          </form>
        )}
      </section>

      {setup && (
        <section className={styles.section} id="compat-setup">
          <div className={styles.sectionHeader}>
            <div><h2>{setup.router.vendorLabel} setup</h2><p>{setup.router.name} is registered. Enter these values in the router/controller.</p></div>
            <span className={styles.level}>WAITING FOR RADIUS</span>
          </div>
          <div className={styles.setupGrid}>
            <div className={styles.setupCard}>
              <h3>AROFi RADIUS values</h3>
              <KeyValue label="Server" value={setup.radius.server || 'Not configured'} copy={() => void copy('server', setup.radius.server)} copied={copied === 'server'} />
              <KeyValue label="Auth port" value={String(setup.radius.authenticationPort)} />
              <KeyValue label="Accounting port" value={String(setup.radius.accountingPort)} />
              <KeyValue label="CoA port" value={String(setup.radius.coaPort)} />
              <KeyValue label="NAS identifier" value={setup.radius.nasIdentifier} copy={() => void copy('nas', setup.radius.nasIdentifier)} copied={copied === 'nas'} />
              <KeyValue label="Shared secret" value={setup.radius.sharedSecret} secret copy={() => void copy('secret', setup.radius.sharedSecret)} copied={copied === 'secret'} />
              {setup.portal.url && <KeyValue label="Portal URL" value={setup.portal.url} copy={() => void copy('portal', setup.portal.url ?? '')} copied={copied === 'portal'} />}
            </div>
            <div className={styles.setupCard}>
              <h3>Controller / router steps</h3>
              <ol className={styles.instructions}>{setup.instructions.map((instruction, index) => <li key={`${index}-${instruction}`}>{instruction}</li>)}</ol>
            </div>
          </div>
          {setup.notes.map((note) => <div className={styles.notice} style={{ marginTop: 10 }} key={note}>{note}</div>)}
          {!setup.portal.url && setup.portal.required && <div className={styles.notice} style={{ marginTop: 10 }}>{setup.portal.note}</div>}
          {verify && (
            <div className={verify.status === 'VERIFIED' ? styles.success : styles.notice} style={{ marginTop: 12 }}>
              <strong>{verify.status === 'VERIFIED' ? 'RADIUS verified.' : 'Connection not fully verified yet.'}</strong>{' '}
              Auth traffic: {verify.checks.radiusAuthenticationSeen ? 'seen' : 'waiting'} · Accounting: {verify.checks.accountingSeen ? 'seen' : 'waiting'}. {verify.next}
            </div>
          )}
          {error && <div className={styles.error} style={{ marginTop: 10 }}>{error}</div>}
          <div className={styles.actions}>
            <button type="button" className={styles.secondary} disabled={busy} onClick={() => void verifyConnection()}>{busy ? <RefreshCw size={14} className="animate-spin" /> : <ShieldCheck size={14} />} Verify RADIUS</button>
            <a className={styles.ghost} href="/admin/router" style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', textDecoration: 'none' }}><Wifi size={14} style={{ marginRight: 5 }} /> Router Overview</a>
          </div>
        </section>
      )}

      {catalog && <div className={styles.notice}><CheckCircle2 size={15} style={{ verticalAlign: 'middle', marginRight: 6 }} />{catalog.guarantee}</div>}
    </div>
  )
}

function KeyValue({ label, value, secret = false, copy, copied = false }: { label: string; value: string; secret?: boolean; copy?: () => void; copied?: boolean }) {
  return (
    <div className={styles.kv}>
      <span>{label}</span>
      <strong className={secret ? styles.secret : undefined}>
        {value}
        {copy && <button type="button" onClick={copy} title={`Copy ${label}`} style={{ border: 0, background: 'transparent', cursor: 'pointer', marginLeft: 7, color: 'var(--text-muted)' }}><Copy size={13} /> {copied ? 'Copied' : ''}</button>}
      </strong>
    </div>
  )
}

function shortBrand(vendor: Vendor) {
  if (vendor === 'MIKROTIK') return 'MikroTik'
  if (vendor === 'RUIJIE_REYEE') return 'Reyee'
  if (vendor === 'TP_LINK_OMADA') return 'Omada'
  if (vendor === 'UBIQUITI_UNIFI') return 'UniFi'
  return vendor.replaceAll('_', ' ')
}
