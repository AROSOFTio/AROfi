import SettingsManager from '@/components/SettingsManager'
import type { AdminSessionResponse } from '@/lib/admin-types'
import { fetchApi } from '@/lib/api'

export default async function SettingsPage() {
  const session = await fetchApi<AdminSessionResponse>('/auth/me')
  const isDevAdmin = Boolean(session?.user.permissions.includes('ALL'))

  const [platformSettings, tenantSettings] = await Promise.all([
    isDevAdmin ? fetchApi('/system/settings') : Promise.resolve(null),
    session?.user.tenantId ? fetchApi('/system/tenant-settings') : Promise.resolve(null),
  ])

  return (
    <SettingsManager
      user={session?.user ?? { permissions: [] }}
      initialPlatformSettings={platformSettings as never}
      initialTenantSettings={tenantSettings as never}
    />
  )
}
