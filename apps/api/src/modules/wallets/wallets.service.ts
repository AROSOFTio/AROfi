import { WalletOwnerType } from '@prisma/client'
import { Injectable } from '@nestjs/common'
import { PrismaService } from '../../prisma.service'

@Injectable()
export class WalletsService {
  constructor(private readonly prisma: PrismaService) {}

  async listWallets(tenantId?: string) {
    const items = await this.prisma.wallet.findMany({
      where: tenantId ? { tenantId } : undefined,
      include: {
        tenant: {
          select: {
            id: true,
            name: true,
          },
        },
        agent: {
          select: {
            id: true,
            code: true,
            name: true,
            phoneNumber: true,
          },
        },
        ledgerEntries: {
          orderBy: { createdAt: 'desc' },
          take: 10,
          include: {
            ledgerTransaction: {
              select: {
                reference: true,
                description: true,
              },
            },
          },
        },
      },
      orderBy: { updatedAt: 'desc' },
    })

    return {
      summary: {
        totalWallets: items.length,
        totalBalanceUgx: items.reduce((total, item) => total + item.balanceUgx, 0),
      },
      items,
    }
  }

  async getWallet(tenantId: string) {
    return this.prisma.wallet.findFirst({
      where: {
        tenantId,
        ownerType: WalletOwnerType.TENANT,
        ownerReference: tenantId,
      },
      include: {
        tenant: {
          select: {
            id: true,
            name: true,
          },
        },
        agent: {
          select: {
            id: true,
            code: true,
            name: true,
            phoneNumber: true,
          },
        },
        ledgerEntries: {
          orderBy: { createdAt: 'desc' },
          take: 20,
          include: {
            ledgerTransaction: {
              select: {
                reference: true,
                description: true,
                channel: true,
              },
            },
          },
        },
      },
    })
  }
}
