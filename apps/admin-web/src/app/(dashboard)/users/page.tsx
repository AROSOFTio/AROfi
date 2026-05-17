import UsersManager from '@/components/UsersManager'
import type { UsersOverviewResponse } from '@/lib/admin-types'
import { fetchApi } from '@/lib/api'

export const dynamic = 'force-dynamic'

export default async function UsersPage() {
  const data = await fetchApi<UsersOverviewResponse>('/users')

  return <UsersManager initialData={data} />
}
