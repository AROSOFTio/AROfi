import SendNotificationPanel from '@/components/SendNotificationPanel'

export const dynamic = 'force-dynamic'

export default function AdminNotificationsPage() {
  return (
    <>
      <div className="page-header">
        <div>
          <h1 className="page-title">Notifications</h1>
          <p className="page-subtitle">Send announcements to the dashboard inbox, saved email addresses, and saved WhatsApp phone numbers.</p>
        </div>
      </div>
      <SendNotificationPanel />
    </>
  )
}
