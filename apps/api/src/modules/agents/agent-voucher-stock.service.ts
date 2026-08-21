import { ForbiddenException, Injectable } from '@nestjs/common'
import { AgentStatus, VoucherStatus } from '@prisma/client'
import { PrismaService } from '../../prisma.service'

@Injectable()
export class AgentVoucherStockService {
  constructor(private readonly prisma: PrismaService) {}

  async getMyStock(email: string, tenantId: string) {
    const agent = await this.prisma.agent.findFirst({
      where: { tenantId, email: { equals: email, mode: 'insensitive' } },
      select: { id: true, code: true, name: true, status: true },
    })
    if (!agent) throw new ForbiddenException('This login is not linked to an Agent profile.')
    if (agent.status !== AgentStatus.ACTIVE) throw new ForbiddenException('This Agent account is not active.')

    const batches = await this.prisma.voucherBatch.findMany({
      where: { tenantId, agentId: agent.id },
      include: {
        package: { select: { id: true, name: true, code: true } },
        vouchers: { select: { status: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: 100,
    })

    const items = batches.map((batch) => {
      const available = batch.vouchers.filter((voucher) =>
        voucher.status === VoucherStatus.GENERATED || voucher.status === VoucherStatus.PRINTED,
      ).length
      const redeemed = batch.vouchers.filter((voucher) => voucher.status === VoucherStatus.REDEEMED).length
      const sold = batch.vouchers.filter((voucher) => voucher.status === VoucherStatus.SOLD).length
      return {
        id: batch.id,
        batchNumber: batch.batchNumber,
        package: batch.package,
        quantity: batch.quantity,
        faceValueUgx: batch.faceValueUgx,
        available,
        sold,
        redeemed,
        status: batch.status,
        createdAt: batch.createdAt,
        expiresAt: batch.expiresAt,
      }
    })

    return {
      agent: { id: agent.id, code: agent.code, name: agent.name },
      summary: {
        assigned: items.reduce((sum, item) => sum + item.quantity, 0),
        available: items.reduce((sum, item) => sum + item.available, 0),
        sold: items.reduce((sum, item) => sum + item.sold, 0),
        redeemed: items.reduce((sum, item) => sum + item.redeemed, 0),
      },
      batches: items,
    }
  }
}
