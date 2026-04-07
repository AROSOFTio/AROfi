import {
  BillingChannel,
  BillingTransactionStatus,
  BillingTransactionType,
  LedgerDirection,
  LedgerTransactionType,
  PackageActivationStatus,
  PackageActivationSource,
  PackageStatus,
  Prisma,
  PrismaClient,
  RadiusEventType,
  RouterConnectionMode,
  RouterStatus,
  SessionStatus,
  VoucherBatchStatus,
  VoucherStatus,
  WalletOwnerType,
} from '@prisma/client'
import * as bcrypt from 'bcrypt'
import { createCipheriv, createHash, randomBytes, randomUUID } from 'crypto'

const prisma = new PrismaClient()

function encryptSeedValue(value: string) {
  const secret = process.env.ROUTER_CREDENTIAL_SECRET ?? 'change_this_router_secret'
  const key = createHash('sha256').update(secret).digest()
  const iv = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', key, iv)
  const encrypted = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()])
  const authTag = cipher.getAuthTag()

  return `v1:${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted.toString('hex')}`
}

type SeedSaleInput = {
  tenantId: string
  walletId: string
  packageId: string
  voucherId?: string
  type: BillingTransactionType
  channel: BillingChannel
  grossAmountUgx: number
  feeAmountUgx: number
  description: string
  customerReference?: string
  externalReference?: string
  paymentProvider?: string
  metadata?: Prisma.InputJsonValue
}

async function createSeedSaleTransaction(input: SeedSaleInput) {
  const netAmountUgx = input.grossAmountUgx - input.feeAmountUgx
  const reference = input.externalReference ?? randomUUID()

  return prisma.$transaction(async (tx) => {
    const ledgerTransaction = await tx.ledgerTransaction.create({
      data: {
        tenantId: input.tenantId,
        walletId: input.walletId,
        reference: `LEDGER-${reference}`,
        type: LedgerTransactionType.SALE,
        channel: input.channel,
        description: input.description,
        grossAmountUgx: input.grossAmountUgx,
        feeAmountUgx: input.feeAmountUgx,
        netAmountUgx,
        sourceType: 'BillingTransaction',
        metadata: input.metadata,
        entries: {
          create: [
            {
              tenantId: input.tenantId,
              walletId: input.walletId,
              accountCode: 'sales_clearing',
              direction: LedgerDirection.DEBIT,
              amountUgx: input.grossAmountUgx,
              memo: 'Gross sale value',
            },
            {
              tenantId: input.tenantId,
              accountCode: 'platform_revenue',
              direction: LedgerDirection.CREDIT,
              amountUgx: input.feeAmountUgx,
              memo: 'Platform fee recognised',
            },
            {
              tenantId: input.tenantId,
              walletId: input.walletId,
              accountCode: 'tenant_wallet',
              direction: LedgerDirection.CREDIT,
              amountUgx: netAmountUgx,
              memo: 'Vendor net proceeds',
            },
          ],
        },
      },
    })

    await tx.wallet.update({
      where: { id: input.walletId },
      data: {
        balanceUgx: {
          increment: netAmountUgx,
        },
      },
    })

    return tx.billingTransaction.create({
      data: {
        tenantId: input.tenantId,
        walletId: input.walletId,
        packageId: input.packageId,
        voucherId: input.voucherId,
        ledgerTransactionId: ledgerTransaction.id,
        channel: input.channel,
        type: input.type,
        status: BillingTransactionStatus.COMPLETED,
        grossAmountUgx: input.grossAmountUgx,
        feeAmountUgx: input.feeAmountUgx,
        netAmountUgx,
        customerReference: input.customerReference,
        externalReference: reference,
        paymentProvider: input.paymentProvider,
        metadata: input.metadata,
      },
    })
  })
}

