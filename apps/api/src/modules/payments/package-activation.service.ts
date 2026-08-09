import { Injectable, Logger } from '@nestjs/common'
import {
  PackageActivationSource,
  PackageActivationStatus,
  Prisma,
  RadiusCredentialStatus,
  VoucherBatchStatus,
} from '@prisma/client'
import { RadiusCredentialService } from '../radius/radius-credential.service'
import { VoucherCodeService } from '../vouchers/voucher-code.service'

// Companion vouchers for multi-device packages must expire well before they
// could be hoarded or resold separately from the bundle that paid for them.
const COMPANION_VOUCHER_EXPIRY_HOURS = 60

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
  private readonly logger = new Logger(PackageActivationService.name)

  constructor(
    private readonly radiusCredentialService: RadiusCredentialService,
    private readonly voucherCodeService: VoucherCodeService,
  ) {}

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
    const normalizedRadiusUsername = input.radiusUsername?.trim() || null

    if (normalizedRadiusUsername) {
      const conflictingActiveCredential = await tx.radiusCredential.findFirst({
        where: {
          username: normalizedRadiusUsername,
          status: RadiusCredentialStatus.ACTIVE,
          expiresAt: { gt: startedAt },
        },
        select: { activationId: true },
      })

      if (conflictingActiveCredential) {
        throw new Error('This Smart TV already has an active package. Wait for it to expire or use the existing connection.')
      }

      await tx.radCheck.deleteMany({ where: { username: normalizedRadiusUsername } })
      await tx.radReply.deleteMany({ where: { username: normalizedRadiusUsername } })
      await tx.radiusCredential.deleteMany({
        where: {
          username: normalizedRadiusUsername,
          OR: [{ expiresAt: { lte: startedAt } }, { status: { not: RadiusCredentialStatus.ACTIVE } }],
        },
      })
      await tx.packageActivation.updateMany({
        where: {
          radiusUsername: normalizedRadiusUsername,
          OR: [{ endsAt: { lte: startedAt } }, { status: { not: PackageActivationStatus.ACTIVE } }],
        },
        data: {
          radiusUsername: null,
          radiusPassword: null,
        },
      })
    }

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

  // Multi-device packages (Package.deviceLimit > 1) sell ONE payment/voucher
  // but should let several people connect from their own devices. RADIUS
  // enforces a strict one-MAC-per-credential lock (see
  // RadiusAuthorizationPolicyService), so instead of sharing one login we
  // mint (deviceLimit - 1) standalone single-use companion vouchers for the
  // same package the moment the first device activates, and hand the codes
  // back to the buyer to share. faceValueUgx is 0 because the revenue was
  // already recorded on the original payment/voucher sale - these are not a
  // second sale. Shared by both the mobile-money and voucher-redemption
  // activation paths so it lives here rather than in VouchersService.
  async generateCompanionVouchersForPackage(
    tx: Prisma.TransactionClient,
    params: { tenantId: string; packageId: string; deviceLimit?: number | null },
  ): Promise<string[]> {
    const quantity = (params.deviceLimit ?? 1) - 1
    if (quantity <= 0) {
      return []
    }

    // Best-effort: a failure here must NOT roll back the customer's already-paid
    // activation. Worst case they get zero companion vouchers and can ask support.
    try {
      const batchNumber = this.voucherCodeService.generateBatchNumber('COMPANION')
      const voucherCodes = await this.generateUniqueVoucherCodes(tx, quantity)
      const expiresAt = new Date(Date.now() + COMPANION_VOUCHER_EXPIRY_HOURS * 60 * 60 * 1000)

      const batch = await tx.voucherBatch.create({
        data: {
          tenantId: params.tenantId,
          packageId: params.packageId,
          batchNumber,
          prefix: 'COMPANION',
          quantity,
          faceValueUgx: 0,
          expiresAt,
          status: VoucherBatchStatus.ACTIVE,
          notes: 'Auto-generated multi-device companion vouchers',
        },
      })

      await tx.voucher.createMany({
        data: voucherCodes.map((code, index) => ({
          tenantId: params.tenantId,
          batchId: batch.id,
          packageId: params.packageId,
          code,
          serialNumber: this.generateBatchScopedSerialNumber(batch.id, index + 1),
          faceValueUgx: 0,
          expiresAt,
        })),
      })

      return voucherCodes
    } catch (error) {
      this.logger.error(
        `Failed to generate companion vouchers for package ${params.packageId} (tenant ${params.tenantId}): ${
          error instanceof Error ? error.message : String(error)
        }`,
      )
      return []
    }
  }

  private generateBatchScopedSerialNumber(batchId: string, index: number) {
    const batchPart = batchId.replace(/[^a-zA-Z0-9]/g, '').slice(-10).toUpperCase()
    return `SN-${batchPart}-${index.toString().padStart(4, '0')}`
  }

  private async generateUniqueVoucherCodes(tx: Prisma.TransactionClient, quantity: number) {
    const codes = new Set<string>()
    let attempts = 0

    while (codes.size < quantity && attempts < quantity * 20) {
      codes.add(this.voucherCodeService.generateVoucherCode('MIXED', 10))
      attempts += 1
    }

    if (codes.size < quantity) {
      throw new Error('Could not generate enough unique companion voucher codes')
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
      const candidate = this.voucherCodeService.generateVoucherCode('MIXED', 10)
      const exists = await tx.voucher.findUnique({ where: { code: candidate }, select: { id: true } })
      if (!exists) {
        codes.add(candidate)
      }
      attempts += 1
    }

    if (codes.size < quantity) {
      throw new Error('Could not generate enough unique companion voucher codes')
    }

    return Array.from(codes).slice(0, quantity)
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
