import { ForbiddenException, Injectable } from '@nestjs/common'
import type { AuthenticatedAdminUser } from './auth.module'
import { PERMISSIONS } from './permissions.constants'

@Injectable()
export class AccessScopeService {
  isSuperAdmin(user?: AuthenticatedAdminUser) {
    return Boolean(user?.permissions.includes(PERMISSIONS.all))
  }

  resolveTenantScope(user: AuthenticatedAdminUser | undefined, requestedTenantId?: string | null) {
    if (!user) {
      throw new ForbiddenException('You must be signed in to access tenant resources')
    }

    if (this.isSuperAdmin(user)) {
      return requestedTenantId ?? undefined
    }

    if (!user.tenantId) {
      throw new ForbiddenException('Your account is not assigned to a tenant')
    }

    if (requestedTenantId && requestedTenantId !== user.tenantId) {
      throw new ForbiddenException('You can only access resources for your assigned tenant')
    }

    return user.tenantId
  }

  requireTenantScope(user: AuthenticatedAdminUser | undefined, requestedTenantId?: string | null) {
    const tenantId = this.resolveTenantScope(user, requestedTenantId)

    if (!tenantId) {
      throw new ForbiddenException('A tenant must be selected for this action')
    }

    return tenantId
  }
}
