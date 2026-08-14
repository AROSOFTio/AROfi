'use client'

import Link from 'next/link'
import { BookOpen } from 'lucide-react'
import { useSearchParams } from 'next/navigation'
import CompactDocumentationBook from '@/components/docs/CompactDocumentationBook'
import SupportTicketWorkspace from '@/components/SupportTicketWorkspaceV2'

export default function SupportPage() {
  const searchParams = useSearchParams()
  const view = searchParams.get('view')

  if (view !== 'documentation') {
    return <SupportTicketWorkspace feedbackOnly={view === 'feedback'} />
  }

  return (
    <>
      <div className="page-header">
        <div>
          <h1 className="page-title">Documentation</h1>
          <p className="page-subtitle">The same AROFi step-by-step handbook, fitted to the admin workspace.</p>
        </div>
        <Link href="/docs" target="_blank" className="btn btn-secondary">
          <BookOpen size={15} /> Open full handbook
        </Link>
      </div>

      <CompactDocumentationBook />
    </>
  )
}
