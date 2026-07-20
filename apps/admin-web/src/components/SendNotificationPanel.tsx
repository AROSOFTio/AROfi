'use client'

import { FormEvent, useEffect, useState } from 'react'
import { Paperclip, Send, X } from 'lucide-react'
import { TenantOverviewResponse } from '@/lib/admin-types'
import { clientDeleteApi, clientFetchApi, clientPostApi, clientUploadApi } from '@/lib/client-api'
import { formatDate } from '@/lib/format'
import ReviewActionModal from '@/components/ReviewActionModal'

const browserApiBase = process.env.NEXT_PUBLIC_API_URL ?? '/api'
const MAX_ATTACHMENTS = 5

type SentNotification = {
  id: string
  title: string
  body: string
  audience: 'ALL_BUSINESSES' | 'SINGLE_BUSINESS'
  tenant: { id: string; name: string } | null
  createdBy: { id: string | null; firstName?: string | null; lastName?: string | null } | null
  createdAt: string
  attachments: Array<{ id: string; fileName: string; mimeType: string; fileSize: number }>
  _count: { reads: number }
}

type DeliveryChannel = {
  businesses: number
  attempted: number
  delivered: number
  failed: number
}

type CreateNotificationResponse = {
  id: string
  delivery: {
    inbox: { businesses: number }
    email: DeliveryChannel
    whatsapp: DeliveryChannel
  }
}

