'use client'

import { useEffect, useState, type FormEvent } from 'react'
import { Modal } from '@/components/Modal'

// In-app replacement for window.prompt/confirm on review actions (approve /
// reject / needs-info) — collects an optional or required note and confirms.
export default function ReviewActionModal({
  open,
  title,
  description,
  confirmLabel,
  danger = false,
  showNote = true,
  noteRequired = false,
  noteLabel = 'Note to the business',
  notePlaceholder,
  busy = false,
  onConfirm,
  onClose,
}: {
  open: boolean
  title: string
  description?: string
  confirmLabel: string
  danger?: boolean
  showNote?: boolean
  noteRequired?: boolean
  noteLabel?: string
  notePlaceholder?: string
  busy?: boolean
  onConfirm: (note: string) => void
  onClose: () => void
}) {
  const [note, setNote] = useState('')

  useEffect(() => {
    if (open) setNote('')
  }, [open])

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    onConfirm(note.trim())
  }

  return (
    <Modal open={open} onClose={onClose} closeDisabled={busy} style={{ width: 'min(480px, 100%)' }} kicker="Confirm" title={title}>
      <form onSubmit={submit} style={{ marginTop: 14 }}>
        {description && <p style={{ fontSize: 13, color: 'var(--text-2)', marginBottom: 14, lineHeight: 1.6 }}>{description}</p>}
        {showNote && (
          <label className="form-group">
            <span className="form-label">{noteLabel}{noteRequired ? '' : ' (optional)'}</span>
            <textarea
              className="form-input"
              rows={3}
              maxLength={2000}
              required={noteRequired}
              placeholder={notePlaceholder}
              value={note}
              onChange={(event) => setNote(event.target.value)}
              disabled={busy}
              autoFocus
            />
          </label>
        )}
        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 16 }}>
          <button type="button" className="btn btn-ghost" onClick={onClose} disabled={busy}>Cancel</button>
          <button
            type="submit"
            className="btn btn-primary"
            style={danger ? { background: 'var(--danger-fg)', boxShadow: 'none' } : undefined}
            disabled={busy}
          >
            {busy ? 'Working...' : confirmLabel}
          </button>
        </div>
      </form>
    </Modal>
  )
}
