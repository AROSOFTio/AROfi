'use client'

import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react'
import { BadgeCheck, Clock3, FileText, Info, ShieldCheck, Upload, XCircle } from 'lucide-react'
import { clientFetchApi, clientPostApi, clientUploadApi } from '@/lib/client-api'
import { formatDate } from '@/lib/format'

type ComplianceProfile = {
  businessName: string
  ownerName: string
  phoneNumber: string
  email: string
  country: string
  district: string
  hotspotLocation: string
  businessType: string
  ispName: string
  ispPackage?: string | null
  routerCount: number
  expectedUsers?: number | null
  payoutPhoneNumber?: string | null
  notes?: string | null
  status: 'PENDING_REVIEW' | 'APPROVED' | 'REJECTED' | 'NEEDS_INFO'
  reviewNotes?: string | null
  reviewedAt?: string | null
  updatedAt: string
}

type KycDoc = {
  id: string
  documentType: string
  fileName: string
  status: 'PENDING' | 'APPROVED' | 'REJECTED'
  reviewNotes?: string | null
  createdAt: string
}

type ComplianceMe = {
  profile: ComplianceProfile | null
  status: ComplianceProfile['status'] | 'NOT_SUBMITTED'
  documents: KycDoc[]
}

const STATUS_PRESENTATION: Record<string, { label: string; tone: string; icon: typeof ShieldCheck; text: string }> = {
  NOT_SUBMITTED: {
    label: 'Not Submitted',
    tone: 'badge-warning',
    icon: Info,
    text: 'Optional for now — add your business and hotspot details below so our team has them on file. This does not limit any feature.',
  },
  PENDING_REVIEW: {
    label: 'Pending Review',
    tone: 'badge-info',
    icon: Clock3,
    text: 'Your submission is waiting on a reviewer. Everything on your dashboard keeps working as normal in the meantime.',
  },
  APPROVED: {
    label: 'Approved',
    tone: 'badge-success',
    icon: BadgeCheck,
    text: 'Your business details have been reviewed and confirmed.',
  },
  REJECTED: {
    label: 'Rejected',
    tone: 'badge-danger',
    icon: XCircle,
    text: 'Your submission was declined. Review the note from our team, update your details, and resubmit.',
  },
  NEEDS_INFO: {
    label: 'Needs More Information',
    tone: 'badge-warning',
    icon: Info,
    text: 'A reviewer needs more information. Update your details or documents below and resubmit.',
  },
}

const DOCUMENT_TYPES = [
  { value: 'BUSINESS_REGISTRATION', label: 'Business registration / trading licence' },
  { value: 'OWNER_ID', label: 'Owner national ID / passport' },
  { value: 'PROOF_OF_ADDRESS', label: 'Proof of address / hotspot location' },
  { value: 'OTHER', label: 'Other (ISP agreement, authorisation, ...)' },
]

