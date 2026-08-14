import type { AdminSessionResponse } from './admin-types'

type AdminUser = AdminSessionResponse['user']

const platformStaffRoles = new Set([
  'SuperAdmin',
  'Support',
  'ReadOnlySupport',
  'NetworkOperator',
  'FinanceManager',
  'WifiAdmin',
])

export function isPlatformAdmin(user?: AdminUser | null) {
  return Boolean(
    user && (
      user.role === 'SuperAdmin' ||
      user.permissions.includes('ALL') ||
      (!user.tenantId && platformStaffRoles.has(user.role))
    )
  )
}

export function isPlatformWorkspace(user?: AdminUser | null) {
  return Boolean(user && !user.tenantId && platformStaffRoles.has(user.role))
}

export function isVendorWorkspace(user?: AdminUser | null) {
  return Boolean(user?.tenantId) && !isPlatformAdmin(user) && !isResellerWorkspace(user)
}

export function isResellerWorkspace(user?: AdminUser | null) {
  return user?.role === 'ResellerPartner'
}
