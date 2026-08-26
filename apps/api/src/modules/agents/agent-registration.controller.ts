import { Body, Controller, Post, UseGuards } from '@nestjs/common'
import { AccessScopeService } from '../auth/access-scope.service'
import { AuthenticatedAdminUser, JwtAuthGuard } from '../auth/auth.module'
import { CurrentUser } from '../auth/current-user.decorator'
import { RequirePermissions } from '../auth/permissions.decorator'
import { PERMISSIONS } from '../auth/permissions.constants'
import { PermissionsGuard } from '../auth/permissions.guard'
import { AgentRegistrationService } from './agent-registration.service'
import { CreateAgentDto } from './dto/create-agent.dto'

@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('agents')
export class AgentRegistrationController {
  constructor(
    private readonly registration: AgentRegistrationService,
    private readonly accessScope: AccessScopeService,
  ) {}

  @RequirePermissions(PERMISSIONS.agentsManage)
  @Post('register')
  register(@CurrentUser() user: AuthenticatedAdminUser, @Body() dto: CreateAgentDto) {
    const tenantId = this.accessScope.requireTenantScope(user, dto.tenantId)
    return this.registration.register({ ...dto, tenantId })
  }
}
