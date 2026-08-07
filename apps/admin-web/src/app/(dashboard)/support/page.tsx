'use client'

import { useSearchParams } from 'next/navigation'
import SupportTicketWorkspace from '@/components/SupportTicketWorkspace'

const documentationSections = [
  {
    title: 'Add another router',
    steps: [
      'Open Network, then Routers.',
      'Select Add Router and enter the router details.',
      'Run the generated setup command in RouterOS.',
      'Confirm the router becomes healthy.',
    ],
  },
  {
    title: 'Sell internet',
    steps: [
      'Create the package under Internet Plans.',
      'Use Vouchers for printed or prepaid access.',
      'Use Customers to confirm active access and expiry.',
    ],
  },
  {
    title: 'Payment or voucher issue',
    steps: [
      'Check the transaction status under Money.',
      'Search the voucher code under Vouchers.',
      'Submit a ticket when money was deducted but access was not activated.',
    ],
  },
  {
    title: 'Withdraw money',
    steps: [
      'Open Money, then Wallet.',
      'Confirm the available balance and payout number.',
      'Select Withdraw Money and complete the request.',
    ],
  },
  {
    title: 'Check router health',
    steps: [
      'Open Network, then Routers.',
      'Check router status and live users.',
      'Use Remote Access only when router administration is required.',
    ],
  },
  {
    title: 'Contact support',
    steps: [
      'Open Support, then Tickets.',
      'Select New ticket.',
      'Add the exact phone, voucher, router, amount, and time where relevant.',
    ],
  },
]

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
          <p className="page-subtitle">AROFi operating guide.</p>
        </div>
      </div>

      <div className="support-docs-grid">
        {documentationSections.map((section, sectionIndex) => (
          <section className="card support-doc-card" key={section.title}>
            <div className="card-header">
              <span className="card-title">{section.title}</span>
              <span style={{ fontSize: 11, color: 'var(--text-3)' }}>{sectionIndex + 1}</span>
            </div>
            <ol>
              {section.steps.map((step) => <li key={step}>{step}</li>)}
            </ol>
          </section>
        ))}
      </div>
    </>
  )
}
