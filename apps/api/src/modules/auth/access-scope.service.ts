import { ForbiddenException, Injectable } from '@nestjs/common'
import type { AuthenticatedAdminUser } from './auth.module'
import { PERMISSIONS } from './permissions.constants'

const PLATFORM_STAFF_ROLES = new Set([
  'SuperAdmin',
  'Support',
  'ReadOnlySupport',
  'NetworkOperator',
  'FinanceManager',
  'WifiAdmin',
])

@Injectable()
export class AccessScopeService {
  isSuperAdmin(user?: AuthenticatedAdminUser) {
    return Boolean(user?.permissions.includes(PERMISSIONS.all))
  }

  isPlatformStaff(user?: AuthenticatedAdminUser) {
    return Boolean(user && !user.tenantId && PLATFORM_STAFF_ROLES.has(user.role))
  }

  resolveTenantScope(user: AuthenticatedAdminUser | undefined, requestedTenantId?: string | null) {
    if (!user) {
      throw new ForbiddenException('You must be signed in to access business resources')
    }

    if (this.isSuperAdmin(user) || this.isPlatformStaff(user)) {
      // Platform staff are still restricted by PermissionsGuard on each API.
      // This only removes the tenant boundary for approved AROFi staff roles;
      // it does not grant a permission the role does not already have.
      return requestedTenantId ?? user.tenantId ?? undefined
    }

    if (!user.tenantId) {
      throw new ForbiddenException('Your account is not assigned to a business')
    }

    if (requestedTenantId && requestedTenantId !== user.tenantId) {
      throw new ForbiddenException('You can only access resources for your own business')
    }

    return user.tenantId
  }

  requireTenantScope(user: AuthenticatedAdminUser | undefined, requestedTenantId?: string | null) {
    const tenantId = this.resolveTenantScope(user, requestedTenantId)

    if (!tenantId) {
      throw new ForbiddenException('A business must be selected for this action')
    }

    return tenantId
  }
}
