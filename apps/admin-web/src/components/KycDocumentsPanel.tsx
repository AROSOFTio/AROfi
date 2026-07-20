'use client'

import { useState, type FormEvent } from 'react'
import { clientPostApi, clientUploadApi } from '@/lib/client-api'
import { formatDate, getStatusBadgeClass } from '@/lib/format'
import type { KycDocumentItem } from '@/lib/admin-types'

const browserApiBase = process.env.NEXT_PUBLIC_API_URL ?? '/api'
const documentTypeLabels: Record<KycDocumentItem['documentType'], string> = {
  BUSINESS_REGISTRATION: 'Business Registration',
  OWNER_ID: 'Owner/Director ID',
  PROOF_OF_ADDRESS: 'Proof of Address',
  OTHER: 'Other',
}

export default function KycDocumentsPanel({
  isSuperAdmin,
  initialDocuments,
}: {
  isSuperAdmin: boolean
  initialDocuments: KycDocumentItem[]
}) {
  const [documents, setDocuments] = useState(initialDocuments)
  const [documentType, setDocumentType] = useState<KycDocumentItem['documentType']>('BUSINESS_REGISTRATION')
  const [file, setFile] = useState<File | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [reviewNotes, setReviewNotes] = useState<Record<string, string>>({})

  async function submitUpload(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!file) {
      setError('Choose a file to upload')
      return
    }
    setBusy(true)
    setError(null)
    try {
      const formData = new FormData()
      formData.append('file', file)
      formData.append('documentType', documentType)
      const uploaded = await clientUploadApi<KycDocumentItem>('/system/kyc/documents', formData)
      setDocuments((previous) => [{ ...uploaded, tenant: documents[0]?.tenant ?? { id: '', name: 'Your workspace' } }, ...previous])
      setFile(null)
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Upload failed')
    } finally {
      setBusy(false)
    }
  }

  async function review(documentId: string, approve: boolean) {
    setBusy(true)
    setError(null)
    try {
      const updated = await clientPostApi<KycDocumentItem>(`/system/kyc/documents/${documentId}/review`, {
        approve,
        notes: reviewNotes[documentId],
      })
      setDocuments((previous) => previous.map((doc) => (doc.id === documentId ? { ...doc, ...updated } : doc)))
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Review failed')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="card">
      <div className="card-header">
        <span className="card-title">{isSuperAdmin ? 'KYC Review Queue' : 'KYC Documents'}</span>
      </div>

      {!isSuperAdmin && (
        <form onSubmit={submitUpload} style={{ padding: '0 20px 16px', display: 'flex', gap: 12, alignItems: 'flex-end', flexWrap: 'wrap' }}>
          <div className="form-group">
            <label className="form-label">Document type</label>
            <select
              className="form-input"
              value={documentType}
              onChange={(event) => setDocumentType(event.target.value as KycDocumentItem['documentType'])}
            >
              {Object.entries(documentTypeLabels).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </div>
          <div className="form-group">
            <label className="form-label">File (PDF/JPEG/PNG, max 8MB)</label>
            <input
              className="form-input"
              type="file"
              accept="application/pdf,image/jpeg,image/png"
              onChange={(event) => setFile(event.target.files?.[0] ?? null)}
            />
          </div>
          <button className="primary-button" type="submit" disabled={busy}>
            {busy ? 'Uploading...' : 'Upload'}
          </button>
        </form>
      )}

      {error && <p style={{ color: 'var(--danger-fg)', padding: '0 20px 12px', fontSize: 13 }}>{error}</p>}

      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              {isSuperAdmin && <th>Business</th>}
              <th>Type</th>
              <th>File</th>
              <th>Status</th>
              <th>Submitted</th>
              {isSuperAdmin && <th>Review</th>}
            </tr>
          </thead>
          <tbody>
            {documents.length === 0 && (
              <tr>
                <td colSpan={isSuperAdmin ? 6 : 4}>
                  <div className="empty-state">
                    <p>No documents submitted yet.</p>
                  </div>
                </td>
              </tr>
            )}
            {documents.map((doc) => (
              <tr key={doc.id}>
                {isSuperAdmin && <td>{doc.tenant.name}</td>}
                <td>{documentTypeLabels[doc.documentType]}</td>
                <td>
                  <a href={`${browserApiBase}/system/kyc/documents/${doc.id}/file`} target="_blank" rel="noreferrer">
                    {doc.fileName}
                  </a>
                </td>
                <td>
                  <span className={getStatusBadgeClass(doc.status)}>{doc.status.toLowerCase()}</span>
                  {doc.reviewNotes && (
                    <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>{doc.reviewNotes}</div>
                  )}
                </td>
                <td style={{ fontSize: 12 }}>{formatDate(doc.createdAt)}</td>
                {isSuperAdmin && (
                  <td>
                    {doc.status === 'PENDING' ? (
                      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
                        <input
                          className="form-input"
                          style={{ width: 140, padding: '4px 8px', fontSize: 12 }}
                          placeholder="Reason (optional)"
                          value={reviewNotes[doc.id] ?? ''}
                          onChange={(event) => setReviewNotes((previous) => ({ ...previous, [doc.id]: event.target.value }))}
                        />
                        <button className="secondary-button" type="button" disabled={busy} onClick={() => review(doc.id, true)}>
                          Approve
                        </button>
                        <button className="secondary-button" type="button" disabled={busy} onClick={() => review(doc.id, false)}>
                          Reject
                        </button>
                      </div>
                    ) : (
                      <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                        {doc.reviewedAt ? formatDate(doc.reviewedAt) : ''}
                      </span>
                    )}
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
