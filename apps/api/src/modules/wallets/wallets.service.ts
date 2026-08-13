import {
  AuditSeverity,
  BillingChannel,
  BillingTransactionStatus,
  BillingTransactionType,
  DisbursementMethod,
  DisbursementStatus,
  LedgerDirection,
  LedgerTransactionType,
  PaymentNetwork,
  Prisma,
  PayoutNumberChangeStatus,
  PayoutNumberStatus,
  WalletOwnerType,
} from '@prisma/client'
import { BadRequestException, Injectable, Logger, NotFoundException, ServiceUnavailableException } from '@nestjs/common'
import * as bcrypt from 'bcrypt'
import { randomUUID } from 'crypto'
import { PrismaService } from '../../prisma.service'
import { PLATFORM_SETTINGS_ID } from '../billing/billing.constants'
import { MailService } from '../mail/mail.service'
import { PaymentRouterService } from '../payments/payment-router.service'
import { PhoneNumberService } from '../payments/phone-number.service'
import { RegisterPayoutNumberDto } from './dto/register-payout-number.dto'
import { RequestPayoutNumberChangeDto } from './dto/request-payout-number-change.dto'
import { RequestWithdrawalDto } from './dto/request-withdrawal.dto'
import { SetPayoutSecretDto } from './dto/set-payout-secret.dto'
import { TopUpWalletDto } from './dto/topup-wallet.dto'

@Injectable()
export class WalletsService {
  private readonly logger = new Logger(WalletsService.name)

  constructor(
    private readonly prisma: PrismaService,
    private readonly paymentRouterService: PaymentRouterService,
    private readonly phoneNumberService: PhoneNumberService,
    private readonly mailService: MailService,
  ) {}

  // Best-effort, fire-and-forget: a slow/broken mail server must never delay
  // or fail a withdrawal action that already succeeded in the database.
  private async notifyWithdrawalEmail(input: {
    tenantId: string
    status: 'REQUESTED' | 'APPROVED' | 'REJECTED' | 'PROCESSING' | 'COMPLETED' | 'FAILED'
    amountUgx: number
    reference: string
    reason?: string | null
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

      await this.mailService.sendWithdrawalStatusEmail({
        to: recipientEmail,
        tenantName: tenant.name,
        recipientName,
        status: input.status,
        amountUgx: input.amountUgx,
        reference: input.reference,
        reason: input.reason,
      })
    } catch (error) {
      this.logger.warn(
        `Failed to send withdrawal ${input.status} email for tenant ${input.tenantId}: ${error instanceof Error ? error.message : String(error)}`,
      )
    }
  }

  async listWallets(tenantId?: string) {
    const items = await this.prisma.wallet.findMany({
      where: tenantId ? { tenantId } : undefined,
      include: {
        tenant: {
          select: {
            id: true,
            name: true,
          },
        },
        agent: {
          select: {
            id: true,
            code: true,
            name: true,
            phoneNumber: true,
          },
        },
        ledgerEntries: {
          orderBy: { createdAt: 'desc' },
          take: 10,
          include: {
            ledgerTransaction: {
              select: {
                reference: true,
                description: true,
              },
            },
          },
        },
      },
      orderBy: { updatedAt: 'desc' },
    })

    return {
      summary: {
        totalWallets: items.length,
        totalBalanceUgx: items.reduce((total, item) => total + item.balanceUgx, 0),
      },
      items,
    }
  }

  async getWallet(tenantId: string, scopedTenantId?: string) {
    if (scopedTenantId && scopedTenantId !== tenantId) {
      return null
    }

    return this.prisma.wallet.findFirst({
      where: {
        tenantId,
        ownerType: WalletOwnerType.TENANT,
        ownerReference: tenantId,
      },
      include: {
        tenant: {
          select: {
            id: true,
            name: true,
          },
        },
        agent: {
          select: {
            id: true,
            code: true,
            name: true,
            phoneNumber: true,
          },
        },
        ledgerEntries: {
          orderBy: { createdAt: 'desc' },
          take: 20,
          include: {
            ledgerTransaction: {
              select: {
                reference: true,
                description: true,
                channel: true,
              },
            },
          },
        },
      },
    })
  }

  async getPayoutProfile(tenantId: string) {
    if (tenantId === 'platform') {
      await this.ensurePlatformTenantExists()
    }
    const platformSettings = await this.getPlatformSettings()
    const [profile, numbers, changeRequests, wallet, recentWithdrawals, mmGross, agentCommissionTotal, completedWithdrawals, pendingWithdrawals] = await Promise.all([
      this.prisma.tenantPayoutProfile.findUnique({
        where: { tenantId },
        select: { id: true, termsVersion: true, createdAt: true, updatedAt: true },
      }),
      this.prisma.tenantPayoutNumber.findMany({
        where: { tenantId },
        orderBy: [{ status: 'asc' }, { createdAt: 'asc' }],
      }),
      this.prisma.tenantPayoutNumberChangeRequest.findMany({
        where: { tenantId },
        orderBy: { createdAt: 'desc' },
        take: 10,
      }),
      this.findTenantWallet(tenantId),
      this.prisma.disbursement.findMany({
        where: { tenantId, agentId: null },
        orderBy: { createdAt: 'desc' },
        take: 20,
      }),
      this.prisma.billingTransaction.aggregate({
        where: {
          tenantId,
          type: BillingTransactionType.MOBILE_MONEY_SALE,
          status: BillingTransactionStatus.COMPLETED,
        },
        _sum: {
          grossAmountUgx: true,
          feeAmountUgx: true,
        },
      }),
      this.prisma.agentCommission.aggregate({
        where: {
          tenantId,
        },
        _sum: {
          amountUgx: true,
        },
      }),
      this.prisma.disbursement.findMany({
        where: {
          tenantId,
          agentId: null,
          status: DisbursementStatus.COMPLETED,
        },
        include: {
          billingTransaction: {
            select: {
              grossAmountUgx: true,
            },
          },
        },
      }),
      this.prisma.disbursement.findMany({
        where: {
          tenantId,
          agentId: null,
          status: {
            in: [
              DisbursementStatus.PENDING,
              DisbursementStatus.PENDING_APPROVAL,
              DisbursementStatus.PENDING_NUMBER_APPROVAL,
              DisbursementStatus.PROCESSING,
              DisbursementStatus.FLAGGED_FOR_REVIEW,
            ],
          },
        },
        include: {
          billingTransaction: {
            select: {
              grossAmountUgx: true,
            },
          },
        },
      }),
    ])

    const alreadyWithdrawnUgx = completedWithdrawals.reduce(
      (sum, wd) => sum + (wd.billingTransaction?.grossAmountUgx ?? wd.amountUgx),
      0,
    )

    const pendingWithdrawalsUgx = pendingWithdrawals.reduce(
      (sum, wd) => sum + (wd.billingTransaction?.grossAmountUgx ?? wd.amountUgx),
      0,
    )

    const earnedBalanceUgx = wallet?.balanceUgx ?? 0
    const balanceUgx = wallet?.balanceUgx ?? 0
    const availableUgx = balanceUgx
    const withdrawableBalanceUgx = Math.max(0, balanceUgx)

    return {
      profile: {
        secretConfigured: Boolean(profile),
        termsVersion: profile?.termsVersion ?? '2026-05-22',
        createdAt: profile?.createdAt,
        updatedAt: profile?.updatedAt,
      },
      wallet,
      numbers,
      changeRequests,
      recentWithdrawals,
      rules: {
        maxActiveNumbers: platformSettings.maxPayoutNumbers,
        registeredNumbersOnly: true,
        numberChangesRequireApproval: platformSettings.payoutNumberChangeRequiresApproval,
        secretKeyRequired: true,
        finalAfterProviderAccepts: true,
        requireWithdrawalApproval: platformSettings.requireWithdrawalApproval,
        instantWithdrawalsEnabled: platformSettings.instantWithdrawalsEnabled,
        requireApprovalForFirstWithdrawal: platformSettings.requireApprovalForFirstWithdrawal,
        requireApprovalAboveAmountUgx: platformSettings.requireApprovalAboveAmountUgx,
        failedSecretAttemptsBeforeLock: platformSettings.failedSecretAttemptsBeforeLock,
        withdrawalLockMinutes: platformSettings.withdrawalLockMinutes,
        minimumPayoutUgx: platformSettings.minimumWithdrawalUgx,
        withdrawalFeeBasisPoints: platformSettings.withdrawalFeeBps,
        withdrawalFlatFeeUgx: platformSettings.withdrawalFlatFeeUgx,
      },
      metrics: {
        totalCollectedUgx: mmGross._sum.grossAmountUgx ?? 0,
        totalFeesUgx: mmGross._sum.feeAmountUgx ?? 0,
        agentCommissionUgx: agentCommissionTotal._sum.amountUgx ?? 0,
        availableBalanceUgx: withdrawableBalanceUgx,
        walletBalanceUgx: balanceUgx,
        earnedBalanceUgx,
        alreadyWithdrawnUgx,
        pendingWithdrawalsUgx,
      },
    }
  }

