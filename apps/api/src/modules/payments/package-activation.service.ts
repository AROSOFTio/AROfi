import { Injectable } from '@nestjs/common'
import {
  PackageActivationSource,
  PackageActivationStatus,
  Prisma,
} from '@prisma/client'

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
  metadata?: Prisma.InputJsonValue
}

@Injectable()
export class PackageActivationService {
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

    return tx.packageActivation.create({
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
  }
}
