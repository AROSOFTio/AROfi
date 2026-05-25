import SettingsManager from '@/components/SettingsManager'
import type { AdminSessionResponse } from '@/lib/admin-types'
import { fetchApi } from '@/lib/api'
import { isVendorWorkspace } from '@/lib/workspace'

export default async function SettingsPage() {
  const session = await fetchApi<AdminSessionResponse>('/auth/me')
  const isDevAdmin = Boolean(session?.user.permissions.includes('ALL'))
  const isVendor = isVendorWorkspace(session?.user)

  const [platformSettings, tenantSettings] = await Promise.all([
    isDevAdmin ? fetchApi('/system/settings') : Promise.resolve(null),
    isVendor ? fetchApi('/system/tenant-settings') : Promise.resolve(null),
  ])

  return (
    <SettingsManager
      user={session?.user ?? { permissions: [] }}
      initialPlatformSettings={platformSettings as never}
      initialTenantSettings={tenantSettings as never}
    />
  )
}
