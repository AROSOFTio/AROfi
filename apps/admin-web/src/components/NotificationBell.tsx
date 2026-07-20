'use client'

import { useEffect, useState } from 'react'
import { Bell, Paperclip } from 'lucide-react'
import { clientFetchApi, clientPostApi } from '@/lib/client-api'
import { formatDate } from '@/lib/format'

const browserApiBase = process.env.NEXT_PUBLIC_API_URL ?? '/api'
const POLL_INTERVAL_MS = 60_000

type NotificationItem = {
  id: string
  title: string
  body: string
  audience: string
  tenant: { id: string; name: string } | null
  createdBy: { id: string | null; name: string }
  createdAt: string
  isRead: boolean
  attachments: Array<{ id: string; fileName: string; mimeType: string; fileSize: number }>
}

type NotificationsResponse = {
  unreadCount: number
  items: NotificationItem[]
}

export default function NotificationBell() {
  const [open, setOpen] = useState(false)
  const [data, setData] = useState<NotificationsResponse | null>(null)
  const [loading, setLoading] = useState(false)

  async function load() {
    setLoading(true)
    try {
      const result = await clientFetchApi<NotificationsResponse>('/notifications')
      setData(result)
    } catch {
      // Notifications are non-critical — a failed fetch just leaves the bell empty.
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void load()
    const interval = window.setInterval(() => void load(), POLL_INTERVAL_MS)
    return () => window.clearInterval(interval)
  }, [])

  async function markRead(id: string) {
    setData((previous) => {
      if (!previous) return previous
      const target = previous.items.find((item) => item.id === id)
      if (!target || target.isRead) return previous
      return {
        unreadCount: Math.max(previous.unreadCount - 1, 0),
        items: previous.items.map((item) => (item.id === id ? { ...item, isRead: true } : item)),
      }
    })
    try {
      await clientPostApi(`/notifications/${id}/read`, {})
    } catch {
      // Best effort — the next poll reconciles state either way.
    }
  }

  async function markAllRead() {
    if (!data || data.unreadCount === 0) return
    setData({ unreadCount: 0, items: data.items.map((item) => ({ ...item, isRead: true })) })
    try {
      await clientPostApi('/notifications/read-all', {})
    } catch {
      // Best effort — the next poll reconciles state either way.
    }
  }

  const unreadCount = data?.unreadCount ?? 0

  return (
    <div style={{ position: 'relative' }}>
      <button
        type="button"
        aria-label="Notifications"
        onClick={() => setOpen((previous) => !previous)}
        style={{
          position: 'relative',
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          width: 36,
          height: 36,
          borderRadius: 8,
          border: 'none',
          background: 'transparent',
          cursor: 'pointer',
        }}
      >
        <Bell size={18} style={{ color: 'var(--text-secondary)' }} />
        {unreadCount > 0 && (
          <span
            style={{
              position: 'absolute',
              top: 3,
              right: 3,
              minWidth: 16,
              height: 16,
              borderRadius: 8,
              background: '#dc2626',
              color: '#fff',
              fontSize: 10,
              fontWeight: 700,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: '0 4px',
              lineHeight: 1,
            }}
          >
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <>
          <div style={{ position: 'fixed', inset: 0, zIndex: 999 }} onClick={() => setOpen(false)} />
          <div
            style={{
              position: 'absolute',
              top: 'calc(100% + 8px)',
              right: 0,
              width: 360,
              maxWidth: 'calc(100vw - 32px)',
              maxHeight: 440,
              overflowY: 'auto',
              background: 'var(--bg-card)',
              border: '1px solid var(--border)',
              borderRadius: 12,
              boxShadow: 'var(--shadow-md)',
              zIndex: 1000,
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 14px', borderBottom: '1px solid var(--border)' }}>
              <span style={{ fontWeight: 700, fontSize: 13, color: 'var(--text-1)' }}>Notifications</span>
              {unreadCount > 0 && (
                <button type="button" onClick={() => void markAllRead()} style={{ background: 'none', border: 'none', color: 'var(--arofi-theme-accent-text)', fontSize: 12, cursor: 'pointer', fontWeight: 600 }}>
                  Mark all read
                </button>
              )}
            </div>
            {loading && !data && <div style={{ padding: 20, textAlign: 'center', fontSize: 13, color: 'var(--text-muted)' }}>Loading...</div>}
            {data && data.items.length === 0 && (
              <div style={{ padding: 20, textAlign: 'center', fontSize: 13, color: 'var(--text-muted)' }}>No notifications yet.</div>
            )}
            {data?.items.map((item) => (
              <div
                key={item.id}
                onClick={() => void markRead(item.id)}
                style={{
                  padding: '12px 14px',
                  borderBottom: '1px solid var(--border)',
                  background: item.isRead ? 'transparent' : 'var(--arofi-theme-accent-soft-2)',
                  cursor: item.isRead ? 'default' : 'pointer',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                  <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-1)' }}>{item.title}</span>
                  {!item.isRead && <span style={{ width: 8, height: 8, borderRadius: 4, background: 'var(--arofi-theme-accent)', flexShrink: 0, marginTop: 4 }} />}
                </div>
                <p style={{ fontSize: 12, color: 'var(--text-2)', margin: '4px 0', whiteSpace: 'pre-wrap' }}>{item.body}</p>
                {item.attachments.length > 0 && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginTop: 6 }}>
                    {item.attachments.map((attachment) => (
                      <a
                        key={attachment.id}
                        href={`${browserApiBase}/notifications/attachments/${attachment.id}/file`}
                        target="_blank"
                        rel="noreferrer"
                        style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--arofi-theme-accent-text)' }}
                        onClick={(event) => event.stopPropagation()}
                      >
                        <Paperclip size={12} /> {attachment.fileName}
                      </a>
                    ))}
                  </div>
                )}
                <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 6 }}>
                  {item.createdBy.name} - {formatDate(item.createdAt)}
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  )
}
