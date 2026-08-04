import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common'
import {
  PackageActivationSource,
  PackageActivationStatus,
  PackageStatus,
  Prisma,
} from '@prisma/client'
import { PrismaService } from '../../prisma.service'
import { RadiusCredentialService } from '../radius/radius-credential.service'
import { CreatePackageDto } from './dto/create-package.dto'
import { CreatePackagePriceDto } from './dto/create-package-price.dto'
import { CreateTvActivationDto } from './dto/create-tv-activation.dto'
import { UpdatePackageDto } from './dto/update-package.dto'

@Injectable()
export class PackagesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly radiusCredentialService: RadiusCredentialService,
  ) {}

  async getCatalog(tenantId?: string) {
    const items = await this.prisma.package.findMany({
      where: {
        status: { not: PackageStatus.ARCHIVED },
        ...(tenantId ? { tenantId } : {}),
      },
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
        isTrialEnabled: item.isTrialEnabled,
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

    const sortedItems = [...mappedItems].sort((a, b) => a.activePriceUgx - b.activePriceUgx)

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
      items: sortedItems,
    }
  }

  async createPackage(dto: CreatePackageDto) {
    const tenant = await this.prisma.tenant.findUnique({ where: { id: dto.tenantId } })
    if (!tenant) {
      throw new NotFoundException('Business not found')
    }

    return this.prisma.package.create({
      data: {
        tenantId: dto.tenantId,
        name: dto.name,
        code: dto.code.toUpperCase(),
        description: dto.description,
        durationMinutes: dto.durationMinutes,
        isTrialEnabled: dto.isTrialEnabled ?? false,
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

  async updatePackage(packageId: string, dto: UpdatePackageDto, tenantId?: string) {
    const pkg = await this.prisma.package.findUnique({ where: { id: packageId } })
    if (!pkg || (tenantId && pkg.tenantId !== tenantId)) {
      throw new NotFoundException('Package not found')
    }

    return this.prisma.$transaction(async (tx) => {
      await tx.package.update({
        where: { id: packageId },
        data: {
          name: dto.name,
          description: dto.description,
          durationMinutes: dto.durationMinutes,
          isTrialEnabled: dto.isTrialEnabled,
          dataLimitMb: dto.dataLimitMb,
          deviceLimit: dto.deviceLimit,
          downloadSpeedKbps: dto.downloadSpeedKbps,
          uploadSpeedKbps: dto.uploadSpeedKbps,
          isFeatured: dto.isFeatured,
          status: dto.status,
        },
      })

      // A price change ends the current default price and adds a new one, so
      // history is preserved and existing activations keep their old price.
      if (dto.priceUgx !== undefined) {
        await tx.packagePrice.updateMany({
          where: { packageId, endsAt: null },
          data: { isDefault: false, endsAt: new Date() },
        })
        await tx.packagePrice.create({
          data: { packageId, amountUgx: dto.priceUgx, isDefault: true },
        })
      }

      return tx.package.findUnique({
        where: { id: packageId },
        include: { tenant: { select: { id: true, name: true } }, prices: true },
      })
    })
  }

  async deletePackage(packageId: string, tenantId?: string) {
    const pkg = await this.prisma.package.findUnique({
      where: { id: packageId },
      include: { _count: { select: { vouchers: true } } },
    })
    if (!pkg || (tenantId && pkg.tenantId !== tenantId)) {
      throw new NotFoundException('Package not found')
    }
    if (pkg._count.vouchers > 0) {
      throw new BadRequestException(
        `Cannot delete this package — it has ${pkg._count.vouchers} voucher(s) linked to it. Archive it instead by editing its status.`,
      )
    }
    await this.prisma.package.update({
      where: { id: packageId },
      data: { status: PackageStatus.ARCHIVED },
    })
    return { deleted: true }
  }

  async addPricing(packageId: string, dto: CreatePackagePriceDto, tenantId?: string) {
    const pkg = await this.prisma.package.findUnique({ where: { id: packageId } })
    if (!pkg) {
      throw new NotFoundException('Package not found')
    }

    if (tenantId && pkg.tenantId !== tenantId) {
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

  async createTvActivation(packageId: string, tenantId: string, dto: CreateTvActivationDto) {
    const normalizedMac = this.normalizeMac(dto.macAddress)
    if (!normalizedMac) {
      throw new BadRequestException('Enter a valid TV MAC address')
    }

    return this.prisma.$transaction(async (tx) => {
      const pkg = await tx.package.findUnique({
        where: { id: packageId },
        include: {
          prices: {
            where: { endsAt: null },
            take: 1,
          },
        },
      })

      if (!pkg || pkg.tenantId !== tenantId || pkg.status === PackageStatus.ARCHIVED) {
        throw new NotFoundException('TV package not found')
      }

      const [router, hotspot, activeForMac] = await Promise.all([
        dto.routerId
          ? tx.router.findFirst({
              where: { id: dto.routerId, tenantId },
              select: { id: true, name: true },
            })
          : Promise.resolve(null),
        dto.hotspotId
          ? tx.hotspot.findFirst({
              where: { id: dto.hotspotId, tenantId },
              select: { id: true, name: true },
            })
          : Promise.resolve(null),
        tx.packageActivation.findFirst({
          where: {
            tenantId,
            boundMacAddress: normalizedMac,
            status: PackageActivationStatus.ACTIVE,
            endsAt: { gt: new Date() },
          },
          include: {
            package: {
              select: { id: true, name: true, code: true },
            },
            radiusCredential: {
              select: { username: true, status: true, expiresAt: true },
            },
          },
        }),
      ])

      if (dto.routerId && !router) {
        throw new NotFoundException('Router not found for this business')
      }

      if (dto.hotspotId && !hotspot) {
        throw new NotFoundException('Hotspot not found for this business')
      }

      if (activeForMac) {
        throw new BadRequestException(
          `This TV already has an active package (${activeForMac.package.name}) until ${activeForMac.endsAt.toISOString()}`,
        )
      }

      const startedAt = new Date()
      const endsAt = new Date(startedAt.getTime() + pkg.durationMinutes * 60 * 1000)
      const username = normalizedMac
      const password = normalizedMac
      const customerName = dto.customerName?.trim() || `Smart TV ${normalizedMac}`
      const phoneNumber = dto.phoneNumber?.trim() || null

      const activation = await tx.packageActivation.create({
        data: {
          tenantId,
          packageId: pkg.id,
          hotspotId: hotspot?.id,
          routerId: router?.id,
          source: PackageActivationSource.VOUCHER,
          status: PackageActivationStatus.ACTIVE,
          customerReference: customerName,
          accessPhoneNumber: phoneNumber,
          durationMinutes: pkg.durationMinutes,
          dataLimitMb: pkg.dataLimitMb,
          deviceLimit: 1,
          downloadSpeedKbps: pkg.downloadSpeedKbps,
          uploadSpeedKbps: pkg.uploadSpeedKbps,
          radiusUsername: username,
          radiusPassword: password,
          boundMacAddress: normalizedMac,
          firstSeenAt: startedAt,
          startedAt,
          endsAt,
          metadata: {
            source: 'SMART_TV_MANUAL',
            createdFrom: 'admin_packages_tv',
            macAddress: normalizedMac,
            customerName,
            phoneNumber,
            priceUgx: pkg.prices[0]?.amountUgx ?? 0,
          } satisfies Prisma.InputJsonValue,
        },
        include: {
          package: {
            select: { id: true, name: true, code: true },
          },
          hotspot: {
            select: { id: true, name: true },
          },
        },
      })

      const credential = await this.radiusCredentialService.provisionForActivation(tx, {
        tenantId,
        activationId: activation.id,
        username,
        password,
        boundMacAddress: normalizedMac,
        routerId: router?.id ?? null,
      })

      return {
        activated: true,
        activation,
        credential: {
          username: credential.username,
          boundMacAddress: credential.boundMacAddress,
          expiresAt: credential.expiresAt,
          status: credential.status,
        },
        router,
        hotspot,
        instructions: [
          'Connect the Smart TV to the hotspot WiFi.',
          'If it is already connected, turn WiFi off and on again so the router asks RADIUS again.',
          'The TV should receive internet automatically without opening the captive portal.',
        ],
      }
    })
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
}
