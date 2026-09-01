import BackupRecoveryPanel from '@/components/BackupRecoveryPanel'
import { fetchApi } from '@/lib/api'

type BackupManifest = {
  version: number
  id: string
  fileName: string
  kind: string
  createdAt: string
  database: string
  sha256: string
  dumpBytes: number
  bundleBytes: number
  r2Uploaded: boolean
}

type RecoveryStatus = {
  state: string
  operation?: string | null
  database: { name: string; host: string; reachable: boolean }
  storage: { directory: string; writable: boolean; r2Configured: boolean; r2EndpointConfigured: boolean; r2BucketConfigured: boolean }
  automation: { enabled: boolean; intervalSeconds: number; retentionDays: number }
  tools: { pgDump: boolean; pgRestore: boolean; psql: boolean; createdb: boolean; tar: boolean; aws: boolean }
  backupCount: number
  latestBackup?: BackupManifest | null
  restoreSafety: Record<string, boolean>
}

export const dynamic = 'force-dynamic'

export default async function BackupRecoveryPage() {
  const [status, backups] = await Promise.all([
    fetchApi<RecoveryStatus>('/system/recovery/status'),
    fetchApi<BackupManifest[]>('/system/recovery/backups'),
  ])

  return <BackupRecoveryPanel initialStatus={status} initialBackups={backups ?? []} />
}
