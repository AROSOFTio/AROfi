import PlatformStaffManager, { type PlatformStaffResponse } from '@/components/PlatformStaffManager'
import UsersManager from '@/components/UsersManager'
import type { AdminSessionResponse, UsersOverviewResponse } from '@/lib/admin-types'
import { fetchApi } from '@/lib/api'

export const dynamic = 'force-dynamic'

export default async function UsersPage() {
  const session = await fetchApi<AdminSessionResponse>('/auth/me')

  if (session?.user.permissions.includes('ALL')) {
    const staff = await fetchApi<PlatformStaffResponse>('/platform-staff')
    return <PlatformStaffManager initialData={staff} />
  }

  const data = await fetchApi<UsersOverviewResponse>('/users')
  return <UsersManager initialData={data} />
}