  async setPayoutSecret(tenantId: string, dto: SetPayoutSecretDto, userId: string) {
    if (tenantId === 'platform') {
      await this.ensurePlatformTenantExists()
    }
    const existing = await this.prisma.tenantPayoutProfile.findUnique({ where: { tenantId } })
    const user = await this.prisma.user.findUnique({ where: { id: userId }, select: { password: true, email: true } })
    const passwordOk = dto.currentPassword && user ? await bcrypt.compare(dto.currentPassword, user.password) : false
    const currentSecretOk = existing && dto.currentSecretKey ? await bcrypt.compare(dto.currentSecretKey, existing.secretHash) : false

    if (!passwordOk && !currentSecretOk) {
      throw new BadRequestException(existing ? 'Enter your current password or current withdrawal code to change the code' : 'Enter your current password to set the withdrawal code')
    }

    const secretHash = await bcrypt.hash(dto.secretKey, 12)
    await this.prisma.tenantPayoutProfile.upsert({
      where: { tenantId },
      update: { secretHash, failedSecretAttempts: 0, withdrawalLockedUntil: null, lastFailedSecretAt: null },
      create: { tenantId, secretHash },
    })

    await this.writeAudit({
      tenantId,
      userId,
      action: 'withdrawal.secret.updated',
      entity: 'TenantPayoutProfile',
      entityId: tenantId,
      details: { resetFailedAttempts: true },
    })

    return { secretConfigured: true }
  }

  async registerPayoutNumber(tenantId: string, dto: RegisterPayoutNumberDto) {
    if (tenantId === 'platform') {
      await this.ensurePlatformTenantExists()
    }
    this.assertSupportedNetwork(dto.network)
    const normalizedPhone = this.phoneNumberService.normalizeForNetwork(dto.phoneNumber, dto.network)

    return this.prisma.$transaction(async (tx) => {
      const activeCount = await tx.tenantPayoutNumber.count({
        where: { tenantId, status: PayoutNumberStatus.VERIFIED },
      })

      const platformSettings = await this.getPlatformSettings()
      if (activeCount >= platformSettings.maxPayoutNumbers) {
        throw new BadRequestException(`You can register only ${platformSettings.maxPayoutNumbers} payout number(s). Request a number change instead.`)
      }

      const hasVerified = await tx.tenantPayoutNumber.count({
        where: { tenantId, status: PayoutNumberStatus.VERIFIED },
      })
      const status = platformSettings.payoutNumberChangeRequiresApproval ? PayoutNumberStatus.PENDING_ADMIN_APPROVAL : PayoutNumberStatus.VERIFIED
      const created = await tx.tenantPayoutNumber.create({
        data: {
          tenantId,
          network: dto.network,
          phone: dto.phoneNumber.trim(),
          normalizedPhone,
          label: dto.label?.trim(),
          ownerName: dto.ownerName?.trim(),
          status,
          // Each approved payout number is equally eligible. The withdrawal
          // request explicitly selects the destination.
          isPrimary: false,
          verifiedAt: status === PayoutNumberStatus.VERIFIED ? new Date() : null,
        },
      })

      await this.writeAudit({
        tenantId,
        action: status === PayoutNumberStatus.VERIFIED ? 'payout.number.registered' : 'payout.number.pending_approval',
        entity: 'TenantPayoutNumber',
        entityId: created.id,
        details: { network: dto.network, normalizedPhone, status },
        client: tx,
      })

      return created
    })
  }

  async requestPayoutNumberChange(tenantId: string, dto: RequestPayoutNumberChangeDto, userId: string) {
    if (tenantId === 'platform') {
      await this.ensurePlatformTenantExists()
    }
    this.assertSupportedNetwork(dto.network)
    const normalizedPhone = this.phoneNumberService.normalizeForNetwork(dto.phoneNumber, dto.network)

    if (dto.existingPayoutNumberId) {
      const existing = await this.prisma.tenantPayoutNumber.findFirst({
        where: { id: dto.existingPayoutNumberId, tenantId, status: PayoutNumberStatus.VERIFIED },
      })
      if (!existing) {
        throw new NotFoundException('Registered payout number not found')
      }
    }

    const platformSettings = await this.getPlatformSettings()
    return this.prisma.$transaction(async (tx) => {
      const request = await tx.tenantPayoutNumberChangeRequest.create({
        data: {
          tenantId,
          existingPayoutNumberId: dto.existingPayoutNumberId,
          requestedNetwork: dto.network,
          requestedPhone: dto.phoneNumber.trim(),
          requestedNormalizedPhone: normalizedPhone,
          reason: dto.reason.trim(),
          status: platformSettings.payoutNumberChangeRequiresApproval
            ? PayoutNumberChangeStatus.PENDING_ADMIN_APPROVAL
            : PayoutNumberChangeStatus.PENDING_VERIFICATION,
        },
      })
      await this.writeAudit({
        tenantId,
        userId,
        action: 'payout.number_change.requested',
        entity: 'TenantPayoutNumberChangeRequest',
        entityId: request.id,
        details: { requestedNetwork: dto.network, requestedNormalizedPhone: normalizedPhone },
        client: tx,
      })
      return request
    })
  }

