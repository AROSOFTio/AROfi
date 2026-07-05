import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common'
import {
  BillingChannel,
  BillingTransactionStatus,
  BillingTransactionType,
  PackageActivationSource,
  PackageActivationStatus,
  Prisma,
  VoucherBatchStatus,
  VoucherStatus,
  WalletOwnerType,
} from '@prisma/client'
import { PrismaService } from '../../prisma.service'
import { BillingService } from '../billing/billing.service'
import { FeeEngineService } from '../billing/fee-engine.service'
import { MailService } from '../mail/mail.service'
import { PackageActivationService } from '../payments/package-activation.service'
import { WhatsAppService } from '../whatsapp/whatsapp.service'
import { CreateVoucherBatchDto } from './dto/create-voucher-batch.dto'
import { CreateVoucherTemplateDto } from './dto/create-voucher-template.dto'
import { RecordVoucherSaleDto } from './dto/record-voucher-sale.dto'
import { RedeemVoucherDto } from './dto/redeem-voucher.dto'
import { UpdateVoucherTemplateDto } from './dto/update-voucher-template.dto'
import { VoucherCodeFormat, VoucherCodeService } from './voucher-code.service'
import PDFDocument = require('pdfkit')
import * as QRCode from 'qrcode'

const VOUCHER_AD_LINE = 'Powered by AROFi · Professional Hotspot Management Platform'

type VoucherPdfTemplate = 'signal' | 'wave' | 'receipt' | 'agent' | 'thermal'

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
  signal: {
    label: 'Signal Card',
    accent: '#10B981',
    accentDark: '#047857',
    background: '#FFFFFB',
    muted: '#64748B',
    ink: '#0F172A',
  },
  wave: {
    label: 'Wave Ticket',
    accent: '#38BDF8',
    accentDark: '#075985',
    background: '#FFFFFB',
    muted: '#475569',
    ink: '#020617',
  },
  receipt: {
    label: 'Clean Receipt',
    accent: '#2563EB',
    accentDark: '#1E3A8A',
    background: '#FFFFFB',
    muted: '#64748B',
    ink: '#0F172A',
  },
  agent: {
    label: 'Agent Strip',
    accent: '#F59E0B',
    accentDark: '#92400E',
    background: '#FFFFFB',
    muted: '#78716C',
    ink: '#1C1917',
  },
  thermal: {
    label: 'Mini Thermal',
    accent: '#111827',
    accentDark: '#030712',
    background: '#FFFFFB',
    muted: '#64748B',
    ink: '#0F172A',
  },
}

@Injectable()
export class VouchersService {
  private readonly logger = new Logger(VouchersService.name)

