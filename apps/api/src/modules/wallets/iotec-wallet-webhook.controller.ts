import { Body, Controller, Headers, Post, Query } from '@nestjs/common'
import { WalletsService } from './wallets.service'

@Controller('wallets/webhooks/iotec')
export class IotecWalletWebhookController {
  constructor(private readonly walletsService: WalletsService) {}

  @Post('disbursement')
  handleDisbursement(
    @Body() payload: Record<string, unknown>,
    @Headers() headers: Record<string, string | string[] | undefined>,
    @Query('secret') secret?: string,
  ) {
    return this.walletsService.handleIotecDisbursementWebhook(payload, headers, secret)
  }
}
