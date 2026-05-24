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
import { CreateVoucherTemplateDto } from './dto/create-voucher-template.dto'
import { RecordVoucherSaleDto } from './dto/record-voucher-sale.dto'
import { RedeemVoucherDto } from './dto/redeem-voucher.dto'
import { UpdateVoucherTemplateDto } from './dto/update-voucher-template.dto'
import { VoucherCodeService } from './voucher-code.service'
import PDFDocument = require('pdfkit')
import * as QRCode from 'qrcode'

type VoucherPdfTemplate = 'emerald' | 'midnight' | 'royal' | 'sunrise' | 'mono'

const voucherPdfTemplates: Record<
  VoucherPdfTemplate,
  {
    label: string
    accent: string
    accentDark: string
    background: string
    muted: string
    ink: string
  }
> = {
  emerald: {
    label: 'Emerald Premium',
    accent: '#10B981',
    accentDark: '#047857',
    background: '#FFFFFB',
    muted: '#64748B',
    ink: '#0F172A',
  },
  midnight: {
    label: 'Midnight Luxe',
    accent: '#38BDF8',
    accentDark: '#075985',
    background: '#FFFFFB',
    muted: '#475569',
    ink: '#020617',
  },
  royal: {
    label: 'Royal Blue',
    accent: '#2563EB',
    accentDark: '#1E3A8A',
    background: '#FFFFFB',
    muted: '#64748B',
    ink: '#0F172A',
  },
  sunrise: {
    label: 'Sunrise Gold',
    accent: '#F59E0B',
    accentDark: '#92400E',
    background: '#FFFFFB',
    muted: '#78716C',
    ink: '#1C1917',
  },
  mono: {
    label: 'Clean Mono',
    accent: '#111827',
    accentDark: '#030712',
    background: '#FFFFFB',
    muted: '#64748B',
    ink: '#0F172A',
  },
}

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
          vouchers: {
            select: {
              id: true,
              code: true,
              status: true,
            },
            orderBy: { createdAt: 'asc' },
          },
        },
        orderBy: { createdAt: 'desc' },
        take: 200,
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
        take: 200,
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
        take: 200,
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
          previewVouchers: batch.vouchers.map((voucher) => ({
            id: voucher.id,
            code: voucher.code,
            status: voucher.status,
          })),
          createdAt: batch.createdAt,
        }
      }),
      recentSales: voucherSales.slice(0, 10),
      recentRedemptions: redemptions.slice(0, 10),
    }
  }

  async getTemplates(tenantId?: string) {
    const items = await this.prisma.voucherTemplate.findMany({
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
        _count: {
          select: {
            batches: true,
          },
        },
      },
      orderBy: [{ isDefault: 'desc' }, { createdAt: 'desc' }],
    })

    return {
      summary: {
        totalTemplates: items.length,
        activeTemplates: items.filter((template) => template.isActive).length,
        defaultTemplates: items.filter((template) => template.isDefault).length,
      },
      items,
    }
  }

  async createTemplate(dto: CreateVoucherTemplateDto) {
    const [tenant, pkg] = await Promise.all([
      this.prisma.tenant.findUnique({ where: { id: dto.tenantId } }),
      dto.packageId ? this.prisma.package.findUnique({ where: { id: dto.packageId } }) : Promise.resolve(null),
    ])

    if (!tenant) {
      throw new NotFoundException('Tenant not found')
    }

    if (pkg && pkg.tenantId !== dto.tenantId) {
      throw new BadRequestException('Package does not belong to the tenant')
    }

    if (dto.isDefault) {
      await this.prisma.voucherTemplate.updateMany({
        where: {
          tenantId: dto.tenantId,
          isDefault: true,
        },
        data: {
          isDefault: false,
        },
      })
    }

    return this.prisma.voucherTemplate.create({
      data: {
        tenantId: dto.tenantId,
        packageId: dto.packageId,
        name: dto.name.trim(),
        code: dto.code.trim().toUpperCase(),
        prefix: dto.prefix.trim().toUpperCase(),
        defaultQuantity: dto.defaultQuantity ?? 100,
        faceValueUgx: dto.faceValueUgx,
        expiresAfterDays: dto.expiresAfterDays,
        isDefault: dto.isDefault ?? false,
        isActive: dto.isActive ?? true,
        notes: dto.notes?.trim(),
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
      },
    })
  }

  async updateTemplate(templateId: string, dto: UpdateVoucherTemplateDto, tenantId?: string) {
    const existing = await this.prisma.voucherTemplate.findUnique({
      where: { id: templateId },
    })

    if (!existing) {
      throw new NotFoundException('Voucher template not found')
    }

    if (tenantId && existing.tenantId !== tenantId) {
      throw new NotFoundException('Voucher template not found')
    }

    if (dto.packageId) {
      const pkg = await this.prisma.package.findUnique({ where: { id: dto.packageId } })
      if (!pkg || pkg.tenantId !== existing.tenantId) {
        throw new BadRequestException('Package does not belong to the template tenant')
      }
    }

    if (dto.isDefault) {
      await this.prisma.voucherTemplate.updateMany({
        where: {
          tenantId: existing.tenantId,
          isDefault: true,
          id: {
            not: templateId,
          },
        },
        data: {
          isDefault: false,
        },
      })
    }

    return this.prisma.voucherTemplate.update({
      where: { id: templateId },
      data: {
        packageId: dto.packageId,
        name: dto.name?.trim(),
        code: dto.code?.trim().toUpperCase(),
        prefix: dto.prefix?.trim().toUpperCase(),
        defaultQuantity: dto.defaultQuantity,
        faceValueUgx: dto.faceValueUgx,
        expiresAfterDays: dto.expiresAfterDays,
        isDefault: dto.isDefault,
        isActive: dto.isActive,
        notes: dto.notes?.trim(),
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
      },
    })
  }

  async createBatch(dto: CreateVoucherBatchDto) {
    const [template, pkg] = await Promise.all([
      dto.templateId
        ? this.prisma.voucherTemplate.findUnique({
            where: { id: dto.templateId },
          })
        : Promise.resolve(null),
      this.prisma.package.findUnique({
        where: { id: dto.packageId },
        include: {
          prices: {
            orderBy: { startsAt: 'desc' },
            take: 1,
          },
        },
      }),
    ])

    if (template && template.tenantId !== dto.tenantId) {
      throw new BadRequestException('Voucher template does not belong to the tenant')
    }

    if (!pkg || pkg.tenantId !== dto.tenantId) {
      throw new NotFoundException('Package not found for tenant')
    }

    if (template?.packageId && template.packageId !== dto.packageId) {
      throw new BadRequestException('Template package does not match the selected package')
    }

    const resolvedPrefix = (dto.prefix ?? template?.prefix)?.toUpperCase()
    const resolvedQuantity = dto.quantity ?? template?.defaultQuantity
    const batchNumber = this.voucherCodeService.generateBatchNumber(resolvedPrefix ?? '')
    const faceValueUgx = dto.faceValueUgx ?? template?.faceValueUgx ?? pkg.prices[0]?.amountUgx
    const resolvedExpiresAt = dto.expiresAt
      ? new Date(dto.expiresAt)
      : template?.expiresAfterDays
        ? new Date(Date.now() + template.expiresAfterDays * 24 * 60 * 60 * 1000)
        : null

    if (!resolvedPrefix) {
      throw new BadRequestException('Prefix is required (direct input or template)')
    }

    if (!resolvedQuantity) {
      throw new BadRequestException('Quantity is required (direct input or template)')
    }

    if (!faceValueUgx) {
      throw new BadRequestException('Package has no active price configured')
    }

    return this.prisma.$transaction(async (tx) => {
      const batch = await tx.voucherBatch.create({
        data: {
          tenantId: dto.tenantId,
          packageId: dto.packageId,
          templateId: template?.id,
          generatedByUserId: dto.generatedByUserId,
          batchNumber,
          prefix: resolvedPrefix,
          quantity: resolvedQuantity,
          faceValueUgx,
          expiresAt: resolvedExpiresAt,
          status: VoucherBatchStatus.ACTIVE,
          notes: dto.notes,
        },
      })

      await tx.voucher.createMany({
        data: Array.from({ length: resolvedQuantity }).map((_, index) => ({
          tenantId: dto.tenantId,
          batchId: batch.id,
          packageId: dto.packageId,
          code: this.voucherCodeService.generateVoucherCode(resolvedPrefix, batchNumber, index + 1),
          serialNumber: this.voucherCodeService.generateSerialNumber(batchNumber, index + 1),
          faceValueUgx,
          expiresAt: resolvedExpiresAt,
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

  async recordSale(voucherId: string, dto: RecordVoucherSaleDto, tenantId?: string) {
    const voucher = await this.prisma.voucher.findUnique({
      where: { id: voucherId },
      include: {
        batch: true,
      },
    })

    if (!voucher) {
      throw new NotFoundException('Voucher not found')
    }

    if (tenantId && voucher.tenantId !== tenantId) {
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
        agentId: dto.agentId,
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

  async redeemVoucher(dto: RedeemVoucherDto, tenantId?: string) {
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

    if (tenantId && voucher.tenantId !== tenantId) {
      throw new NotFoundException('Voucher not found')
    }

    const normalizedMac = this.normalizeMac(dto.macAddress)

    if (voucher.status === VoucherStatus.REDEEMED && voucher.redemption) {
      const redeemedMac = this.normalizeMac(voucher.redemption.boundMacAddress)
      const observedMac = normalizedMac
      if (redeemedMac && observedMac && redeemedMac !== observedMac) {
        const activation = voucher.redemption.activation
        if (activation) {
          await this.prisma.suspiciousAccessAttempt.create({
            data: {
              tenantId: voucher.tenantId,
              activationId: activation.id,
              type: 'SECOND_DEVICE',
              username: voucher.code,
              expectedMacAddress: redeemedMac,
              observedMacAddress: observedMac,
              routerId: dto.routerId,
              ipAddress: dto.clientIp,
              userAgent: dto.userAgent,
              message: 'Redeemed voucher attempted from a second MAC address',
            },
          })
        }
        throw new BadRequestException('This voucher/package is already active on another device.')
      }

      return {
        voucher,
        redemption: voucher.redemption,
        activation: voucher.redemption.activation,
      }
    }

    const settings = await this.prisma.tenantSetting.upsert({
      where: { tenantId: voucher.tenantId },
      update: {},
      create: { tenantId: voucher.tenantId },
    })

    const redeemableGeneratedStates: VoucherStatus[] = [VoucherStatus.GENERATED, VoucherStatus.PRINTED];
    if (
      voucher.status !== VoucherStatus.SOLD &&
      !(settings.redeemableWhenGenerated && redeemableGeneratedStates.includes(voucher.status))
    ) {
      throw new BadRequestException('Voucher is not redeemable in its current state')
    }

    if (voucher.expiresAt && voucher.expiresAt <= new Date()) {
      await this.prisma.voucher.update({
        where: { id: voucher.id },
        data: { status: VoucherStatus.EXPIRED },
      })
      throw new BadRequestException('Voucher has expired')
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
          boundMacAddress: normalizedMac,
          firstSeenIp: dto.clientIp,
          firstSeenAt: normalizedMac ? new Date() : undefined,
          routerId: dto.routerId,
          hotspotServerName: dto.hotspotServerName,
          userAgent: dto.userAgent,
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
        radiusUsername: voucher.code,
        radiusPassword: voucher.code,
        boundMacAddress: normalizedMac,
        firstSeenIp: dto.clientIp,
        routerId: dto.routerId,
        hotspotServerName: dto.hotspotServerName,
        metadata: {
          voucherCode: voucher.code,
          sessionReference: dto.sessionReference,
          macAddress: normalizedMac,
          clientIp: dto.clientIp,
          routerId: dto.routerId,
          hotspotServerName: dto.hotspotServerName,
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

  async renderBatchPdf(batchId: string, tenantId?: string, actorUserId?: string, templateId?: string) {
    const batch = await this.prisma.voucherBatch.findUnique({
      where: { id: batchId },
      include: {
        tenant: true,
        package: { include: { prices: { orderBy: { startsAt: 'desc' }, take: 1 } } },
        vouchers: { orderBy: { serialNumber: 'asc' } },
      },
    })

    if (!batch || (tenantId && batch.tenantId !== tenantId)) {
      throw new NotFoundException('Voucher batch not found')
    }

    const templateKey = this.resolveVoucherPdfTemplate(templateId)
    const template = voucherPdfTemplates[templateKey]
    const doc = new PDFDocument({ size: 'A4', margin: 18, bufferPages: true })
    const chunks: Buffer[] = []
    doc.on('data', (chunk) => chunks.push(Buffer.from(chunk)))
    const done = new Promise<Buffer>((resolve) => {
      doc.on('end', () => resolve(Buffer.concat(chunks)))
    })

    const pageMargin = 18
    const cardGap = 8
    const cardWidth = (doc.page.width - pageMargin * 2 - cardGap * 2) / 3
    const cardHeight = 92
    let x = pageMargin
    let y = pageMargin

    for (const voucher of batch.vouchers) {
      if (y + cardHeight > doc.page.height - pageMargin) {
        doc.addPage()
        x = pageMargin
        y = pageMargin
      }

      const qrPng = await this.generateVoucherQrPng(voucher.code)

      this.drawVoucherCard(doc, {
        x,
        y,
        width: cardWidth,
        height: cardHeight,
        template,
        tenantName: batch.tenant.name,
        packageName: batch.package.name,
        durationMinutes: batch.package.durationMinutes,
        amountUgx: batch.faceValueUgx,
        voucherCode: voucher.code,
        support: this.formatVoucherSupport(batch.tenant.supportPhone, batch.tenant.supportEmail),
        portalHost: this.getVoucherPortalHost(),
        qrPng,
      })

      x += cardWidth + cardGap
      if (x + cardWidth > doc.page.width - pageMargin) {
        x = pageMargin
        y += cardHeight + cardGap
      }
    }

    const pageRange = doc.bufferedPageRange()
    for (let pageIndex = 0; pageIndex < pageRange.count; pageIndex += 1) {
      doc.switchToPage(pageIndex)
      doc.fontSize(6).fillColor('#64748B')
      doc.text(
        `AROFi vouchers . ${template.label} . Powered by AROSOFT Innovations Ltd . https://arosoft.io`,
        pageMargin,
        doc.page.height - 12,
        {
          width: doc.page.width - pageMargin * 2,
          align: 'center',
          link: 'https://arosoft.io',
        },
      )
    }

    doc.end()
    const buffer = await done

    try {
      await this.prisma.$transaction(async (tx) => {
        await tx.voucherBatch.update({
          where: { id: batch.id },
          data: {
            lastPrintedAt: new Date(),
            printCount: { increment: 1 },
          },
        })
        await tx.voucher.updateMany({
          where: {
            batchId: batch.id,
            status: { in: [VoucherStatus.GENERATED, VoucherStatus.PRINTED] },
          },
          data: {
            status: VoucherStatus.PRINTED,
            lastPrintedAt: new Date(),
            printCount: { increment: 1 },
          },
        })
        await tx.voucherPrintLog.create({
          data: {
            tenantId: batch.tenantId,
            batchId: batch.id,
            format: 'A4_PDF',
            quantity: batch.vouchers.length,
            actorUserId,
            metadata: { batchNumber: batch.batchNumber, template: templateKey },
          },
        })
      })
    } catch (error) {
      console.warn('Voucher PDF generated but print tracking failed', error)
    }

    return {
      filename: `${batch.batchNumber}-${templateKey}-vouchers.pdf`,
      contentType: 'application/pdf',
      buffer,
    }
  }

  private resolveVoucherPdfTemplate(templateId?: string): VoucherPdfTemplate {
    const normalized = (templateId ?? '').toLowerCase()
    return normalized in voucherPdfTemplates ? (normalized as VoucherPdfTemplate) : 'emerald'
  }

  private drawVoucherCard(
    doc: PDFKit.PDFDocument,
    input: {
      x: number
      y: number
      width: number
      height: number
      template: (typeof voucherPdfTemplates)[VoucherPdfTemplate]
      tenantName: string
      packageName: string
      durationMinutes: number
      amountUgx: number
      voucherCode: string
      support: string
      portalHost: string
      qrPng: Buffer
    },
  ) {
    const { x, y, width, height, template } = input
    const railWidth = 12
    const innerX = x + railWidth + 6
    const qrSize = 46
    const qrX = x + width - qrSize - 8
    doc.save()
    doc.roundedRect(x, y, width, height, 5).fillAndStroke(template.background, '#D7DEE8')

    doc.save()
    doc.roundedRect(x, y, railWidth, height, 5).fill(template.accent)
    for (let dotY = y + 16; dotY < y + height - 8; dotY += 18) {
      doc.circle(x + railWidth / 2, dotY, 1.25).fill('#FFFFFF')
    }
    doc.restore()

    doc.fillColor(template.accentDark).font('Helvetica-Bold').fontSize(5.2)
      .text(input.tenantName.toUpperCase(), innerX, y + 7, { width: width - railWidth - 12, align: 'center', ellipsis: true })

    const codeY = y + 28
    this.drawVoucherUserIcon(doc, innerX + 1, codeY - 3)
    doc.fillColor(template.ink).font('Helvetica-Bold').fontSize(12)
      .text(input.voucherCode, innerX + 20, codeY, { width: qrX - innerX - 24, ellipsis: true })

    doc.moveTo(innerX, y + 44).lineTo(x + width - 5, y + 44).strokeColor(template.accent).lineWidth(1.4).stroke()

    doc.image(input.qrPng, qrX, y + 43, { width: qrSize, height: qrSize })

    const detailY = y + 49
    const detailWidth = (qrX - innerX - 10) / 2
    this.drawVoucherDetail(doc, 'PACKAGE', input.packageName, innerX, detailY, detailWidth, template)
    this.drawVoucherDetail(doc, 'PRICE', `UGX ${input.amountUgx.toLocaleString('en-UG')}`, innerX + detailWidth + 8, detailY, detailWidth, template)
    this.drawVoucherDetail(doc, 'DURATION', this.formatVoucherDuration(input.durationMinutes), innerX, detailY + 18, detailWidth, template)
    this.drawVoucherDetail(doc, 'HELP', input.portalHost, innerX + detailWidth + 8, detailY + 18, detailWidth, template)

    doc.fillColor(template.ink).font('Helvetica').fontSize(4.4)
      .text(`Help: ${input.support} | ${input.portalHost}`, innerX, y + height - 8, {
        width: width - railWidth - 16,
        align: 'left',
        ellipsis: true,
      })
    doc.restore()
  }

  private drawVoucherDetail(
    doc: PDFKit.PDFDocument,
    label: string,
    value: string,
    x: number,
    y: number,
    width: number,
    template: (typeof voucherPdfTemplates)[VoucherPdfTemplate],
  ) {
    doc.fillColor(template.muted).font('Helvetica-Bold').fontSize(4).text(label, x, y, { width })
    doc.fillColor(template.ink).font('Helvetica-Bold').fontSize(5.4).text(value, x, y + 5, {
      width,
      height: 12,
      ellipsis: true,
    })
  }

  private drawVoucherUserIcon(doc: PDFKit.PDFDocument, x: number, y: number) {
    doc.save()
    doc.fillColor('#000000')
    doc.circle(x + 7, y + 5, 4.2).fill()
    doc.roundedRect(x + 1, y + 10, 12, 8, 4).fill()
    doc.circle(x + 14, y + 15, 4).fill()
    doc.strokeColor('#FFFFFF').lineWidth(0.8)
    doc.moveTo(x + 11.5, y + 15).lineTo(x + 16.5, y + 15).stroke()
    doc.moveTo(x + 14, y + 12.5).lineTo(x + 14, y + 17.5).stroke()
    doc.restore()
  }

  private async generateVoucherQrPng(voucherCode: string) {
    const dataUrl = await QRCode.toDataURL(this.buildVoucherPortalUrl(voucherCode), {
      errorCorrectionLevel: 'M',
      margin: 1,
      width: 112,
      color: {
        dark: '#0F172A',
        light: '#FFFFFF',
      },
    })
    return Buffer.from(dataUrl.split(',')[1] ?? '', 'base64')
  }

  private buildVoucherPortalUrl(voucherCode: string) {
    const baseUrl = this.getVoucherQrBaseUrl()
    const separator = baseUrl.includes('?') ? '&' : '?'
    return `${baseUrl}${separator}voucher=${encodeURIComponent(voucherCode)}`
  }

  private getVoucherPortalBaseUrl() {
    const host = process.env.PORTAL_PUBLIC_HOST ?? process.env.API_PUBLIC_HOST ?? 'arofi.arosoft.io'
    const normalizedHost = host.startsWith('http://') || host.startsWith('https://') ? host : `https://${host}`
    return normalizedHost.replace(/\/$/, '')
  }

  private getVoucherPortalHost() {
    try {
      return new URL(this.getVoucherPortalBaseUrl()).host
    } catch {
      return this.getVoucherPortalBaseUrl().replace(/^https?:\/\//, '')
    }
  }

  private getVoucherQrBaseUrl() {
    const configuredBase = process.env.VOUCHER_QR_BASE_URL ?? process.env.HOTSPOT_LOGIN_BASE_URL ?? 'http://wifi.login/portal'
    const withProtocol = configuredBase.startsWith('http://') || configuredBase.startsWith('https://')
      ? configuredBase
      : `http://${configuredBase}`
    const normalized = withProtocol.replace(/\/$/, '')
    return normalized.endsWith('/portal') ? normalized : `${normalized}/portal`
  }

  private formatVoucherSupport(phone?: string | null, email?: string | null) {
    return [phone, email].filter((value): value is string => Boolean(value?.trim())).join(' - ') || 'Contact venue staff'
  }

  private formatVoucherDuration(minutes: number) {
    if (minutes >= 1440 && minutes % 1440 === 0) {
      const days = minutes / 1440
      return `${days} ${days === 1 ? 'day' : 'days'}`
    }
    if (minutes >= 60 && minutes % 60 === 0) {
      const hours = minutes / 60
      return `${hours} ${hours === 1 ? 'hour' : 'hours'}`
    }
    return `${minutes} min`
  }

  async exportBatchCsv(batchId: string, tenantId?: string) {
    const batch = await this.prisma.voucherBatch.findUnique({
      where: { id: batchId },
      include: {
        tenant: true,
        package: true,
        vouchers: { orderBy: { serialNumber: 'asc' } },
      },
    })

    if (!batch || (tenantId && batch.tenantId !== tenantId)) {
      throw new NotFoundException('Voucher batch not found')
    }

    const rows = [
      ['serialNumber', 'code', 'status', 'package', 'durationMinutes', 'priceUgx', 'expiresAt'].join(','),
      ...batch.vouchers.map((voucher) =>
        [
          voucher.serialNumber,
          voucher.code,
          voucher.status,
          batch.package.name,
          batch.package.durationMinutes,
          voucher.faceValueUgx,
          voucher.expiresAt?.toISOString() ?? '',
        ].map((value) => `"${String(value).replace(/"/g, '""')}"`).join(','),
      ),
    ]

    await this.prisma.voucherBatch.update({
      where: { id: batch.id },
      data: { exportedAt: new Date() },
    })
    await this.prisma.voucher.updateMany({
      where: { batchId: batch.id },
      data: { exportedAt: new Date() },
    })

    return {
      filename: `${batch.batchNumber}-vouchers.csv`,
      contentType: 'text/csv',
      buffer: Buffer.from(rows.join('\n'), 'utf8'),
    }
  }

  private normalizeMac(value?: string | null) {
    if (!value) {
      return undefined
    }

    const compact = value.replace(/[^a-fA-F0-9]/g, '').toUpperCase()
    if (!/^[A-F0-9]{12}$/.test(compact)) {
      return undefined
    }

    return compact.match(/.{1,2}/g)?.join(':')
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
