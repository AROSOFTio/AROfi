import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common'
import { JwtAuthGuard } from '../auth/auth.module'
import { WalletsService } from './wallets.service'

@UseGuards(JwtAuthGuard)
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
