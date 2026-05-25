import { BadRequestException, Injectable } from '@nestjs/common'
import { BillingChannel, BillingTransactionStatus, DisbursementStatus, WalletOwnerType } from '@prisma/client'
import { PrismaService } from '../../prisma.service'
import { CreateTenantDto } from './dto/create-tenant.dto'

@Injectable()
export class TenantsService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(tenantId?: string) {
    const tenants = await this.prisma.tenant.findMany({
      where: tenantId ? { id: tenantId } : { users: { none: { role: { name: 'SuperAdmin' } } } },
      include: {
        wallets: {
          where: {
            ownerType: WalletOwnerType.TENANT,
          },
          select: {
            id: true,
            balanceUgx: true,
            currency: true,
          },
          take: 1,
        },
        tenantSettings: true,
        payoutNumbers: {
          orderBy: [{ isPrimary: 'desc' }, { createdAt: 'desc' }],
          take: 5,
        },
        payoutNumberChangeRequests: {
          orderBy: { createdAt: 'desc' },
          take: 3,
        },
        _count: {
          select: {
            users: true,
            hotspots: true,
            routers: true,
            packages: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    })

    const tenantIds = tenants.map((tenant) => tenant.id)
    const [billingByTenant, withdrawalByTenant] = await Promise.all([
      tenantIds.length
        ? this.prisma.billingTransaction.groupBy({
            by: ['tenantId'],
            where: { tenantId: { in: tenantIds }, status: BillingTransactionStatus.COMPLETED, channel: { in: [BillingChannel.MOBILE_MONEY, BillingChannel.VOUCHER] } },
            _sum: { grossAmountUgx: true, feeAmountUgx: true, netAmountUgx: true },
          })
        : [],
      tenantIds.length
        ? this.prisma.disbursement.groupBy({
            by: ['tenantId', 'status'],
            where: { tenantId: { in: tenantIds }, agentId: null },
            _sum: { amountUgx: true },
            _count: { _all: true },
          })
        : [],
    ])
    const billingMap = new Map<string, (typeof billingByTenant)[number]>()
    billingByTenant.forEach((item) => {
      billingMap.set(item.tenantId, item)
    })
    const withdrawalMap = new Map<string, { pendingUgx: number; completedUgx: number; failedCount: number; pendingCount: number }>()
    withdrawalByTenant.forEach((item) => {
      const current = withdrawalMap.get(item.tenantId) ?? { pendingUgx: 0, completedUgx: 0, failedCount: 0, pendingCount: 0 }
      if ([DisbursementStatus.PENDING, DisbursementStatus.PENDING_APPROVAL, DisbursementStatus.PENDING_NUMBER_APPROVAL, DisbursementStatus.FLAGGED_FOR_REVIEW, DisbursementStatus.PROCESSING].includes(item.status)) {
        current.pendingUgx += item._sum.amountUgx ?? 0
        current.pendingCount += item._count._all
      }
      if (item.status === DisbursementStatus.COMPLETED) current.completedUgx += item._sum.amountUgx ?? 0
      if (item.status === DisbursementStatus.FAILED || item.status === DisbursementStatus.REVERSED) current.failedCount += item._count._all
      withdrawalMap.set(item.tenantId, current)
    })

    return {
      summary: {
        totalTenants: tenants.length,
        withDomain: tenants.filter((tenant) => Boolean(tenant.domain)).length,
        totalHotspots: tenants.reduce((total, tenant) => total + tenant._count.hotspots, 0),
        totalRouters: tenants.reduce((total, tenant) => total + tenant._count.routers, 0),
      },
      items: tenants.map((tenant) => ({
        id: tenant.id,
        name: tenant.name,
        domain: tenant.domain,
        logoUrl: tenant.logoUrl,
        brandColor: tenant.brandColor,
        portalTemplate: tenant.portalTemplate,
        supportPhone: tenant.supportPhone,
        supportEmail: tenant.supportEmail,
        createdAt: tenant.createdAt,
        updatedAt: tenant.updatedAt,
        wallet: tenant.wallets[0] ?? null,
        status: {
          accountActive: tenant.tenantSettings?.accountActive ?? true,
          fraudHold: tenant.tenantSettings?.fraudHold ?? false,
          kycCompleted: tenant.tenantSettings?.kycCompleted ?? true,
        },
        earnings: {
          grossSalesUgx: billingMap.get(tenant.id)?._sum.grossAmountUgx ?? 0,
          platformFeesUgx: billingMap.get(tenant.id)?._sum.feeAmountUgx ?? 0,
          netEarningsUgx: billingMap.get(tenant.id)?._sum.netAmountUgx ?? 0,
          pendingWithdrawalUgx: withdrawalMap.get(tenant.id)?.pendingUgx ?? 0,
          completedWithdrawalUgx: withdrawalMap.get(tenant.id)?.completedUgx ?? 0,
          failedWithdrawalCount: withdrawalMap.get(tenant.id)?.failedCount ?? 0,
          pendingWithdrawalCount: withdrawalMap.get(tenant.id)?.pendingCount ?? 0,
        },
        payoutNumbers: tenant.payoutNumbers,
        payoutNumberChangeRequests: tenant.payoutNumberChangeRequests,
        counts: tenant._count,
      })),
    }
  }

  async create(dto: CreateTenantDto) {
    const name = dto.name.trim()
    const domain = dto.domain?.trim().toLowerCase()
    const brandColor = dto.brandColor?.trim().toUpperCase()

    if (domain && !/^[a-z0-9.-]+$/.test(domain)) {
      throw new BadRequestException('Domain must include only lowercase letters, digits, dots, or hyphens')
    }

    const tenant = await this.prisma.tenant.create({
      data: {
        name,
        domain,
        logoUrl: dto.logoUrl?.trim(),
        brandColor,
        portalTemplate: dto.portalTemplate?.trim() || 'classic',
        supportPhone: dto.supportPhone?.trim(),
        supportEmail: dto.supportEmail?.trim().toLowerCase(),
      },
    })

    await this.prisma.wallet.create({
      data: {
        tenantId: tenant.id,
        ownerType: WalletOwnerType.TENANT,
        ownerReference: tenant.id,
      },
    })

    return this.prisma.tenant.findUnique({
      where: { id: tenant.id },
      include: {
        wallets: {
          where: {
            ownerType: WalletOwnerType.TENANT,
          },
          select: {
            id: true,
            balanceUgx: true,
            currency: true,
          },
          take: 1,
        },
      },
    })
  }
}
