import { redirect } from 'next/navigation'
import PasswordChangeCard from '@/components/PasswordChangeCard'
import { getAdminSession } from '@/lib/api'

export default async function AgentSettingsPage() {
  const session = await getAdminSession()
  if (session?.user.role !== 'VoucherAgent') redirect('/dashboard')

  return (
    <div style={{ maxWidth: 760, margin: '0 auto', display: 'grid', gap: 14 }}>
      <div className="page-header" style={{ marginBottom: 0 }}>
        <div><h1 className="page-title">Account Settings</h1></div>
      </div>
      <PasswordChangeCard />
    </div>
  )
}
