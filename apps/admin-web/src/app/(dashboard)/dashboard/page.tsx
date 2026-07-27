import DashboardHome from '../../../components/DashboardHome'

export default async function DashboardAliasPage({ searchParams }: { searchParams?: Promise<Record<string, string | undefined>> }) {
  return <DashboardHome searchParams={await searchParams} />
}