  async requestWithdrawal(tenantId: string, dto: RequestWithdrawalDto, userId: string) {
    if (tenantId === 'platform') {
      await this.ensurePlatformTenantExists()
    }
    if (!dto.confirmPhoneInPossession) {
      throw new BadRequestException('Confirm that you have the registered payout phone with you before requesting withdrawal')
    }

    if (!dto.acceptFinalTerms) {
      throw new BadRequestException('Accept the final withdrawal terms before requesting withdrawal')
    }

    const [profile, tenantSettings, platformSettings, pendingNumberChange] = await Promise.all([
      this.prisma.tenantPayoutProfile.findUnique({ where: { tenantId } }),
      this.prisma.tenantSetting.upsert({
        where: { tenantId },
        update: {},
        create: { tenantId },
      }),
      this.getPlatformSettings(),
      this.prisma.tenantPayoutNumberChangeRequest.findFirst({
        where: {
          tenantId,
          status: { in: [PayoutNumberChangeStatus.PENDING, PayoutNumberChangeStatus.PENDING_VERIFICATION, PayoutNumberChangeStatus.PENDING_ADMIN_APPROVAL] },
        },
      }),
    ])
    if (!profile) {
      throw new BadRequestException('Set your withdrawal code before requesting withdrawal')
    }

    if (!tenantSettings.kycCompleted) throw new BadRequestException('Complete business verification before withdrawing')
    if (!tenantSettings.accountActive) throw new BadRequestException('Business account is not active for withdrawals')
    if (tenantSettings.fraudHold) throw new BadRequestException('Withdrawals are temporarily blocked while the account is under review')
    if (pendingNumberChange) throw new BadRequestException('A payout number change is pending. Withdrawals remain blocked until the request is approved or cancelled.')
    if (profile.withdrawalLockedUntil && profile.withdrawalLockedUntil > new Date()) {
      throw new BadRequestException(`Withdrawals are locked until ${profile.withdrawalLockedUntil.toISOString()} after failed secret attempts`)
    }

    const secretOk = await bcrypt.compare(dto.secretKey, profile.secretHash)
    if (!secretOk) {
      await this.recordFailedSecretAttempt(tenantId, profile.id, platformSettings, userId)
      throw new BadRequestException('Invalid withdrawal code')
    }

    if (profile.failedSecretAttempts > 0 || profile.withdrawalLockedUntil) {
      await this.prisma.tenantPayoutProfile.update({
        where: { id: profile.id },
        data: { failedSecretAttempts: 0, withdrawalLockedUntil: null, lastFailedSecretAt: null },
      })
    }

    const verifiedPayoutNumbers = await this.prisma.tenantPayoutNumber.findMany({
      where: {
        tenantId,
        status: PayoutNumberStatus.VERIFIED,
        verifiedAt: { not: null },
      },
      orderBy: { createdAt: 'asc' },
    })

    if (verifiedPayoutNumbers.length === 0) {
      throw new NotFoundException('Registered verified payout number not found')
    }

    const payoutNumber = dto.payoutNumberId
      ? verifiedPayoutNumbers.find((number) => number.id === dto.payoutNumberId)
      : null

    if (!payoutNumber) {
      throw new BadRequestException('Withdrawals can only go to one of your registered verified payout numbers')
    }

    const provider = this.paymentRouterService.resolveDisbursement(payoutNumber.network)
    const reference = `BUSINESS-WD-${Date.now()}-${randomUUID().slice(0, 8).toUpperCase()}`
    const fee = this.calculateWithdrawalFee(dto.amountUgx, platformSettings)
    const totalDebitUgx = dto.amountUgx + fee.feeAmountUgx
    const minimumPayoutUgx = platformSettings.minimumWithdrawalUgx

    if (dto.amountUgx < minimumPayoutUgx) {
      throw new BadRequestException(`Minimum withdrawal is UGX ${minimumPayoutUgx.toLocaleString('en-US')}`)
    }

    const reviewReason = null
    const initialStatus = DisbursementStatus.PROCESSING

    const reserved = await this.prisma.$transaction(async (tx) => {
      const wallet = await tx.wallet.findFirst({
        where: {
          tenantId,
          ownerType: WalletOwnerType.TENANT,
          ownerReference: tenantId,
        },
      })

      if (!wallet) {
        throw new BadRequestException('Wallet does not have enough available balance for this withdrawal')
      }

      const completedWithdrawals = await tx.disbursement.findMany({
        where: {
          tenantId,
          agentId: null,
          status: DisbursementStatus.COMPLETED,
        },
        include: {
          billingTransaction: {
            select: {
              grossAmountUgx: true,
            },
          },
        },
      })

      const pendingWithdrawals = await tx.disbursement.findMany({
        where: {
          tenantId,
          agentId: null,
          status: {
            in: [
              DisbursementStatus.PENDING,
              DisbursementStatus.PENDING_APPROVAL,
              DisbursementStatus.PENDING_NUMBER_APPROVAL,
              DisbursementStatus.PROCESSING,
              DisbursementStatus.FLAGGED_FOR_REVIEW,
            ],
          },
        },
        include: {
          billingTransaction: {
            select: {
              grossAmountUgx: true,
            },
          },
        },
      })

      const alreadyWithdrawnUgx = completedWithdrawals.reduce(
        (sum, wd) => sum + (wd.billingTransaction?.grossAmountUgx ?? wd.amountUgx),
        0,
      )

      const pendingWithdrawalsUgx = pendingWithdrawals.reduce(
        (sum, wd) => sum + (wd.billingTransaction?.grossAmountUgx ?? wd.amountUgx),
        0,
      )

      const withdrawableBalanceUgx = Math.max(0, wallet.balanceUgx)

      if (withdrawableBalanceUgx < totalDebitUgx) {
        throw new BadRequestException(`Insufficient balance. Your wallet balance is UGX ${withdrawableBalanceUgx.toLocaleString('en-US')}.`)
      }

      const debited = await tx.wallet.updateMany({
        where: { id: wallet.id, balanceUgx: { gte: totalDebitUgx } },
        data: { balanceUgx: { decrement: totalDebitUgx } },
      })

      if (debited.count !== 1) {
        throw new BadRequestException('Wallet does not have enough available balance for this withdrawal and charges')
      }

      if (tenantId === 'platform') {
        await tx.platformSetting.update({
          where: { id: PLATFORM_SETTINGS_ID },
          data: {
            platformWalletBalanceUgx: {
              decrement: totalDebitUgx,
            },
          },
        })
      }

      const ledgerTransaction = await tx.ledgerTransaction.create({
        data: {
          tenantId,
          walletId: wallet.id,
          reference: `LEDGER-${reference}`,
          type: LedgerTransactionType.DISBURSEMENT,
          channel: BillingChannel.DISBURSEMENT,
          description: 'Business wallet withdrawal reserved',
          grossAmountUgx: totalDebitUgx,
          feeAmountUgx: fee.feeAmountUgx,
          netAmountUgx: -totalDebitUgx,
          sourceType: 'VendorWithdrawal',
          sourceId: userId,
          metadata: this.toJsonValue({
            payoutNumberId: payoutNumber.id,
            network: payoutNumber.network,
            payoutAmountUgx: dto.amountUgx,
            totalDebitUgx,
            withdrawalFee: fee,
            finalAfterProviderAccepts: true,
            reviewReason,
          }),
          entries: {
            create: [
              {
                tenantId,
                walletId: wallet.id,
                accountCode: 'tenant_wallet',
                direction: LedgerDirection.DEBIT,
                amountUgx: totalDebitUgx,
                memo: 'Business wallet withdrawal reserve',
              },
              {
                tenantId,
                accountCode: 'disbursement_clearing',
                direction: LedgerDirection.CREDIT,
                amountUgx: dto.amountUgx,
                memo: 'Provider payout reserve',
              },
              ...(fee.feeAmountUgx > 0
                ? [
                    {
                      tenantId,
                      accountCode: 'platform_revenue',
                      direction: LedgerDirection.CREDIT,
                      amountUgx: fee.feeAmountUgx,
                      memo: 'Business withdrawal charge',
                    },
                  ]
                : []),
            ],
          },
        },
      })

      const billingTransaction = await tx.billingTransaction.create({
        data: {
          tenantId,
          walletId: wallet.id,
          ledgerTransactionId: ledgerTransaction.id,
          channel: BillingChannel.DISBURSEMENT,
          type: BillingTransactionType.AGENT_DISBURSEMENT,
          status: BillingTransactionStatus.PENDING,
          grossAmountUgx: totalDebitUgx,
          feeAmountUgx: fee.feeAmountUgx,
          netAmountUgx: -totalDebitUgx,
          customerReference: payoutNumber.normalizedPhone,
          externalReference: reference,
          paymentProvider: provider.provider.replace(/_/g, ' '),
          metadata: this.toJsonValue({
            payoutNumberId: payoutNumber.id,
            network: payoutNumber.network,
            requestedByUserId: userId,
            termsVersion: profile.termsVersion,
            payoutAmountUgx: dto.amountUgx,
            totalDebitUgx,
            withdrawalFee: fee,
            confirmPhoneInPossession: dto.confirmPhoneInPossession,
            acceptFinalTerms: dto.acceptFinalTerms,
            reviewReason,
          }),
        },
      })

      const disbursement = await tx.disbursement.create({
        data: {
          tenantId,
          walletId: wallet.id,
          billingTransactionId: billingTransaction.id,
          reference,
          method: DisbursementMethod.MOBILE_MONEY,
          status: initialStatus,
          network: payoutNumber.network,
          provider: provider.provider,
          amountUgx: dto.amountUgx,
          destinationReference: payoutNumber.normalizedPhone,
          notes: reviewReason
            ? `Business wallet withdrawal reserved. Review required: ${reviewReason}.`
            : 'Business wallet withdrawal reserved. Provider payout is being sent instantly.',
          metadata: this.toJsonValue({
            payoutNumberId: payoutNumber.id,
            requestedByUserId: userId,
            termsVersion: profile.termsVersion,
            payoutAmountUgx: dto.amountUgx,
            totalDebitUgx,
            withdrawalFee: fee,
            reviewReason,
          }),
        },
      })

      await this.writeAudit({
        tenantId,
        userId,
        action: 'withdrawal.requested',
        entity: 'Disbursement',
        entityId: disbursement.id,
        details: { amountUgx: dto.amountUgx, totalDebitUgx, payoutNumberId: payoutNumber.id, reviewReason },
        client: tx,
      })

      return { walletId: wallet.id, currency: wallet.currency, billingTransactionId: billingTransaction.id, disbursementId: disbursement.id }
    })

    let providerResponse
    try {
      providerResponse = await provider.sendMoney({
        amountUgx: dto.amountUgx,
        currency: reserved.currency,
        phoneNumber: payoutNumber.normalizedPhone,
        externalReference: reference,
        narrative: 'AROfi business wallet withdrawal',
        network: payoutNumber.network,
      })
    } catch (error) {
      await this.releaseFailedWithdrawalReserve({
        tenantId,
        walletId: reserved.walletId,
        billingTransactionId: reserved.billingTransactionId,
        disbursementId: reserved.disbursementId,
        amountUgx: dto.amountUgx,
        totalDebitUgx,
        reference,
        errorMessage: error instanceof Error ? error.message : 'Unable to submit withdrawal to provider',
      })

      if (error instanceof ServiceUnavailableException || error instanceof BadRequestException) {
        throw error
      }
      throw new ServiceUnavailableException(error instanceof Error ? error.message : 'Unable to submit withdrawal to provider')
    }

    return this.completeProviderSubmission({
      reserved,
      providerResponse,
      payoutNumberId: payoutNumber.id,
      requestedByUserId: userId,
      termsVersion: profile.termsVersion,
      payoutAmountUgx: dto.amountUgx,
      totalDebitUgx,
      withdrawalFee: fee,
    })
  }

