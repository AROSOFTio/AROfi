import { Injectable, NotFoundException } from '@nestjs/common'
import {
  BillingTransactionStatus,
  BillingTransactionType,
  SessionStatus,
  VoucherStatus,
} from '@prisma/client'
import { buildTenantHotspotDomain } from '../../common/tenant-hotspot-domain'
import { PrismaService } from '../../prisma.service'

@Injectable()
export class VoucherOverviewService {
  constructor(private readonly prisma: PrismaService) {}

  async getOverview(tenantId?: string) {
    const voucherTransactionTypes = [
      BillingTransactionType.VOUCHER_SALE,
      BillingTransactionType.VOUCHER_REDEMPTION,
    ]
    const tenantWhere = tenantId ? { tenantId } : undefined

    const [batches, totalBatches, recentSales, recentRedemptions, voucherCounts, voucherTotals] =
      await Promise.all([
        this.prisma.voucherBatch.findMany({
          where: tenantWhere,
          select: {
            id: true,
            batchNumber: true,
            prefix: true,
            quantity: true,
            faceValueUgx: true,
            status: true,
            createdAt: true,
            tenant: {
              select: {
                id: true,
                name: true,
                domain: true,
                supportPhone: true,
                supportEmail: true,
              },
            },
            package: {
              select: {
                id: true,
                name: true,
                code: true,
                durationMinutes: true,
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
          },
          orderBy: { createdAt: 'desc' },
          take: 200,
        }),
        this.prisma.voucherBatch.count({ where: tenantWhere }),
        this.prisma.billingTransaction.findMany({
          where: {
            ...(tenantId ? { tenantId } : {}),
            type: { in: voucherTransactionTypes },
            status: BillingTransactionStatus.COMPLETED,
          },
          select: {
            id: true,
            tenantId: true,
            walletId: true,
            agentId: true,
            packageId: true,
            voucherId: true,
            ledgerTransactionId: true,
            channel: true,
            type: true,
            status: true,
            grossAmountUgx: true,
            feeAmountUgx: true,
            netAmountUgx: true,
            feeBasisPoints: true,
            feeSource: true,
            customerReference: true,
            externalReference: true,
            paymentProvider: true,
            metadata: true,
            createdAt: true,
            updatedAt: true,
            tenant: { select: { id: true, name: true } },
            package: { select: { id: true, name: true, code: true } },
            voucher: { select: { id: true, code: true } },
          },
          orderBy: { createdAt: 'desc' },
          take: 10,
        }),
        this.prisma.voucherRedemption.findMany({
          where: tenantWhere,
          include: {
            tenant: { select: { id: true, name: true } },
            package: { select: { id: true, name: true, code: true } },
            voucher: { select: { id: true, code: true } },
            hotspot: { select: { id: true, name: true } },
            networkSessions: {
              where: { status: SessionStatus.ACTIVE },
              take: 1,
              select: { id: true, status: true, ipAddress: true },
            },
          },
          orderBy: { createdAt: 'desc' },
          take: 10,
        }),
        this.prisma.voucher.groupBy({
          by: ['status'],
          where: tenantWhere,
          _count: { _all: true },
        }),
        this.prisma.billingTransaction.aggregate({
          where: {
            ...(tenantId ? { tenantId } : {}),
            type: { in: voucherTransactionTypes },
            status: BillingTransactionStatus.COMPLETED,
          },
          _sum: {
            grossAmountUgx: true,
            feeAmountUgx: true,
          },
        }),
      ])

    const batchIds = batches.map((batch) => batch.id)
    const batchVoucherCounts = batchIds.length
      ? await this.prisma.voucher.groupBy({
          by: ['batchId', 'status'],
          where: {
            batchId: { in: batchIds },
            status: {
              in: [VoucherStatus.GENERATED, VoucherStatus.SOLD, VoucherStatus.REDEEMED],
            },
          },
          _count: { _all: true },
        })
      : []

    const countsByBatch = new Map<string, Record<string, number>>()
    for (const count of batchVoucherCounts) {
      const existing = countsByBatch.get(count.batchId) ?? {}
      existing[count.status] = count._count._all
      countsByBatch.set(count.batchId, existing)
    }

    const summaryByStatus: Record<string, number> = {}
    let totalGenerated = 0
    for (const count of voucherCounts) {
      summaryByStatus[count.status] = count._count._all
      totalGenerated += count._count._all
    }

    return {
      summary: {
        totalBatches,
        totalGenerated,
        activeUnused: summaryByStatus[VoucherStatus.GENERATED] ?? 0,
        sold: summaryByStatus[VoucherStatus.SOLD] ?? 0,
        redeemed: summaryByStatus[VoucherStatus.REDEEMED] ?? 0,
        totalVoucherSalesUgx: voucherTotals._sum.grossAmountUgx ?? 0,
        totalVoucherFeesUgx: voucherTotals._sum.feeAmountUgx ?? 0,
      },
      batches: batches.map((batch) => {
        const counts = countsByBatch.get(batch.id) ?? {}
        const generatedCount = counts[VoucherStatus.GENERATED] ?? 0
        const soldCount = counts[VoucherStatus.SOLD] ?? 0
        const redeemedCount = counts[VoucherStatus.REDEEMED] ?? 0

        return {
          id: batch.id,
          batchNumber: batch.batchNumber,
          prefix: batch.prefix,
          quantity: batch.quantity,
          faceValueUgx: batch.faceValueUgx,
          status: batch.status,
          tenant: {
            ...batch.tenant,
            hotspotDomain: buildTenantHotspotDomain(batch.tenant.name),
          },
          package: batch.package,
          agent: batch.agent,
          generatedCount,
          soldCount,
          redeemedCount,
          remainingCount: generatedCount,
          previewVouchers: [],
          createdAt: batch.createdAt,
        }
      }),
      recentSales,
      recentRedemptions,
    }
  }

  async getBatchPreview(batchId: string, tenantId?: string) {
    const batch = await this.prisma.voucherBatch.findFirst({
      where: {
        id: batchId,
        ...(tenantId ? { tenantId } : {}),
      },
      select: {
        id: true,
        vouchers: {
          select: {
            id: true,
            code: true,
            status: true,
          },
          orderBy: { createdAt: 'asc' },
        },
      },
    })

    if (!batch) {
      throw new NotFoundException('Voucher batch not found')
    }

    return {
      batchId: batch.id,
      previewVouchers: batch.vouchers,
    }
  }
}
