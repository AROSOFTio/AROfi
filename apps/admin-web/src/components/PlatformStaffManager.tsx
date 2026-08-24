'use client'

import { FormEvent, useMemo, useState } from 'react'
import { Briefcase, Headphones, Network, ShieldCheck, WalletCards } from 'lucide-react'
import { Modal } from '@/components/Modal'
import { clientFetchApi, clientPatchApi, clientPostApi } from '@/lib/client-api'
import { formatDate } from '@/lib/format'

export type PlatformStaffResponse = {
  roles: Array<{ id: string; name: string; permissions: string[] }>
  users: Array<{
    id: string
    email: string
    firstName?: string | null
    lastName?: string | null
    displayName: string
    isActive: boolean
    createdAt: string
    updatedAt: string
    role: { id: string; name: string; permissions: string[] }
  }>
}

type Staff = PlatformStaffResponse['users'][number]

type FormState = { firstName: string; lastName: string; email: string; password: string; roleName: string }
const emptyForm: FormState = { firstName: '', lastName: '', email: '', password: '', roleName: 'Support' }

const roleOrder = ['Support', 'ReadOnlySupport', 'NetworkOperator', 'FinanceManager', 'WifiAdmin', 'SuperAdmin']
const roleMeta: Record<string, { label: string; description: string }> = {
  SuperAdmin: { label: 'Developer Admin', description: 'Full platform control. Use only for trusted senior administrators.' },
  Support: { label: 'Support Officer', description: 'Handles support tickets and can inspect customer, payment and network information needed for troubleshooting.' },
  ReadOnlySupport: { label: 'Read-only Support', description: 'Can inspect support and operational records but cannot reply or change tickets.' },
  NetworkOperator: { label: 'Network Operator', description: 'Manages routers, hotspots and network sessions without finance administration.' },
  FinanceManager: { label: 'Finance Manager', description: 'Handles billing, payments, payouts, float and finance reports.' },
  WifiAdmin: { label: 'Operations Admin', description: 'Broad WiFi operations role with network, packages, vouchers and support access.' },
}

function roleLabel(role: string) { return roleMeta[role]?.label ?? role.replace(/([a-z])([A-Z])/g, '$1 $2') }

