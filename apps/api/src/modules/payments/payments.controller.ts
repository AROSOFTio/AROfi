import { Body, Controller, Get, Headers, Param, Post, Query, UseGuards } from '@nestjs/common'
import { JwtAuthGuard } from '../auth/auth.module'
import { InitiatePortalPaymentDto } from './dto/initiate-portal-payment.dto'
import { PaymentsService } from './payments.service'

@Controller('payments')
export class PaymentsController {
  constructor(private readonly paymentsService: PaymentsService) {}

  @UseGuards(JwtAuthGuard)
  @Get('overview')
  getOverview(@Query('tenantId') tenantId?: string) {
    return this.paymentsService.getOverview(tenantId)
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

  @Post('webhooks/yo-uganda')
  handleYoWebhook(
    @Body() payload: Record<string, unknown>,
    @Headers() headers: Record<string, string | string[] | undefined>,
    @Query('token') token?: string,
    @Query('event') event?: string,
    @Query('externalReference') externalReference?: string,
  ) {
    return this.paymentsService.handleYoWebhook(payload, headers, token, event, externalReference)
  }

  @Get('webhooks/pesapal')
  handlePesapalWebhookGet(
    @Query() query: Record<string, string>,
    @Headers() headers: Record<string, string | string[] | undefined>,
  ) {
    return this.paymentsService.handlePesapalWebhook(
      {},
      headers,
      query.token,
      query.OrderTrackingId ?? query.orderTrackingId,
      query.OrderMerchantReference ?? query.merchantReference ?? query.externalReference,
      query.OrderNotificationType ?? query.event,
    )
  }

  @Post('webhooks/pesapal')
  handlePesapalWebhookPost(
    @Body() payload: Record<string, unknown>,
    @Headers() headers: Record<string, string | string[] | undefined>,
    @Query('token') token?: string,
    @Query('orderTrackingId') orderTrackingId?: string,
    @Query('merchantReference') merchantReference?: string,
    @Query('event') event?: string,
  ) {
    return this.paymentsService.handlePesapalWebhook(
      payload,
      headers,
      token,
      orderTrackingId,
      merchantReference,
      event,
    )
  }

  @Get(':paymentId')
  getPayment(@Param('paymentId') paymentId: string) {
    return this.paymentsService.getPayment(paymentId)
  }

  @Post(':paymentId/check-status')
  checkPaymentStatus(@Param('paymentId') paymentId: string) {
    return this.paymentsService.checkPaymentStatus(paymentId)
  }
}