  constructor(
    private readonly prisma: PrismaService,
    private readonly billingService: BillingService,
    private readonly packageActivationService: PackageActivationService,
    private readonly voucherCodeService: VoucherCodeService,
    private readonly feeEngineService: FeeEngineService,
    private readonly mailService: MailService,
    private readonly whatsAppService: WhatsAppService,
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
          type: {
            in: [BillingTransactionType.VOUCHER_SALE, BillingTransactionType.VOUCHER_REDEMPTION],
          },
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
          networkSessions: {
            where: { status: 'ACTIVE' },
            take: 1,
            select: {
              id: true,
              status: true,
              ipAddress: true,
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
        prefix: this.resolveTemplatePrefix(dto.prefix),
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
        prefix: dto.prefix === undefined ? undefined : this.resolveTemplatePrefix(dto.prefix),
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

    const resolvedCodeFormat = this.resolveVoucherCodeFormat(dto.codeFormat)
    const resolvedCodeLength = dto.codeLength ?? 10
    const codeModeLabel = this.getCodeModeLabel(resolvedCodeFormat)
    const resolvedQuantity = dto.quantity ?? template?.defaultQuantity
    const batchNumber = this.voucherCodeService.generateBatchNumber(codeModeLabel)
    const faceValueUgx = dto.faceValueUgx ?? template?.faceValueUgx ?? pkg.prices[0]?.amountUgx
    const resolvedExpiresAt = dto.expiresAt
      ? new Date(dto.expiresAt)
      : template?.expiresAfterDays
        ? new Date(Date.now() + template.expiresAfterDays * 24 * 60 * 60 * 1000)
        : null

    if (!resolvedQuantity) {
      throw new BadRequestException('Quantity is required (direct input or template)')
    }

    if (!faceValueUgx) {
      throw new BadRequestException('Package has no active price configured')
    }

    return this.prisma.$transaction(async (tx) => {
      const voucherCodes = await this.generateUniqueVoucherCodes(tx, resolvedQuantity, resolvedCodeFormat, resolvedCodeLength)
      const batch = await tx.voucherBatch.create({
        data: {
          tenantId: dto.tenantId,
          packageId: dto.packageId,
          templateId: template?.id,
          generatedByUserId: dto.generatedByUserId,
          batchNumber,
          prefix: codeModeLabel,
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
          code: voucherCodes[index],
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
    const codeVariants = this.getVoucherCodeLookupVariants(dto.code)
    if (!codeVariants.length) {
      throw new NotFoundException('Voucher not found')
    }

    const voucher = await this.prisma.voucher.findFirst({
      where: {
        OR: codeVariants.map((code) => ({ code })),
      },
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

      // Same device re-submitting a redeemed voucher is a legitimate RECONNECT
      // — but ONLY while the package it activated is still live. If that
      // activation has already expired (or was revoked/quota-exhausted),
      // returning it as "success" makes the portal say "connecting…" and then
      // hand the customer a dead session — the exact "connected but no
      // internet" confusion. Reject with a plain message so they buy again.
      const priorActivation = voucher.redemption.activation
      const activationDead =
        !priorActivation ||
        priorActivation.status !== PackageActivationStatus.ACTIVE ||
        (priorActivation.endsAt != null && priorActivation.endsAt <= new Date())
      if (activationDead) {
        throw new BadRequestException(
          'This voucher has already been used and its time has expired. Please buy a new package or voucher.',
        )
      }

      return {
        voucher,
        redemption: voucher.redemption,
        activation: priorActivation,
      }
    }

    const settings = await this.prisma.tenantSetting.upsert({
      where: { tenantId: voucher.tenantId },
      update: {},
      create: { tenantId: voucher.tenantId, redeemableWhenGenerated: true },
    })

    const redeemableGeneratedStates: VoucherStatus[] = [VoucherStatus.GENERATED, VoucherStatus.PRINTED]
    // Treat null/undefined as true — new tenants and migrated rows default to allowing GENERATED vouchers
    const allowGenerated = settings.redeemableWhenGenerated !== false
    if (
      voucher.status !== VoucherStatus.SOLD &&
      !(allowGenerated && redeemableGeneratedStates.includes(voucher.status))
    ) {
      throw new BadRequestException(
        voucher.status === VoucherStatus.REDEEMED
          ? 'This voucher has already been used.'
          : voucher.status === VoucherStatus.EXPIRED
            ? 'This voucher has expired.'
            : 'This voucher code is not valid for redemption.',
      )
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

    let receiptInfo: {
      tenantId: string
      packageName: string
      grossAmountUgx: number
      feeAmountUgx: number
      netAmountUgx: number
      customerReference?: string | null
      reference: string
    } | null = null

    let customerWhatsAppInfo: {
      phoneNumber: string
      packageName: string
      durationMinutes: number
      companionVoucherCodes: string[]
    } | null = null

    const result = await this.prisma.$transaction(async (tx) => {
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

      const wasSold = voucher.status === VoucherStatus.SOLD

      const breakdown = await this.feeEngineService.calculateBreakdown(
        BillingChannel.VOUCHER,
        voucher.faceValueUgx,
        voucher.tenantId,
        tx,
      )

      const grossAmountUgx = wasSold ? 0 : breakdown.grossAmountUgx
      const feeAmountUgx = wasSold ? 0 : breakdown.feeAmountUgx
      const netAmountUgx = wasSold ? 0 : breakdown.netAmountUgx

      await tx.billingTransaction.upsert({
        where: { externalReference: redemptionReference },
        update: {
          customerReference: voucher.code,
          grossAmountUgx,
          feeAmountUgx,
          netAmountUgx,
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
          grossAmountUgx,
          feeAmountUgx,
          netAmountUgx,
          customerReference: voucher.code,
          externalReference: redemptionReference,
          metadata: {
            hotspotId: dto.hotspotId,
            sessionReference: dto.sessionReference,
          },
        },
      })

      if (!wasSold) {
        const wallet = await tx.wallet.findFirst({
          where: {
            tenantId: voucher.tenantId,
            ownerType: WalletOwnerType.TENANT,
            ownerReference: voucher.tenantId,
          },
        })
        if (wallet) {
          await tx.wallet.update({
            where: { id: wallet.id },
            data: {
              balanceUgx: {
                decrement: feeAmountUgx,
              },
              earnedBalanceUgx: {
                decrement: feeAmountUgx,
              },
            },
          })

          if (feeAmountUgx > 0) {
            await tx.platformSetting.update({
              where: { id: 'global' },
              data: {
                platformWalletBalanceUgx: {
                  increment: feeAmountUgx,
                },
              },
            })
          }
        }
      }

      const packageRecord = await tx.package.findUnique({
        where: { id: voucher.packageId },
      })

      if (!packageRecord) {
        throw new NotFoundException('Package not found for voucher redemption')
      }

      if (!wasSold) {
        receiptInfo = {
          tenantId: voucher.tenantId,
          packageName: packageRecord.name,
          grossAmountUgx,
          feeAmountUgx,
          netAmountUgx,
          customerReference: dto.customerReference,
          reference: redemptionReference,
        }
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

      const companionVoucherCodes = await this.packageActivationService.generateCompanionVouchersForPackage(tx, {
        tenantId: voucher.tenantId,
        packageId: voucher.packageId,
        deviceLimit: packageRecord.deviceLimit,
      })

      if (accessPhoneNumber) {
        customerWhatsAppInfo = {
          phoneNumber: accessPhoneNumber,
          packageName: packageRecord.name,
          durationMinutes: packageRecord.durationMinutes,
          companionVoucherCodes,
        }
      }

      return {
        voucher: updatedVoucher,
        redemption,
        activation,
        companionVoucherCodes,
      }
    })

    if (receiptInfo) {
      // Best-effort, fire-and-forget: a slow/broken mail server must never
      // delay or fail a redemption that already succeeded.
      void this.sendSaleReceiptEmailSafely({ ...receiptInfo, channel: 'Voucher' })
    }

    if (customerWhatsAppInfo) {
      void this.sendCustomerWhatsAppConfirmation(customerWhatsAppInfo)
    }

    return result
  }

  private async sendCustomerWhatsAppConfirmation(input: {
    phoneNumber: string
    packageName: string
    durationMinutes: number
    companionVoucherCodes: string[]
  }) {
    if (!this.whatsAppService.isConfigured()) {
      return
    }

    const lines = [
      `✅ Voucher redeemed for *${input.packageName}*.`,
      `Your device is connecting now.`,
    ]
    if (input.companionVoucherCodes.length > 0) {
      lines.push('', `Your package covers ${input.companionVoucherCodes.length + 1} devices. Share these codes so your friends can connect on their own phones:`)
      for (const code of input.companionVoucherCodes) {
        lines.push(`• ${code}`)
      }
      lines.push('', 'Each code works on one device only and expires soon, so share them right away.')
    }

    try {
      await this.whatsAppService.sendTextMessage(input.phoneNumber, lines.join('\n'))
    } catch (error) {
      this.logger.warn(
        `Failed to send WhatsApp confirmation to ${input.phoneNumber}: ${error instanceof Error ? error.message : String(error)}`,
      )
    }
  }

  private async sendSaleReceiptEmailSafely(input: {
    tenantId: string
    packageName: string
    channel: 'Mobile Money' | 'Voucher'
    grossAmountUgx: number
    feeAmountUgx: number
    netAmountUgx: number
    customerReference?: string | null
    reference: string
  }) {
    try {
      const tenant = await this.prisma.tenant.findUnique({
        where: { id: input.tenantId },
        select: {
          name: true,
          supportEmail: true,
          users: { select: { email: true, firstName: true, lastName: true }, take: 1 },
        },
      })
      const recipientEmail = tenant?.supportEmail ?? tenant?.users[0]?.email
      if (!tenant || !recipientEmail) {
        return
      }

      const recipientName = tenant.users[0]
        ? `${tenant.users[0].firstName ?? ''} ${tenant.users[0].lastName ?? ''}`.trim() || tenant.name
        : tenant.name

      await this.mailService.sendSaleReceiptEmail({
        to: recipientEmail,
        tenantName: tenant.name,
        recipientName,
        packageName: input.packageName,
        channel: input.channel,
        grossAmountUgx: input.grossAmountUgx,
        feeAmountUgx: input.feeAmountUgx,
        netAmountUgx: input.netAmountUgx,
        customerReference: input.customerReference,
        reference: input.reference,
        occurredAt: new Date(),
      })
    } catch (error) {
      this.logger.warn(
        `Failed to send sale receipt email for tenant ${input.tenantId}: ${error instanceof Error ? error.message : String(error)}`,
      )
    }
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
    const cardHeight = 106
    let x = pageMargin
    let y = pageMargin

    // Printed voucher QRs must always open a universally reachable page.
    // Pointing them at a hotspot-local IP/hostname only works on one specific
    // captive network and fails everywhere else with "page could not be
    // reached". The public portal URL is the reliable target:
    //   - Off-network scans open the portal directly and still prefill the code.
    //   - On-network scans are intercepted by MikroTik; login.html recovers the
    //     nested voucher code from dst/link-orig and auto-redeems it there.
    const portalHost = this.getVoucherPortalHost()

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
        portalHost,
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
        `AROFi vouchers . ${template.label} . Powered by arofi.net . https://arofi.net`,
        pageMargin,
        doc.page.height - 12,
        {
          width: doc.page.width - pageMargin * 2,
          align: 'center',
          link: 'https://arofi.net',
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
    const aliases: Record<string, VoucherPdfTemplate> = {
      emerald: 'signal',
      midnight: 'wave',
      royal: 'receipt',
      sunrise: 'agent',
      mono: 'thermal',
      'signal-card': 'signal',
      'wave-ticket': 'wave',
      'clean-receipt': 'receipt',
      'agent-strip': 'agent',
      'mini-thermal': 'thermal',
    }
    return normalized in voucherPdfTemplates ? (normalized as VoucherPdfTemplate) : aliases[normalized] ?? 'signal'
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
    const codeFontSize = input.voucherCode.length > 18 ? 7.2 : input.voucherCode.length > 14 ? 8.4 : 9.8
    doc.fillColor(template.ink).font('Helvetica-Bold').fontSize(codeFontSize)
      .text(input.voucherCode, innerX + 17, codeY + 1, {
        width: qrX - innerX - 20,
        height: 10,
        ellipsis: true,
        lineBreak: false,
      })

    doc.moveTo(innerX, y + 44).lineTo(x + width - 5, y + 44).strokeColor(template.accent).lineWidth(1.4).stroke()

    doc.image(input.qrPng, qrX, y + 43, { width: qrSize, height: qrSize })

    const detailY = y + 49
    const detailWidth = (qrX - innerX - 10) / 2
    this.drawVoucherDetail(doc, 'PACKAGE', input.packageName, innerX, detailY, detailWidth, template)
    this.drawVoucherDetail(doc, 'PRICE', `UGX ${input.amountUgx.toLocaleString('en-UG')}`, innerX + detailWidth + 8, detailY, detailWidth, template)
    this.drawVoucherDetail(doc, 'DURATION', this.formatVoucherDuration(input.durationMinutes), innerX, detailY + 18, detailWidth, template)
    this.drawVoucherDetail(doc, 'HELP', input.portalHost, innerX + detailWidth + 8, detailY + 18, detailWidth, template)

    doc.fillColor(template.ink).font('Helvetica').fontSize(4.2)
      .text(`Help: ${input.support}  |  ${input.portalHost}`, innerX, y + height - 16, {
        width: width - railWidth - 16,
        align: 'left',
        ellipsis: true,
      })

    // Advertisement band: an AROSOFT promo line printed on every voucher.
    doc.save()
    doc.moveTo(innerX, y + height - 10)
      .lineTo(x + width - 8, y + height - 10)
      .dash(1.2, { space: 1.4 })
      .strokeColor('#C7D2E5')
      .lineWidth(0.4)
      .stroke()
    doc.undash()
    doc.restore()
    doc.fillColor('#BBBBBB').font('Helvetica').fontSize(4.0)
      .text(VOUCHER_AD_LINE, innerX, y + height - 7, {
        width: width - railWidth - 16,
        align: 'center',
        ellipsis: true,
      })
    doc.restore()
  }

  private getVoucherCodeLookupVariants(input: string) {
    const normalized = this.normalizeVoucherCodeInput(input)
    const compactRaw = (input ?? '').trim().replace(/[\u2010-\u2015]/g, '-').replace(/\s+/g, '')
    const variants = new Set<string>()

    if (compactRaw) {
      variants.add(compactRaw)
      variants.add(compactRaw.toUpperCase())
      variants.add(compactRaw.toLowerCase())
    }

    if (normalized) {
      variants.add(normalized)
    }

    const parts = normalized.split('-').filter(Boolean)
    if (parts.length >= 4 && /^\d{8}$/.test(parts[1])) {
      variants.add(`${parts[0]}-${parts[parts.length - 2]}-${parts[parts.length - 1]}`)
    }

    const compact = normalized.replace(/[^A-Z0-9]/g, '')
    const compactWithDate = compact.match(/^([A-Z0-9]{2,8})(\d{8})([A-Z0-9]{4})(\d{4})$/)
    if (compactWithDate) {
      variants.add(`${compactWithDate[1]}-${compactWithDate[3]}-${compactWithDate[4]}`)
    }

    const compactStandard = compact.match(/^([A-Z0-9]{2,8})([A-Z0-9]{4})(\d{4})$/)
    if (compactStandard) {
      variants.add(`${compactStandard[1]}-${compactStandard[2]}-${compactStandard[3]}`)
    }

    return Array.from(variants)
  }

  private normalizeVoucherCodeInput(input?: string | null) {
    return (input ?? '')
      .trim()
      .replace(/[\u2010-\u2015]/g, '-')
      .replace(/\s+/g, '')
      .toUpperCase()
  }

  private resolveTemplatePrefix(prefix?: string | null) {
    return prefix?.trim().toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 12) || 'RANDOM'
  }

  private resolveVoucherCodeFormat(format?: string | null): VoucherCodeFormat {
    if (format === 'NUMBERS' || format === 'UPPERCASE_TEXT' || format === 'LOWERCASE_TEXT' || format === 'MIXED') {
      return format
    }

    return 'MIXED'
  }

  private getCodeModeLabel(format: VoucherCodeFormat) {
    switch (format) {
      case 'NUMBERS':
        return 'NUMBERS'
      case 'UPPERCASE_TEXT':
        return 'UPPERCASE'
      case 'LOWERCASE_TEXT':
        return 'LOWERCASE'
      case 'MIXED':
      default:
        return 'MIXED'
    }
  }

  private async generateUniqueVoucherCodes(
    tx: Prisma.TransactionClient,
    quantity: number,
    format: VoucherCodeFormat,
    length: number,
  ) {
    const codes = new Set<string>()
    let attempts = 0

    while (codes.size < quantity && attempts < quantity * 20) {
      codes.add(this.voucherCodeService.generateVoucherCode(format, length))
      attempts += 1
    }

    if (codes.size < quantity) {
      throw new BadRequestException('Could not generate enough unique voucher codes. Increase voucher code length.')
    }

    const existingCodes = await tx.voucher.findMany({
      where: { code: { in: Array.from(codes) } },
      select: { code: true },
    })

    for (const existing of existingCodes) {
      codes.delete(existing.code)
    }

    attempts = 0
    while (codes.size < quantity && attempts < quantity * 20) {
      const nextCode = this.voucherCodeService.generateVoucherCode(format, length)
      if (!codes.has(nextCode)) {
        const existing = await tx.voucher.findUnique({ where: { code: nextCode }, select: { id: true } })
        if (!existing) {
          codes.add(nextCode)
        }
      }
      attempts += 1
    }

    if (codes.size < quantity) {
      throw new BadRequestException('Could not generate enough unique voucher codes. Increase voucher code length.')
    }

    return Array.from(codes)
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
    const host = process.env.PORTAL_PUBLIC_HOST ?? process.env.API_PUBLIC_HOST ?? 'app.arofi.net'
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
    const configuredBase = process.env.VOUCHER_QR_BASE_URL ?? this.getVoucherPortalBaseUrl()
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
