import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common'
import { AccessScopeService } from '../auth/access-scope.service'
import { AuthenticatedAdminUser, JwtAuthGuard } from '../auth/auth.module'
import { CurrentUser } from '../auth/current-user.decorator'
import { PermissionsGuard } from '../auth/permissions.guard'
import { RequirePermissions } from '../auth/permissions.decorator'
import { PERMISSIONS } from '../auth/permissions.constants'
import { CheckoutSmsCreditsDto } from './dto/checkout-sms-credits.dto'
import { SmsService } from './sms.service'

@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('sms')
export class SmsController {
  constructor(
    private readonly smsService: SmsService,
    private readonly accessScope: AccessScopeService,
  ) {}

  @RequirePermissions(PERMISSIONS.settingsManage)
  @Get('wallet')
  getWallet(@CurrentUser() user: AuthenticatedAdminUser) {
    const tenantId = this.accessScope.requireTenantScope(user)
    return this.smsService.getWalletStatus(tenantId)
  }

  @RequirePermissions(PERMISSIONS.settingsManage)
  @Post('wallet/checkout')
  startCheckout(@CurrentUser() user: AuthenticatedAdminUser, @Body() dto: CheckoutSmsCreditsDto) {
    const tenantId = this.accessScope.requireTenantScope(user)
    return this.smsService.startCreditCheckout(tenantId, dto)
  }

  @RequirePermissions(PERMISSIONS.settingsManage)
  @Get('wallet/checkout/status')
  refreshCheckout(@CurrentUser() user: AuthenticatedAdminUser) {
    const tenantId = this.accessScope.requireTenantScope(user)
    return this.smsService.refreshCreditCheckout(tenantId)
  }
}
