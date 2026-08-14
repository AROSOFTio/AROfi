'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { MessageSquareText } from 'lucide-react'
import type { AdminSessionResponse } from '@/lib/admin-types'
import { clientFetchApi } from '@/lib/client-api'
import { formatDate } from '@/lib/format'
import { isVendorWorkspace } from '@/lib/workspace'

type Ticket = {
  id: string
  reference: string
  subject: string
  status: string
  updatedAt: string
  latestResponseAt?: string | null
  tenant?: { id: string; name: string } | null
  messages: Array<{ id: string; authorRole: string; authorName: string; body: string; isInternal: boolean; createdAt: string }>
}
type TicketsResponse = { items: Ticket[] }

const POLL_MS = 20_000

export default function SupportTicketQuickAccess({ user }: { user: AdminSessionResponse['user'] }) {
  const router = useRouter()
  const canRead = user.permissions.includes('support.read') || user.permissions.includes('ALL')
  const businessWorkspace = isVendorWorkspace(user)
  const [open, setOpen] = useState(false)
  const [tickets, setTickets] = useState<Ticket[]>([])
  const [seen, setSeen] = useState<Record<string, string>>({})
  const storageKey = `arofi-ticket-seen:${user.id}`

  useEffect(() => {
    if (!canRead) return
    try {
      const stored = window.localStorage.getItem(storageKey)
      if (stored) setSeen(JSON.parse(stored))
    } catch {}

    async function load() {
      try {
        const data = await clientFetchApi<TicketsResponse>('/support-floor/tickets')
        setTickets(data.items ?? [])
      } catch {}
    }
    void load()
    const timer = window.setInterval(() => void load(), POLL_MS)
    return () => window.clearInterval(timer)
  }, [canRead, storageKey])

  const recent = useMemo(() => tickets.slice(0, 8), [tickets])

  function latestIncoming(ticket: Ticket) {
    const publicMessages = ticket.messages.filter((message) => !message.isInternal)
    for (let index = publicMessages.length - 1; index >= 0; index -= 1) {
      const message = publicMessages[index]
      const fromBusiness = message.authorRole.toLowerCase().includes('business')
      if ((businessWorkspace && !fromBusiness) || (!businessWorkspace && fromBusiness)) return message
    }
    return null
  }

  const unreadCount = tickets.filter((ticket) => {
    const incoming = latestIncoming(ticket)
    if (!incoming) return false
    const seenAt = seen[ticket.id]
    return !seenAt || new Date(incoming.createdAt).getTime() > new Date(seenAt).getTime()
  }).length

  function saveSeen(next: Record<string, string>) {
    setSeen(next)
    try { window.localStorage.setItem(storageKey, JSON.stringify(next)) } catch {}
  }

  function openTicket(ticket: Ticket) {
    const incoming = latestIncoming(ticket)
    if (incoming) saveSeen({ ...seen, [ticket.id]: incoming.createdAt })
    setOpen(false)
    router.push(`/support?ticket=${encodeURIComponent(ticket.id)}`)
  }

  if (!canRead) return null

  return (
    <div style={{ position: 'relative' }}>
      <button type="button" className="topbar-ai-support" onClick={() => setOpen((value) => !value)} aria-label="Open support tickets" style={{ position: 'relative' }}>
        <MessageSquareText size={15} />
        <span>Tickets</span>
        {unreadCount > 0 && <span style={{ position:'absolute', top:-5, right:-5, minWidth:17, height:17, borderRadius:9, background:'#dc2626', color:'#fff', fontSize:10, fontWeight:800, display:'grid', placeItems:'center', padding:'0 4px' }}>{unreadCount > 9 ? '9+' : unreadCount}</span>}
      </button>

      {open && <>
        <div style={{ position:'fixed', inset:0, zIndex:1098 }} onClick={() => setOpen(false)} />
        <div style={{ position:'absolute', top:'calc(100% + 8px)', right:0, zIndex:1099, width:360, maxWidth:'calc(100vw - 28px)', maxHeight:460, overflow:'auto', border:'1px solid var(--border)', borderRadius:12, background:'var(--bg-card)', boxShadow:'var(--shadow-md)' }}>
          <div style={{ padding:'11px 13px', borderBottom:'1px solid var(--border)', display:'flex', justifyContent:'space-between', alignItems:'center' }}><strong style={{fontSize:13}}>Support Tickets</strong><span style={{fontSize:11,color:'var(--text-3)'}}>{unreadCount} new</span></div>
          {recent.length === 0 && <div style={{padding:22,textAlign:'center',fontSize:12,color:'var(--text-3)'}}>No tickets yet.</div>}
          {recent.map((ticket) => {
            const incoming = latestIncoming(ticket)
            const unread = Boolean(incoming && (!seen[ticket.id] || new Date(incoming.createdAt) > new Date(seen[ticket.id])))
            return <button key={ticket.id} type="button" onClick={() => openTicket(ticket)} style={{ width:'100%', border:0, borderBottom:'1px solid var(--border)', background:unread?'rgba(37,99,235,.07)':'transparent', padding:'11px 13px', textAlign:'left', cursor:'pointer', color:'inherit' }}>
              <div style={{display:'flex',justifyContent:'space-between',gap:8}}><strong style={{fontSize:12.5,lineHeight:1.35}}>{ticket.subject}</strong>{unread && <span style={{width:8,height:8,borderRadius:4,background:'#2563eb',marginTop:4,flexShrink:0}}/>}</div>
              <div style={{fontSize:10.5,color:'var(--text-3)',marginTop:3}}>{ticket.tenant?.name ?? ticket.reference} · {ticket.status.toLowerCase().replace(/_/g,' ')}</div>
              {incoming && <div style={{fontSize:11.5,color:'var(--text-2)',marginTop:5,overflow:'hidden',whiteSpace:'nowrap',textOverflow:'ellipsis'}}>{businessWorkspace ? 'Support replied' : 'Customer replied'}: {incoming.body}</div>}
              <div style={{fontSize:10,color:'var(--text-3)',marginTop:4}}>{formatDate(incoming?.createdAt ?? ticket.latestResponseAt ?? ticket.updatedAt)}</div>
            </button>
          })}
          <button type="button" onClick={() => { setOpen(false); router.push('/support') }} style={{width:'100%',border:0,background:'transparent',padding:'11px',color:'var(--arofi-theme-accent-text)',fontWeight:700,fontSize:12,cursor:'pointer'}}>Open Support Floor</button>
        </div>
      </>}
    </div>
  )
}
