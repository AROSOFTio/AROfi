import * as bcrypt from 'bcrypt'
import { BadRequestException, NotFoundException, ServiceUnavailableException } from '@nestjs/common'
import { BillingTransactionStatus, DisbursementStatus, PaymentNetwork, PaymentProvider, PayoutNumberChangeStatus, PayoutNumberStatus } from '@prisma/client'
import { WalletsService } from './wallets.service'

describe('WalletsService withdrawals', () => {
  const provider = {
    provider: PaymentProvider.MTN_MOMO_DIRECT,
    sendMoney: jest.fn(),
  }

  const tx = {
    wallet: {
      findFirst: jest.fn(),
      updateMany: jest.fn(),
      update: jest.fn(),
      findUniqueOrThrow: jest.fn(),
    },
    ledgerTransaction: { create: jest.fn() },
    billingTransaction: {
      create: jest.fn(),
      update: jest.fn(),
    },
    disbursement: {
      create: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
      findUnique: jest.fn(),
      findMany: jest.fn(),
    },
    auditLog: { create: jest.fn() },
  }

  const prisma: any = {
    tenant: { findUnique: jest.fn().mockResolvedValue(null) },
    tenantPayoutProfile: {
      findUnique: jest.fn(),
      update: jest.fn(),
    },
    tenantSetting: { upsert: jest.fn() },
    platformSetting: { upsert: jest.fn() },
    tenantPayoutNumberChangeRequest: { findFirst: jest.fn() },
    tenantPayoutNumber: { findMany: jest.fn() },
    disbursement: {
      count: jest.fn(),
      findUnique: jest.fn(),
      findUniqueOrThrow: jest.fn(),
      updateMany: jest.fn(),
    },
    billingTransaction: { findUniqueOrThrow: jest.fn() },
    wallet: { findUniqueOrThrow: jest.fn() },
    auditLog: { create: jest.fn() },
    $transaction: jest.fn((callback: any) => callback(tx)),
  }

  const paymentRouter: any = {
    resolveDisbursement: jest.fn(() => provider),
  }

  const phoneNumberService: any = {}
  const mailService: any = { sendWithdrawalStatusEmail: jest.fn() }

  const service = new WalletsService(prisma, paymentRouter, phoneNumberService, mailService)

  const settings = {
    id: 'global',
    minimumWithdrawalUgx: 1000,
    withdrawalFeeBps: 0,
    withdrawalFlatFeeUgx: 0,
    requireWithdrawalApproval: false,
    instantWithdrawalsEnabled: true,
    requireApprovalForFirstWithdrawal: false,
    requireApprovalAboveAmountUgx: null,
    failedSecretAttemptsBeforeLock: 5,
    withdrawalLockMinutes: 30,
    payoutNumberChangeRequiresApproval: true,
    maxPayoutNumbers: 2,
  }

  const dto = {
    amountUgx: 10_000,
    secretKey: 'correct-secret',
    confirmPhoneInPossession: true,
    acceptFinalTerms: true,
  }

  beforeEach(() => {
    jest.clearAllMocks()
    jest.spyOn(bcrypt, 'compare').mockResolvedValue(true as never)
    prisma.tenantPayoutProfile.findUnique.mockResolvedValue({
      id: 'profile-1',
      tenantId: 'tenant-1',
      secretHash: 'hash',
      termsVersion: '2026-05-22',
      failedSecretAttempts: 0,
      withdrawalLockedUntil: null,
    })
    prisma.tenantSetting.upsert.mockResolvedValue({ kycCompleted: true, accountActive: true, fraudHold: false })
    prisma.platformSetting.upsert.mockResolvedValue(settings)
    prisma.tenantPayoutNumberChangeRequest.findFirst.mockResolvedValue(null)
    prisma.tenantPayoutNumber.findMany.mockResolvedValue([
      {
        id: 'payout-1',
        tenantId: 'tenant-1',
        network: PaymentNetwork.MTN,
        normalizedPhone: '+256771234567',
        status: PayoutNumberStatus.VERIFIED,
        isPrimary: true,
        verifiedAt: new Date(),
      },
    ])
    prisma.disbursement.count.mockResolvedValue(1)
    prisma.disbursement.findUnique.mockResolvedValue({
      id: 'disb-1',
      tenantId: 'tenant-1',
      status: DisbursementStatus.PROCESSING,
      metadata: {},
    })
    prisma.disbursement.findUniqueOrThrow.mockResolvedValue({ id: 'disb-1', status: DisbursementStatus.FLAGGED_FOR_REVIEW })
    prisma.disbursement.updateMany.mockResolvedValue({ count: 1 })
    prisma.billingTransaction.findUniqueOrThrow.mockResolvedValue({ id: 'billing-1', status: BillingTransactionStatus.PENDING })
    prisma.wallet.findUniqueOrThrow.mockResolvedValue({ id: 'wallet-1', balanceUgx: 40_000 })
    tx.wallet.findFirst.mockResolvedValue({ id: 'wallet-1', balanceUgx: 50_000, currency: 'UGX' })
    tx.wallet.updateMany.mockResolvedValue({ count: 1 })
    tx.wallet.update.mockResolvedValue({ id: 'wallet-1', balanceUgx: 50_000 })
    tx.ledgerTransaction.create.mockResolvedValue({ id: 'ledger-1' })
    tx.billingTransaction.create.mockResolvedValue({ id: 'billing-1' })
    tx.disbursement.create.mockResolvedValue({ id: 'disb-1' })
    tx.disbursement.findMany.mockResolvedValue([])
    tx.billingTransaction.update.mockResolvedValue({ id: 'billing-1', status: BillingTransactionStatus.COMPLETED })
    tx.disbursement.update.mockResolvedValue({ id: 'disb-1', tenantId: 'tenant-1', status: DisbursementStatus.PROCESSING })
    tx.disbursement.updateMany.mockResolvedValue({ count: 1 })
    tx.wallet.findUniqueOrThrow.mockResolvedValue({ id: 'wallet-1', balanceUgx: 40_000 })
    tx.disbursement.findUnique.mockResolvedValue({
      id: 'disb-1',
      tenantId: 'tenant-1',
      status: DisbursementStatus.PROCESSING,
      metadata: {},
    })
    provider.sendMoney.mockResolvedValue({
      status: 'OK',
      statusCode: 1,
      transactionStatus: 'PENDING',
      transactionReference: 'provider-1',
      rawRequest: '{}',
      rawResponse: '{}',
    })
  })

  it('sends an instant withdrawal to a registered verified payout number', async () => {
    const result = await service.requestWithdrawal('tenant-1', dto, 'user-1')

    expect(provider.sendMoney).toHaveBeenCalledWith(expect.objectContaining({
      amountUgx: 10_000,
      phoneNumber: '+256771234567',
      network: PaymentNetwork.MTN,
    }))
    expect(result.disbursement.status).toBe(DisbursementStatus.PROCESSING)
  })

  it('blocks withdrawal when no registered verified payout number exists', async () => {
    prisma.tenantPayoutNumber.findMany.mockResolvedValue([])

    await expect(service.requestWithdrawal('tenant-1', dto, 'user-1')).rejects.toBeInstanceOf(NotFoundException)
    expect(provider.sendMoney).not.toHaveBeenCalled()
  })

  it('blocks withdrawal while payout number change is pending', async () => {
    prisma.tenantPayoutNumberChangeRequest.findFirst.mockResolvedValue({ id: 'change-1', status: PayoutNumberChangeStatus.PENDING_ADMIN_APPROVAL })

    await expect(service.requestWithdrawal('tenant-1', dto, 'user-1')).rejects.toBeInstanceOf(BadRequestException)
    expect(provider.sendMoney).not.toHaveBeenCalled()
  })

  it('increments failed attempts when the withdrawal secret is wrong', async () => {
    jest.spyOn(bcrypt, 'compare').mockResolvedValue(false as never)
    prisma.tenantPayoutProfile.update.mockResolvedValue({ failedSecretAttempts: 1 })

    await expect(service.requestWithdrawal('tenant-1', dto, 'user-1')).rejects.toBeInstanceOf(BadRequestException)

    expect(prisma.tenantPayoutProfile.update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'profile-1' },
      data: expect.objectContaining({ failedSecretAttempts: { increment: 1 } }),
    }))
  })

  it('locks withdrawals after too many wrong secret attempts', async () => {
    jest.spyOn(bcrypt, 'compare').mockResolvedValue(false as never)
    prisma.tenantPayoutProfile.update.mockResolvedValueOnce({ failedSecretAttempts: 5 }).mockResolvedValueOnce({})

    await expect(service.requestWithdrawal('tenant-1', dto, 'user-1')).rejects.toBeInstanceOf(BadRequestException)

    expect(prisma.tenantPayoutProfile.update).toHaveBeenLastCalledWith(expect.objectContaining({
      data: expect.objectContaining({ withdrawalLockedUntil: expect.any(Date) }),
    }))
  })

  it('keeps the wallet reserve locked when provider submission outcome is uncertain', async () => {
    provider.sendMoney.mockRejectedValue(new ServiceUnavailableException('provider timeout'))

    await expect(service.requestWithdrawal('tenant-1', dto, 'user-1')).rejects.toBeInstanceOf(ServiceUnavailableException)

    // A timeout may happen after the provider accepted the payout. Never give
    // the reserved money back until callback/status reconciliation proves fail.
    expect(tx.wallet.update).not.toHaveBeenCalledWith(expect.objectContaining({
      data: { balanceUgx: { increment: 10_000 } },
    }))
    expect(prisma.disbursement.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ id: 'disb-1' }),
      data: expect.objectContaining({ status: DisbursementStatus.PROCESSING }),
    }))
  })

  it('releases the reserve for a definite pre-submission validation rejection', async () => {
    provider.sendMoney.mockRejectedValue(new BadRequestException('invalid payout request'))

    await expect(service.requestWithdrawal('tenant-1', dto, 'user-1')).rejects.toBeInstanceOf(BadRequestException)

    expect(tx.wallet.update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'wallet-1' },
      data: { balanceUgx: { increment: 10_000 } },
    }))
  })

  it('refunds a failed reserve only once when two failure paths race', async () => {
    tx.disbursement.updateMany
      .mockResolvedValueOnce({ count: 1 })
      .mockResolvedValueOnce({ count: 0 })

    const releaseInput = {
      tenantId: 'tenant-1',
      walletId: 'wallet-1',
      billingTransactionId: 'billing-1',
      disbursementId: 'disb-1',
      amountUgx: 10_000,
      totalDebitUgx: 10_000,
      reference: 'WD-TEST',
      errorMessage: 'provider confirmed failure',
    }

    await Promise.all([
      (service as any).releaseFailedWithdrawalReserve(releaseInput),
      (service as any).releaseFailedWithdrawalReserve(releaseInput),
    ])

    const refundCalls = tx.wallet.update.mock.calls.filter(
      ([arg]: any[]) => arg?.data?.balanceUgx?.increment === 10_000,
    )
    expect(refundCalls).toHaveLength(1)
  })

  it('auto-sends high-risk withdrawals after the secret PIN passes', async () => {
    prisma.platformSetting.upsert.mockResolvedValue({ ...settings, requireApprovalAboveAmountUgx: 5_000 })

    const result = await service.requestWithdrawal('tenant-1', dto, 'user-1')

    expect(provider.sendMoney).toHaveBeenCalled()
    expect(result.disbursement.status).toBe(DisbursementStatus.PROCESSING)
  })
})
