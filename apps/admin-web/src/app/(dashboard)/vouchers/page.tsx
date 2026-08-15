import VouchersWorkspace from '@/components/VouchersWorkspace'
import { getAdminSession } from '@/lib/api'

export const dynamic = 'force-dynamic'

export default async function VouchersPage() {
  const session = await getAdminSession()
  return <VouchersWorkspace isAgent={session?.user.role === 'VoucherAgent'} />
}
