import type { AdminSessionResponse } from './admin-types'

type AdminUser = AdminSessionResponse['user']

export function isPlatformAdmin(user?: AdminUser | null) {
  return user?.role === 'SuperAdmin' || user?.permissions.includes('ALL') || false
}

export function isVendorWorkspace(user?: AdminUser | null) {
  return Boolean(user?.tenantId) && !isPlatformAdmin(user) && !isResellerWorkspace(user)
}

export function isResellerWorkspace(user?: AdminUser | null) {
  return user?.role === 'ResellerPartner'
}
