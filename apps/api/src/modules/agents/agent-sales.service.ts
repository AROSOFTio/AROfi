import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  OnModuleDestroy,
  ServiceUnavailableException,
} from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import {
  AgentStatus,
  BillingChannel,
  BillingTransactionStatus,
  BillingTransactionType,
  CommissionStatus,
  PackageActivationSource,
  PackageStatus,
  PaymentNetwork,
  PaymentProvider,
  PaymentStatus,
  Prisma,
  SettlementStatus,
  VoucherBatchStatus,
  VoucherStatus,
  WalletOwnerType,
} from '@prisma/client'
import { randomBytes, randomInt, randomUUID } from 'crypto'
import { RedisProtocolClient } from '../../common/cache/redis-protocol.client'
import { PrismaService } from '../../prisma.service'
import { BillingService } from '../billing/billing.service'
import { FeeEngineService } from '../billing/fee-engine.service'
import { PLATFORM_SETTINGS_ID } from '../billing/billing.constants'
import { PackageActivationService } from '../payments/package-activation.service'
import { PaymentRouterService } from '../payments/payment-router.service'
import { PhoneNumberService } from '../payments/phone-number.service'
import { mapRawStatusToPaymentStatus } from '../payments/payment-provider.interface'
import type {
  AgentCashSaleDto,
  AgentFulfillmentMode,
  AgentMobileMoneySaleDto,
  CreateAgentActivationClaimDto,
  RecordAgentCashSettlementDto,
  UpdateAgentSalesPolicyDto,
} from './dto/agent-sales.dto'

const CLAIM_TTL_SECONDS = 10 * 60
const PAYMENT_TTL_SECONDS = 24 * 60 * 60
const POLICY_MARKER = '[[AROFI_AGENT_SALES_POLICY]]'
const CASH_SETTLEMENT_MARKER = 'AGENT_CASH_REMITTANCE'

type AgentSalesPolicy = {
  cashEnabled: boolean
  mobileMoneyEnabled: boolean
  allowedPackageIds: string[]
}

type ClaimState = {
  code: string
  token: string
  tenantId: string
  tenantName: string
  routerId: string
  macAddress: string
  clientIp?: string
  loginUrl: string
  hotspotServerName?: string
  status: 'WAITING' | 'PAYMENT_PENDING' | 'FULFILLED' | 'FAILED'
  paymentId?: string
  activationId?: string
  failureMessage?: string
  createdAt: string
  expiresAt: string
}

type AgentPaymentState = {
  id: string
  tenantId: string
  agentId: string
  packageId: string
  customerPhoneNumber: string
  payingPhoneNumber: string
  fulfillment: AgentFulfillmentMode
  claimCode?: string
  network: PaymentNetwork
  provider: string
  providerReference: string
  externalReference: string
  amountUgx: number
  status: PaymentStatus
  statusMessage?: string
  voucherCode?: string
  activationId?: string
  createdAt: string
  updatedAt: string
}

type JsonRecord = Record<string, unknown>

