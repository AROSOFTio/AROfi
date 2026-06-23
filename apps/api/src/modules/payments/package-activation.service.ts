import { Injectable } from '@nestjs/common'
import {
  PackageActivationSource,
  PackageActivationStatus,
  Prisma,
} from '@prisma/client'
import { RadiusCredentialService } from '../radius/radius-credential.service'

type ActivatePackageInput = {
  tenantId: string
  packageId: string
  paymentId?: string
  voucherRedemptionId?: string
  hotspotId?: string
  source: PackageActivationSource
  customerReference?: string
  accessPhoneNumber?: string
  sessionReference?: string
  durationMinutes: number
  dataLimitMb?: number | null
  deviceLimit?: number | null
  downloadSpeedKbps?: number | null
  uploadSpeedKbps?: number | null
  radiusUsername?: string | null
  radiusPassword?: string | null
  boundMacAddress?: string | null
  firstSeenIp?: string | null
  routerId?: string | null
  hotspotServerName?: string | null
  metadata?: Prisma.InputJsonValue
}

@Injectable()
export class PackageActivationService {
  constructor(private readonly radiusCredentialService: RadiusCredentialService) {}

  async activateInTransaction(tx: Prisma.TransactionClient, input: ActivatePackageInput) {
    const existingActivation = input.paymentId
      ? await tx.packageActivation.findUnique({ where: { paymentId: input.paymentId } })
      : input.voucherRedemptionId
        ? await tx.packageActivation.findUnique({ where: { voucherRedemptionId: input.voucherRedemptionId } })
        : null

    if (existingActivation) {
      return existingActivation
    }

    const startedAt = new Date()
    const endsAt = new Date(startedAt.getTime() + input.durationMinutes * 60 * 1000)

    const activation = await tx.packageActivation.create({
      data: {
        tenantId: input.tenantId,
        packageId: input.packageId,
        paymentId: input.paymentId,
        voucherRedemptionId: input.voucherRedemptionId,
        hotspotId: input.hotspotId,
        source: input.source,
        status: PackageActivationStatus.ACTIVE,
        customerReference: input.customerReference,
        accessPhoneNumber: input.accessPhoneNumber,
        durationMinutes: input.durationMinutes,
        dataLimitMb: input.dataLimitMb,
        deviceLimit: input.deviceLimit,
        downloadSpeedKbps: input.downloadSpeedKbps,
        uploadSpeedKbps: input.uploadSpeedKbps,
        radiusUsername: input.radiusUsername,
        radiusPassword: input.radiusPassword,
        boundMacAddress: this.normalizeMac(input.boundMacAddress),
        firstSeenIp: input.firstSeenIp,
        firstSeenAt: input.boundMacAddress ? startedAt : undefined,
        routerId: input.routerId,
        hotspotServerName: input.hotspotServerName,
        startedAt,
        endsAt,
        metadata: input.metadata,
      },
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
    })

    await this.radiusCredentialService.provisionForActivation(tx, {
      tenantId: input.tenantId,
      activationId: activation.id,
      username: input.radiusUsername,
      password: input.radiusPassword,
      boundMacAddress: input.boundMacAddress,
      routerId: input.routerId,
    })

    return activation
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