async function createWalletAdjustment(
  tenantId: string,
  walletId: string,
  amountUgx: number,
  description: string,
) {
  const direction = amountUgx >= 0 ? LedgerDirection.CREDIT : LedgerDirection.DEBIT
  const absoluteAmount = Math.abs(amountUgx)

  return prisma.$transaction(async (tx) => {
    const ledgerTransaction = await tx.ledgerTransaction.create({
      data: {
        tenantId,
        walletId,
        reference: `WALLET-${randomUUID()}`,
        type: LedgerTransactionType.WALLET_ADJUSTMENT,
        channel: BillingChannel.WALLET_ADJUSTMENT,
        description,
        grossAmountUgx: absoluteAmount,
        feeAmountUgx: 0,
        netAmountUgx: amountUgx,
        sourceType: 'WalletAdjustment',
        entries: {
          create: [
            {
              tenantId,
              walletId,
              accountCode: 'tenant_wallet',
              direction,
              amountUgx: absoluteAmount,
              memo: description,
            },
            {
              tenantId,
              accountCode: 'adjustment_clearing',
              direction: direction === LedgerDirection.CREDIT ? LedgerDirection.DEBIT : LedgerDirection.CREDIT,
              amountUgx: absoluteAmount,
              memo: description,
            },
          ],
        },
      },
    })

    await tx.wallet.update({
      where: { id: walletId },
      data: {
        balanceUgx: {
          increment: amountUgx,
        },
      },
    })

    return tx.billingTransaction.create({
      data: {
        tenantId,
        walletId,
        ledgerTransactionId: ledgerTransaction.id,
        channel: BillingChannel.WALLET_ADJUSTMENT,
        type: BillingTransactionType.WALLET_ADJUSTMENT,
        status: BillingTransactionStatus.COMPLETED,
        grossAmountUgx: absoluteAmount,
        feeAmountUgx: 0,
        netAmountUgx: amountUgx,
        externalReference: `WALLET-ADJUST-${randomUUID()}`,
        metadata: { description },
      },
    })
  })
}

