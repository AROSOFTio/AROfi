import { Controller, Get, Param, Query } from '@nestjs/common'
import { WalletsService } from './wallets.service'

@Controller('wallets')
export class WalletsController {
  constructor(private readonly walletsService: WalletsService) {}

  @Get()
  listWallets(@Query('tenantId') tenantId?: string) {
    return this.walletsService.listWallets(tenantId)
  }

  @Get(':tenantId')
  getWallet(@Param('tenantId') tenantId: string) {
    return this.walletsService.getWallet(tenantId)
  }
}
