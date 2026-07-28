import { Module } from '@nestjs/common'
import { ReferralsController } from './referrals.controller'
import { ReferralsService } from './referrals.service'
import { WalletsModule } from '../wallets/wallets.module'

@Module({
  imports: [WalletsModule],
  controllers: [ReferralsController],
  providers: [ReferralsService],
  exports: [ReferralsService],
})
export class ReferralsModule {}
