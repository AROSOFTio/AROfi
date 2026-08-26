import { Body, Controller, Param, Post, UseGuards } from '@nestjs/common'
import { IsString, MinLength } from 'class-validator'
import { InvalidateRedisCache } from '../../common/cache/redis-cache.decorators'
import { AccessScopeService } from '../auth/access-scope.service'
import { AuthenticatedAdminUser, JwtAuthGuard } from '../auth/auth.module'
import { CurrentUser } from '../auth/current-user.decorator'
import { RequirePermissions } from '../auth/permissions.decorator'
import { PERMISSIONS } from '../auth/permissions.constants'
import { PermissionsGuard } from '../auth/permissions.guard'
import { AgentRegistrationService } from './agent-registration.service'
import { CreateAgentDto } from './dto/create-agent.dto'

class ProvisionAgentLoginDto {
  @IsString()
  @MinLength(8)
  temporaryPassword: string
}

@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('agents')
export class AgentRegistrationController {
  constructor(
    private readonly registration: AgentRegistrationService,
    private readonly accessScope: AccessScopeService,
  ) {}

  @RequirePermissions(PERMISSIONS.agentsManage)
  @InvalidateRedisCache('agents:overview')
  @Post('register')
  register(@CurrentUser() user: AuthenticatedAdminUser, @Body() dto: CreateAgentDto) {
    const tenantId = this.accessScope.requireTenantScope(user, dto.tenantId)
    return this.registration.register({ ...dto, tenantId })
  }

  @RequirePermissions(PERMISSIONS.agentsManage)
  @InvalidateRedisCache('agents:overview', 'agent:dashboard')
  @Post(':agentId/provision-login')
  provisionLogin(
    @CurrentUser() user: AuthenticatedAdminUser,
    @Param('agentId') agentId: string,
    @Body() dto: ProvisionAgentLoginDto,
  ) {
    const tenantId = this.accessScope.requireTenantScope(user)
    return this.registration.provisionLogin(agentId, tenantId, dto.temporaryPassword)
  }
}
