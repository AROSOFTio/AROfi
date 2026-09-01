import Link from 'next/link'
import { ShieldCheck } from 'lucide-react'

export default function RecoveryLinkNote() {
  return (
    <Link href="/admin/backups" className="ops-quick-card">
      <strong style={{ display: 'flex', alignItems: 'center', gap: 7 }}><ShieldCheck size={15}/> Backup & Recovery</strong>
      <span>Check backup readiness, create a verified snapshot, download archives, or run a guarded restore.</span>
    </Link>
  )
}
