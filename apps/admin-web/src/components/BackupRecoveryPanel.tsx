'use client'

import { useMemo, useRef, useState } from 'react'
import { AlertTriangle, CheckCircle2, Cloud, Database, Download, HardDrive, RefreshCw, RotateCcw, ShieldCheck, Upload } from 'lucide-react'
import { clientFetchApi, clientPostApi, clientUploadApi } from '@/lib/client-api'

type BackupManifest = {
  version: number
  id: string
  fileName: string
  kind: string
  createdAt: string
  database: string
  sha256: string
  dumpBytes: number
  bundleBytes: number
  r2Uploaded: boolean
}

type RecoveryStatus = {
  state: string
  operation?: string | null
  database: { name: string; host: string; reachable: boolean }
  storage: { directory: string; writable: boolean; r2Configured: boolean; r2EndpointConfigured: boolean; r2BucketConfigured: boolean }
  automation: { enabled: boolean; intervalSeconds: number; retentionDays: number }
  tools: { pgDump: boolean; pgRestore: boolean; psql: boolean; createdb: boolean; tar: boolean; aws: boolean }
  backupCount: number
  latestBackup?: BackupManifest | null
  restoreSafety: Record<string, boolean>
}

export default function BackupRecoveryPanel({ initialStatus, initialBackups }: { initialStatus: RecoveryStatus | null; initialBackups: BackupManifest[] }) {
  const [status, setStatus] = useState(initialStatus)
  const [backups, setBackups] = useState(initialBackups)
  const [busy, setBusy] = useState('')
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const fileInput = useRef<HTMLInputElement>(null)

  const latestAge = useMemo(() => {
    const createdAt = backups[0]?.createdAt
    if (!createdAt) return 'No backup yet'
    const minutes = Math.max(0, Math.round((Date.now() - Date.parse(createdAt)) / 60000))
    if (minutes < 60) return `${minutes} min ago`
    const hours = Math.round(minutes / 60)
    if (hours < 48) return `${hours} hr ago`
    return `${Math.round(hours / 24)} days ago`
  }, [backups])

  async function refresh() {
    const [nextStatus, nextBackups] = await Promise.all([
      clientFetchApi<RecoveryStatus>('/system/recovery/status'),
      clientFetchApi<BackupManifest[]>('/system/recovery/backups'),
    ])
    setStatus(nextStatus)
    setBackups(nextBackups)
  }

  async function backupNow() {
    setBusy('backup')
    setError('')
    setMessage('')
    try {
      const result = await clientPostApi<BackupManifest>('/system/recovery/backups', {}, { timeoutMs: 10 * 60 * 1000 })
      setMessage(`Verified backup created: ${result.fileName}${result.r2Uploaded ? ' and uploaded offsite.' : '.'}`)
      await refresh()
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Backup failed')
    } finally {
      setBusy('')
    }
  }

  async function uploadBackup(file?: File) {
    if (!file) return
    setBusy('upload')
    setError('')
    setMessage('')
    try {
      const form = new FormData()
      form.append('file', file)
      const result = await clientUploadApi<{ fileName: string }>('/system/recovery/upload', form)
      setMessage(`Backup uploaded and staged safely as ${result.fileName}. It has not been restored.`)
      await refresh()
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Upload failed')
    } finally {
      if (fileInput.current) fileInput.current.value = ''
      setBusy('')
    }
  }

  async function restoreBackup(item: BackupManifest) {
    const required = `RESTORE ${item.fileName}`
    const accepted = window.confirm(
      `Restore ${item.fileName}? AROFi will first create a fresh pre-restore backup, restore into a temporary database, validate it, then swap databases only if validation passes.`,
    )
    if (!accepted) return
    const confirmation = window.prompt(`Type exactly:\n${required}`)?.trim()
    if (confirmation !== required) {
      setError('Restore cancelled because the confirmation text did not match exactly.')
      return
    }
    const reason = window.prompt('Reason for this restore (required):', 'Emergency platform recovery')?.trim()
    if (!reason) return

    setBusy(`restore:${item.id}`)
    setError('')
    setMessage('')
    try {
      const result = await clientPostApi<{ message: string; preRestoreBackup: string; previousDatabase: string }>(
        `/system/recovery/backups/${encodeURIComponent(item.fileName)}/restore`,
        { confirmation, reason },
        { timeoutMs: 20 * 60 * 1000 },
      )
      setMessage(`${result.message} Pre-restore snapshot: ${result.preRestoreBackup}`)
      await refresh()
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Restore failed')
    } finally {
      setBusy('')
    }
  }

  const ready = status?.state === 'READY'
  return (
    <div className="recovery-page">
      <style>{`
        .recovery-page{display:grid;gap:14px}.recovery-head{display:flex;justify-content:space-between;gap:16px;align-items:flex-start}.recovery-head h1{margin:0;font-size:27px;letter-spacing:-.035em}.recovery-head p{margin:5px 0 0;color:var(--text-3);font-size:12.5px;max-width:760px;line-height:1.45}.recovery-actions{display:flex;gap:8px;flex-wrap:wrap}
        .recovery-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:10px}.recovery-stat{padding:13px;border:1px solid var(--border);border-radius:11px;background:var(--bg-card)}.recovery-stat-head{display:flex;gap:8px;align-items:center;color:var(--text-3);font-size:11px}.recovery-stat strong{display:block;margin-top:6px;font-size:18px;color:var(--text-1)}.recovery-stat small{display:block;margin-top:3px;color:var(--text-3);font-size:10.5px;overflow-wrap:anywhere}
        .recovery-banner{display:flex;gap:9px;align-items:flex-start;padding:12px 14px;border-radius:10px;border:1px solid var(--border);background:var(--bg-card);font-size:12px}.recovery-banner.ok{border-color:rgba(22,163,74,.3)}.recovery-banner.warn{border-color:rgba(245,158,11,.35)}.recovery-banner.error{border-color:rgba(220,38,38,.35)}
        .recovery-card{border:1px solid var(--border);border-radius:11px;background:var(--bg-card);overflow:hidden}.recovery-card-head{display:flex;align-items:center;justify-content:space-between;gap:10px;padding:12px 14px;border-bottom:1px solid var(--border)}.recovery-card-head strong{font-size:13px}.recovery-card-head span{font-size:10.5px;color:var(--text-3)}
        .recovery-table{width:100%;border-collapse:collapse}.recovery-table th,.recovery-table td{text-align:left;padding:10px 12px;border-top:1px solid var(--border);font-size:11.5px}.recovery-table th{border-top:0;color:var(--text-3);font-size:10px;text-transform:uppercase;letter-spacing:.04em}.recovery-table code{font-size:10.5px}.recovery-row-actions{display:flex;gap:6px;justify-content:flex-end}.recovery-empty{padding:36px;text-align:center;color:var(--text-3);font-size:12px}.recovery-safety{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px;padding:13px}.recovery-safety div{display:flex;gap:7px;align-items:center;font-size:11px;color:var(--text-2)}
        @media(max-width:1000px){.recovery-grid{grid-template-columns:repeat(2,minmax(0,1fr))}.recovery-safety{grid-template-columns:repeat(2,minmax(0,1fr))}}@media(max-width:650px){.recovery-head{display:grid}.recovery-actions .btn{flex:1}.recovery-grid{grid-template-columns:1fr 1fr}.recovery-table thead{display:none}.recovery-table,.recovery-table tbody,.recovery-table tr,.recovery-table td{display:block}.recovery-table tr{padding:10px 12px;border-top:1px solid var(--border)}.recovery-table td{padding:3px 0;border:0}.recovery-row-actions{justify-content:flex-start;margin-top:7px}.recovery-safety{grid-template-columns:1fr}}
      `}</style>

      <header className="recovery-head">
        <div>
          <h1>Backup & Recovery</h1>
          <p>Platform database protection with verified PostgreSQL archives, persistent local storage, optional Cloudflare R2 offsite copies, and guarded restore validation before any live database swap.</p>
        </div>
        <div className="recovery-actions">
          <button className="btn btn-ghost" type="button" disabled={Boolean(busy)} onClick={() => fileInput.current?.click()}><Upload size={15}/> Upload</button>
          <input ref={fileInput} hidden type="file" accept=".arobackup,.dump" onChange={(event) => void uploadBackup(event.target.files?.[0])}/>
          <button className="btn btn-primary" type="button" disabled={Boolean(busy)} onClick={() => void backupNow()}><RefreshCw size={15} className={busy === 'backup' ? 'spin' : ''}/> Backup Now</button>
        </div>
      </header>

      {message && <div className="recovery-banner ok"><CheckCircle2 size={17}/><span>{message}</span></div>}
      {error && <div className="recovery-banner error"><AlertTriangle size={17}/><span>{error}</span></div>}
      {!ready && <div className="recovery-banner warn"><AlertTriangle size={17}/><span>Recovery is not fully ready. Check the status cards below before attempting restore.</span></div>}

      <section className="recovery-grid">
        <Stat icon={<Database size={15}/>} label="Database" value={status?.database.reachable ? 'Reachable' : 'Unavailable'} sub={status?.database.name ?? 'Unknown'}/>
        <Stat icon={<HardDrive size={15}/>} label="Persistent storage" value={status?.storage.writable ? 'Writable' : 'Unavailable'} sub={status?.storage.directory ?? '/var/lib/arofi/backups'}/>
        <Stat icon={<Cloud size={15}/>} label="Cloudflare R2" value={status?.storage.r2Configured ? 'Configured' : 'Local only'} sub={status?.storage.r2Configured ? 'Offsite upload enabled' : 'Add backup S3/R2 credentials'}/>
        <Stat icon={<ShieldCheck size={15}/>} label="Latest backup" value={latestAge} sub={`${backups.length} verified local backup${backups.length === 1 ? '' : 's'}`}/>
      </section>

      <section className="recovery-card">
        <div className="recovery-card-head"><strong>Restore safety</strong><span>Destructive actions are platform-owner only and audited</span></div>
        <div className="recovery-safety">
          <Safety label="SHA-256 checksum validation"/><Safety label="pg_restore archive validation"/><Safety label="Temporary database restore"/><Safety label="Core-table/count verification"/><Safety label="Automatic pre-restore backup"/><Safety label="Database rename swap + rollback"/>
        </div>
      </section>

      <section className="recovery-card">
        <div className="recovery-card-head"><strong>Available backups</strong><span>Automatic every {Math.round((status?.automation.intervalSeconds ?? 21600) / 3600)}h · retention {status?.automation.retentionDays ?? 30} days</span></div>
        {backups.length === 0 ? <div className="recovery-empty">No verified backups are stored yet. Use Backup Now to create the first one.</div> : (
          <div style={{overflowX:'auto'}}><table className="recovery-table"><thead><tr><th>Created</th><th>Type</th><th>Size</th><th>Offsite</th><th>Checksum</th><th></th></tr></thead><tbody>
            {backups.map((item) => <tr key={item.id}><td>{new Date(item.createdAt).toLocaleString()}</td><td>{humanize(item.kind)}</td><td>{formatBytes(item.bundleBytes)}</td><td>{item.r2Uploaded ? 'R2 ✓' : 'Local'}</td><td><code>{item.sha256.slice(0,12)}…</code></td><td><div className="recovery-row-actions"><a className="btn btn-ghost btn-sm" href={`/api/system/recovery/backups/${encodeURIComponent(item.fileName)}/download`}><Download size={13}/> Download</a><button className="btn btn-ghost btn-sm" type="button" disabled={Boolean(busy)} onClick={() => void restoreBackup(item)}><RotateCcw size={13}/> Restore</button></div></td></tr>)}
          </tbody></table></div>
        )}
      </section>
    </div>
  )
}

function Stat({icon,label,value,sub}:{icon:React.ReactNode;label:string;value:string;sub:string}){return <div className="recovery-stat"><div className="recovery-stat-head">{icon}<span>{label}</span></div><strong>{value}</strong><small>{sub}</small></div>}
function Safety({label}:{label:string}){return <div><CheckCircle2 size={14}/><span>{label}</span></div>}
function humanize(value:string){return value.replace(/[-_]/g,' ').replace(/\b\w/g,(c)=>c.toUpperCase())}
function formatBytes(value:number){if(!Number.isFinite(value)||value<=0)return '0 B';if(value<1024*1024)return `${Math.round(value/1024)} KB`;return `${(value/1024/1024).toFixed(1)} MB`}