@Injectable()
export class AgentSalesService implements OnModuleDestroy {
  private readonly redis?: RedisProtocolClient
  private readonly memory = new Map<string, { value: string; expiresAt: number }>()
  private readonly finalizingPayments = new Map<string, Promise<AgentPaymentState>>()

  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
    private readonly billingService: BillingService,
    private readonly feeEngineService: FeeEngineService,
    private readonly paymentRouterService: PaymentRouterService,
    private readonly phoneNumberService: PhoneNumberService,
    private readonly packageActivationService: PackageActivationService,
  ) {
    const redisUrl = this.configService.get<string>('REDIS_URL')?.trim()
    if (redisUrl) {
      try {
        this.redis = new RedisProtocolClient(redisUrl, 1200)
      } catch {
        // Claims/payments fall back to the local process. The module remains
        // usable in development even when Redis is not configured.
      }
    }
  }

  onModuleDestroy() {
    this.redis?.disconnect()
  }

  async createClaim(dto: CreateAgentActivationClaimDto) {
    const macAddress = this.normalizeMac(dto.macAddress)
    if (!macAddress) {
      throw new BadRequestException('Open this from the WiFi captive portal so AROFi can identify this device safely.')
    }
    if (!dto.loginUrl?.trim()) {
      throw new BadRequestException('The router login address is missing. Reopen the WiFi sign-in page and try again.')
    }

    const router = dto.routerKey
      ? await this.prisma.router.findUnique({
          where: { registrationKey: dto.routerKey },
          include: { tenant: { select: { id: true, name: true, domain: true } } },
        })
      : dto.routerId
        ? await this.prisma.router.findUnique({
            where: { id: dto.routerId },
            include: { tenant: { select: { id: true, name: true, domain: true } } },
          })
        : null

    if (!router) {
      throw new NotFoundException('The WiFi router could not be verified. Reopen the captive portal and try again.')
    }
    if (dto.routerId && dto.routerId !== router.id) {
      throw new BadRequestException('Router ID does not match the verified WiFi router.')
    }
    if (dto.tenantDomain && router.tenant.domain && dto.tenantDomain !== router.tenant.domain) {
      throw new BadRequestException('This WiFi portal does not match the verified router business.')
    }

    const code = await this.generateClaimCode()
    const token = randomBytes(32).toString('base64url')
    const now = new Date()
    const claim: ClaimState = {
      code,
      token,
      tenantId: router.tenant.id,
      tenantName: router.tenant.name,
      routerId: router.id,
      macAddress,
      clientIp: dto.clientIp?.trim() || undefined,
      loginUrl: dto.loginUrl.trim(),
      hotspotServerName: dto.hotspotServerName?.trim() || undefined,
      status: 'WAITING',
      createdAt: now.toISOString(),
      expiresAt: new Date(now.getTime() + CLAIM_TTL_SECONDS * 1000).toISOString(),
    }
    await this.saveClaim(claim)

    return {
      code,
      token,
      expiresAt: claim.expiresAt,
      businessName: claim.tenantName,
      message: 'Give this 6-digit code to the agent. The code only identifies this waiting device; it does not grant internet access.',
    }
  }

  async getClaimStatus(token: string) {
    if (!token?.trim()) throw new BadRequestException('Claim token is required')
    let claim = await this.readJson<ClaimState>(this.claimTokenKey(token.trim()))
    if (!claim) {
      return { status: 'EXPIRED' as const, message: 'This agent activation request has expired. Request a new code.' }
    }

    if (claim.paymentId && claim.status === 'PAYMENT_PENDING') {
      try {
        await this.checkMobileMoneyPaymentById(claim.paymentId)
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Payment status could not be checked.'
        if (!/pending|waiting|provider|connection/i.test(message)) {
          claim = { ...claim, failureMessage: message }
          await this.saveClaim(claim)
        }
      }
      claim = (await this.readJson<ClaimState>(this.claimTokenKey(token.trim()))) ?? claim
    }

    if (claim.status === 'FULFILLED' && claim.activationId) {
      const activation = await this.prisma.packageActivation.findUnique({
        where: { id: claim.activationId },
        include: { radiusCredential: true, package: { select: { name: true } } },
      })
      const username = activation?.radiusCredential?.username ?? activation?.radiusUsername
      const password = activation?.radiusCredential?.password ?? activation?.radiusPassword
      if (activation && username && password) {
        return {
          status: 'FULFILLED' as const,
          message: 'Internet access is ready. Connecting this device now.',
          packageName: activation.package.name,
          reconnect: {
            loginUrl: claim.loginUrl,
            username,
            password,
          },
        }
      }
    }

    return {
      status: claim.status,
      message:
        claim.status === 'PAYMENT_PENDING'
          ? 'Waiting for Mobile Money approval on the paying phone.'
          : claim.status === 'FAILED'
            ? claim.failureMessage ?? 'The sale could not be completed.'
            : 'Waiting for the agent to complete the sale.',
      expiresAt: claim.expiresAt,
    }
  }

  async getMyDashboard(email: string, tenantId: string) {
    const agent = await this.requireAgentForUser(email, tenantId, false)
    const [transactions, commissions, voucherBatches, cashOutstandingUgx] = await Promise.all([
      this.prisma.billingTransaction.findMany({
        where: {
          tenantId,
          agentId: agent.id,
          status: BillingTransactionStatus.COMPLETED,
          type: { in: [BillingTransactionType.VOUCHER_SALE, BillingTransactionType.MOBILE_MONEY_SALE] },
        },
        include: {
          package: { select: { id: true, name: true, code: true } },
          voucher: { select: { id: true, code: true, status: true } },
          sourceCommission: { select: { amountUgx: true, status: true } },
        },
        orderBy: { createdAt: 'desc' },
        take: 100,
      }),
      this.prisma.agentCommission.findMany({
        where: { tenantId, agentId: agent.id, status: { not: CommissionStatus.REVERSED } },
        select: { amountUgx: true, createdAt: true, status: true },
      }),
      this.prisma.voucherBatch.findMany({
        where: { tenantId, agentId: agent.id },
        include: { vouchers: { select: { status: true } } },
        orderBy: { createdAt: 'desc' },
        take: 100,
      }),
      this.calculateCashOutstanding(agent.id, tenantId),
    ])

    const startOfToday = new Date()
    startOfToday.setHours(0, 0, 0, 0)
    const todayTransactions = transactions.filter((item) => item.createdAt >= startOfToday)
    const todayCommissions = commissions.filter((item) => item.createdAt >= startOfToday)
    const availableOfflineVouchers = voucherBatches.reduce(
      (total, batch) => total + batch.vouchers.filter((voucher) => (voucher.status === VoucherStatus.GENERATED || voucher.status === VoucherStatus.PRINTED)).length,
      0,
    )

    return {
      agent: {
        id: agent.id,
        code: agent.code,
        name: agent.name,
        email: agent.email,
        phoneNumber: agent.phoneNumber,
        status: agent.status,
        commissionRateBps: agent.commissionRateBps,
        cashLimitUgx: agent.floatLimitUgx,
        policy: this.readPolicy(agent.notes).policy,
      },
      summary: {
        todaySalesUgx: todayTransactions.reduce((sum, item) => sum + item.grossAmountUgx, 0),
        todayCommissionUgx: todayCommissions.reduce((sum, item) => sum + item.amountUgx, 0),
        totalCommissionUgx: commissions.reduce((sum, item) => sum + item.amountUgx, 0),
        cashToRemitUgx: cashOutstandingUgx,
        cashRemainingBeforeLimitUgx:
          agent.floatLimitUgx > 0 ? Math.max(0, agent.floatLimitUgx - cashOutstandingUgx) : null,
        availableOfflineVouchers,
      },
      recentSales: transactions.slice(0, 20).map((item) => ({
        id: item.id,
        amountUgx: item.grossAmountUgx,
        customerReference: item.customerReference,
        packageName: item.package?.name ?? 'Internet package',
        voucherCode: item.voucher?.code ?? null,
        paymentMethod: item.channel === BillingChannel.MOBILE_MONEY ? 'MOBILE_MONEY' : 'CASH',
        fulfillment: this.readMetadataString(item.metadata, 'fulfillment') ?? (item.voucher ? 'VOUCHER_LATER' : 'ACTIVATE_NOW'),
        commissionUgx: item.sourceCommission?.amountUgx ?? 0,
        createdAt: item.createdAt,
      })),
    }
  }

  async getOverview(tenantId?: string) {
    const agents = await this.prisma.agent.findMany({
      where: tenantId ? { tenantId } : undefined,
      include: { tenant: { select: { id: true, name: true } } },
      orderBy: { createdAt: 'desc' },
      take: 500,
    })
    const ids = agents.map((agent) => agent.id)
    if (ids.length === 0) {
      return { summary: { activeAgents: 0, totalSalesUgx: 0, totalCommissionUgx: 0, cashToCollectUgx: 0, mobileMoneySalesUgx: 0 }, agents: [] }
    }

    const [transactions, commissions, settlements, batches] = await Promise.all([
      this.prisma.billingTransaction.findMany({
        where: {
          agentId: { in: ids },
          status: BillingTransactionStatus.COMPLETED,
          type: { in: [BillingTransactionType.VOUCHER_SALE, BillingTransactionType.MOBILE_MONEY_SALE] },
        },
        include: { sourceCommission: { select: { amountUgx: true } } },
      }),
      this.prisma.agentCommission.findMany({
        where: { agentId: { in: ids }, status: { not: CommissionStatus.REVERSED } },
        select: { agentId: true, amountUgx: true },
      }),
      this.prisma.settlement.findMany({
        where: {
          agentId: { in: ids },
          status: SettlementStatus.COMPLETED,
          notes: { startsWith: CASH_SETTLEMENT_MARKER },
        },
        select: { agentId: true, payableAmountUgx: true },
      }),
      this.prisma.voucherBatch.findMany({
        where: { agentId: { in: ids } },
        include: { vouchers: { select: { status: true } } },
      }),
    ])

    const result = agents.map((agent) => {
      const sales = transactions.filter((item) => item.agentId === agent.id)
      const agentCommissions = commissions.filter((item) => item.agentId === agent.id)
      const remitted = settlements.filter((item) => item.agentId === agent.id).reduce((sum, item) => sum + item.payableAmountUgx, 0)
      const cashLiability = sales
        .filter((item) => item.channel === BillingChannel.VOUCHER)
        .reduce((sum, item) => sum + Math.max(0, item.grossAmountUgx - (item.sourceCommission?.amountUgx ?? 0)), 0)
      const stock = batches
        .filter((batch) => batch.agentId === agent.id)
        .reduce((sum, batch) => sum + batch.vouchers.filter((voucher) => (voucher.status === VoucherStatus.GENERATED || voucher.status === VoucherStatus.PRINTED)).length, 0)
      const mobileMoneySalesUgx = sales
        .filter((item) => item.channel === BillingChannel.MOBILE_MONEY)
        .reduce((sum, item) => sum + item.grossAmountUgx, 0)

      return {
        id: agent.id,
        code: agent.code,
        name: agent.name,
        phoneNumber: agent.phoneNumber,
        email: agent.email,
        type: agent.type,
        status: agent.status,
        territory: agent.territory,
        commissionRateBps: agent.commissionRateBps,
        cashLimitUgx: agent.floatLimitUgx,
        notes: this.readPolicy(agent.notes).humanNotes,
        tenant: agent.tenant,
        policy: this.readPolicy(agent.notes).policy,
        totalSalesUgx: sales.reduce((sum, item) => sum + item.grossAmountUgx, 0),
        mobileMoneySalesUgx,
        cashSalesUgx: sales.filter((item) => item.channel === BillingChannel.VOUCHER).reduce((sum, item) => sum + item.grossAmountUgx, 0),
        commissionUgx: agentCommissions.reduce((sum, item) => sum + item.amountUgx, 0),
        cashToCollectUgx: Math.max(0, cashLiability - remitted),
        availableVoucherStock: stock,
        loginReady: Boolean(agent.email),
      }
    })

    return {
      summary: {
        activeAgents: agents.filter((agent) => agent.status === AgentStatus.ACTIVE).length,
        totalSalesUgx: result.reduce((sum, item) => sum + item.totalSalesUgx, 0),
        mobileMoneySalesUgx: result.reduce((sum, item) => sum + item.mobileMoneySalesUgx, 0),
        totalCommissionUgx: result.reduce((sum, item) => sum + item.commissionUgx, 0),
        cashToCollectUgx: result.reduce((sum, item) => sum + item.cashToCollectUgx, 0),
      },
      agents: result,
    }
  }

  async recordCashSale(email: string, tenantId: string, dto: AgentCashSaleDto) {
    const agent = await this.requireAgentForUser(email, tenantId, true)
    const policy = this.readPolicy(agent.notes).policy
    if (!policy.cashEnabled) throw new ForbiddenException('Cash selling is disabled for this agent.')

    const pkg = await this.requireSellablePackage(tenantId, dto.packageId, policy)
    const customerPhoneNumber = this.phoneNumberService.normalize(dto.customerPhoneNumber)
    const amountUgx = pkg.prices[0].amountUgx
    const commissionUgx = Math.floor((amountUgx * agent.commissionRateBps) / 10000)
    const cashLiabilityUgx = Math.max(0, amountUgx - commissionUgx)
    const currentOutstanding = await this.calculateCashOutstanding(agent.id, tenantId)
    if (agent.floatLimitUgx > 0 && currentOutstanding + cashLiabilityUgx > agent.floatLimitUgx) {
      throw new BadRequestException(
        `Cash sales are paused because this sale would exceed the unsettled cash limit of UGX ${agent.floatLimitUgx.toLocaleString('en-UG')}. Mobile Money sales are still available.`,
      )
    }

    const claim = dto.fulfillment === 'ACTIVATE_NOW'
      ? await this.requireClaim(dto.claimCode, tenantId)
      : null
    const externalReference = `AGENT-CASH-${Date.now()}-${randomUUID().slice(0, 8).toUpperCase()}`

    const saleResult = await this.prisma.$transaction(async (tx) => {
      const breakdown = await this.feeEngineService.calculateBreakdown(BillingChannel.VOUCHER, amountUgx, tenantId, tx)
      const sale = await tx.billingTransaction.create({
        data: {
          tenantId,
          agentId: agent.id,
          packageId: pkg.id,
          channel: BillingChannel.VOUCHER,
          type: BillingTransactionType.VOUCHER_SALE,
          status: BillingTransactionStatus.COMPLETED,
          grossAmountUgx: breakdown.grossAmountUgx,
          feeAmountUgx: breakdown.feeAmountUgx,
          netAmountUgx: breakdown.netAmountUgx,
          feeBasisPoints: breakdown.feeBasisPoints,
          feeSource: breakdown.feeSource,
          customerReference: customerPhoneNumber,
          externalReference,
          paymentProvider: 'AGENT_CASH',
          metadata: {
            agentHybridSale: true,
            paymentMethod: 'CASH',
            fulfillment: dto.fulfillment,
            agentCommissionUgx: commissionUgx,
            cashLiabilityUgx,
            claimCode: claim?.code,
          } as Prisma.InputJsonValue,
        },
      })

      await tx.agentCommission.create({
        data: {
          tenantId,
          agentId: agent.id,
          sourceTransactionId: sale.id,
          status: CommissionStatus.SETTLED,
          basisAmountUgx: amountUgx,
          rateBps: agent.commissionRateBps,
          amountUgx: commissionUgx,
        },
      })

      if (breakdown.feeAmountUgx > 0) {
        let wallet = await tx.wallet.findFirst({
          where: { tenantId, ownerType: WalletOwnerType.TENANT, ownerReference: tenantId },
        })
        if (!wallet) {
          wallet = await tx.wallet.create({
            data: {
              tenantId,
              ownerType: WalletOwnerType.TENANT,
              ownerReference: tenantId,
              balanceUgx: 0,
              earnedBalanceUgx: 0,
            },
          })
        }
        await tx.wallet.update({
          where: { id: wallet.id },
          data: {
            balanceUgx: { decrement: breakdown.feeAmountUgx },
            earnedBalanceUgx: { decrement: breakdown.feeAmountUgx },
          },
        })
        await tx.platformSetting.update({
          where: { id: PLATFORM_SETTINGS_ID },
          data: { platformWalletBalanceUgx: { increment: breakdown.feeAmountUgx } },
        })
      }

      let activationId: string | undefined
      if (claim) {
        await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${externalReference}))`
        const activation = await this.packageActivationService.activateInTransaction(tx, {
          tenantId,
          packageId: pkg.id,
          source: PackageActivationSource.VOUCHER,
          customerReference: customerPhoneNumber,
          accessPhoneNumber: customerPhoneNumber,
          durationMinutes: pkg.durationMinutes,
          dataLimitMb: pkg.dataLimitMb,
          deviceLimit: pkg.deviceLimit,
          downloadSpeedKbps: pkg.downloadSpeedKbps,
          uploadSpeedKbps: pkg.uploadSpeedKbps,
          boundMacAddress: claim.macAddress,
          firstSeenIp: claim.clientIp,
          routerId: claim.routerId,
          hotspotServerName: claim.hotspotServerName,
          metadata: {
            agentSale: true,
            paymentMethod: 'CASH',
            agentId: agent.id,
            claimCode: claim.code,
            billingExternalReference: externalReference,
          } as Prisma.InputJsonValue,
        })
        activationId = activation.id
      }

      return { sale, activationId }
    })

    let voucherCode: string | undefined
    if (dto.fulfillment === 'VOUCHER_LATER') {
      const voucher = await this.ensureOnlineVoucherForSale(saleResult.sale.id, agent.id, pkg.id, amountUgx, customerPhoneNumber)
      voucherCode = voucher.code
    }

    if (claim && saleResult.activationId) {
      await this.saveClaim({ ...claim, status: 'FULFILLED', activationId: saleResult.activationId })
    }

    return {
      status: 'COMPLETED',
      saleId: saleResult.sale.id,
      amountUgx,
      commissionUgx,
      cashToRemitUgx: cashLiabilityUgx,
      voucherCode,
      activationId: saleResult.activationId,
      message: dto.fulfillment === 'ACTIVATE_NOW'
        ? 'Cash received. The customer device has been activated and will connect from its captive window.'
        : 'Cash received. The voucher has been generated for later use.',
    }
  }

  async initiateMobileMoneySale(email: string, tenantId: string, dto: AgentMobileMoneySaleDto) {
    const agent = await this.requireAgentForUser(email, tenantId, true)
    const policy = this.readPolicy(agent.notes).policy
    if (!policy.mobileMoneyEnabled) throw new ForbiddenException('Mobile Money selling is disabled for this agent.')

    const pkg = await this.requireSellablePackage(tenantId, dto.packageId, policy)
    const customerPhoneNumber = this.phoneNumberService.normalize(dto.customerPhoneNumber)
    const network = dto.network ?? this.phoneNumberService.resolveNetwork(dto.payingPhoneNumber)
    if (network !== PaymentNetwork.MTN && network !== PaymentNetwork.AIRTEL) {
      throw new BadRequestException('Choose MTN or Airtel Mobile Money.')
    }
    const payingPhoneNumber = this.phoneNumberService.normalizeForNetwork(dto.payingPhoneNumber, network)
    const claim = dto.fulfillment === 'ACTIVATE_NOW'
      ? await this.requireClaim(dto.claimCode, tenantId)
      : null

    const paymentId = randomUUID()
    const externalReference = `AROFI-AGENT-MM-${Date.now()}-${paymentId.slice(0, 8).toUpperCase()}`
    const amountUgx = pkg.prices[0].amountUgx
    const provider = this.paymentRouterService.providerFor(network, 'COLLECTION')
    const collection = this.paymentRouterService.resolveCollection(network, provider)
    const gateway = await collection.collectPayment({
      amountUgx,
      currency: 'UGX',
      phoneNumber: payingPhoneNumber,
      externalReference,
      customerReference: customerPhoneNumber,
      narrative: `AROFi agent sale - ${pkg.name}`,
      network,
    })
    const providerReference =
      gateway.transactionReference ?? gateway.orderTrackingId ?? gateway.merchantReference ?? gateway.mnoTransactionReferenceId ?? externalReference
    const initialStatus = this.mapProviderResultStatus(gateway.transactionStatus, gateway.status)
    const now = new Date().toISOString()
    let state: AgentPaymentState = {
      id: paymentId,
      tenantId,
      agentId: agent.id,
      packageId: pkg.id,
      customerPhoneNumber,
      payingPhoneNumber,
      fulfillment: dto.fulfillment,
      claimCode: claim?.code,
      network,
      provider: String(collection.provider),
      providerReference,
      externalReference,
      amountUgx,
      status: initialStatus,
      statusMessage: gateway.statusMessage ?? gateway.errorMessage,
      createdAt: now,
      updatedAt: now,
    }
    await this.savePayment(state)

    if (claim) {
      await this.saveClaim({ ...claim, status: 'PAYMENT_PENDING', paymentId })
    }

    if (initialStatus === PaymentStatus.COMPLETED) {
      state = await this.finalizeMobileMoneyPayment(state)
    }

    return this.publicPaymentState(state)
  }

  async checkMyMobileMoneyPayment(email: string, tenantId: string, paymentId: string) {
    const agent = await this.requireAgentForUser(email, tenantId, false)
    const state = await this.requirePayment(paymentId)
    if (state.tenantId !== tenantId || state.agentId !== agent.id) {
      throw new NotFoundException('Agent payment was not found.')
    }
    return this.publicPaymentState(await this.checkMobileMoneyPaymentById(paymentId))
  }

  async updatePolicy(agentId: string, scopedTenantId: string | undefined, dto: UpdateAgentSalesPolicyDto) {
    const agent = await this.prisma.agent.findFirst({
      where: { id: agentId, ...(scopedTenantId ? { tenantId: scopedTenantId } : {}) },
    })
    if (!agent) throw new NotFoundException('Agent not found')

    const parsed = this.readPolicy(agent.notes)
    const policy: AgentSalesPolicy = {
      cashEnabled: dto.cashEnabled ?? parsed.policy.cashEnabled,
      mobileMoneyEnabled: dto.mobileMoneyEnabled ?? parsed.policy.mobileMoneyEnabled,
      allowedPackageIds: dto.allowedPackageIds ?? parsed.policy.allowedPackageIds,
    }

    if (policy.allowedPackageIds.length > 0) {
      const count = await this.prisma.package.count({
        where: { id: { in: policy.allowedPackageIds }, tenantId: agent.tenantId, status: PackageStatus.ACTIVE },
      })
      if (count !== new Set(policy.allowedPackageIds).size) {
        throw new BadRequestException('One or more selected packages are unavailable for this business.')
      }
    }

    const updated = await this.prisma.agent.update({
      where: { id: agent.id },
      data: {
        floatLimitUgx: dto.cashLimitUgx ?? agent.floatLimitUgx,
        notes: this.writePolicy(parsed.humanNotes, policy),
      },
    })
    return {
      agentId: updated.id,
      cashLimitUgx: updated.floatLimitUgx,
      policy,
    }
  }

  async recordCashSettlement(scopedTenantId: string | undefined, dto: RecordAgentCashSettlementDto) {
    const agent = await this.prisma.agent.findFirst({
      where: { id: dto.agentId, ...(scopedTenantId ? { tenantId: scopedTenantId } : {}) },
    })
    if (!agent) throw new NotFoundException('Agent not found')

    const outstanding = await this.calculateCashOutstanding(agent.id, agent.tenantId)
    if (dto.amountUgx > outstanding) {
      throw new BadRequestException(`Settlement cannot exceed the outstanding cash of UGX ${outstanding.toLocaleString('en-UG')}.`)
    }

    const wallet = await this.findOrCreateAgentBookkeepingWallet(agent.id, agent.tenantId)
    const now = new Date()
    const settlement = await this.prisma.settlement.create({
      data: {
        tenantId: agent.tenantId,
        agentId: agent.id,
        walletId: wallet.id,
        reference: `AGENT-CASH-SET-${Date.now()}-${randomUUID().slice(0, 8).toUpperCase()}`,
        status: SettlementStatus.COMPLETED,
        periodStart: agent.createdAt,
        periodEnd: now,
        openingFloatUgx: outstanding,
        closingFloatUgx: Math.max(0, outstanding - dto.amountUgx),
        grossSalesUgx: outstanding,
        commissionsUgx: 0,
        payableAmountUgx: dto.amountUgx,
        notes: `${CASH_SETTLEMENT_MARKER}${dto.notes?.trim() ? `: ${dto.notes.trim()}` : ''}`,
      },
    })

    return {
      id: settlement.id,
      amountUgx: settlement.payableAmountUgx,
      cashRemainingUgx: Math.max(0, outstanding - dto.amountUgx),
      recordedAt: settlement.createdAt,
    }
  }

  private async checkMobileMoneyPaymentById(paymentId: string): Promise<AgentPaymentState> {
    let state = await this.requirePayment(paymentId)
    if (state.status === PaymentStatus.COMPLETED) return this.finalizeMobileMoneyPayment(state)
    if ((state.status === PaymentStatus.FAILED || state.status === PaymentStatus.CANCELLED || state.status === PaymentStatus.EXPIRED)) return state

    const provider = state.provider as PaymentProvider
    const collection = this.paymentRouterService.resolveCollection(state.network, provider)
    const gateway = await collection.getPaymentStatus(state.providerReference || state.externalReference)
    const status = this.mapProviderResultStatus(gateway.transactionStatus, gateway.status)
    state = {
      ...state,
      status,
      statusMessage: gateway.statusMessage ?? gateway.errorMessage ?? state.statusMessage,
      updatedAt: new Date().toISOString(),
    }
    await this.savePayment(state)

    if (status === PaymentStatus.COMPLETED) return this.finalizeMobileMoneyPayment(state)
    if ((status === PaymentStatus.FAILED || status === PaymentStatus.CANCELLED || status === PaymentStatus.EXPIRED) && state.claimCode) {
      const claim = await this.readJson<ClaimState>(this.claimCodeKey(state.claimCode))
      if (claim) await this.saveClaim({ ...claim, status: 'FAILED', failureMessage: state.statusMessage ?? 'Mobile Money payment failed.' })
    }
    return state
  }

  private async finalizeMobileMoneyPayment(state: AgentPaymentState): Promise<AgentPaymentState> {
    const existing = this.finalizingPayments.get(state.id)
    if (existing) return existing

    const operation = (async () => {
      const current = (await this.readJson<AgentPaymentState>(this.paymentKey(state.id))) ?? state
      const agent = await this.prisma.agent.findFirst({
        where: { id: current.agentId, tenantId: current.tenantId, status: AgentStatus.ACTIVE },
      })
      if (!agent) throw new NotFoundException('Active agent was not found for this payment.')
      const pkg = await this.requireSellablePackage(current.tenantId, current.packageId, this.readPolicy(agent.notes).policy)

      const sale = await this.billingService.recordSale({
        tenantId: current.tenantId,
        packageId: current.packageId,
        agentId: current.agentId,
        channel: BillingChannel.MOBILE_MONEY,
        type: BillingTransactionType.MOBILE_MONEY_SALE,
        grossAmountUgx: current.amountUgx,
        description: `Agent Mobile Money sale - ${pkg.name}`,
        customerReference: current.customerPhoneNumber,
        externalReference: current.externalReference,
        paymentProvider: current.provider,
        metadata: {
          agentHybridSale: true,
          paymentMethod: 'MOBILE_MONEY',
          fulfillment: current.fulfillment,
          payingPhoneNumber: current.payingPhoneNumber,
          network: current.network,
          providerReference: current.providerReference,
          claimCode: current.claimCode,
        } as Prisma.InputJsonValue,
      })

      let voucherCode = current.voucherCode
      let activationId = current.activationId
      if (current.fulfillment === 'VOUCHER_LATER') {
        const voucher = await this.ensureOnlineVoucherForSale(
          sale.id,
          current.agentId,
          current.packageId,
          current.amountUgx,
          current.customerPhoneNumber,
        )
        voucherCode = voucher.code
      } else {
        const claim = await this.requireClaim(current.claimCode, current.tenantId)
        activationId = await this.ensureActivationForAgentSale(
          current.externalReference,
          current.tenantId,
          current.agentId,
          pkg,
          current.customerPhoneNumber,
          claim,
          'MOBILE_MONEY',
        )
        await this.saveClaim({ ...claim, status: 'FULFILLED', activationId })
      }

      const completed: AgentPaymentState = {
        ...current,
        status: PaymentStatus.COMPLETED,
        voucherCode,
        activationId,
        updatedAt: new Date().toISOString(),
      }
      await this.savePayment(completed)
      return completed
    })().finally(() => this.finalizingPayments.delete(state.id))

    this.finalizingPayments.set(state.id, operation)
    return operation
  }

  private async ensureActivationForAgentSale(
    externalReference: string,
    tenantId: string,
    agentId: string,
    pkg: Awaited<ReturnType<AgentSalesService['requireSellablePackage']>>,
    customerPhoneNumber: string,
    claim: ClaimState,
    paymentMethod: 'MOBILE_MONEY' | 'CASH',
  ) {
    return this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${externalReference}))`
      const recent = await tx.packageActivation.findMany({
        where: {
          tenantId,
          packageId: pkg.id,
          routerId: claim.routerId,
          boundMacAddress: claim.macAddress,
          createdAt: { gte: new Date(claim.createdAt) },
        },
        orderBy: { createdAt: 'desc' },
        take: 20,
      })
      const existing = recent.find((item) => this.readMetadataString(item.metadata, 'billingExternalReference') === externalReference)
      if (existing) return existing.id

      const activation = await this.packageActivationService.activateInTransaction(tx, {
        tenantId,
        packageId: pkg.id,
        source: paymentMethod === 'MOBILE_MONEY' ? PackageActivationSource.MOBILE_MONEY : PackageActivationSource.VOUCHER,
        customerReference: customerPhoneNumber,
        accessPhoneNumber: customerPhoneNumber,
        durationMinutes: pkg.durationMinutes,
        dataLimitMb: pkg.dataLimitMb,
        deviceLimit: pkg.deviceLimit,
        downloadSpeedKbps: pkg.downloadSpeedKbps,
        uploadSpeedKbps: pkg.uploadSpeedKbps,
        boundMacAddress: claim.macAddress,
        firstSeenIp: claim.clientIp,
        routerId: claim.routerId,
        hotspotServerName: claim.hotspotServerName,
        metadata: {
          agentSale: true,
          paymentMethod,
          agentId,
          claimCode: claim.code,
          billingExternalReference: externalReference,
        } as Prisma.InputJsonValue,
      })
      return activation.id
    })
  }

  private async ensureOnlineVoucherForSale(
    saleId: string,
    agentId: string,
    packageId: string,
    faceValueUgx: number,
    customerReference: string,
  ) {
    const sale = await this.prisma.billingTransaction.findUnique({ where: { id: saleId } })
    if (!sale) throw new NotFoundException('Sale transaction not found')
    if (sale.voucherId) return this.prisma.voucher.findUniqueOrThrow({ where: { id: sale.voucherId } })

    const batchNumber = `AGENT-ONLINE-${sale.id}`
    const existingBatch = await this.prisma.voucherBatch.findUnique({
      where: { batchNumber },
      include: { vouchers: true },
    })
    if (existingBatch?.vouchers[0]) {
      await this.prisma.billingTransaction.update({ where: { id: sale.id }, data: { voucherId: existingBatch.vouchers[0].id } })
      return existingBatch.vouchers[0]
    }

    try {
      const voucher = await this.prisma.$transaction(async (tx) => {
        const batch = await tx.voucherBatch.create({
          data: {
            tenantId: sale.tenantId,
            packageId,
            agentId,
            batchNumber,
            prefix: 'AGENT-ONLINE',
            quantity: 1,
            faceValueUgx,
            status: VoucherBatchStatus.ACTIVE,
            notes: `Online agent sale ${sale.externalReference ?? sale.id}`,
          },
        })
        const code = await this.generateUniqueVoucherCode(tx)
        const created = await tx.voucher.create({
          data: {
            tenantId: sale.tenantId,
            batchId: batch.id,
            packageId,
            code,
            serialNumber: `SN-${batch.id.replace(/[^a-zA-Z0-9]/g, '').slice(-10).toUpperCase()}-0001`,
            faceValueUgx,
            status: VoucherStatus.SOLD,
            soldAt: new Date(),
            soldToReference: customerReference,
            customerReference,
          },
        })
        await tx.billingTransaction.update({ where: { id: sale.id }, data: { voucherId: created.id } })
        return created
      })
      return voucher
    } catch (error) {
      const raced = await this.prisma.voucherBatch.findUnique({ where: { batchNumber }, include: { vouchers: true } })
      if (raced?.vouchers[0]) {
        await this.prisma.billingTransaction.update({ where: { id: sale.id }, data: { voucherId: raced.vouchers[0].id } })
        return raced.vouchers[0]
      }
      throw error
    }
  }

  private async requireSellablePackage(tenantId: string, packageId: string, policy: AgentSalesPolicy) {
    if (policy.allowedPackageIds.length > 0 && !policy.allowedPackageIds.includes(packageId)) {
      throw new ForbiddenException('This package is not assigned to your agent account.')
    }
    const pkg = await this.prisma.package.findFirst({
      where: { id: packageId, tenantId, status: PackageStatus.ACTIVE },
      include: {
        prices: {
          where: { OR: [{ endsAt: null }, { endsAt: { gt: new Date() } }] },
          orderBy: { startsAt: 'desc' },
          take: 1,
        },
      },
    })
    if (!pkg || !pkg.prices[0]) throw new NotFoundException('Active package price not found for this business.')
    return pkg
  }

  private async requireAgentForUser(email: string, tenantId: string, requireActive: boolean) {
    const agent = await this.prisma.agent.findFirst({
      where: {
        tenantId,
        email: { equals: email.trim(), mode: 'insensitive' },
        ...(requireActive ? { status: AgentStatus.ACTIVE } : {}),
      },
      orderBy: { createdAt: 'asc' },
    })
    if (!agent) {
      throw new ForbiddenException(
        requireActive
          ? 'Your login is not linked to an active agent profile. Ask the business owner to activate your agent account.'
          : 'Your login is not linked to an agent profile.',
      )
    }
    return agent
  }

  private async requireClaim(code: string | undefined, tenantId: string) {
    const normalized = code?.replace(/\D/g, '')
    if (!normalized || normalized.length !== 6) {
      throw new BadRequestException('Enter the 6-digit activation code shown on the customer device.')
    }
    const claim = await this.readJson<ClaimState>(this.claimCodeKey(normalized))
    if (!claim || new Date(claim.expiresAt).getTime() <= Date.now()) {
      throw new BadRequestException('That activation code has expired. Ask the customer to request a new code.')
    }
    if (claim.tenantId !== tenantId) throw new ForbiddenException('This activation code belongs to another business.')
    if (claim.status === 'FULFILLED') throw new BadRequestException('This customer activation has already been completed.')
    return claim
  }

  private async calculateCashOutstanding(agentId: string, tenantId: string) {
    const [sales, settlements] = await Promise.all([
      this.prisma.billingTransaction.findMany({
        where: {
          tenantId,
          agentId,
          type: BillingTransactionType.VOUCHER_SALE,
          status: BillingTransactionStatus.COMPLETED,
        },
        include: { sourceCommission: { select: { amountUgx: true } } },
      }),
      this.prisma.settlement.findMany({
        where: {
          tenantId,
          agentId,
          status: SettlementStatus.COMPLETED,
          notes: { startsWith: CASH_SETTLEMENT_MARKER },
        },
        select: { payableAmountUgx: true },
      }),
    ])
    const obligation = sales.reduce(
      (sum, sale) => sum + Math.max(0, sale.grossAmountUgx - (sale.sourceCommission?.amountUgx ?? 0)),
      0,
    )
    const remitted = settlements.reduce((sum, item) => sum + item.payableAmountUgx, 0)
    return Math.max(0, obligation - remitted)
  }

  private async findOrCreateAgentBookkeepingWallet(agentId: string, tenantId: string) {
    const existing = await this.prisma.wallet.findFirst({ where: { tenantId, agentId } })
    if (existing) return existing
    return this.prisma.wallet.create({
      data: {
        tenantId,
        agentId,
        ownerType: WalletOwnerType.AGENT,
        ownerReference: agentId,
        balanceUgx: 0,
        earnedBalanceUgx: 0,
      },
    })
  }

  private readPolicy(notes?: string | null): { humanNotes: string; policy: AgentSalesPolicy } {
    const defaultPolicy: AgentSalesPolicy = { cashEnabled: true, mobileMoneyEnabled: true, allowedPackageIds: [] }
    if (!notes) return { humanNotes: '', policy: defaultPolicy }
    const index = notes.lastIndexOf(POLICY_MARKER)
    if (index < 0) return { humanNotes: notes.trim(), policy: defaultPolicy }
    const humanNotes = notes.slice(0, index).trim()
    try {
      const parsed = JSON.parse(notes.slice(index + POLICY_MARKER.length).trim()) as Partial<AgentSalesPolicy>
      return {
        humanNotes,
        policy: {
          cashEnabled: parsed.cashEnabled !== false,
          mobileMoneyEnabled: parsed.mobileMoneyEnabled !== false,
          allowedPackageIds: Array.isArray(parsed.allowedPackageIds)
            ? parsed.allowedPackageIds.filter((item): item is string => typeof item === 'string')
            : [],
        },
      }
    } catch {
      return { humanNotes, policy: defaultPolicy }
    }
  }

  private writePolicy(humanNotes: string, policy: AgentSalesPolicy) {
    const prefix = humanNotes.trim() ? `${humanNotes.trim()}\n` : ''
    return `${prefix}${POLICY_MARKER}${JSON.stringify(policy)}`
  }

  private mapProviderResultStatus(transactionStatus?: string, fallbackStatus?: string) {
    return mapRawStatusToPaymentStatus(transactionStatus || fallbackStatus)
  }

  private publicPaymentState(state: AgentPaymentState) {
    return {
      id: state.id,
      status: state.status,
      statusMessage: state.statusMessage,
      amountUgx: state.amountUgx,
      fulfillment: state.fulfillment,
      voucherCode: state.voucherCode,
      activationId: state.activationId,
      customerPhoneNumber: state.customerPhoneNumber,
      payingPhoneNumber: state.payingPhoneNumber,
      network: state.network,
    }
  }

  private async generateClaimCode() {
    for (let attempt = 0; attempt < 30; attempt += 1) {
      const code = randomInt(100000, 1000000).toString()
      if (!(await this.readRaw(this.claimCodeKey(code)))) return code
    }
    throw new ServiceUnavailableException('Could not allocate an activation code. Please try again.')
  }

  private async generateUniqueVoucherCode(tx: Prisma.TransactionClient) {
    const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
    for (let attempt = 0; attempt < 50; attempt += 1) {
      const bytes = randomBytes(10)
      let code = 'AF'
      for (let index = 0; index < 8; index += 1) code += alphabet[bytes[index] % alphabet.length]
      const exists = await tx.voucher.findUnique({ where: { code }, select: { id: true } })
      if (!exists) return code
    }
    throw new ServiceUnavailableException('Could not generate a unique voucher code. Please retry.')
  }

  private claimCodeKey(code: string) {
    return `arofi:agent-claim:code:${code}`
  }

  private claimTokenKey(token: string) {
    return `arofi:agent-claim:token:${token}`
  }

  private paymentKey(id: string) {
    return `arofi:agent-payment:${id}`
  }

  private async saveClaim(claim: ClaimState) {
    const ttl = Math.max(1, Math.ceil((new Date(claim.expiresAt).getTime() - Date.now()) / 1000))
    await Promise.all([
      this.writeRaw(this.claimCodeKey(claim.code), JSON.stringify(claim), ttl),
      this.writeRaw(this.claimTokenKey(claim.token), JSON.stringify(claim), ttl),
    ])
  }

  private async savePayment(state: AgentPaymentState) {
    await this.writeRaw(this.paymentKey(state.id), JSON.stringify(state), PAYMENT_TTL_SECONDS)
  }

  private async requirePayment(id: string) {
    const state = await this.readJson<AgentPaymentState>(this.paymentKey(id))
    if (!state) throw new NotFoundException('Agent payment request was not found or has expired.')
    return state
  }

  private async readJson<T>(key: string): Promise<T | null> {
    const raw = await this.readRaw(key)
    if (!raw) return null
    try {
      return JSON.parse(raw) as T
    } catch {
      return null
    }
  }

  private async readRaw(key: string) {
    if (this.redis) {
      try {
        return await this.redis.get(key)
      } catch {
        // fall through to local memory when Redis is temporarily unavailable
      }
    }
    const entry = this.memory.get(key)
    if (!entry) return null
    if (entry.expiresAt <= Date.now()) {
      this.memory.delete(key)
      return null
    }
    return entry.value
  }

  private async writeRaw(key: string, value: string, ttlSeconds: number) {
    if (this.redis) {
      try {
        await this.redis.setEx(key, ttlSeconds, value)
        return
      } catch {
        // keep the flow usable on a single API instance if Redis drops briefly
      }
    }
    this.memory.set(key, { value, expiresAt: Date.now() + ttlSeconds * 1000 })
  }

  private readMetadataString(metadata: Prisma.JsonValue | null, key: string) {
    if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) return undefined
    const value = (metadata as JsonRecord)[key]
    return typeof value === 'string' ? value : undefined
  }

  private normalizeMac(value?: string | null) {
    if (!value) return undefined
    const compact = value.replace(/[^a-fA-F0-9]/g, '').toUpperCase()
    if (!/^[A-F0-9]{12}$/.test(compact)) return undefined
    return compact.match(/.{1,2}/g)?.join(':')
  }
}