async function main() {
  console.log('Seeding AROFi billing and network core...')

  const [superAdminRole, vendorAdminRole, financeRole] = await Promise.all([
    prisma.role.upsert({
      where: { name: 'SuperAdmin' },
      update: { permissions: ['ALL'] },
      create: { name: 'SuperAdmin', permissions: ['ALL'] },
    }),
    prisma.role.upsert({
      where: { name: 'VendorAdmin' },
      update: { permissions: ['billing.read', 'billing.write', 'packages.manage', 'vouchers.manage'] },
      create: {
        name: 'VendorAdmin',
        permissions: ['billing.read', 'billing.write', 'packages.manage', 'vouchers.manage'],
      },
    }),
    prisma.role.upsert({
      where: { name: 'Finance' },
      update: { permissions: ['billing.read', 'settlements.read'] },
      create: {
        name: 'Finance',
        permissions: ['billing.read', 'settlements.read'],
      },
    }),
  ])

  const masterTenant = await prisma.tenant.upsert({
    where: { domain: 'arosoft.io' },
    update: { name: 'AROSOFT Master Tenant' },
    create: {
      name: 'AROSOFT Master Tenant',
      domain: 'arosoft.io',
    },
  })

  const vendorTenant = await prisma.tenant.upsert({
    where: { domain: 'citynet.arofi.local' },
    update: { name: 'CityNet Kampala' },
    create: {
      name: 'CityNet Kampala',
      domain: 'citynet.arofi.local',
    },
  })

  const [superAdminPassword, vendorPassword] = await Promise.all([
    bcrypt.hash('supersecret', 10),
    bcrypt.hash('vendorsecret', 10),
  ])

  const [superAdminUser, vendorAdminUser] = await Promise.all([
    prisma.user.upsert({
      where: { email: 'admin@arosoft.io' },
      update: {
        password: superAdminPassword,
        roleId: superAdminRole.id,
        tenantId: masterTenant.id,
      },
      create: {
        email: 'admin@arosoft.io',
        password: superAdminPassword,
        firstName: 'System',
        lastName: 'Administrator',
        roleId: superAdminRole.id,
        tenantId: masterTenant.id,
      },
    }),
    prisma.user.upsert({
      where: { email: 'vendor@citynet.ug' },
      update: {
        password: vendorPassword,
        roleId: vendorAdminRole.id,
        tenantId: vendorTenant.id,
      },
      create: {
        email: 'vendor@citynet.ug',
        password: vendorPassword,
        firstName: 'Grace',
        lastName: 'Namara',
        roleId: vendorAdminRole.id,
        tenantId: vendorTenant.id,
      },
    }),
  ])

  const financeUser = await prisma.user.upsert({
    where: { email: 'finance@citynet.ug' },
    update: {
      password: vendorPassword,
      roleId: financeRole.id,
      tenantId: vendorTenant.id,
    },
    create: {
      email: 'finance@citynet.ug',
      password: vendorPassword,
      firstName: 'Daniel',
      lastName: 'Mwesigwa',
      roleId: financeRole.id,
      tenantId: vendorTenant.id,
    },
  })

  const existingPackageIds = (
    await prisma.package.findMany({
      where: { tenantId: vendorTenant.id },
      select: { id: true },
    })
  ).map((pkg) => pkg.id)

  await prisma.radiusEvent.deleteMany({ where: { tenantId: vendorTenant.id } })
  await prisma.networkSession.deleteMany({ where: { tenantId: vendorTenant.id } })
  await prisma.routerHealthCheck.deleteMany({ where: { tenantId: vendorTenant.id } })
  await prisma.radiusClient.deleteMany({ where: { tenantId: vendorTenant.id } })
  await prisma.router.deleteMany({ where: { tenantId: vendorTenant.id } })
  await prisma.routerGroup.deleteMany({ where: { tenantId: vendorTenant.id } })
  await prisma.paymentWebhook.deleteMany({ where: { tenantId: vendorTenant.id } })
  await prisma.packageActivation.deleteMany({ where: { tenantId: vendorTenant.id } })
  await prisma.payment.deleteMany({ where: { tenantId: vendorTenant.id } })
  await prisma.voucherRedemption.deleteMany({ where: { tenantId: vendorTenant.id } })
  await prisma.billingTransaction.deleteMany({ where: { tenantId: vendorTenant.id } })
  await prisma.ledgerEntry.deleteMany({ where: { tenantId: vendorTenant.id } })
  await prisma.ledgerTransaction.deleteMany({ where: { tenantId: vendorTenant.id } })
  await prisma.voucher.deleteMany({ where: { tenantId: vendorTenant.id } })
  await prisma.voucherBatch.deleteMany({ where: { tenantId: vendorTenant.id } })
  await prisma.packagePrice.deleteMany({ where: { packageId: { in: existingPackageIds } } })
  await prisma.package.deleteMany({ where: { tenantId: vendorTenant.id } })
  await prisma.wallet.deleteMany({ where: { tenantId: vendorTenant.id } })

  await prisma.hotspot.deleteMany({ where: { tenantId: vendorTenant.id } })

  const tenantWallet = await prisma.wallet.create({
    data: {
      tenantId: vendorTenant.id,
      ownerType: WalletOwnerType.TENANT,
      currency: 'UGX',
      balanceUgx: 0,
    },
  })

  const cityCentreHotspot = await prisma.hotspot.create({
    data: {
      tenantId: vendorTenant.id,
      name: 'City Centre Hotspot',
      nasIpAddress: '10.10.0.1',
      secret: 'radius-secret',
    },
  })

  const nakawaHotspot = await prisma.hotspot.create({
    data: {
      tenantId: vendorTenant.id,
      name: 'Nakawa Lounge Hotspot',
      nasIpAddress: '10.10.0.2',
      secret: 'radius-secret',
    },
  })

  const hourlyPackage = await prisma.package.create({
    data: {
      tenantId: vendorTenant.id,
      name: '1 Hour Unlimited',
      code: 'HR1',
      description: 'Unlimited hotspot access valid for 60 minutes.',
      durationMinutes: 60,
      downloadSpeedKbps: 2048,
      uploadSpeedKbps: 1024,
      deviceLimit: 1,
      isFeatured: true,
      status: PackageStatus.ACTIVE,
      prices: {
        create: {
          amountUgx: 1000,
          isDefault: true,
        },
      },
    },
    include: { prices: true },
  })

  const dailyPackage = await prisma.package.create({
    data: {
      tenantId: vendorTenant.id,
      name: '24 Hours Unlimited',
      code: 'DAY24',
      description: 'Unlimited hotspot access valid for 24 hours.',
      durationMinutes: 1440,
      downloadSpeedKbps: 4096,
      uploadSpeedKbps: 2048,
      deviceLimit: 2,
      isFeatured: true,
      status: PackageStatus.ACTIVE,
      prices: {
        create: {
          amountUgx: 5000,
          isDefault: true,
        },
      },
    },
    include: { prices: true },
  })

  const weekendPackage = await prisma.package.create({
    data: {
      tenantId: vendorTenant.id,
      name: 'Weekend Streamer',
      code: 'WKND',
      description: 'High-throughput weekend bundle for cafes and lounges.',
      durationMinutes: 2880,
      dataLimitMb: 25000,
      downloadSpeedKbps: 8192,
      uploadSpeedKbps: 4096,
      deviceLimit: 3,
      status: PackageStatus.ACTIVE,
      prices: {
        create: {
          amountUgx: 12000,
          isDefault: true,
        },
      },
    },
    include: { prices: true },
  })

  const metroCoreGroup = await prisma.routerGroup.create({
    data: {
      tenantId: vendorTenant.id,
      name: 'Metro Core',
      code: 'METRO',
      description: 'Primary aggregation routers for Kampala city coverage.',
      region: 'Kampala CBD',
    },
  })

  const branchEdgeGroup = await prisma.routerGroup.create({
    data: {
      tenantId: vendorTenant.id,
      name: 'Branch Edge',
      code: 'BRANCH',
      description: 'Remote branch gateways with smaller hotspot footprints.',
      region: 'Greater Kampala',
    },
  })

  const cityRouter = await prisma.router.create({
    data: {
      tenantId: vendorTenant.id,
      groupId: metroCoreGroup.id,
      hotspotId: cityCentreHotspot.id,
      name: 'City Centre Gateway',
      identity: 'city-core-rtr01',
      host: '10.10.0.1',
      apiPort: 8728,
      connectionMode: RouterConnectionMode.ROUTEROS_API,
      username: 'arofi-sync',
      passwordCiphertext: encryptSeedValue('router-api-pass'),
      sharedSecretCiphertext: encryptSeedValue('radius-secret'),
      siteLabel: 'City Centre Arcade',
      model: 'CCR2004-1G-12S+2XS',
      serialNumber: 'ARO-CITY-001',
      routerOsVersion: '7.18.2',
      status: RouterStatus.HEALTHY,
      healthMessage: 'RouterOS API reachable and sending AAA traffic',
      lastSeenAt: new Date('2026-04-07T07:25:00.000Z'),
      lastHealthCheckAt: new Date('2026-04-07T07:25:00.000Z'),
      lastLatencyMs: 38,
      activeSessionCount: 1,
      lastProvisionedAt: new Date('2026-04-06T08:15:00.000Z'),
      tags: ['metro', 'mikrotik', 'radius'],
      radiusClient: {
        create: {
          tenantId: vendorTenant.id,
          shortName: 'city-centre-gateway',
          ipAddress: '10.10.0.1',
          secretCiphertext: encryptSeedValue('radius-secret'),
        },
      },
    },
  })

  const branchRouter = await prisma.router.create({
    data: {
      tenantId: vendorTenant.id,
      groupId: branchEdgeGroup.id,
      hotspotId: nakawaHotspot.id,
      name: 'Nakawa Edge',
      identity: 'nakawa-edge-rtr02',
      host: '10.10.0.2',
      apiPort: 8728,
      connectionMode: RouterConnectionMode.ROUTEROS_API,
      username: 'arofi-sync',
      passwordCiphertext: encryptSeedValue('router-edge-pass'),
      sharedSecretCiphertext: encryptSeedValue('radius-secret'),
      siteLabel: 'Nakawa Lounge',
      model: 'hEX S',
      serialNumber: 'ARO-NAKAWA-002',
      routerOsVersion: '7.16.4',
      status: RouterStatus.OFFLINE,
      healthMessage: 'Router has not checked in since the last branch outage.',
      lastSeenAt: new Date('2026-04-06T18:12:00.000Z'),
      lastHealthCheckAt: new Date('2026-04-07T07:10:00.000Z'),
      lastLatencyMs: 412,
      activeSessionCount: 0,
      lastProvisionedAt: new Date('2026-04-05T14:30:00.000Z'),
      tags: ['branch', 'mikrotik'],
      radiusClient: {
        create: {
          tenantId: vendorTenant.id,
          shortName: 'nakawa-edge',
          ipAddress: '10.10.0.2',
          secretCiphertext: encryptSeedValue('radius-secret'),
        },
      },
    },
  })

  await prisma.routerHealthCheck.createMany({
    data: [
      {
        tenantId: vendorTenant.id,
        routerId: cityRouter.id,
        status: RouterStatus.HEALTHY,
        latencyMs: 38,
        message: 'RouterOS API endpoint reachable',
        activeUsers: 1,
        checkedAt: new Date('2026-04-07T07:25:00.000Z'),
      },
      {
        tenantId: vendorTenant.id,
        routerId: branchRouter.id,
        status: RouterStatus.OFFLINE,
        latencyMs: 412,
        message: 'Timed out after 4000ms while connecting to RouterOS API',
        activeUsers: 0,
        checkedAt: new Date('2026-04-07T07:10:00.000Z'),
      },
    ],
  })

  const batch = await prisma.voucherBatch.create({
    data: {
      tenantId: vendorTenant.id,
      packageId: hourlyPackage.id,
      generatedByUserId: vendorAdminUser.id,
      batchNumber: 'BATCH-HR1-APR-2026',
      prefix: 'HR1APR',
      quantity: 5,
      faceValueUgx: 1000,
      status: VoucherBatchStatus.ACTIVE,
      notes: 'Launch batch for counter sales.',
    },
  })

  const vouchers = await Promise.all(
    Array.from({ length: 5 }).map((_, index) =>
      prisma.voucher.create({
        data: {
          tenantId: vendorTenant.id,
          batchId: batch.id,
          packageId: hourlyPackage.id,
          code: `HR1APR-${(index + 1).toString().padStart(4, '0')}`,
          serialNumber: `SN-HR1APR-${(index + 1).toString().padStart(4, '0')}`,
          faceValueUgx: 1000,
          expiresAt: new Date('2026-12-31T23:59:59.000Z'),
        },
      }),
    ),
  )

  await createWalletAdjustment(
    vendorTenant.id,
    tenantWallet.id,
    25000,
    'Opening float loaded for voucher operations',
  )

  await createSeedSaleTransaction({
    tenantId: vendorTenant.id,
    walletId: tenantWallet.id,
    packageId: dailyPackage.id,
    type: BillingTransactionType.MOBILE_MONEY_SALE,
    channel: BillingChannel.MOBILE_MONEY,
    grossAmountUgx: 5000,
    feeAmountUgx: 400,
    description: 'Yo! Uganda mobile money sale for 24-hour package',
    customerReference: '+256700111222',
    externalReference: 'YO-APR-2026-0001',
    paymentProvider: 'Yo! Uganda',
    metadata: { network: 'MTN', packageCode: dailyPackage.code },
  })

  await createSeedSaleTransaction({
    tenantId: vendorTenant.id,
    walletId: tenantWallet.id,
    packageId: hourlyPackage.id,
    voucherId: vouchers[0].id,
    type: BillingTransactionType.VOUCHER_SALE,
    channel: BillingChannel.VOUCHER,
    grossAmountUgx: 1000,
    feeAmountUgx: 20,
    description: 'Counter sale of hourly hotspot voucher',
    customerReference: 'Walk-in customer',
    externalReference: 'VOUCHER-SALE-0001',
    metadata: { batchNumber: batch.batchNumber, soldBy: vendorAdminUser.email },
  })

  await prisma.voucher.update({
    where: { id: vouchers[0].id },
    data: {
      status: VoucherStatus.REDEEMED,
      soldAt: new Date('2026-04-05T08:30:00.000Z'),
      redeemedAt: new Date('2026-04-05T09:10:00.000Z'),
      soldToReference: 'Walk-in customer',
      customerReference: '+256772123456',
    },
  })

  const redemption = await prisma.voucherRedemption.create({
    data: {
      tenantId: vendorTenant.id,
      voucherId: vouchers[0].id,
      packageId: hourlyPackage.id,
      redeemedByUserId: financeUser.id,
      hotspotId: cityCentreHotspot.id,
      customerReference: '+256772123456',
      sessionReference: 'SESSION-APR-0001',
    },
  })

  await prisma.billingTransaction.create({
    data: {
      tenantId: vendorTenant.id,
      walletId: tenantWallet.id,
      packageId: hourlyPackage.id,
      voucherId: vouchers[0].id,
      channel: BillingChannel.VOUCHER,
      type: BillingTransactionType.VOUCHER_REDEMPTION,
      status: BillingTransactionStatus.COMPLETED,
      grossAmountUgx: 0,
      feeAmountUgx: 0,
      netAmountUgx: 0,
      customerReference: '+256772123456',
      externalReference: 'VOUCHER-REDEEM-0001',
      metadata: { hotspot: cityCentreHotspot.name, sessionReference: 'SESSION-APR-0001' },
    },
  })

  const voucherActivation = await prisma.packageActivation.create({
    data: {
      tenantId: vendorTenant.id,
      packageId: hourlyPackage.id,
      voucherRedemptionId: redemption.id,
      hotspotId: cityCentreHotspot.id,
      source: PackageActivationSource.VOUCHER,
      status: PackageActivationStatus.ACTIVE,
      customerReference: '+256772123456',
      accessPhoneNumber: '256772123456',
      durationMinutes: hourlyPackage.durationMinutes,
      dataLimitMb: hourlyPackage.dataLimitMb,
      deviceLimit: hourlyPackage.deviceLimit,
      downloadSpeedKbps: hourlyPackage.downloadSpeedKbps,
      uploadSpeedKbps: hourlyPackage.uploadSpeedKbps,
      startedAt: new Date('2026-04-07T07:05:00.000Z'),
      endsAt: new Date('2026-04-07T08:05:00.000Z'),
      metadata: {
        voucherCode: vouchers[0].code,
        sessionReference: 'SESSION-APR-0001',
      } as Prisma.InputJsonValue,
    },
  })

  await createSeedSaleTransaction({
    tenantId: vendorTenant.id,
    walletId: tenantWallet.id,
    packageId: hourlyPackage.id,
    voucherId: vouchers[1].id,
    type: BillingTransactionType.VOUCHER_SALE,
    channel: BillingChannel.VOUCHER,
    grossAmountUgx: 1000,
    feeAmountUgx: 20,
    description: 'Agent sale of hourly hotspot voucher',
    customerReference: 'Agent counter',
    externalReference: 'VOUCHER-SALE-0002',
    metadata: { batchNumber: batch.batchNumber, soldBy: vendorAdminUser.email },
  })

  await prisma.voucher.update({
    where: { id: vouchers[1].id },
    data: {
      status: VoucherStatus.SOLD,
      soldAt: new Date('2026-04-06T11:20:00.000Z'),
      soldToReference: 'Agent counter',
    },
  })

  await prisma.networkSession.createMany({
    data: [
      {
        tenantId: vendorTenant.id,
        routerId: cityRouter.id,
        hotspotId: cityCentreHotspot.id,
        activationId: voucherActivation.id,
        voucherRedemptionId: redemption.id,
        radiusSessionId: 'SESSION-APR-0001',
        status: SessionStatus.ACTIVE,
        username: vouchers[0].code,
        customerReference: '+256772123456',
        phoneNumber: '256772123456',
        macAddress: '84:7B:57:11:22:33',
        ipAddress: '172.16.10.21',
        nasIpAddress: cityCentreHotspot.nasIpAddress,
        packageName: hourlyPackage.name,
        startedAt: new Date('2026-04-07T07:05:00.000Z'),
        sessionTimeSeconds: 1800,
        inputOctets: BigInt(73400320),
        outputOctets: BigInt(36700160),
        lastAccountingAt: new Date('2026-04-07T07:35:00.000Z'),
      },
      {
        tenantId: vendorTenant.id,
        routerId: branchRouter.id,
        hotspotId: nakawaHotspot.id,
        radiusSessionId: 'SESSION-APR-0002',
        status: SessionStatus.CLOSED,
        username: '256700111222',
        customerReference: '+256700111222',
        phoneNumber: '256700111222',
        macAddress: '48:A9:8A:44:55:66',
        ipAddress: '172.16.11.40',
        nasIpAddress: nakawaHotspot.nasIpAddress,
        packageName: dailyPackage.name,
        startedAt: new Date('2026-04-07T05:10:00.000Z'),
        endedAt: new Date('2026-04-07T05:54:00.000Z'),
        sessionTimeSeconds: 2640,
        inputOctets: BigInt(188743680),
        outputOctets: BigInt(62914560),
        lastAccountingAt: new Date('2026-04-07T05:54:00.000Z'),
      },
    ],
  })

  await prisma.radiusEvent.createMany({
    data: [
      {
        tenantId: vendorTenant.id,
        routerId: cityRouter.id,
        hotspotId: cityCentreHotspot.id,
        eventType: RadiusEventType.ACCESS_ACCEPT,
        username: vouchers[0].code,
        customerReference: '+256772123456',
        phoneNumber: '256772123456',
        macAddress: '84:7B:57:11:22:33',
        ipAddress: '172.16.10.21',
        nasIpAddress: cityCentreHotspot.nasIpAddress,
        authMethod: 'VOUCHER',
        responseCode: 'Access-Accept',
        message: 'Voucher access granted',
        payload: {
          plan: hourlyPackage.code,
          hotspot: cityCentreHotspot.name,
        } as Prisma.InputJsonValue,
        createdAt: new Date('2026-04-07T07:05:00.000Z'),
      },
      {
        tenantId: vendorTenant.id,
        routerId: cityRouter.id,
        hotspotId: cityCentreHotspot.id,
        eventType: RadiusEventType.ACCOUNTING_INTERIM,
        username: vouchers[0].code,
        customerReference: '+256772123456',
        phoneNumber: '256772123456',
        macAddress: '84:7B:57:11:22:33',
        ipAddress: '172.16.10.21',
        nasIpAddress: cityCentreHotspot.nasIpAddress,
        authMethod: 'VOUCHER',
        responseCode: 'Interim-Update',
        message: 'Interim usage update received',
        payload: {
          inputOctets: '73400320',
          outputOctets: '36700160',
        } as Prisma.InputJsonValue,
        createdAt: new Date('2026-04-07T07:35:00.000Z'),
      },
      {
        tenantId: vendorTenant.id,
        routerId: branchRouter.id,
        hotspotId: nakawaHotspot.id,
        eventType: RadiusEventType.ACCESS_REJECT,
        username: 'unknown-client',
        customerReference: 'Walk-in unknown user',
        macAddress: '90:AA:BB:CC:DD:EE',
        ipAddress: '172.16.11.99',
        nasIpAddress: nakawaHotspot.nasIpAddress,
        authMethod: 'UNKNOWN',
        responseCode: 'Access-Reject',
        message: 'No active package activation found',
        payload: {
          hotspot: nakawaHotspot.name,
        } as Prisma.InputJsonValue,
        createdAt: new Date('2026-04-07T06:42:00.000Z'),
      },
      {
        tenantId: vendorTenant.id,
        routerId: branchRouter.id,
        hotspotId: nakawaHotspot.id,
        eventType: RadiusEventType.ACCOUNTING_STOP,
        username: '256700111222',
        customerReference: '+256700111222',
        phoneNumber: '256700111222',
        macAddress: '48:A9:8A:44:55:66',
        ipAddress: '172.16.11.40',
        nasIpAddress: nakawaHotspot.nasIpAddress,
        authMethod: 'MOBILE_MONEY',
        responseCode: 'Accounting-Stop',
        message: 'Session closed cleanly',
        payload: {
          inputOctets: '188743680',
          outputOctets: '62914560',
        } as Prisma.InputJsonValue,
        createdAt: new Date('2026-04-07T05:54:00.000Z'),
      },
    ],
  })

  await prisma.voucher.update({
    where: { id: vouchers[2].id },
    data: {
      status: VoucherStatus.GENERATED,
    },
  })

  await prisma.voucherBatch.update({
    where: { id: batch.id },
    data: {
      status: VoucherBatchStatus.ACTIVE,
    },
  })

  console.log('Seed complete', {
    superAdminUserId: superAdminUser.id,
    vendorAdminUserId: vendorAdminUser.id,
    vendorTenantId: vendorTenant.id,
    walletId: tenantWallet.id,
    packages: [hourlyPackage.code, dailyPackage.code, weekendPackage.code],
    voucherBatch: batch.batchNumber,
    routers: [cityRouter.name, branchRouter.name],
  })
}

main()
  .catch((error) => {
    console.error(error)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
