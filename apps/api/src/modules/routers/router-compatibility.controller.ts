import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common'
import { AccessScopeService } from '../auth/access-scope.service'
import { AuthenticatedAdminUser, JwtAuthGuard } from '../auth/auth.module'
import { CurrentUser } from '../auth/current-user.decorator'
import { RequirePermissions } from '../auth/permissions.decorator'
import { PERMISSIONS } from '../auth/permissions.constants'
import { PermissionsGuard } from '../auth/permissions.guard'
import { InvalidateRedisCache } from '../../common/cache/redis-cache.decorators'
import { RegisterCompatibleRouterDto } from './dto/router-compatibility.dto'
import { RouterCompatibilityService } from './router-compatibility.service'

@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('router-compatibility')
export class RouterCompatibilityController {
  constructor(
    private readonly compatibility: RouterCompatibilityService,
    private readonly accessScope: AccessScopeService,
  ) {}

  @RequirePermissions(PERMISSIONS.routersRead)
  @Get('profiles')
  getProfiles() {
    return this.compatibility.getProfiles()
  }

  @RequirePermissions(PERMISSIONS.routersManage)
  @InvalidateRedisCache('routers:overview', 'hotspots:overview')
  @Post('register')
  async register(@CurrentUser() user: AuthenticatedAdminUser, @Body() dto: RegisterCompatibleRouterDto) {
    const tenantId = this.accessScope.requireTenantScope(user, dto.tenantId)
    const setup = await this.compatibility.register(tenantId, dto)
    return this.withRadiusPortalUrl(setup)
  }

  @RequirePermissions(PERMISSIONS.routersRead)
  @Get(':routerId/setup')
  async getSetup(@CurrentUser() user: AuthenticatedAdminUser, @Param('routerId') routerId: string) {
    const tenantId = this.accessScope.resolveTenantScope(user)
    const setup = await this.compatibility.getSetup(routerId, tenantId)
    return this.withRadiusPortalUrl(setup)
  }

  @RequirePermissions(PERMISSIONS.routersManage)
  @InvalidateRedisCache('routers:overview')
  @Post(':routerId/verify')
  verify(@CurrentUser() user: AuthenticatedAdminUser, @Param('routerId') routerId: string) {
    const tenantId = this.accessScope.resolveTenantScope(user)
    return this.compatibility.verify(routerId, tenantId)
  }

  private withRadiusPortalUrl<T extends {
    router: { id: string; vendor: string }
    portal: { url: string | null; required: boolean; note: string }
    instructions: string[]
  }>(setup: T): T {
    const configured = (process.env.PORTAL_PUBLIC_URL ?? 'https://arofi.net/portal').trim().replace(/\/$/, '')
    const radiusBase = /\/radius(?:[/?#]|$)/i.test(configured) ? configured : `${configured}/radius`
    const separator = radiusBase.includes('?') ? '&' : '?'
    const portalUrl = `${radiusBase}${separator}routerId=${encodeURIComponent(setup.router.id)}&vendor=${encodeURIComponent(setup.router.vendor)}`

    return {
      ...setup,
      portal: {
        ...setup.portal,
        url: portalUrl,
        note: 'Use this router-specific AROFi URL as the external checkout/portal handoff where the controller supports a third-party portal. Native RADIUS login deployments can also open it to buy access and receive credentials.',
      },
      instructions: [
        ...setup.instructions.filter((item) => !/external (portal|hotspot)|external portal url/i.test(item)),
        `AROFi RADIUS checkout / external portal handoff: ${portalUrl}`,
      ],
    }
  }
}
