import { fetchApi } from '@/lib/api'
import type { PackageCatalogResponse } from '@/lib/admin-types'
import AgentMobileConsole, { type AgentConsoleData } from '@/components/AgentMobileConsole'

function isTrialPackage(pkg: PackageCatalogResponse['items'][number]) {
  const haystack = `${pkg.name} ${pkg.code} ${pkg.description ?? ''}`.toLowerCase()
  return Boolean(pkg.isTrialEnabled) || (pkg.activePriceUgx ?? 0) <= 0 || haystack.includes('trial')
}

export default async function AgentDashboard() {
  const [data, packageResponse] = await Promise.all([
    fetchApi<AgentConsoleData>('/agent-sales/me/dashboard'),
    fetchApi<PackageCatalogResponse>('/packages'),
  ])

  const allowed = new Set(data.agent.policy.allowedPackageIds ?? [])
  const sellPackages = (packageResponse?.items ?? [])
    .filter((pkg) => pkg.status === 'ACTIVE' && !isTrialPackage(pkg))
    .filter((pkg) => allowed.size === 0 || allowed.has(pkg.id))
    .map((pkg) => ({
      id: pkg.id,
      name: pkg.name,
      code: pkg.code,
      durationMinutes: pkg.durationMinutes,
      activePriceUgx: pkg.activePriceUgx,
    }))

  return <AgentMobileConsole data={data} packages={sellPackages} />
}
