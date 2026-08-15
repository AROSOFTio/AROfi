import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common'
import { AccessScopeService } from '../auth/access-scope.service'
import { AuthenticatedAdminUser, JwtAuthGuard } from '../auth/auth.module'
import { CurrentUser } from '../auth/current-user.decorator'
import { RequirePermissions } from '../auth/permissions.decorator'
import { PERMISSIONS } from '../auth/permissions.constants'
import { PermissionsGuard } from '../auth/permissions.guard'
import { AgentAccountingService } from './agent-accounting.service'
import { AgentCashDepositDto, AgentCommissionWithdrawalDto } from './dto/agent-accounting.dto'

@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('agent-accounting')
export class AgentAccountingController {
  constructor(
    private readonly accounting: AgentAccountingService,
    private readonly accessScope: AccessScopeService,
  ) {}

  @RequirePermissions(PERMISSIONS.agentsRead)
  @Get('me')
  getMyAccounting(@CurrentUser() user: AuthenticatedAdminUser) {
    const tenantId = this.accessScope.requireTenantScope(user)
    return this.accounting.getMyAccounting(user.email, tenantId)
  }

  @RequirePermissions(PERMISSIONS.agentsRead)
  @Post('me/cash-deposits')
  initiateCashDeposit(@CurrentUser() user: AuthenticatedAdminUser, @Body() dto: AgentCashDepositDto) {
    const tenantId = this.accessScope.requireTenantScope(user)
    return this.accounting.initiateCashDeposit(user.email, tenantId, dto)
  }

  @RequirePermissions(PERMISSIONS.agentsRead)
  @Post('me/cash-deposits/:transactionId/status')
  checkCashDeposit(@CurrentUser() user: AuthenticatedAdminUser, @Param('transactionId') transactionId: string) {
    const tenantId = this.accessScope.requireTenantScope(user)
    return this.accounting.checkCashDeposit(user.email, tenantId, transactionId)
  }

  @RequirePermissions(PERMISSIONS.agentsRead)
  @Post('me/commission-withdrawals')
  initiateCommissionWithdrawal(
    @CurrentUser() user: AuthenticatedAdminUser,
    @Body() dto: AgentCommissionWithdrawalDto,
  ) {
    const tenantId = this.accessScope.requireTenantScope(user)
    return this.accounting.initiateCommissionWithdrawal(user.email, tenantId, dto)
  }

  @RequirePermissions(PERMISSIONS.agentsRead)
  @Post('me/commission-withdrawals/:disbursementId/status')
  checkCommissionWithdrawal(
    @CurrentUser() user: AuthenticatedAdminUser,
    @Param('disbursementId') disbursementId: string,
  ) {
    const tenantId = this.accessScope.requireTenantScope(user)
    return this.accounting.checkCommissionWithdrawal(user.email, tenantId, disbursementId)
  }
}
