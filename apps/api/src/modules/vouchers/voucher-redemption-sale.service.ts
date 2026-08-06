import { Injectable, Logger } from '@nestjs/common'
import {
  BillingTransactionStatus,
  BillingTransactionType,
  CommissionStatus,
  Prisma,
  VoucherStatus,
} from '@prisma/client'
import { PrismaService } from '../../prisma.service'

/**
 * Converts the financial redemption record into the single authoritative
 * voucher sale record. A voucher is inventory while generated/printed and is
 * only a sale once the customer successfully redeems it.
 */
@Injectable()
export class VoucherRedemptionSaleService {
  private readonly logger = new Logger(VoucherRedemptionSaleService.name)

  constructor(private readonly prisma: PrismaService) {}

  async recordRedeemedVoucherAsSale(voucherId: string) {
    return this.prisma.$transaction(async (tx) => {
      const voucher = await tx.voucher.findUnique({
        where: { id: voucherId },
        include: {
          batch: {
            include: {
              agent: {
                select: {
                  id: true,
                  code: true,
                  name: true,
                  commissionRateBps: true,
                },
              },
            },
          },
          billingTransactions: {
            where: {
              status: BillingTransactionStatus.COMPLETED,
              type: {
                in: [
                  BillingTransactionType.VOUCHER_SALE,
                  BillingTransactionType.VOUCHER_REDEMPTION,
                ],
              },
            },
            orderBy: { createdAt: 'asc' },
          },
        },
      })

      if (!voucher || voucher.status !== VoucherStatus.REDEEMED) {
        return null
      }

      // Historical vouchers may already have been manually posted as sold.
      // Preserve that original sale and keep the later zero-value redemption
      // transaction as a usage audit record.
      const existingSale = voucher.billingTransactions.find(
        (transaction) =>
          transaction.type === BillingTransactionType.VOUCHER_SALE &&
          transaction.grossAmountUgx > 0,
      )
      if (existingSale) {
        return existingSale
      }

      const redemptionTransaction = voucher.billingTransactions.find(
        (transaction) =>
          transaction.type === BillingTransactionType.VOUCHER_REDEMPTION &&
          transaction.grossAmountUgx > 0,
      )

      if (!redemptionTransaction) {
        this.logger.warn(
          `Redeemed voucher ${voucher.id} has no positive redemption transaction to convert into a sale`,
        )
        return null
      }

      const agent = voucher.batch.agent
      const existingMetadata =
        redemptionTransaction.metadata &&
        typeof redemptionTransaction.metadata === 'object' &&
        !Array.isArray(redemptionTransaction.metadata)
          ? (redemptionTransaction.metadata as Prisma.JsonObject)
          : {}

      const sale = await tx.billingTransaction.update({
        where: { id: redemptionTransaction.id },
        data: {
          type: BillingTransactionType.VOUCHER_SALE,
          agentId: agent?.id ?? null,
          metadata: {
            ...existingMetadata,
            saleRecordedAtRedemption: true,
            stockOwnerType: agent ? 'AGENT' : 'MAIN',
            batchNumber: voucher.batch.batchNumber,
            agentId: agent?.id ?? null,
            agentCode: agent?.code ?? null,
            agentName: agent?.name ?? null,
            redeemedAt: voucher.redeemedAt?.toISOString() ?? new Date().toISOString(),
          } as Prisma.InputJsonValue,
        },
      })

      if (agent && sale.grossAmountUgx > 0) {
        const existingCommission = await tx.agentCommission.findUnique({
          where: { sourceTransactionId: sale.id },
        })

        if (!existingCommission) {
          const amountUgx = Math.round(
            (sale.grossAmountUgx * agent.commissionRateBps) / 10000,
          )

          if (amountUgx > 0) {
            await tx.agentCommission.create({
              data: {
                tenantId: sale.tenantId,
                agentId: agent.id,
                sourceTransactionId: sale.id,
                status: CommissionStatus.ACCRUED,
                basisAmountUgx: sale.grossAmountUgx,
                rateBps: agent.commissionRateBps,
                amountUgx,
              },
            })
          }
        }
      }

      return sale
    })
  }
}
