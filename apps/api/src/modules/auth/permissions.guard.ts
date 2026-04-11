import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common'
import { Reflector } from '@nestjs/core'
import type { Request } from 'express'
import { PERMISSIONS } from './permissions.constants'
import { REQUIRED_PERMISSIONS_KEY } from './permissions.decorator'
import type { AuthenticatedAdminUser } from './auth.module'

type AuthenticatedRequest = Request & {
  user?: AuthenticatedAdminUser
}

@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext) {
    const requiredPermissions = this.reflector.getAllAndOverride<string[]>(
      REQUIRED_PERMISSIONS_KEY,
      [context.getHandler(), context.getClass()],
    )

    if (!requiredPermissions || requiredPermissions.length === 0) {
      return true
    }

    const request = context.switchToHttp().getRequest<AuthenticatedRequest>()
    const user = request.user

    if (!user) {
      throw new ForbiddenException('You must be signed in to access this resource')
    }

    if (user.permissions.includes(PERMISSIONS.all)) {
      return true
    }

    const hasPermission = requiredPermissions.every((permission) =>
      user.permissions.includes(permission),
    )

    if (!hasPermission) {
      throw new ForbiddenException('You do not have permission to perform this action')
    }

    return true
  }
}
