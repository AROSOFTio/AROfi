import { Body, Controller, Get, Headers, Param, Post, Query, UseGuards } from '@nestjs/common'
import { AccessScopeService } from '../auth/access-scope.service'
import { AuthenticatedAdminUser, JwtAuthGuard } from '../auth/auth.module'
import { PermissionsGuard } from '../auth/permissions.guard'
import { CurrentUser } from '../auth/current-user.decorator'
import { RequirePermissions } from '../auth/permissions.decorator'
import { PERMISSIONS } from '../auth/permissions.constants'
import { PaymentNetwork, PaymentProvider } from '@prisma/client'
import { InitiatePortalPaymentDto } from './dto/initiate-portal-payment.dto'
import { PaymentsService } from './payments.service'

@Controller('payments')
export class PaymentsController {
  constructor(
    private readonly paymentsService: PaymentsService,
    private readonly accessScope: AccessScopeService,
  ) {}

  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePermissions(PERMISSIONS.paymentsRead)
  @Get('overview')
  getOverview(@CurrentUser() user: AuthenticatedAdminUser, @Query('tenantId') tenantId?: string) {
    const scopedTenantId = this.accessScope.resolveTenantScope(user, tenantId)
    return this.paymentsService.getOverview(scopedTenantId)
  }

  @Get('portal/context')
  getPortalContext(
    @Query('tenantDomain') tenantDomain?: string,
    @Query('phoneNumber') phoneNumber?: string,
  ) {
    return this.paymentsService.getPortalContext(tenantDomain, phoneNumber)
  }

  @Post('portal/initiate')
  initiatePortalPayment(@Body() dto: InitiatePortalPaymentDto) {
    return this.paymentsService.initiatePortalPayment(dto)
  }

  @Post('webhooks/mtn/collection')
  handleMtnCollectionWebhook(
    @Body() payload: Record<string, unknown>,
    @Headers() headers: Record<string, string | string[] | undefined>,
  ) {
    return this.paymentsService.handleProviderWebhook(PaymentProvider.MTN_MOMO_DIRECT, PaymentNetwork.MTN, payload, headers, 'collection')
  }

  @Post('webhooks/mtn/disbursement')
  handleMtnDisbursementWebhook(@Body() payload: Record<string, unknown>, @Headers() headers: Record<string, string | string[] | undefined>) {
    return this.paymentsService.handleProviderWebhook(PaymentProvider.MTN_MOMO_DIRECT, PaymentNetwork.MTN, payload, headers, 'disbursement')
  }

  @Post('webhooks/airtel/collection')
  handleAirtelCollectionWebhook(@Body() payload: Record<string, unknown>, @Headers() headers: Record<string, string | string[] | undefined>) {
    return this.paymentsService.handleProviderWebhook(PaymentProvider.AIRTEL_MONEY_DIRECT, PaymentNetwork.AIRTEL, payload, headers, 'collection')
  }

  @Post('webhooks/airtel/disbursement')
  handleAirtelDisbursementWebhook(@Body() payload: Record<string, unknown>, @Headers() headers: Record<string, string | string[] | undefined>) {
    return this.paymentsService.handleProviderWebhook(PaymentProvider.AIRTEL_MONEY_DIRECT, PaymentNetwork.AIRTEL, payload, headers, 'disbursement')
  }

  @Post('webhooks/aggregator/collection')
  handleAggregatorCollectionWebhook(@Body() payload: Record<string, unknown>, @Headers() headers: Record<string, string | string[] | undefined>) {
    return this.paymentsService.handleAggregatorCollectionWebhook(payload, headers)
  }

  @Get('webhooks/aggregator/collection')
  handleAggregatorCollectionReturn(
    @Query() query: Record<string, unknown>,
    @Headers() headers: Record<string, string | string[] | undefined>,
  ) {
    return this.paymentsService.handleAggregatorCollectionWebhook(query, headers)
  }

  @Post('webhooks/pesapal')
  handlePesapalWebhook(
    @Body() payload: Record<string, unknown>,
    @Headers() headers: Record<string, string | string[] | undefined>,
  ) {
    return this.paymentsService.handleAggregatorCollectionWebhook(payload, headers)
  }

  @Get('webhooks/pesapal')
  handlePesapalReturn(
    @Query() query: Record<string, unknown>,
    @Headers() headers: Record<string, string | string[] | undefined>,
  ) {
    return this.paymentsService.handleAggregatorCollectionWebhook(query, headers)
  }

  @Post('webhooks/yo-uganda')
  handleYoUgandaWebhook(
    @Body() payload: Record<string, unknown>,
    @Headers() headers: Record<string, string | string[] | undefined>,
  ) {
    return this.paymentsService.handleAggregatorCollectionWebhook(payload, headers)
  }

  @Get('webhooks/yo-uganda')
  handleYoUgandaReturn(
    @Query() query: Record<string, unknown>,
    @Headers() headers: Record<string, string | string[] | undefined>,
  ) {
    return this.paymentsService.handleAggregatorCollectionWebhook(query, headers)
  }

  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePermissions(PERMISSIONS.paymentsRead)
  @Get(':paymentId')
  getPayment(@CurrentUser() user: AuthenticatedAdminUser, @Param('paymentId') paymentId: string) {
    const tenantId = this.accessScope.resolveTenantScope(user)
    return this.paymentsService.getPayment(paymentId, tenantId)
  }

  @Post(':paymentId/check-status')
  checkPaymentStatus(@Param('paymentId') paymentId: string, @Query('token') token?: string) {
    return this.paymentsService.checkPaymentStatus(paymentId, undefined, token)
  }
}

