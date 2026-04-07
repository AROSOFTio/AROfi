import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common'
import {
  BillingChannel,
  BillingTransactionStatus,
  BillingTransactionType,
  PackageActivationSource,
  Prisma,
  VoucherBatchStatus,
  VoucherStatus,
} from '@prisma/client'
import { PrismaService } from '../../prisma.service'
import { BillingService } from '../billing/billing.service'
import { PackageActivationService } from '../payments/package-activation.service'
import { CreateVoucherBatchDto } from './dto/create-voucher-batch.dto'
import { RecordVoucherSaleDto } from './dto/record-voucher-sale.dto'
import { RedeemVoucherDto } from './dto/redeem-voucher.dto'
import { VoucherCodeService } from './voucher-code.service'

@Injectable()
export class VouchersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly billingService: BillingService,
    private readonly packageActivationService: PackageActivationService,
    private readonly voucherCodeService: VoucherCodeService,
  ) {}

  async getOverview(tenantId?: string) {
    const [batches, voucherSales, redemptions, voucherCounts] = await Promise.all([
      this.prisma.voucherBatch.findMany({
        where: tenantId ? { tenantId } : undefined,
        include: {
          tenant: {
            select: {
              id: true,
              name: true,
            },
          },
          package: {
            select: {
              id: true,
              name: true,
              code: true,
            },
          },
          vouchers: {
            select: {
              id: true,
              status: true,
            },
          },
        },
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.billingTransaction.findMany({
        where: {
          ...(tenantId ? { tenantId } : {}),
          type: BillingTransactionType.VOUCHER_SALE,
          status: BillingTransactionStatus.COMPLETED,
        },
        include: {
          tenant: {
            select: {
              id: true,
              name: true,
            },
          },
          package: {
            select: {
              id: true,
              name: true,
              code: true,
            },
          },
          voucher: {
            select: {
              id: true,
              code: true,
            },
          },
        },
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.voucherRedemption.findMany({
        where: tenantId ? { tenantId } : undefined,
        include: {
          tenant: {
            select: {
              id: true,
              name: true,
            },
          },
          package: {
            select: {
              id: true,
              name: true,
              code: true,
            },
          },
          voucher: {
            select: {
              id: true,
              code: true,
            },
          },
          hotspot: {
            select: {
              id: true,
              name: true,
            },
          },
        },
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.voucher.groupBy({
        by: ['status'],
        where: tenantId ? { tenantId } : undefined,
        _count: { _all: true },
      }),
    ])

    const summaryByStatus = voucherCounts.reduce<Record<string, number>>((accumulator, current) => {
      accumulator[current.status] = current._count._all
      return accumulator
    }, {})

    return {
      summary: {
        totalBatches: batches.length,
        totalGenerated: Object.values(summaryByStatus).reduce((total, value) => total + value, 0),
        activeUnused: summaryByStatus[VoucherStatus.GENERATED] ?? 0,
        sold: summaryByStatus[VoucherStatus.SOLD] ?? 0,
        redeemed: summaryByStatus[VoucherStatus.REDEEMED] ?? 0,
        totalVoucherSalesUgx: voucherSales.reduce((total, sale) => total + sale.grossAmountUgx, 0),
        totalVoucherFeesUgx: voucherSales.reduce((total, sale) => total + sale.feeAmountUgx, 0),
      },
      batches: batches.map((batch) => {
        const generatedCount = batch.vouchers.filter((voucher) => voucher.status === VoucherStatus.GENERATED).length
        const soldCount = batch.vouchers.filter((voucher) => voucher.status === VoucherStatus.SOLD).length
        const redeemedCount = batch.vouchers.filter((voucher) => voucher.status === VoucherStatus.REDEEMED).length

        return {
          id: batch.id,
          batchNumber: batch.batchNumber,
          prefix: batch.prefix,
          quantity: batch.quantity,
          faceValueUgx: batch.faceValueUgx,
          status: batch.status,
          tenant: batch.tenant,
          package: batch.package,
          generatedCount,
          soldCount,
          redeemedCount,
          remainingCount: generatedCount,
          createdAt: batch.createdAt,
        }
      }),
      recentSales: voucherSales.slice(0, 10),
      recentRedemptions: redemptions.slice(0, 10),
    }
  }

  async createBatch(dto: CreateVoucherBatchDto) {
    const pkg = await this.prisma.package.findUnique({
      where: { id: dto.packageId },
      include: {
        prices: {
          orderBy: { startsAt: 'desc' },
          take: 1,
        },
      },
    })

    if (!pkg || pkg.tenantId !== dto.tenantId) {
      throw new NotFoundException('Package not found for tenant')
    }

    const batchNumber = this.voucherCodeService.generateBatchNumber(dto.prefix)
    const faceValueUgx = dto.faceValueUgx ?? pkg.prices[0]?.amountUgx

    if (!faceValueUgx) {
      throw new BadRequestException('Package has no active price configured')
    }

    return this.prisma.$transaction(async (tx) => {
      const batch = await tx.voucherBatch.create({
        data: {
          tenantId: dto.tenantId,
          packageId: dto.packageId,
          generatedByUserId: dto.generatedByUserId,
          batchNumber,
          prefix: dto.prefix.toUpperCase(),
          quantity: dto.quantity,
          faceValueUgx,
          expiresAt: dto.expiresAt ? new Date(dto.expiresAt) : null,
          status: VoucherBatchStatus.ACTIVE,
          notes: dto.notes,
        },
      })

      await tx.voucher.createMany({
        data: Array.from({ length: dto.quantity }).map((_, index) => ({
          tenantId: dto.tenantId,
          batchId: batch.id,
          packageId: dto.packageId,
          code: this.voucherCodeService.generateVoucherCode(dto.prefix, batchNumber, index + 1),
          serialNumber: this.voucherCodeService.generateSerialNumber(batchNumber, index + 1),
          faceValueUgx,
          expiresAt: dto.expiresAt ? new Date(dto.expiresAt) : null,
        })),
      })

      return tx.voucherBatch.findUnique({
        where: { id: batch.id },
        include: {
          package: {
            select: {
              id: true,
              name: true,
              code: true,
            },
          },
          tenant: {
            select: {
              id: true,
              name: true,
            },
          },
          vouchers: {
            select: {
              id: true,
              code: true,
              serialNumber: true,
              status: true,
            },
          },
        },
      })
    })
  }

  async recordSale(voucherId: string, dto: RecordVoucherSaleDto) {
    const voucher = await this.prisma.voucher.findUnique({
      where: { id: voucherId },
      include: {
        batch: true,
      },
    })

    if (!voucher) {
      throw new NotFoundException('Voucher not found')
    }

    if (voucher.status === VoucherStatus.REDEEMED) {
      throw new BadRequestException('Voucher has already been redeemed')
    }

    if (voucher.status === VoucherStatus.SOLD) {
      throw new BadRequestException('Voucher has already been sold')
    }

    if (dto.externalReference) {
      const existingTransaction = await this.prisma.billingTransaction.findUnique({
        where: { externalReference: dto.externalReference },
      })

      if (existingTransaction) {
        return {
          billingTransaction: existingTransaction,
          voucher,
        }
      }
    }

    return this.prisma.$transaction(async (tx) => {
      const billingTransaction = await this.billingService.recordSaleInTransaction(tx, {
        tenantId: voucher.tenantId,
        packageId: voucher.packageId,
        voucherId: voucher.id,
        channel: BillingChannel.VOUCHER,
        type: BillingTransactionType.VOUCHER_SALE,
        grossAmountUgx: voucher.faceValueUgx,
        description: 'Voucher sale posted to tenant wallet',
        customerReference: dto.customerReference,
        externalReference: dto.externalReference,
        metadata: {
          batchNumber: voucher.batch.batchNumber,
          voucherCode: voucher.code,
        } as Prisma.InputJsonValue,
      })

      const updatedVoucher = await tx.voucher.update({
        where: { id: voucher.id },
        data: {
          status: VoucherStatus.SOLD,
          soldAt: new Date(),
          soldToReference: dto.customerReference,
        },
      })

      await this.refreshBatchStatus(voucher.batchId, tx)

      return {
        billingTransaction,
        voucher: updatedVoucher,
      }
    })
  }

  async redeemVoucher(dto: RedeemVoucherDto) {
    const voucher = await this.prisma.voucher.findUnique({
      where: { code: dto.code },
      include: {
        redemption: {
          include: {
            hotspot: {
              select: {
                id: true,
                name: true,
              },
            },
            package: {
              select: {
                id: true,
                name: true,
                code: true,
              },
            },
            voucher: {
              select: {
                id: true,
                code: true,
              },
            },
            activation: {
              include: {
                package: {
                  select: {
                    id: true,
                    name: true,
                    code: true,
                  },
                },
                hotspot: {
                  select: {
                    id: true,
                    name: true,
                  },
                },
              },
            },
          },
        },
      },
    })

    if (!voucher) {
      throw new NotFoundException('Voucher not found')
    }

    if (voucher.status === VoucherStatus.REDEEMED && voucher.redemption) {
      return {
        voucher,
        redemption: voucher.redemption,
        activation: voucher.redemption.activation,
      }
    }

    if (voucher.status !== VoucherStatus.SOLD) {
      throw new BadRequestException('Voucher must be sold before redemption')
    }

    const redemptionReference = `VOUCHER-REDEEM-${voucher.id}`
    const accessPhoneNumber =
      dto.accessPhoneNumber ?? this.normalizePhoneNumber(dto.customerReference)

    return this.prisma.$transaction(async (tx) => {
      const updatedVoucher = await tx.voucher.update({
        where: { id: voucher.id },
        data: {
          status: VoucherStatus.REDEEMED,
          redeemedAt: new Date(),
          customerReference: dto.customerReference,
        },
      })

      const redemption = await tx.voucherRedemption.create({
        data: {
          tenantId: voucher.tenantId,
          voucherId: voucher.id,
          packageId: voucher.packageId,
          redeemedByUserId: dto.redeemedByUserId,
          hotspotId: dto.hotspotId,
          customerReference: dto.customerReference,
          sessionReference: dto.sessionReference,
        },
        include: {
          hotspot: {
            select: {
              id: true,
              name: true,
            },
          },
          package: {
            select: {
              id: true,
              name: true,
              code: true,
            },
          },
          voucher: {
            select: {
              id: true,
              code: true,
            },
          },
        },
      })

      await tx.billingTransaction.upsert({
        where: { externalReference: redemptionReference },
        update: {
          customerReference: dto.customerReference,
          metadata: {
            hotspotId: dto.hotspotId,
            sessionReference: dto.sessionReference,
          },
        },
        create: {
          tenantId: voucher.tenantId,
          packageId: voucher.packageId,
          voucherId: voucher.id,
          channel: BillingChannel.VOUCHER,
          type: BillingTransactionType.VOUCHER_REDEMPTION,
          status: BillingTransactionStatus.COMPLETED,
          grossAmountUgx: 0,
          feeAmountUgx: 0,
          netAmountUgx: 0,
          customerReference: dto.customerReference,
          externalReference: redemptionReference,
          metadata: {
            hotspotId: dto.hotspotId,
            sessionReference: dto.sessionReference,
          },
        },
      })

      const packageRecord = await tx.package.findUnique({
        where: { id: voucher.packageId },
      })

      if (!packageRecord) {
        throw new NotFoundException('Package not found for voucher redemption')
      }

      const activation = await this.packageActivationService.activateInTransaction(tx, {
        tenantId: voucher.tenantId,
        packageId: voucher.packageId,
        voucherRedemptionId: redemption.id,
        hotspotId: dto.hotspotId,
        source: PackageActivationSource.VOUCHER,
        customerReference: dto.customerReference,
        accessPhoneNumber,
        durationMinutes: packageRecord.durationMinutes,
        dataLimitMb: packageRecord.dataLimitMb,
        deviceLimit: packageRecord.deviceLimit,
        downloadSpeedKbps: packageRecord.downloadSpeedKbps,
        uploadSpeedKbps: packageRecord.uploadSpeedKbps,
        metadata: {
          voucherCode: voucher.code,
          sessionReference: dto.sessionReference,
        } as Prisma.InputJsonValue,
      })

      await this.refreshBatchStatus(voucher.batchId, tx)

      return {
        voucher: updatedVoucher,
        redemption,
        activation,
      }
    })
  }

  private normalizePhoneNumber(value?: string | null) {
    if (!value) {
      return undefined
    }

    const digits = value.replace(/\D/g, '')

    if (/^256\d{9}$/.test(digits)) {
      return digits
    }

    if (/^0\d{9}$/.test(digits)) {
      return `256${digits.slice(1)}`
    }

    if (/^7\d{8}$/.test(digits)) {
      return `256${digits}`
    }

    return undefined
  }

  private async refreshBatchStatus(batchId: string, tx?: Prisma.TransactionClient) {
    const executor = tx ?? this.prisma
    const remainingCount = await executor.voucher.count({
      where: {
        batchId,
        status: VoucherStatus.GENERATED,
      },
    })

    await executor.voucherBatch.update({
      where: { id: batchId },
      data: {
        status: remainingCount === 0 ? VoucherBatchStatus.EXHAUSTED : VoucherBatchStatus.ACTIVE,
      },
    })
  }
}
