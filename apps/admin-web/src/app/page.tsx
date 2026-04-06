import type { Metadata } from 'next'
import DashboardLayout from './(dashboard)/layout'
import DashboardHome from '../components/DashboardHome'

export const metadata: Metadata = {
  title: 'AROFi Admin - Hotspot Billing & Network Management',
  description: 'Enterprise hotspot billing and network management platform. Built by AROSOFT Innovations Ltd.',
}

export default function RootPage() {
  return (
    <DashboardLayout>
      <DashboardHome />
    </DashboardLayout>
  )
}
