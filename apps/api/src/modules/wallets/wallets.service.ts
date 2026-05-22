import {
  BillingChannel,
  BillingTransactionStatus,
  BillingTransactionType,
  DisbursementMethod,
  DisbursementStatus,
  LedgerDirection,
  LedgerTransactionType,
  PaymentNetwork,
  Prisma,
  PayoutNumberStatus,
  WalletOwnerType,
} from '@prisma/client'
import { BadRequestException, Injectable, NotFoundException, ServiceUnavailableException } from '@nestjs/common'
import * as bcrypt from 'bcrypt'
import { randomUUID } from 'crypto'
import { PrismaService } from '../../prisma.service'
import { PaymentRouterService } from '../payments/payment-router.service'
import { PhoneNumberService } from '../payments/phone-number.service'
import { RegisterPayoutNumberDto } from './dto/register-payout-number.dto'
import { RequestPayoutNumberChangeDto } from './dto/request-payout-number-change.dto'
import { RequestWithdrawalDto } from './dto/request-withdrawal.dto'
import { SetPayoutSecretDto } from './dto/set-payout-secret.dto'

@Injectable()
export class WalletsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly paymentRouterService: PaymentRouterService,
    private readonly phoneNumberService: PhoneNumberService,
  ) {}

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
    const [profile, numbers, changeRequests, wallet, recentWithdrawals] = await Promise.all([
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
    ])

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
        maxActiveNumbers: 2,
        registeredNumbersOnly: true,
        numberChangesRequireApproval: true,
        secretKeyRequired: true,
        finalAfterProviderAccepts: true,
        minimumPayoutUgx: this.getMinimumPayoutUgx(),
        withdrawalFeeBasisPoints: this.getWithdrawalFeeBasisPoints(),
        withdrawalFlatFeeUgx: this.getWithdrawalFlatFeeUgx(),
      },
    }
  }

  async setPayoutSecret(tenantId: string, dto: SetPayoutSecretDto) {
    const secretHash = await bcrypt.hash(dto.secretKey, 12)
    await this.prisma.tenantPayoutProfile.upsert({
      where: { tenantId },
      update: { secretHash },
      create: { tenantId, secretHash },
    })

    return { secretConfigured: true }
  }

  async registerPayoutNumber(tenantId: string, dto: RegisterPayoutNumberDto) {
    this.assertSupportedNetwork(dto.network)
    const normalizedPhone = this.phoneNumberService.normalizeForNetwork(dto.phoneNumber, dto.network)

    return this.prisma.$transaction(async (tx) => {
      const activeCount = await tx.tenantPayoutNumber.count({
        where: { tenantId, status: PayoutNumberStatus.ACTIVE },
      })

      if (activeCount >= 2) {
        throw new BadRequestException('You can register only two payout numbers. Request a number change instead.')
      }

      return tx.tenantPayoutNumber.create({
        data: {
          tenantId,
          network: dto.network,
          phone: dto.phoneNumber.trim(),
          normalizedPhone,
          label: dto.label?.trim(),
        },
      })
    })
  }

  async requestPayoutNumberChange(tenantId: string, dto: RequestPayoutNumberChangeDto, userId: string) {
    this.assertSupportedNetwork(dto.network)
    const normalizedPhone = this.phoneNumberService.normalizeForNetwork(dto.phoneNumber, dto.network)

    if (dto.existingPayoutNumberId) {
      const existing = await this.prisma.tenantPayoutNumber.findFirst({
        where: { id: dto.existingPayoutNumberId, tenantId, status: PayoutNumberStatus.ACTIVE },
      })
      if (!existing) {
        throw new NotFoundException('Registered payout number not found')
      }
    }

    return this.prisma.tenantPayoutNumberChangeRequest.create({
      data: {
        tenantId,
        existingPayoutNumberId: dto.existingPayoutNumberId,
        requestedNetwork: dto.network,
        requestedPhone: dto.phoneNumber.trim(),
        requestedNormalizedPhone: normalizedPhone,
        reason: dto.reason.trim(),
      },
    })
  }

  async requestWithdrawal(tenantId: string, dto: RequestWithdrawalDto, userId: string) {
    if (!dto.confirmPhoneInPossession) {
      throw new BadRequestException('Confirm that you have the registered payout phone with you before requesting withdrawal')
    }

    if (!dto.acceptFinalTerms) {
      throw new BadRequestException('Accept the final disbursement terms before requesting withdrawal')
    }

    const profile = await this.prisma.tenantPayoutProfile.findUnique({ where: { tenantId } })
    if (!profile) {
      throw new BadRequestException('Set your disbursement secret key before requesting withdrawal')
    }

    const secretOk = await bcrypt.compare(dto.secretKey, profile.secretHash)
    if (!secretOk) {
      throw new BadRequestException('Invalid disbursement secret key')
    }

    const payoutNumber = await this.prisma.tenantPayoutNumber.findFirst({
      where: {
        id: dto.payoutNumberId,
        tenantId,
        status: PayoutNumberStatus.ACTIVE,
      },
    })

    if (!payoutNumber) {
      throw new NotFoundException('Active registered payout number not found')
    }

    const provider = this.paymentRouterService.resolveDisbursement(payoutNumber.network)
    const reference = `VENDOR-WD-${Date.now()}-${randomUUID().slice(0, 8).toUpperCase()}`
    const fee = this.calculateWithdrawalFee(dto.amountUgx)
    const totalDebitUgx = dto.amountUgx + fee.feeAmountUgx
    const minimumPayoutUgx = this.getMinimumPayoutUgx()

    if (dto.amountUgx < minimumPayoutUgx) {
      throw new BadRequestException(`Minimum withdrawal is UGX ${minimumPayoutUgx.toLocaleString('en-US')}`)
    }

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

      const debited = await tx.wallet.updateMany({
        where: { id: wallet.id, balanceUgx: { gte: totalDebitUgx } },
        data: { balanceUgx: { decrement: totalDebitUgx } },
      })

      if (debited.count !== 1) {
        throw new BadRequestException('Wallet does not have enough available balance for this withdrawal and charges')
      }

      const ledgerTransaction = await tx.ledgerTransaction.create({
        data: {
          tenantId,
          walletId: wallet.id,
          reference: `LEDGER-${reference}`,
          type: LedgerTransactionType.DISBURSEMENT,
          channel: BillingChannel.DISBURSEMENT,
          description: 'Vendor wallet withdrawal reserved',
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
          }),
          entries: {
            create: [
              {
                tenantId,
                walletId: wallet.id,
                accountCode: 'tenant_wallet',
                direction: LedgerDirection.DEBIT,
                amountUgx: totalDebitUgx,
                memo: 'Vendor wallet withdrawal reserve',
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
                      memo: 'Vendor withdrawal charge',
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
          status: DisbursementStatus.PENDING,
          network: payoutNumber.network,
          provider: provider.provider,
          amountUgx: dto.amountUgx,
          destinationReference: payoutNumber.normalizedPhone,
          notes: 'Vendor wallet withdrawal reserved. Final after provider accepts.',
          metadata: this.toJsonValue({
            payoutNumberId: payoutNumber.id,
            requestedByUserId: userId,
            termsVersion: profile.termsVersion,
            payoutAmountUgx: dto.amountUgx,
            totalDebitUgx,
            withdrawalFee: fee,
          }),
        },
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
        narrative: 'AROfi vendor wallet withdrawal',
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

    return this.prisma.$transaction(async (tx) => {
      const billingTransaction = await tx.billingTransaction.update({
        where: { id: reserved.billingTransactionId },
        data: { status: BillingTransactionStatus.COMPLETED },
      })
      const disbursement = await tx.disbursement.update({
        where: { id: reserved.disbursementId },
        data: {
          status: DisbursementStatus.PROCESSING,
          providerReference: providerResponse.transactionReference,
          notes: 'Vendor wallet withdrawal submitted. Final after provider accepts.',
          metadata: this.toJsonValue({
            payoutNumberId: payoutNumber.id,
            providerResponse,
            requestedByUserId: userId,
            termsVersion: profile.termsVersion,
            payoutAmountUgx: dto.amountUgx,
            totalDebitUgx,
            withdrawalFee: fee,
          }),
        },
      })
      const updatedWallet = await tx.wallet.findUniqueOrThrow({ where: { id: reserved.walletId } })

      return {
        disbursement,
        billingTransaction,
        wallet: updatedWallet,
        providerStatus: providerResponse.transactionStatus,
      }
    })
  }

  private async findTenantWallet(tenantId: string) {
    return this.prisma.wallet.findFirst({
      where: {
        tenantId,
        ownerType: WalletOwnerType.TENANT,
        ownerReference: tenantId,
      },
    })
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
  }) {
    await this.prisma.$transaction(async (tx) => {
      const disbursement = await tx.disbursement.findUnique({ where: { id: input.disbursementId } })
      if (!disbursement || disbursement.status === DisbursementStatus.FAILED) {
        return
      }

      await tx.wallet.update({
        where: { id: input.walletId },
        data: { balanceUgx: { increment: input.totalDebitUgx } },
      })

      await tx.ledgerTransaction.create({
        data: {
          tenantId: input.tenantId,
          walletId: input.walletId,
          reference: `REVERSAL-${input.reference}`,
          type: LedgerTransactionType.DISBURSEMENT,
          channel: BillingChannel.DISBURSEMENT,
          description: 'Vendor wallet withdrawal reserve released',
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
        data: { status: BillingTransactionStatus.FAILED },
      })

      await tx.disbursement.update({
        where: { id: input.disbursementId },
        data: {
          status: DisbursementStatus.FAILED,
          failedAt: new Date(),
          notes: 'Provider did not accept withdrawal request. Wallet reserve released.',
          metadata: this.toJsonValue({ errorMessage: input.errorMessage }),
        },
      })
    })
  }

  private calculateWithdrawalFee(amountUgx: number) {
    const basisPoints = this.getWithdrawalFeeBasisPoints()
    const flatFeeUgx = this.getWithdrawalFlatFeeUgx()
    const percentageFeeUgx = Math.round((amountUgx * basisPoints) / 10000)
    return {
      basisPoints,
      flatFeeUgx,
      percentageFeeUgx,
      feeAmountUgx: percentageFeeUgx + flatFeeUgx,
    }
  }

  private getWithdrawalFeeBasisPoints() {
    return this.readNonNegativeIntegerEnv('VENDOR_WITHDRAWAL_FEE_BPS', 0)
  }

  private getWithdrawalFlatFeeUgx() {
    return this.readNonNegativeIntegerEnv('VENDOR_WITHDRAWAL_FLAT_FEE_UGX', 0)
  }

  private getMinimumPayoutUgx() {
    return this.readNonNegativeIntegerEnv('MINIMUM_PAYOUT_UGX', 0)
  }

  private readNonNegativeIntegerEnv(key: string, fallback: number) {
    const value = Number(process.env[key] ?? fallback)
    return Number.isFinite(value) && value >= 0 ? Math.round(value) : fallback
  }
}