  async listVendorWithdrawals(filters: { tenantId?: string; status?: DisbursementStatus; from?: string; to?: string }) {
    const dateFilter = this.buildDateFilter(filters)
    const where = {
      ...(filters.tenantId ? { tenantId: filters.tenantId } : {}),
      agentId: null,
      ...(filters.status ? { status: filters.status } : {}),
      ...(dateFilter.createdAt ? { createdAt: dateFilter.createdAt } : {}),
    }
    const [items, pendingPayoutNumbers, pendingNumberChanges] = await Promise.all([
      this.prisma.disbursement.findMany({
        where,
        include: {
          tenant: { select: { id: true, name: true, domain: true } },
          billingTransaction: true,
        },
        orderBy: { createdAt: 'desc' },
        take: 250,
      }),
      this.prisma.tenantPayoutNumber.findMany({
        where: {
          ...(filters.tenantId ? { tenantId: filters.tenantId } : {}),
          status: { in: [PayoutNumberStatus.PENDING_ADMIN_APPROVAL, PayoutNumberStatus.PENDING_VERIFICATION] },
        },
        include: { tenant: { select: { id: true, name: true, domain: true } } },
        orderBy: { createdAt: 'desc' },
        take: 100,
      }),
      this.prisma.tenantPayoutNumberChangeRequest.findMany({
        where: {
          ...(filters.tenantId ? { tenantId: filters.tenantId } : {}),
          status: { in: [PayoutNumberChangeStatus.PENDING, PayoutNumberChangeStatus.PENDING_ADMIN_APPROVAL, PayoutNumberChangeStatus.PENDING_VERIFICATION] },
        },
        include: { tenant: { select: { id: true, name: true, domain: true } } },
        orderBy: { createdAt: 'desc' },
        take: 100,
      }),
    ])

    return {
      summary: {
        totalWithdrawals: items.length,
        pendingReview: items.filter((item) => item.status === DisbursementStatus.PENDING_APPROVAL || item.status === DisbursementStatus.FLAGGED_FOR_REVIEW).length,
        failed: items.filter((item) => item.status === DisbursementStatus.FAILED).length,
        completedAmountUgx: items.filter((item) => item.status === DisbursementStatus.COMPLETED).reduce((total, item) => total + item.amountUgx, 0),
        pendingPayoutNumbers: pendingPayoutNumbers.length,
        pendingNumberChanges: pendingNumberChanges.length,
      },
      items,
      pendingPayoutNumbers,
      pendingNumberChanges,
    }
  }

