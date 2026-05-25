import DashboardHome from '../../../components/DashboardHome'

export const metadata = {
  title: 'AROFi Admin – Dashboard',
  description: 'Platform overview for AROFi Hotspot Billing & Network Management.',
}

export default async function DashboardPage({ searchParams }: { searchParams?: Promise<Record<string, string | undefined>> }) {
  return <DashboardHome searchParams={await searchParams} />
}
