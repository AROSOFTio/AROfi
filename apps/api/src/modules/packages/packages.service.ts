import { Injectable, NotFoundException } from '@nestjs/common'
import { PackageStatus } from '@prisma/client'
import { PrismaService } from '../../prisma.service'
import { CreatePackageDto } from './dto/create-package.dto'
import { CreatePackagePriceDto } from './dto/create-package-price.dto'

@Injectable()
export class PackagesService {
  constructor(private readonly prisma: PrismaService) {}

  async getCatalog(tenantId?: string) {
    const items = await this.prisma.package.findMany({
      where: tenantId ? { tenantId } : undefined,
      include: {
        tenant: {
          select: {
            id: true,
            name: true,
          },
        },
        prices: {
          orderBy: { startsAt: 'desc' },
        },
        _count: {
          select: {
            voucherBatches: true,
            vouchers: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    })

    const mappedItems = items.map((item) => {
      const activePrice = item.prices.find((price) => price.endsAt === null) ?? item.prices[0]

      return {
        id: item.id,
        tenant: item.tenant,
        name: item.name,
        code: item.code,
        description: item.description,
        durationMinutes: item.durationMinutes,
        dataLimitMb: item.dataLimitMb,
        deviceLimit: item.deviceLimit,
        downloadSpeedKbps: item.downloadSpeedKbps,
        uploadSpeedKbps: item.uploadSpeedKbps,
        isFeatured: item.isFeatured,
        status: item.status,
        activePriceUgx: activePrice?.amountUgx ?? 0,
        priceHistoryCount: item.prices.length,
        voucherBatchCount: item._count.voucherBatches,
        voucherCount: item._count.vouchers,
        updatedAt: item.updatedAt,
      }
    })

    return {
      summary: {
        totalPackages: mappedItems.length,
        activePackages: mappedItems.filter((item) => item.status === PackageStatus.ACTIVE).length,
        featuredPackages: mappedItems.filter((item) => item.isFeatured).length,
        averagePriceUgx:
          mappedItems.length > 0
            ? Math.round(mappedItems.reduce((total, item) => total + item.activePriceUgx, 0) / mappedItems.length)
            : 0,
      },
      items: mappedItems,
    }
  }

  async createPackage(dto: CreatePackageDto) {
    const tenant = await this.prisma.tenant.findUnique({ where: { id: dto.tenantId } })
    if (!tenant) {
      throw new NotFoundException('Tenant not found')
    }

    return this.prisma.package.create({
      data: {
        tenantId: dto.tenantId,
        name: dto.name,
        code: dto.code.toUpperCase(),
        description: dto.description,
        durationMinutes: dto.durationMinutes,
        dataLimitMb: dto.dataLimitMb,
        deviceLimit: dto.deviceLimit,
        downloadSpeedKbps: dto.downloadSpeedKbps,
        uploadSpeedKbps: dto.uploadSpeedKbps,
        isFeatured: dto.isFeatured ?? false,
        status: dto.status ?? PackageStatus.ACTIVE,
        prices: {
          create: {
            amountUgx: dto.initialPriceUgx,
            isDefault: true,
          },
        },
      },
      include: {
        tenant: {
          select: {
            id: true,
            name: true,
          },
        },
        prices: true,
      },
    })
  }

  async addPricing(packageId: string, dto: CreatePackagePriceDto) {
    const pkg = await this.prisma.package.findUnique({ where: { id: packageId } })
    if (!pkg) {
      throw new NotFoundException('Package not found')
    }

    return this.prisma.$transaction(async (tx) => {
      if (dto.isDefault ?? true) {
        await tx.packagePrice.updateMany({
          where: {
            packageId,
            endsAt: null,
          },
          data: {
            isDefault: false,
            endsAt: dto.startsAt ? new Date(dto.startsAt) : new Date(),
          },
        })
      }

      return tx.packagePrice.create({
        data: {
          packageId,
          amountUgx: dto.amountUgx,
          isDefault: dto.isDefault ?? true,
          startsAt: dto.startsAt ? new Date(dto.startsAt) : new Date(),
          endsAt: dto.endsAt ? new Date(dto.endsAt) : null,
        },
      })
    })
  }
}
