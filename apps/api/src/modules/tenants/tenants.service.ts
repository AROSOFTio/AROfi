import { BadRequestException, Injectable } from '@nestjs/common'
import { WalletOwnerType } from '@prisma/client'
import { PrismaService } from '../../prisma.service'
import { CreateTenantDto } from './dto/create-tenant.dto'

@Injectable()
export class TenantsService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(tenantId?: string) {
    const tenants = await this.prisma.tenant.findMany({
      where: tenantId ? { id: tenantId } : undefined,
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
        supportPhone: tenant.supportPhone,
        supportEmail: tenant.supportEmail,
        createdAt: tenant.createdAt,
        updatedAt: tenant.updatedAt,
        wallet: tenant.wallets[0] ?? null,
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