export default function ComplianceManager() {
  const [data, setData] = useState<ComplianceMe | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [documentType, setDocumentType] = useState(DOCUMENT_TYPES[0].value)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      setData(await clientFetchApi<ComplianceMe>('/compliance/me'))
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not load compliance status.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    setSaving(true)
    setMessage('')
    setError('')
    try {
      const payload = Object.fromEntries(
        ['businessName', 'ownerName', 'phoneNumber', 'email', 'country', 'district', 'hotspotLocation', 'businessType', 'ispName', 'ispPackage', 'payoutPhoneNumber', 'notes']
          .map((key) => [key, form.get(key) || undefined]),
      ) as Record<string, unknown>
      const routerCount = Number(form.get('routerCount'))
      const expectedUsers = Number(form.get('expectedUsers'))
      if (routerCount > 0) payload.routerCount = routerCount
      if (expectedUsers > 0) payload.expectedUsers = expectedUsers

      const result = await clientPostApi<{ message?: string }>('/compliance/submit', payload)
      setMessage(result?.message ?? 'Submitted for review.')
      await load()
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not submit for review.')
    } finally {
      setSaving(false)
    }
  }

  async function uploadDocument(file: File) {
    setUploading(true)
    setMessage('')
    setError('')
    try {
      const form = new FormData()
      form.append('file', file)
      form.append('documentType', documentType)
      await clientUploadApi('/system/kyc/documents', form)
      setMessage('Document uploaded. It will be checked during review.')
      await load()
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Upload failed.')
    } finally {
      setUploading(false)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  const status = data?.status ?? 'NOT_SUBMITTED'
  const presentation = STATUS_PRESENTATION[status] ?? STATUS_PRESENTATION.NOT_SUBMITTED
  const StatusIcon = presentation.icon
  const profile = data?.profile

  return (
    <>
      <div className="page-header">
        <div>
          <h1 className="page-title">Compliance</h1>
          <p className="page-subtitle">
            AROFi is built for authorised WiFi operators, licensed ISPs and compliant hotspot businesses. Submit your business details for verification.
          </p>
        </div>
      </div>

      <div className="card">
        <div className="withdraw-card-body compliance-status-row">
          <StatusIcon size={28} />
          <div>
            <div className="compliance-status-title">
              Compliance Status: <span className={`badge ${presentation.tone}`}>{presentation.label}</span>
            </div>
            <p>{presentation.text}</p>
            {profile?.reviewNotes && (status === 'REJECTED' || status === 'NEEDS_INFO') && (
              <p className="compliance-review-note"><strong>Reviewer note:</strong> {profile.reviewNotes}</p>
            )}
            {profile?.reviewedAt && status === 'APPROVED' && (
              <p className="compliance-review-note">Approved on {formatDate(profile.reviewedAt)}.</p>
            )}
          </div>
        </div>
      </div>

      {(message || error) && (
        <p style={{ fontSize: 13, marginBottom: 12, color: error ? 'var(--danger-fg)' : 'var(--success-fg)' }}>
          {error || message}
        </p>
      )}

      <form className="card" onSubmit={submit}>
        <div className="card-header">
          <span className="card-title">Business &amp; Hotspot Details</span>
          {status !== 'NOT_SUBMITTED' && <span className="badge badge-info">Resubmitting sends it back for review</span>}
        </div>
        <div className="form-grid" style={{ padding: 16 }}>
          <label className="form-group">
            <span className="form-label">Business name</span>
            <input name="businessName" className="form-input" required maxLength={160} defaultValue={profile?.businessName ?? ''} disabled={saving || loading} />
          </label>
          <label className="form-group">
            <span className="form-label">Owner name</span>
            <input name="ownerName" className="form-input" required maxLength={120} defaultValue={profile?.ownerName ?? ''} disabled={saving || loading} />
          </label>
          <label className="form-group">
            <span className="form-label">Phone number</span>
            <input name="phoneNumber" type="tel" className="form-input" required maxLength={30} defaultValue={profile?.phoneNumber ?? ''} disabled={saving || loading} />
          </label>
          <label className="form-group">
            <span className="form-label">Email</span>
            <input name="email" type="email" className="form-input" required defaultValue={profile?.email ?? ''} disabled={saving || loading} />
          </label>
          <label className="form-group">
            <span className="form-label">Country</span>
            <input name="country" className="form-input" maxLength={80} defaultValue={profile?.country ?? 'Uganda'} disabled={saving || loading} />
          </label>
          <label className="form-group">
            <span className="form-label">District / City</span>
            <input name="district" className="form-input" required maxLength={120} defaultValue={profile?.district ?? ''} disabled={saving || loading} />
          </label>
          <label className="form-group form-span-2">
            <span className="form-label">Exact hotspot location</span>
            <input name="hotspotLocation" className="form-input" required maxLength={240} placeholder="e.g. Mutungo Hill Stage, Plot 12, next to XYZ Supermarket" defaultValue={profile?.hotspotLocation ?? ''} disabled={saving || loading} />
          </label>
          <label className="form-group">
            <span className="form-label">Business type</span>
            <select name="businessType" className="form-input" required defaultValue={profile?.businessType ?? ''} disabled={saving || loading}>
              <option value="" disabled>Select business type</option>
              <option>WiFi hotspot business</option>
              <option>Licensed ISP</option>
              <option>ISP authorised reseller</option>
              <option>Hotel / Guesthouse</option>
              <option>Cafe / Restaurant</option>
              <option>School / Institution</option>
              <option>Other</option>
            </select>
          </label>
          <label className="form-group">
            <span className="form-label">ISP name (your internet provider)</span>
            <input name="ispName" className="form-input" required maxLength={120} placeholder="e.g. MTN, Airtel, Liquid, Roke" defaultValue={profile?.ispName ?? ''} disabled={saving || loading} />
          </label>
          <label className="form-group">
            <span className="form-label">Internet package / account (optional)</span>
            <input name="ispPackage" className="form-input" maxLength={160} placeholder="e.g. 20 Mbps dedicated, account 12345" defaultValue={profile?.ispPackage ?? ''} disabled={saving || loading} />
          </label>
          <label className="form-group">
            <span className="form-label">Number of routers / sites</span>
            <input name="routerCount" type="number" min={1} max={1000} className="form-input" defaultValue={profile?.routerCount ?? 1} disabled={saving || loading} />
          </label>
          <label className="form-group">
            <span className="form-label">Expected hotspot users (optional)</span>
            <input name="expectedUsers" type="number" min={1} className="form-input" defaultValue={profile?.expectedUsers ?? ''} disabled={saving || loading} />
          </label>
          <label className="form-group">
            <span className="form-label">Payout / withdrawal phone (optional)</span>
            <input name="payoutPhoneNumber" type="tel" className="form-input" maxLength={30} defaultValue={profile?.payoutPhoneNumber ?? ''} disabled={saving || loading} />
          </label>
          <label className="form-group form-span-2">
            <span className="form-label">Anything else we should know (optional)</span>
            <textarea name="notes" className="form-input" rows={3} maxLength={2000} placeholder="Licences held, authorisations, multiple locations, ..." defaultValue={profile?.notes ?? ''} disabled={saving || loading} />
          </label>
          <div className="form-span-2">
            <button className="btn btn-primary" disabled={saving || loading}>
              {saving ? 'Submitting...' : status === 'NOT_SUBMITTED' ? 'Submit for Review' : 'Update & Resubmit for Review'}
            </button>
          </div>
        </div>
      </form>

      <div className="card">
        <div className="card-header">
          <span className="card-title">Supporting Documents</span>
          <span className="badge badge-info">Optional but speeds up approval</span>
        </div>
        <div className="withdraw-card-body">
          <div className="compliance-upload-row">
            <select className="form-input" style={{ maxWidth: 320 }} value={documentType} onChange={(event) => setDocumentType(event.target.value)} disabled={uploading}>
              {DOCUMENT_TYPES.map((type) => (
                <option key={type.value} value={type.value}>{type.label}</option>
              ))}
            </select>
            <button type="button" className="btn btn-ghost" onClick={() => fileInputRef.current?.click()} disabled={uploading}>
              <Upload size={15} /> {uploading ? 'Uploading...' : 'Upload Document'}
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*,.pdf"
              style={{ display: 'none' }}
              onChange={(event) => {
                const file = event.target.files?.[0]
                if (file) void uploadDocument(file)
              }}
            />
          </div>
          {data && data.documents.length > 0 && (
            <ul className="compliance-doc-list">
              {data.documents.map((doc) => (
                <li key={doc.id}>
                  <FileText size={15} />
                  <span className="compliance-doc-name">{doc.fileName}</span>
                  <span className="compliance-doc-type">{doc.documentType.toLowerCase().replace(/_/g, ' ')}</span>
                  <span className={`badge ${doc.status === 'APPROVED' ? 'badge-success' : doc.status === 'REJECTED' ? 'badge-danger' : 'badge-info'}`}>
                    {doc.status.toLowerCase()}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </>
  )
}
