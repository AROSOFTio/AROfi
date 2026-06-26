'use client'

import { useEffect, type CSSProperties, type MouseEvent, type ReactNode } from 'react'

type ModalSize = 'compact' | 'default' | 'wide'

// Single reusable modal shell — every popup form in the dashboard should use
// this instead of hand-rolling its own overlay/card/close-button markup, so
// sizing, spacing, and backdrop behavior stay consistent everywhere.
export function Modal({
  open,
  onClose,
  size = 'default',
  style,
  kicker,
  title,
  closeDisabled,
  children,
}: {
  open: boolean
  onClose: () => void
  size?: ModalSize
  style?: CSSProperties
  kicker?: string
  title: ReactNode
  closeDisabled?: boolean
  children: ReactNode
}) {
  // Without this, the page behind the overlay keeps its own scroll position
  // and can still capture wheel/touch input, which is what made modals feel
  // "hard to scroll" — input was landing on the hidden background, not the
  // modal's own scrollable card.
  useEffect(() => {
    if (!open) {
      return
    }
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = previousOverflow
    }
  }, [open])

  if (!open) {
    return null
  }

  function handleOverlayClick(event: MouseEvent<HTMLDivElement>) {
    if (event.target === event.currentTarget && !closeDisabled) {
      onClose()
    }
  }

  const sizeClass = size === 'compact' ? 'compact' : size === 'wide' ? 'wide' : ''

  return (
    <div className="modal-overlay" role="dialog" aria-modal="true" onClick={handleOverlayClick}>
      <div className={`modal-card ${sizeClass}`.trim()} style={style} onClick={(event) => event.stopPropagation()}>
        <button type="button" className="modal-close" onClick={onClose} disabled={closeDisabled}>
          Close
        </button>
        {kicker && <div className="modal-kicker">{kicker}</div>}
        <h2 className="modal-title">{title}</h2>
        {children}
      </div>
    </div>
  )
}
