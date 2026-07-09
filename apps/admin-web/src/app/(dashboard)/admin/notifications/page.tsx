import SendNotificationPanel from '@/components/SendNotificationPanel'

export const dynamic = 'force-dynamic'

export default function AdminNotificationsPage() {
  return (
    <>
      <div className="page-header">
        <div>
          <h1 className="page-title">Notifications</h1>
          <p className="page-subtitle">Send in-app updates and files to one business or every business. No browser pop-ups — businesses see these in their notification inbox.</p>
        </div>
      </div>
      <SendNotificationPanel />
    </>
  )
}
