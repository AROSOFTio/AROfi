import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common'
import { AccessScopeService } from '../auth/access-scope.service'
import { AuthenticatedAdminUser, JwtAuthGuard } from '../auth/auth.module'
import { CurrentUser } from '../auth/current-user.decorator'
import { PermissionsGuard } from '../auth/permissions.guard'
import { RequirePermissions } from '../auth/permissions.decorator'
import { PERMISSIONS } from '../auth/permissions.constants'
import { CheckoutSubscriptionDto } from './dto/checkout-subscription.dto'
import { SelectPlanDto } from './dto/select-plan.dto'
import { SubscriptionService } from './subscription.service'

@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('subscription')
export class SubscriptionController {
  constructor(
    private readonly subscriptionService: SubscriptionService,
    private readonly accessScope: AccessScopeService,
  ) {}

  @Get('plans')
  getPlans() {
    return this.subscriptionService.getPlanCatalog()
  }

  @RequirePermissions(PERMISSIONS.settingsManage)
  @Get('status')
  getStatus(@CurrentUser() user: AuthenticatedAdminUser) {
    const tenantId = this.accessScope.requireTenantScope(user)
    return this.subscriptionService.getStatus(tenantId)
  }

  @RequirePermissions(PERMISSIONS.settingsManage)
  @Post('select')
  selectPlan(@CurrentUser() user: AuthenticatedAdminUser, @Body() dto: SelectPlanDto) {
    const tenantId = this.accessScope.requireTenantScope(user)
    return this.subscriptionService.selectPlan(tenantId, dto.plan)
  }

  @RequirePermissions(PERMISSIONS.settingsManage)
  @Post('checkout')
  startCheckout(@CurrentUser() user: AuthenticatedAdminUser, @Body() dto: CheckoutSubscriptionDto) {
    const tenantId = this.accessScope.requireTenantScope(user)
    return this.subscriptionService.startCheckout(tenantId, dto.phoneNumber)
  }

  @RequirePermissions(PERMISSIONS.settingsManage)
  @Get('checkout/status')
  refreshCheckoutStatus(@CurrentUser() user: AuthenticatedAdminUser) {
    const tenantId = this.accessScope.requireTenantScope(user)
    return this.subscriptionService.refreshCheckoutStatus(tenantId)
  }

  @RequirePermissions(PERMISSIONS.settingsManage)
  @Post('skip')
  skipPayment(@CurrentUser() user: AuthenticatedAdminUser) {
    const tenantId = this.accessScope.requireTenantScope(user)
    return this.subscriptionService.skipPayment(tenantId)
  }
}