export default function PlatformStaffManager({ initialData }: { initialData: PlatformStaffResponse }) {
  const [data, setData] = useState(initialData)
  const [addOpen, setAddOpen] = useState(false)
  const [editing, setEditing] = useState<Staff | null>(null)
  const [form, setForm] = useState<FormState>(emptyForm)
  const [editForm, setEditForm] = useState<FormState>(emptyForm)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')

  const roles = useMemo(() => [...data.roles].sort((a, b) => {
    const ai = roleOrder.indexOf(a.name); const bi = roleOrder.indexOf(b.name)
    return (ai < 0 ? 99 : ai) - (bi < 0 ? 99 : bi)
  }), [data.roles])

  async function refresh() { setData(await clientFetchApi<PlatformStaffResponse>('/platform-staff')) }

  async function addStaff(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setError(''); setNotice('')
    try {
      await clientPostApi('/platform-staff', form)
      await refresh(); setAddOpen(false); setForm(emptyForm); setNotice('Platform staff account created successfully.')
    } catch (caught) { setError(caught instanceof Error ? caught.message : 'Unable to create staff account') }
    finally { setBusy(false) }
  }

  function beginEdit(user: Staff) {
    setEditing(user); setError(''); setNotice('')
    setEditForm({ firstName: user.firstName ?? '', lastName: user.lastName ?? '', email: user.email, password: '', roleName: user.role.name })
  }

  async function saveEdit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (!editing) return
    setBusy(true); setError(''); setNotice('')
    try {
      await clientPatchApi(`/platform-staff/${editing.id}`, { ...editForm, password: editForm.password || undefined })
      await refresh(); setEditing(null); setNotice('Staff account updated.')
    } catch (caught) { setError(caught instanceof Error ? caught.message : 'Unable to update staff account') }
    finally { setBusy(false) }
  }

  async function toggle(user: Staff) {
    setBusy(true); setError(''); setNotice('')
    try {
      await clientPostApi(`/platform-staff/${user.id}/${user.isActive ? 'deactivate' : 'activate'}`, {})
      await refresh(); setNotice(`${user.displayName} ${user.isActive ? 'deactivated' : 'activated'}.`)
    } catch (caught) { setError(caught instanceof Error ? caught.message : 'Unable to change staff access') }
    finally { setBusy(false) }
  }

  const users = data.users
  const supportCount = users.filter((u) => ['Support', 'ReadOnlySupport'].includes(u.role.name) && u.isActive).length
  const networkCount = users.filter((u) => ['NetworkOperator', 'WifiAdmin'].includes(u.role.name) && u.isActive).length
  const financeCount = users.filter((u) => u.role.name === 'FinanceManager' && u.isActive).length

  return <div className="psm">
    <style>{`
      .psm{display:grid;gap:16px}.psm-head{display:flex;justify-content:space-between;gap:14px;align-items:flex-start}.psm-head h1{font-size:25px;margin:0}.psm-head p{margin:5px 0 0;font-size:12.5px;color:var(--text-3)}.psm-stats{display:grid;grid-template-columns:repeat(5,minmax(120px,1fr));gap:10px}.psm-stat{border:1px solid var(--border);border-radius:11px;background:var(--bg-card);padding:12px}.psm-stat svg{color:var(--brand-fg,#2563eb)}.psm-stat strong{display:block;font-size:20px;margin-top:7px}.psm-stat span{font-size:10.5px;color:var(--text-3)}.psm-card{border:1px solid var(--border);border-radius:11px;background:var(--bg-card);overflow:hidden}.psm-card-head{padding:12px 14px;border-bottom:1px solid var(--border);display:flex;justify-content:space-between}.psm table{width:100%;border-collapse:collapse}.psm th,.psm td{padding:11px 13px;border-bottom:1px solid var(--border);text-align:left;font-size:12px}.psm th{font-size:10.5px;color:var(--text-3);text-transform:uppercase}.psm-name{font-weight:750}.psm-email{font-size:10.5px;color:var(--text-3);margin-top:2px}.psm-role{font-weight:700}.psm-desc{font-size:10.5px;color:var(--text-3);max-width:330px;margin-top:2px}.psm-actions{display:flex;gap:6px}.psm-status{display:inline-flex;padding:4px 7px;border-radius:999px;font-size:10px;font-weight:800}.psm-status.on{background:#dcfce7;color:#166534}.psm-status.off{background:#fee2e2;color:#991b1b}.psm-note{padding:9px 11px;border-radius:8px;font-size:12px}.psm-note.ok{background:#effaf3;border:1px solid #b7e4c7;color:#166534}.psm-note.err{background:#fff1f2;border:1px solid #fecaca;color:#b91c1c}.psm-form{display:grid;gap:11px}.psm-grid{display:grid;grid-template-columns:1fr 1fr;gap:9px}.psm-form label{display:grid;gap:5px;font-size:11.5px;font-weight:700}.psm-role-help{font-size:11px;color:var(--text-3);padding:9px 10px;border:1px solid var(--border);border-radius:8px;background:var(--surface-muted)}@media(max-width:900px){.psm-stats{grid-template-columns:repeat(2,1fr)}.psm-card{overflow:auto}}@media(max-width:600px){.psm-head{align-items:center}.psm-head p{display:none}.psm-grid{grid-template-columns:1fr}}
    `}</style>

    <div className="psm-head"><div><h1>Team & Roles</h1><p>Create real AROFi platform staff accounts and control exactly what each team member can access.</p></div><button className="btn btn-primary" type="button" onClick={() => {setError('');setAddOpen(true)}}>+ Add Staff</button></div>
    {(notice || error) && <div className={`psm-note ${error ? 'err':'ok'}`}>{error || notice}</div>}
    <div className="psm-stats">
      <Stat icon={<ShieldCheck size={17}/>} name="Platform Staff" value={users.length}/><Stat icon={<Briefcase size={17}/>} name="Active" value={users.filter(u=>u.isActive).length}/><Stat icon={<Headphones size={17}/>} name="Support" value={supportCount}/><Stat icon={<Network size={17}/>} name="Network" value={networkCount}/><Stat icon={<WalletCards size={17}/>} name="Finance" value={financeCount}/>
    </div>
    <section className="psm-card"><div className="psm-card-head"><strong>AROFi Staff Directory</strong><span style={{fontSize:11,color:'var(--text-3)'}}>{roles.length} roles available</span></div><div style={{overflow:'auto'}}><table><thead><tr><th>Staff member</th><th>Role</th><th>Access</th><th>Status</th><th>Created</th><th>Actions</th></tr></thead><tbody>{users.length===0&&<tr><td colSpan={6} style={{textAlign:'center',padding:30,color:'var(--text-3)'}}>No platform staff accounts yet.</td></tr>}{users.map(user=><tr key={user.id}><td><div className="psm-name">{user.displayName}</div><div className="psm-email">{user.email}</div></td><td><div className="psm-role">{roleLabel(user.role.name)}</div><div className="psm-desc">{roleMeta[user.role.name]?.description}</div></td><td>{user.role.permissions.includes('ALL')?'Full platform':`${user.role.permissions.length} scoped permissions`}</td><td><span className={`psm-status ${user.isActive?'on':'off'}`}>{user.isActive?'Active':'Inactive'}</span></td><td>{formatDate(user.createdAt)}</td><td><div className="psm-actions"><button type="button" className="btn btn-ghost" onClick={()=>beginEdit(user)}>Edit</button><button disabled={busy} type="button" className="btn btn-ghost" onClick={()=>void toggle(user)}>{user.isActive?'Deactivate':'Activate'}</button></div></td></tr>)}</tbody></table></div></section>

    <Modal open={addOpen} onClose={()=>!busy&&setAddOpen(false)} closeDisabled={busy} kicker="Developer Admin" title="Add AROFi staff member"><form className="psm-form" onSubmit={addStaff}><div className="psm-grid"><Field name="firstName" label="First name" value={form.firstName} onChange={v=>setForm(p=>({...p,firstName:v}))}/><Field name="lastName" label="Last name" value={form.lastName} onChange={v=>setForm(p=>({...p,lastName:v}))}/></div><Field name="email" type="email" label="Work email" value={form.email} onChange={v=>setForm(p=>({...p,email:v}))}/><Field name="password" type="password" label="Temporary password" value={form.password} onChange={v=>setForm(p=>({...p,password:v}))}/><RoleField roles={roles} value={form.roleName} onChange={v=>setForm(p=>({...p,roleName:v}))}/><div className="psm-role-help">{roleMeta[form.roleName]?.description}</div><div style={{display:'flex',justifyContent:'flex-end',gap:8}}><button type="button" className="btn btn-ghost" onClick={()=>setAddOpen(false)}>Cancel</button><button disabled={busy} className="btn btn-primary" type="submit">{busy?'Creating…':'Create Staff Account'}</button></div></form></Modal>

    {editing&&<Modal open={Boolean(editing)} onClose={()=>!busy&&setEditing(null)} closeDisabled={busy} kicker={editing.email} title="Edit staff account"><form className="psm-form" onSubmit={saveEdit}><div className="psm-grid"><Field name="firstName" label="First name" value={editForm.firstName} onChange={v=>setEditForm(p=>({...p,firstName:v}))}/><Field name="lastName" label="Last name" value={editForm.lastName} onChange={v=>setEditForm(p=>({...p,lastName:v}))}/></div><Field name="email" type="email" label="Work email" value={editForm.email} onChange={v=>setEditForm(p=>({...p,email:v}))}/><Field name="password" type="password" required={false} label="New password (optional)" value={editForm.password} onChange={v=>setEditForm(p=>({...p,password:v}))}/><RoleField roles={roles} value={editForm.roleName} onChange={v=>setEditForm(p=>({...p,roleName:v}))}/><div className="psm-role-help">{roleMeta[editForm.roleName]?.description}</div><div style={{display:'flex',justifyContent:'flex-end',gap:8}}><button type="button" className="btn btn-ghost" onClick={()=>setEditing(null)}>Cancel</button><button disabled={busy} className="btn btn-primary" type="submit">{busy?'Saving…':'Save Changes'}</button></div></form></Modal>}
  </div>
}

function Stat({icon,name,value}:{icon:React.ReactNode;name:string;value:number}){return <div className="psm-stat">{icon}<strong>{value}</strong><span>{name}</span></div>}
function Field({label,value,onChange,type='text',required=true}:{name:string;label:string;value:string;onChange:(v:string)=>void;type?:string;required?:boolean}){return <label>{label}<input className="form-input" type={type} value={value} onChange={e=>onChange(e.target.value)} required={required}/></label>}
function RoleField({roles,value,onChange}:{roles:PlatformStaffResponse['roles'];value:string;onChange:(v:string)=>void}){return <label>Role<select className="form-input" value={value} onChange={e=>onChange(e.target.value)}>{roles.map(role=><option key={role.id} value={role.name}>{roleLabel(role.name)}</option>)}</select></label>}