export default function SendNotificationPanel() {
  const [tenants, setTenants] = useState<TenantOverviewResponse['items']>([])
  const [sent, setSent] = useState<SentNotification[]>([])
  const [loadingSent, setLoadingSent] = useState(true)
  const [audience, setAudience] = useState<'SINGLE_BUSINESS' | 'ALL_BUSINESSES'>('SINGLE_BUSINESS')
  const [tenantId, setTenantId] = useState('')
  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')
  const [files, setFiles] = useState<File[]>([])
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<SentNotification | null>(null)

  useEffect(() => {
    void loadTenants()
    void loadSent()
  }, [])

  async function loadTenants() {
    try {
      const data = await clientFetchApi<TenantOverviewResponse>('/tenants')
      setTenants(data.items)
      if (!tenantId && data.items[0]) setTenantId(data.items[0].id)
    } catch {
      // Non-fatal — the tenant picker just stays empty.
    }
  }

  async function loadSent() {
    setLoadingSent(true)
    try {
      const data = await clientFetchApi<SentNotification[]>('/notifications/sent')
      setSent(data)
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Unable to load sent notifications')
    } finally {
      setLoadingSent(false)
    }
  }

  function onFilesSelected(fileList: FileList | null) {
    if (!fileList) return
    const selected = Array.from(fileList).slice(0, MAX_ATTACHMENTS - files.length)
    setFiles((previous) => [...previous, ...selected].slice(0, MAX_ATTACHMENTS))
  }

  function removeFile(index: number) {
    setFiles((previous) => previous.filter((_, i) => i !== index))
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError(null)
    setSuccess(null)

    if (audience === 'SINGLE_BUSINESS' && !tenantId) {
      setError('Select a business to notify')
      return
    }

    setIsSubmitting(true)
    try {
      const notification = await clientPostApi<CreateNotificationResponse>('/notifications', {
        title: title.trim(),
        body: body.trim(),
        audience,
        tenantId: audience === 'SINGLE_BUSINESS' ? tenantId : undefined,
      })

      for (const file of files) {
        const formData = new FormData()
        formData.append('file', file)
        await clientUploadApi(`/notifications/${notification.id}/attachments`, formData)
      }

      const { inbox, email, whatsapp } = notification.delivery
      const deliveryMessage = `Dashboard: ${inbox.businesses}/${inbox.businesses} businesses. Email: ${email.delivered}/${email.attempted} contacts (${email.businesses}/${inbox.businesses} businesses covered). WhatsApp: ${whatsapp.delivered}/${whatsapp.attempted} contacts (${whatsapp.businesses}/${inbox.businesses} businesses covered).`
      const hasDeliveryProblem =
        email.failed > 0 ||
        whatsapp.failed > 0 ||
        email.businesses < inbox.businesses ||
        whatsapp.businesses < inbox.businesses

      if (hasDeliveryProblem) {
        setError(`Notification saved, but some contacts were missing or could not be reached. ${deliveryMessage}`)
      } else {
        setSuccess(`Notification delivered. ${deliveryMessage}`)
      }
      setTitle('')
      setBody('')
      setFiles([])
      await loadSent()
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Could not send notification')
    } finally {
      setIsSubmitting(false)
    }
  }

  async function handleDelete(notification: SentNotification) {
    try {
      await clientDeleteApi(`/notifications/${notification.id}`)
      setSuccess(`Notification "${notification.title}" deleted.`)
      await loadSent()
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Could not delete this notification')
    }
  }

  return (
    <>
      <div className="card" style={{ marginBottom: 20 }}>
        <div className="card-header">
          <span className="card-title">Send Notification</span>
        </div>
        <form onSubmit={submit} style={{ padding: '0 20px 20px', display: 'grid', gap: 14 }}>
          <div style={{ display: 'flex', gap: 20 }}>
            <label style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontSize: 13, color: 'var(--text-2)' }}>
              <input type="radio" checked={audience === 'SINGLE_BUSINESS'} onChange={() => setAudience('SINGLE_BUSINESS')} />
              One business
            </label>
            <label style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontSize: 13, color: 'var(--text-2)' }}>
              <input type="radio" checked={audience === 'ALL_BUSINESSES'} onChange={() => setAudience('ALL_BUSINESSES')} />
              All businesses
            </label>
          </div>

          {audience === 'SINGLE_BUSINESS' && (
            <div className="form-group">
              <label className="form-label">Business</label>
              <select className="form-input" value={tenantId} onChange={(event) => setTenantId(event.target.value)} required>
                <option value="">Select business</option>
                {tenants.map((tenant) => (
                  <option key={tenant.id} value={tenant.id}>{tenant.name}</option>
                ))}
              </select>
            </div>
          )}

          <div className="form-group">
            <label className="form-label">Title</label>
            <input className="form-input" value={title} onChange={(event) => setTitle(event.target.value)} placeholder="Scheduled maintenance tonight" required />
          </div>

          <div className="form-group">
            <label className="form-label">Message</label>
            <textarea className="form-input" value={body} onChange={(event) => setBody(event.target.value)} placeholder="Details for the business owner..." rows={4} required />
          </div>

          <div className="form-group">
            <label className="form-label">Attachments (optional, up to {MAX_ATTACHMENTS})</label>
            <input type="file" multiple onChange={(event) => onFilesSelected(event.target.files)} disabled={files.length >= MAX_ATTACHMENTS} />
            {files.length > 0 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 8 }}>
                {files.map((file, index) => (
                  <div key={`${file.name}-${index}`} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: 'var(--text-2)' }}>
                    <Paperclip size={12} /> {file.name}
                    <button type="button" onClick={() => removeFile(index)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--danger-fg)', display: 'inline-flex' }}>
                      <X size={12} />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          <p style={{ margin: 0, fontSize: 12, color: 'var(--text-muted)' }}>
            Delivery uses each business&apos;s saved contact email, active account emails, and saved WhatsApp phone number. Duplicate contacts receive one copy.
          </p>

          {error && <p style={{ color: 'var(--danger-fg)', fontSize: 13, margin: 0 }}>{error}</p>}
          {success && <p style={{ color: 'var(--success-fg)', fontSize: 13, margin: 0 }}>{success}</p>}

          <div>
            <button type="submit" className="btn btn-primary" disabled={isSubmitting} style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
              <Send size={14} /> {isSubmitting ? 'Sending...' : 'Send Notification'}
            </button>
          </div>
        </form>
      </div>

      <div className="card">
        <div className="card-header">
          <span className="card-title">Sent Notifications</span>
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Title</th>
                <th>Audience</th>
                <th>Attachments</th>
                <th>Read By</th>
                <th>Sent</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {!loadingSent && sent.length === 0 && (
                <tr>
                  <td colSpan={6}>
                    <div className="empty-state">
                      <p>No notifications sent yet.</p>
                    </div>
                  </td>
                </tr>
              )}
              {sent.map((notification) => (
                <tr key={notification.id}>
                  <td>
                    <div style={{ color: 'var(--text-primary)', fontWeight: 600 }}>{notification.title}</div>
                    <div style={{ fontSize: 12, color: 'var(--text-muted)', maxWidth: 320 }}>{notification.body}</div>
                  </td>
                  <td>{notification.audience === 'ALL_BUSINESSES' ? 'All Businesses' : notification.tenant?.name ?? 'Unknown'}</td>
                  <td>
                    {notification.attachments.length === 0 ? '-' : (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                        {notification.attachments.map((attachment) => (
                          <a key={attachment.id} href={`${browserApiBase}/notifications/attachments/${attachment.id}/file`} target="_blank" rel="noreferrer" style={{ fontSize: 12 }}>
                            {attachment.fileName}
                          </a>
                        ))}
                      </div>
                    )}
                  </td>
                  <td>{notification._count.reads}</td>
                  <td style={{ fontSize: 12 }}>{formatDate(notification.createdAt)}</td>
                  <td>
                    <button type="button" className="btn btn-ghost" style={{ color: '#dc2626' }} onClick={() => setDeleteTarget(notification)}>
                      Delete
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <ReviewActionModal
        open={Boolean(deleteTarget)}
        title={`Delete "${deleteTarget?.title ?? ''}"`}
        description="This removes the notification and its attachments for every business that could see it. This cannot be undone."
        confirmLabel="Delete Notification"
        danger
        showNote={false}
        onConfirm={() => {
          if (!deleteTarget) return
          const target = deleteTarget
          setDeleteTarget(null)
          void handleDelete(target)
        }}
        onClose={() => setDeleteTarget(null)}
      />
    </>
  )
}
