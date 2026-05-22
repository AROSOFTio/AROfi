import { BadRequestException, Injectable } from '@nestjs/common'
import { Prisma } from '@prisma/client'
import { PrismaService } from '../../prisma.service'

@Injectable()
export class WalletLedgerService {
  constructor(private readonly prisma: PrismaService) {}

  calculateCommission(amountUgx: number) {
    const bps = Number.parseInt(process.env.PLATFORM_COMMISSION_BPS ?? '0', 10) || 0
    return Math.floor((amountUgx * bps) / 10_000)
  }

  async assertAvailableBalance(tx: Prisma.TransactionClient, walletId: string, amountUgx: number) {
    const wallet = await tx.wallet.findUnique({ where: { id: walletId } })
    if (!wallet || wallet.balanceUgx < amountUgx) {
      throw new BadRequestException('Insufficient available wallet balance')
    }
    return wallet
  }
}