  async approvePayoutNumber(numberId: string, actorUserId: string, scopedTenantId?: string) {
    const number = await this.prisma.tenantPayoutNumber.findUnique({ where: { id: numberId } })
    if (!number || (scopedTenantId && number.tenantId !== scopedTenantId)) {
      throw new NotFoundException('Payout number not found')
    }
    if (number.status !== PayoutNumberStatus.PENDING_ADMIN_APPROVAL && number.status !== PayoutNumberStatus.PENDING_VERIFICATION) {
      throw new BadRequestException('Only pending payout numbers can be approved')
    }

    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.tenantPayoutNumber.update({
        where: { id: number.id },
        data: {
          status: PayoutNumberStatus.VERIFIED,
          verifiedAt: new Date(),
          approvedByUserId: actorUserId,
          isPrimary: false,
        },
        include: { tenant: { select: { id: true, name: true, domain: true } } },
      })
      await this.writeAudit({
        tenantId: number.tenantId,
        userId: actorUserId,
        action: 'payout.number.approved',
        entity: 'TenantPayoutNumber',
        entityId: number.id,
        details: { normalizedPhone: number.normalizedPhone, network: number.network },
        client: tx,
      })
      return updated
    })
  }

  async rejectPayoutNumber(numberId: string, actorUserId: string, reason: string, scopedTenantId?: string) {
    const number = await this.prisma.tenantPayoutNumber.findUnique({ where: { id: numberId } })
    if (!number || (scopedTenantId && number.tenantId !== scopedTenantId)) {
      throw new NotFoundException('Payout number not found')
    }
    if (number.status !== PayoutNumberStatus.PENDING_ADMIN_APPROVAL && number.status !== PayoutNumberStatus.PENDING_VERIFICATION) {
      throw new BadRequestException('Only pending payout numbers can be rejected')
    }
    const updated = await this.prisma.tenantPayoutNumber.update({
      where: { id: number.id },
      data: { status: PayoutNumberStatus.DISABLED, changedAt: new Date(), approvedByUserId: actorUserId },
      include: { tenant: { select: { id: true, name: true, domain: true } } },
    })
    await this.writeAudit({
      tenantId: number.tenantId,
      userId: actorUserId,
      action: 'payout.number.rejected',
      entity: 'TenantPayoutNumber',
      entityId: number.id,
      severity: AuditSeverity.WARNING,
      details: { reason, normalizedPhone: number.normalizedPhone, network: number.network },
    })
    return updated
  }

  async approveWithdrawal(disbursementId: string, actorUserId: string, scopedTenantId?: string) {
    const disbursement = await this.getWithdrawalForAction(disbursementId, scopedTenantId)
    if (disbursement.status !== DisbursementStatus.PENDING_APPROVAL && disbursement.status !== DisbursementStatus.FLAGGED_FOR_REVIEW) {
      throw new BadRequestException('Only flagged withdrawals can be approved')
    }

    await this.prisma.disbursement.update({
      where: { id: disbursement.id },
      data: {
        status: DisbursementStatus.PROCESSING,
        notes: 'Withdrawal approved. Submitting to provider.',
        metadata: this.toJsonValue({ ...(this.objectMetadata(disbursement.metadata)), approvedByUserId: actorUserId }),
      },
    })

    void this.notifyWithdrawalEmail({
      tenantId: disbursement.tenantId,
      status: 'APPROVED',
      amountUgx: disbursement.amountUgx,
      reference: disbursement.reference,
    })

    return this.submitReservedWithdrawal(disbursement.id)
  }

  async rejectWithdrawal(disbursementId: string, actorUserId: string, reason: string, scopedTenantId?: string) {
    const disbursement = await this.getWithdrawalForAction(disbursementId, scopedTenantId)
    if (disbursement.status !== DisbursementStatus.PENDING_APPROVAL && disbursement.status !== DisbursementStatus.FLAGGED_FOR_REVIEW) {
      throw new BadRequestException('Only flagged withdrawals can be rejected')
    }
    if (!disbursement.billingTransactionId || !disbursement.walletId) {
      throw new BadRequestException('Withdrawal reserve is incomplete')
    }

    await this.releaseFailedWithdrawalReserve({
      tenantId: disbursement.tenantId,
      walletId: disbursement.walletId,
      billingTransactionId: disbursement.billingTransactionId,
      disbursementId: disbursement.id,
      amountUgx: disbursement.amountUgx,
      totalDebitUgx: disbursement.billingTransaction?.grossAmountUgx ?? disbursement.amountUgx,
      reference: disbursement.reference,
      errorMessage: reason,
      disbursementStatus: DisbursementStatus.REVERSED,
      billingStatus: BillingTransactionStatus.REVERSED,
      notes: 'Withdrawal rejected by Dev Admin. Wallet reserve released.',
      extraMetadata: { rejectedByUserId: actorUserId, reason },
    })

    return this.prisma.disbursement.findUnique({ where: { id: disbursement.id } })
  }

  async retryFailedWithdrawal(disbursementId: string, scopedTenantId?: string) {
    const disbursement = await this.getWithdrawalForAction(disbursementId, scopedTenantId)
    if (disbursement.status !== DisbursementStatus.FAILED) {
      throw new BadRequestException('Only failed withdrawals can be retried')
    }
    throw new BadRequestException('Failed withdrawals release the reserved balance. Ask the business owner to submit a new withdrawal request.')
  }

  async approvePayoutNumberChange(requestId: string, actorUserId: string, scopedTenantId?: string) {
    const request = await this.prisma.tenantPayoutNumberChangeRequest.findUnique({ where: { id: requestId } })
    if (!request || (scopedTenantId && request.tenantId !== scopedTenantId)) {
      throw new NotFoundException('Payout number change request not found')
    }
    if (
      request.status !== PayoutNumberChangeStatus.PENDING &&
      request.status !== PayoutNumberChangeStatus.PENDING_VERIFICATION &&
      request.status !== PayoutNumberChangeStatus.PENDING_ADMIN_APPROVAL
    ) {
      throw new BadRequestException('Only pending payout number changes can be approved')
    }

    return this.prisma.$transaction(async (tx) => {
      if (request.existingPayoutNumberId) {
        await tx.tenantPayoutNumber.updateMany({
          where: { id: request.existingPayoutNumberId, tenantId: request.tenantId },
          data: { status: PayoutNumberStatus.DISABLED, isPrimary: false, changedAt: new Date() },
        })
      }

      const payoutNumber = await tx.tenantPayoutNumber.upsert({
        where: {
          tenantId_normalizedPhone: {
            tenantId: request.tenantId,
            normalizedPhone: request.requestedNormalizedPhone,
          },
        },
        update: {
          network: request.requestedNetwork,
          phone: request.requestedPhone,
          status: PayoutNumberStatus.VERIFIED,
          isPrimary: false,
          verifiedAt: new Date(),
          changedAt: new Date(),
          approvedByUserId: actorUserId,
        },
        create: {
          tenantId: request.tenantId,
          network: request.requestedNetwork,
          phone: request.requestedPhone,
          normalizedPhone: request.requestedNormalizedPhone,
          status: PayoutNumberStatus.VERIFIED,
          isPrimary: false,
          verifiedAt: new Date(),
          changedAt: new Date(),
          approvedByUserId: actorUserId,
        },
      })

      const updatedRequest = await tx.tenantPayoutNumberChangeRequest.update({
        where: { id: request.id },
        data: {
          status: PayoutNumberChangeStatus.APPROVED,
          reviewedByUserId: actorUserId,
          reviewedAt: new Date(),
          reviewNotes: 'Approved by Dev Admin',
        },
      })

      await this.writeAudit({
        tenantId: request.tenantId,
        userId: actorUserId,
        action: 'payout.number_change.approved',
        entity: 'TenantPayoutNumberChangeRequest',
        entityId: request.id,
        details: { payoutNumberId: payoutNumber.id, normalizedPhone: payoutNumber.normalizedPhone },
        client: tx,
      })

      return { request: updatedRequest, payoutNumber }
    })
  }

  async rejectPayoutNumberChange(requestId: string, actorUserId: string, reason: string, scopedTenantId?: string) {
    const request = await this.prisma.tenantPayoutNumberChangeRequest.findUnique({ where: { id: requestId } })
    if (!request || (scopedTenantId && request.tenantId !== scopedTenantId)) {
      throw new NotFoundException('Payout number change request not found')
    }
    if (
      request.status !== PayoutNumberChangeStatus.PENDING &&
      request.status !== PayoutNumberChangeStatus.PENDING_VERIFICATION &&
      request.status !== PayoutNumberChangeStatus.PENDING_ADMIN_APPROVAL
    ) {
      throw new BadRequestException('Only pending payout number changes can be rejected')
    }

    const updated = await this.prisma.tenantPayoutNumberChangeRequest.update({
      where: { id: request.id },
      data: {
        status: PayoutNumberChangeStatus.REJECTED,
        reviewedByUserId: actorUserId,
        reviewedAt: new Date(),
        reviewNotes: reason,
      },
    })

    await this.writeAudit({
      tenantId: request.tenantId,
      userId: actorUserId,
      action: 'payout.number_change.rejected',
      entity: 'TenantPayoutNumberChangeRequest',
      entityId: request.id,
      severity: AuditSeverity.WARNING,
      details: { reason },
    })

    return updated
  }

  private async ensurePlatformTenantExists() {
    await this.prisma.tenant.upsert({
      where: { id: 'platform' },
      update: {},
      create: {
        id: 'platform',
        name: 'AROFi Platform',
        domain: 'platform.internal',
      },
    })
  }

  private async findTenantWallet(tenantId: string) {
    if (tenantId === 'platform') {
      await this.ensurePlatformTenantExists()
      
      const platformFeesSum = await this.prisma.billingTransaction.aggregate({
        where: {
          status: BillingTransactionStatus.COMPLETED,
          feeAmountUgx: { gt: 0 }
        },
        _sum: {
          feeAmountUgx: true
        }
      })
      const totalFeesCollected = platformFeesSum._sum.feeAmountUgx ?? 0

      const platformWithdrawalsSum = await this.prisma.disbursement.aggregate({
        where: {
          tenantId: 'platform',
          status: DisbursementStatus.COMPLETED
        },
        _sum: {
          amountUgx: true
        }
      })
      const totalPlatformWithdrawn = platformWithdrawalsSum._sum.amountUgx ?? 0

      const dynamicPlatformBalance = Math.max(0, totalFeesCollected - totalPlatformWithdrawn)

      await this.prisma.platformSetting.update({
        where: { id: PLATFORM_SETTINGS_ID },
        data: { platformWalletBalanceUgx: dynamicPlatformBalance }
      })

      let wallet = await this.prisma.wallet.findFirst({
        where: {
          tenantId: 'platform',
          ownerType: WalletOwnerType.TENANT,
          ownerReference: 'platform',
        },
      })
      if (!wallet) {
        wallet = await this.prisma.wallet.create({
          data: {
            tenantId: 'platform',
            ownerType: WalletOwnerType.TENANT,
            ownerReference: 'platform',
            currency: 'UGX',
            balanceUgx: dynamicPlatformBalance,
            earnedBalanceUgx: dynamicPlatformBalance,
          },
        })
      } else {
        if (wallet.balanceUgx !== dynamicPlatformBalance) {
          wallet = await this.prisma.wallet.update({
            where: { id: wallet.id },
            data: {
              balanceUgx: dynamicPlatformBalance,
              earnedBalanceUgx: dynamicPlatformBalance,
            },
          })
        }
      }
      return wallet
    }

    let wallet = await this.prisma.wallet.findFirst({
      where: {
        tenantId,
        ownerType: WalletOwnerType.TENANT,
        ownerReference: tenantId,
      },
    })

    if (wallet) {
      const mmGrossSum = await this.prisma.billingTransaction.aggregate({
        where: {
          tenantId,
          type: BillingTransactionType.MOBILE_MONEY_SALE,
          status: BillingTransactionStatus.COMPLETED
        },
        _sum: {
          netAmountUgx: true
        }
      })
      const totalMMSalesNet = mmGrossSum._sum.netAmountUgx ?? 0

      const topupsSum = await this.prisma.billingTransaction.aggregate({
        where: {
          tenantId,
          type: BillingTransactionType.TENANT_WALLET_TOPUP,
          status: BillingTransactionStatus.COMPLETED
        },
        _sum: {
          grossAmountUgx: true
        }
      })
      const totalTopups = topupsSum._sum.grossAmountUgx ?? 0

      const voucherFeesSum = await this.prisma.billingTransaction.aggregate({
        where: {
          tenantId,
          type: {
            in: [BillingTransactionType.VOUCHER_SALE, BillingTransactionType.VOUCHER_REDEMPTION]
          },
          status: BillingTransactionStatus.COMPLETED
        },
        _sum: {
          feeAmountUgx: true
        }
      })
      const totalVoucherFees = voucherFeesSum._sum.feeAmountUgx ?? 0

      const withdrawalsSum = await this.prisma.disbursement.aggregate({
        where: {
          tenantId,
          status: DisbursementStatus.COMPLETED
        },
        _sum: {
          amountUgx: true
        }
      })
      const totalWithdrawn = withdrawalsSum._sum.amountUgx ?? 0

      const computedBalance = totalMMSalesNet + totalTopups - totalVoucherFees - totalWithdrawn

      if (wallet.balanceUgx !== computedBalance) {
        wallet = await this.prisma.wallet.update({
          where: { id: wallet.id },
          data: {
            balanceUgx: computedBalance,
            earnedBalanceUgx: computedBalance
          }
        })
      }
    }

    return wallet
  }
  async submitReservedWithdrawal(disbursementId: string) {
    const disbursement = await this.prisma.disbursement.findUnique({
      where: { id: disbursementId },
      include: { billingTransaction: true, wallet: true },
    })
    if (!disbursement || !disbursement.billingTransactionId) {
      throw new NotFoundException('Withdrawal not found')
    }
    if (!disbursement.destinationReference || !disbursement.network) {
      throw new BadRequestException('Withdrawal payout destination is incomplete')
    }

    const provider = this.paymentRouterService.resolveDisbursement(disbursement.network)

    try {
      const providerResponse = await provider.sendMoney({
        amountUgx: disbursement.amountUgx,
        currency: disbursement.wallet.currency,
        phoneNumber: disbursement.destinationReference,
        externalReference: disbursement.reference,
        narrative: 'AROfi business wallet withdrawal',
        network: disbursement.network,
      })

      return this.completeProviderSubmission({
        reserved: {
          walletId: disbursement.walletId,
          currency: disbursement.wallet.currency,
          billingTransactionId: disbursement.billingTransactionId,
          disbursementId: disbursement.id,
        },
        providerResponse,
        ...this.objectMetadata(disbursement.metadata),
      })
    } catch (error) {
      const metadata = this.objectMetadata(disbursement.metadata)
      const isReferralWithdrawal = typeof metadata.referralWalletTransactionId === 'string'
      if (!isReferralWithdrawal) {
        await this.releaseFailedWithdrawalReserve({
          tenantId: disbursement.tenantId,
          walletId: disbursement.walletId,
          billingTransactionId: disbursement.billingTransactionId,
          disbursementId: disbursement.id,
          amountUgx: disbursement.amountUgx,
          totalDebitUgx: disbursement.billingTransaction?.grossAmountUgx ?? disbursement.amountUgx,
          reference: disbursement.reference,
          errorMessage: error instanceof Error ? error.message : 'Unable to submit withdrawal to provider',
        })
      }
      throw new ServiceUnavailableException(error instanceof Error ? error.message : 'Unable to submit withdrawal to provider')
    }
  }

  private async completeProviderSubmission(input: {
    reserved: {
      walletId: string
      currency?: string
      billingTransactionId: string
      disbursementId: string
    }
    providerResponse: {
      status?: string
      statusCode?: number
      transactionStatus?: string
      transactionReference?: string
      [key: string]: unknown
    }
    payoutNumberId?: unknown
    requestedByUserId?: unknown
    termsVersion?: unknown
    payoutAmountUgx?: unknown
    totalDebitUgx?: unknown
    withdrawalFee?: unknown
    referralWalletTransactionId?: unknown
  }) {
    const finalStatus = this.providerResponseCompleted(input.providerResponse)
      ? DisbursementStatus.COMPLETED
      : DisbursementStatus.PROCESSING

    const result = await this.prisma.$transaction(async (tx) => {
      const billingTransaction = await tx.billingTransaction.update({
        where: { id: input.reserved.billingTransactionId },
        data: { status: BillingTransactionStatus.COMPLETED },
      })
      const disbursement = await tx.disbursement.update({
        where: { id: input.reserved.disbursementId },
        data: {
          status: finalStatus,
          providerReference: input.providerResponse.transactionReference,
          completedAt: finalStatus === DisbursementStatus.COMPLETED ? new Date() : undefined,
          notes:
            finalStatus === DisbursementStatus.COMPLETED
              ? 'Withdrawal sent successfully.'
              : 'Withdrawal sent to provider and is processing.',
          metadata: this.toJsonValue({
            payoutNumberId: input.payoutNumberId,
            providerResponse: input.providerResponse,
            requestedByUserId: input.requestedByUserId,
            termsVersion: input.termsVersion,
            payoutAmountUgx: input.payoutAmountUgx,
            totalDebitUgx: input.totalDebitUgx,
            withdrawalFee: input.withdrawalFee,
          }),
        },
      })
      await this.writeAudit({
        tenantId: disbursement.tenantId,
        userId: typeof input.requestedByUserId === 'string' ? input.requestedByUserId : undefined,
        action: 'withdrawal.payout_sent',
        entity: 'Disbursement',
        entityId: disbursement.id,
        details: { status: finalStatus, providerReference: input.providerResponse.transactionReference },
        client: tx,
      })
      if (typeof input.referralWalletTransactionId === 'string') {
        const referralWithdrawal = await tx.referralWalletTransaction.update({
          where: { id: input.referralWalletTransactionId },
          data: {
            type: finalStatus === DisbursementStatus.COMPLETED ? 'PAID_WITHDRAWAL' : 'WITHDRAWAL_PROCESSING',
            status: finalStatus === DisbursementStatus.COMPLETED ? 'PAID' : 'PROCESSING',
            description:
              finalStatus === DisbursementStatus.COMPLETED
                ? 'Referral wallet withdrawal paid by payout provider'
                : 'Referral wallet withdrawal is processing with payout provider',
          },
        })
        if (finalStatus === DisbursementStatus.COMPLETED) {
          await tx.referralProfile.update({
            where: { id: referralWithdrawal.referrerProfileId },
            data: { withdrawnAmountUgx: { increment: referralWithdrawal.amountUgx } },
          })
        }
      }
      const wallet = await tx.wallet.findUniqueOrThrow({ where: { id: input.reserved.walletId } })
      return {
        disbursement,
        billingTransaction,
        wallet,
        providerStatus: input.providerResponse.transactionStatus,
      }
    })

    void this.notifyWithdrawalEmail({
      tenantId: result.disbursement.tenantId,
      status: finalStatus === DisbursementStatus.COMPLETED ? 'COMPLETED' : 'PROCESSING',
      amountUgx: typeof input.payoutAmountUgx === 'number' ? input.payoutAmountUgx : result.disbursement.amountUgx,
      reference: result.disbursement.reference,
    })

    return result
  }

  private providerResponseCompleted(providerResponse: { statusCode?: number; transactionStatus?: string; status?: string }) {
    const status = (providerResponse.transactionStatus ?? providerResponse.status ?? '').toUpperCase()
    return providerResponse.statusCode === 0 || ['SUCCESS', 'SUCCESSFUL', 'COMPLETED', 'SUCCEEDED'].includes(status)
  }

  private async resolveWithdrawalReviewReason(
    tenantId: string,
    amountUgx: number,
    settings: {
      requireWithdrawalApproval: boolean
      instantWithdrawalsEnabled: boolean
      requireApprovalForFirstWithdrawal: boolean
      requireApprovalAboveAmountUgx: number | null
    },
  ) {
    if (settings.requireWithdrawalApproval) return 'Platform approval mode is enabled'
    if (!settings.instantWithdrawalsEnabled) return 'Instant withdrawals are disabled'
    if (settings.requireApprovalAboveAmountUgx !== null && settings.requireApprovalAboveAmountUgx !== undefined && amountUgx > settings.requireApprovalAboveAmountUgx) {
      return `Amount is above the review threshold of UGX ${settings.requireApprovalAboveAmountUgx.toLocaleString('en-US')}`
    }
    if (settings.requireApprovalForFirstWithdrawal) {
      const completed = await this.prisma.disbursement.count({
        where: { tenantId, agentId: null, status: { in: [DisbursementStatus.COMPLETED, DisbursementStatus.PROCESSING] } },
      })
      if (completed === 0) return 'First withdrawal requires review'
    }
    return null
  }

  private async recordFailedSecretAttempt(
    tenantId: string,
    profileId: string,
    settings: { failedSecretAttemptsBeforeLock: number; withdrawalLockMinutes: number },
    userId?: string,
  ) {
    const updated = await this.prisma.tenantPayoutProfile.update({
      where: { id: profileId },
      data: {
        failedSecretAttempts: { increment: 1 },
        lastFailedSecretAt: new Date(),
      },
    })
    await this.writeAudit({
      tenantId,
      userId,
      action: 'withdrawal.secret_failed',
      entity: 'TenantPayoutProfile',
      entityId: profileId,
      severity: AuditSeverity.WARNING,
      details: { failedSecretAttempts: updated.failedSecretAttempts },
    })

    if (updated.failedSecretAttempts >= settings.failedSecretAttemptsBeforeLock) {
      const lockedUntil = new Date(Date.now() + settings.withdrawalLockMinutes * 60_000)
      await this.prisma.tenantPayoutProfile.update({
        where: { id: profileId },
        data: { withdrawalLockedUntil: lockedUntil },
      })
      await this.writeAudit({
        tenantId,
        userId,
        action: 'withdrawal.locked',
        entity: 'TenantPayoutProfile',
        entityId: profileId,
        severity: AuditSeverity.WARNING,
        details: { lockedUntil, failedSecretAttempts: updated.failedSecretAttempts },
      })
    }
  }

  private async getWithdrawalForAction(disbursementId: string, scopedTenantId?: string) {
    const disbursement = await this.prisma.disbursement.findUnique({
      where: { id: disbursementId },
      include: { billingTransaction: true },
    })
    if (!disbursement || disbursement.agentId) {
      throw new NotFoundException('Withdrawal not found')
    }
    if (scopedTenantId && disbursement.tenantId !== scopedTenantId) {
      throw new NotFoundException('Withdrawal not found')
    }
    return disbursement
  }

  private assertSupportedNetwork(network: PaymentNetwork) {
    if (network !== PaymentNetwork.MTN && network !== PaymentNetwork.AIRTEL) {
      throw new BadRequestException('Payout network must be MTN or Airtel')
    }
  }

  private toJsonValue(value: unknown): Prisma.InputJsonValue {
    return JSON.parse(JSON.stringify(value ?? {})) as Prisma.InputJsonValue
  }

  private async releaseFailedWithdrawalReserve(input: {
    tenantId: string
    walletId: string
    billingTransactionId: string
    disbursementId: string
    amountUgx: number
    totalDebitUgx: number
    reference: string
    errorMessage: string
    disbursementStatus?: DisbursementStatus
    billingStatus?: BillingTransactionStatus
    notes?: string
    extraMetadata?: Record<string, unknown>
  }) {
    const released = await this.prisma.$transaction(async (tx) => {
      const disbursement = await tx.disbursement.findUnique({ where: { id: input.disbursementId } })
      if (
        !disbursement ||
        disbursement.status === DisbursementStatus.FAILED ||
        disbursement.status === DisbursementStatus.REVERSED ||
        disbursement.status === DisbursementStatus.CANCELLED
      ) {
        return false
      }

      await tx.wallet.update({
        where: { id: input.walletId },
        data: { balanceUgx: { increment: input.totalDebitUgx } },
      })

      if (input.tenantId === 'platform') {
        await tx.platformSetting.update({
          where: { id: PLATFORM_SETTINGS_ID },
          data: {
            platformWalletBalanceUgx: {
              increment: input.totalDebitUgx,
            },
          },
        })
      }

      await tx.ledgerTransaction.create({
        data: {
          tenantId: input.tenantId,
          walletId: input.walletId,
          reference: `REVERSAL-${input.reference}`,
          type: LedgerTransactionType.DISBURSEMENT,
          channel: BillingChannel.DISBURSEMENT,
          description: 'Business wallet withdrawal reserve released',
          grossAmountUgx: input.totalDebitUgx,
          feeAmountUgx: 0,
          netAmountUgx: input.totalDebitUgx,
          sourceType: 'VendorWithdrawalReversal',
          sourceId: input.disbursementId,
          metadata: this.toJsonValue({ errorMessage: input.errorMessage }),
          entries: {
            create: [
              {
                tenantId: input.tenantId,
                walletId: input.walletId,
                accountCode: 'tenant_wallet',
                direction: LedgerDirection.CREDIT,
                amountUgx: input.totalDebitUgx,
                memo: 'Withdrawal provider submission failed',
              },
              {
                tenantId: input.tenantId,
                accountCode: 'disbursement_clearing',
                direction: LedgerDirection.DEBIT,
                amountUgx: input.amountUgx,
                memo: 'Withdrawal reserve released',
              },
              ...(input.totalDebitUgx > input.amountUgx
                ? [
                    {
                      tenantId: input.tenantId,
                      accountCode: 'platform_revenue',
                      direction: LedgerDirection.DEBIT,
                      amountUgx: input.totalDebitUgx - input.amountUgx,
                      memo: 'Withdrawal charge released',
                    },
                  ]
                : []),
            ],
          },
        },
      })

      await tx.billingTransaction.update({
        where: { id: input.billingTransactionId },
        data: { status: input.billingStatus ?? BillingTransactionStatus.FAILED },
      })

      await tx.disbursement.update({
        where: { id: input.disbursementId },
        data: {
          status: input.disbursementStatus ?? DisbursementStatus.FAILED,
          failedAt: new Date(),
          notes: input.notes ?? 'Provider did not accept withdrawal request. Wallet reserve released.',
          metadata: this.toJsonValue({ errorMessage: input.errorMessage, ...input.extraMetadata }),
        },
      })

      await this.writeAudit({
        tenantId: input.tenantId,
        action: input.disbursementStatus === DisbursementStatus.REVERSED ? 'withdrawal.balance_reversed' : 'withdrawal.payout_failed',
        entity: 'Disbursement',
        entityId: input.disbursementId,
        severity: AuditSeverity.WARNING,
        details: { errorMessage: input.errorMessage, totalDebitUgx: input.totalDebitUgx },
        client: tx,
      })

      return true
    })

    if (released) {
      void this.notifyWithdrawalEmail({
        tenantId: input.tenantId,
        status: input.disbursementStatus === DisbursementStatus.REVERSED ? 'REJECTED' : 'FAILED',
        amountUgx: input.amountUgx,
        reference: input.reference,
        reason: input.errorMessage,
      })
    }
  }

  private buildDateFilter(filters: { from?: string; to?: string }) {
    const createdAt: Prisma.DateTimeFilter = {}
    const from = filters.from ? new Date(filters.from) : null
    const to = filters.to ? new Date(filters.to) : null
    if (from && Number.isFinite(from.getTime())) createdAt.gte = from
    if (to && Number.isFinite(to.getTime())) createdAt.lte = to
    return Object.keys(createdAt).length ? { createdAt } : {}
  }

  private objectMetadata(value: Prisma.JsonValue | null): Record<string, unknown> {
    return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}
  }

  private calculateWithdrawalFee(
    amountUgx: number,
    settings: { withdrawalFeeBps: number; withdrawalFlatFeeUgx: number },
  ) {
    const basisPoints = settings.withdrawalFeeBps
    const flatFeeUgx = settings.withdrawalFlatFeeUgx
    const percentageFeeUgx = Math.round((amountUgx * basisPoints) / 10000)
    return {
      basisPoints,
      flatFeeUgx,
      percentageFeeUgx,
      feeAmountUgx: percentageFeeUgx + flatFeeUgx,
    }
  }

  private getPlatformSettings() {
    return this.prisma.platformSetting.upsert({
      where: { id: PLATFORM_SETTINGS_ID },
      update: {},
      create: { id: PLATFORM_SETTINGS_ID },
    })
  }

  async initiateTopup(tenantId: string, dto: TopUpWalletDto) {
    const wallet = await this.findTenantWallet(tenantId)
    if (!wallet) {
      throw new NotFoundException('Wallet not found')
    }

    const reference = `BUSINESS-TOPUP-${Date.now()}-${randomUUID().slice(0, 8).toUpperCase()}`

    const billingTransaction = await this.prisma.billingTransaction.create({
      data: {
        tenantId,
        walletId: wallet.id,
        channel: BillingChannel.MOBILE_MONEY,
        type: BillingTransactionType.TENANT_WALLET_TOPUP,
        status: BillingTransactionStatus.PENDING,
        grossAmountUgx: dto.amountUgx,
        feeAmountUgx: 0,
        netAmountUgx: dto.amountUgx,
        customerReference: dto.phoneNumber,
        externalReference: reference,
      },
    })

    const network = this.phoneNumberService.resolveNetwork(dto.phoneNumber)
    const provider = this.paymentRouterService.resolveCollection(network)

    try {
      const response = await provider.collectPayment({
        amountUgx: dto.amountUgx,
        currency: 'UGX',
        phoneNumber: dto.phoneNumber,
        network,
        externalReference: reference,
        narrative: 'AROFi Wallet Topup',
      })

      await this.prisma.billingTransaction.update({
        where: { id: billingTransaction.id },
        data: {
          metadata: {
            providerReference: response.transactionReference || undefined,
          },
        },
      })

      return {
        success: true,
        reference,
        status: 'PENDING',
        statusMessage: response.statusMessage || 'Topup request sent. Enter MM PIN on your phone.',
      }
    } catch (error) {
      await this.prisma.billingTransaction.update({
        where: { id: billingTransaction.id },
        data: {
          status: BillingTransactionStatus.FAILED,
        },
      })
      throw error
    }
  }

  async checkTopupStatus(reference: string, tenantId: string) {
    const txRecord = await this.prisma.billingTransaction.findUnique({
      where: { externalReference: reference },
    })

    if (!txRecord || txRecord.tenantId !== tenantId) {
      throw new NotFoundException('Topup transaction not found')
    }

    if (txRecord.status !== BillingTransactionStatus.PENDING) {
      return txRecord
    }

    const network = this.phoneNumberService.resolveNetwork(txRecord.customerReference || '')
    const provider = this.paymentRouterService.resolveCollection(network)
    const metadata = (txRecord.metadata || {}) as Record<string, any>
    const providerReference = metadata.providerReference || txRecord.externalReference
    try {
      const gatewayResponse = await provider.getPaymentStatus(providerReference)
      const providerStatus = (gatewayResponse.transactionStatus ?? '').toUpperCase()

      if (
        providerStatus === 'SUCCESSFUL' ||
        providerStatus === 'SUCCEEDED' ||
        providerStatus === 'PAID' ||
        providerStatus === 'COMPLETED' ||
        providerStatus === 'SUCCESS'
      ) {
        await this.prisma.$transaction(async (tx) => {
          await tx.billingTransaction.update({
            where: { id: txRecord.id },
            data: {
              status: BillingTransactionStatus.COMPLETED,
              metadata: {
                providerReference: gatewayResponse.transactionReference || providerReference,
              },
            },
          })

          if (txRecord.walletId) {
            await tx.wallet.update({
              where: { id: txRecord.walletId },
              data: {
                balanceUgx: {
                  increment: txRecord.grossAmountUgx,
                },
              },
            })
          }
        })
      } else if (providerStatus === 'FAILED') {
        await this.prisma.billingTransaction.update({
          where: { id: txRecord.id },
          data: {
            status: BillingTransactionStatus.FAILED,
          },
        })
      }
    } catch (error) {
      console.error('Failed to check topup status', error)
    }

    return this.prisma.billingTransaction.findUnique({
      where: { externalReference: reference },
    })
  }

  private async writeAudit(input: {
    tenantId?: string | null
    userId?: string
    action: string
    entity: string
    entityId?: string
    severity?: AuditSeverity
    details?: Record<string, unknown>
    client?: Prisma.TransactionClient
  }) {
    const client = input.client ?? this.prisma
    await client.auditLog.create({
      data: {
        tenantId: input.tenantId ?? null,
        userId: input.userId,
        action: input.action,
        entity: input.entity,
        entityId: input.entityId,
        severity: input.severity ?? AuditSeverity.INFO,
        details: this.toJsonValue(input.details ?? {}),
      },
    })
  }
}
