import { Controller, Get, UseGuards } from '@nestjs/common'
import { AccessScopeService } from '../auth/access-scope.service'
import { AuthenticatedAdminUser, JwtAuthGuard } from '../auth/auth.module'
import { CurrentUser } from '../auth/current-user.decorator'
import { RequirePermissions } from '../auth/permissions.decorator'
import { PERMISSIONS } from '../auth/permissions.constants'
import { PermissionsGuard } from '../auth/permissions.guard'
import { AgentVoucherStockService } from './agent-voucher-stock.service'

@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('agent-voucher-stock')
export class AgentVoucherStockController {
  constructor(
    private readonly stock: AgentVoucherStockService,
    private readonly accessScope: AccessScopeService,
  ) {}

  @RequirePermissions(PERMISSIONS.vouchersRead)
  @Get('me')
  getMyStock(@CurrentUser() user: AuthenticatedAdminUser) {
    const tenantId = this.accessScope.requireTenantScope(user)
    return this.stock.getMyStock(user.email, tenantId)
  }
}
