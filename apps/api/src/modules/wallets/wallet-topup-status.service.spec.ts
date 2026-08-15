import { NotFoundException } from '@nestjs/common'
import {
  BillingTransactionStatus,
  PaymentNetwork,
  PaymentProvider,
} from '@prisma/client'
import { WalletTopupStatusService } from './wallet-topup-status.service'

describe('WalletTopupStatusService', () => {
  const pendingTopup = {
    id: 'tx-1',
    tenantId: 'tenant-1',
    walletId: 'wallet-1',
    status: BillingTransactionStatus.PENDING,
    grossAmountUgx: 10_000,
    customerReference: '256771234567',
    externalReference: 'BUSINESS-TOPUP-TEST',
    metadata: {
      provider: PaymentProvider.YO_UGANDA,
      providerReference: 'provider-ref-1',
    },
  }

  function buildHarness(options?: { amount?: string; status?: string }) {
    const claim = jest
      .fn()
      .mockResolvedValueOnce({ count: 1 })
      .mockResolvedValue({ count: 0 })
    const walletUpdate = jest.fn().mockResolvedValue({})
    const outsideUpdateMany = jest.fn().mockResolvedValue({ count: 1 })

    const prisma = {
      billingTransaction: {
        findUnique: jest.fn().mockResolvedValue(pendingTopup),
        updateMany: outsideUpdateMany,
      },
      platformSetting: {
        upsert: jest.fn(),
      },
      $transaction: jest.fn(async (callback: (tx: any) => Promise<unknown>) =>
        callback({
          billingTransaction: { updateMany: claim },
          wallet: { update: walletUpdate },
        }),
      ),
    }

    const provider = {
      provider: PaymentProvider.YO_UGANDA,
      getPaymentStatus: jest.fn().mockResolvedValue({
        status: options?.status ?? 'SUCCESS',
        statusCode: 0,
        transactionStatus: options?.status ?? 'SUCCESSFUL',
        transactionReference: 'provider-ref-1',
        amount: options?.amount ?? '10000',
        rawRequest: '',
        rawResponse: '',
      }),
    }

    const paymentRouter = {
      resolveCollection: jest.fn().mockReturnValue(provider),
    }
    const phoneNumbers = {
      resolveNetwork: jest.fn().mockReturnValue(PaymentNetwork.MTN),
    }

    const service = new WalletTopupStatusService(
      prisma as any,
      paymentRouter as any,
      phoneNumbers as any,
    )

    return {
      service,
      prisma,
      provider,
      claim,
      walletUpdate,
      outsideUpdateMany,
    }
  }

  it('credits the wallet only once when two status checks race on the same pending topup', async () => {
    const harness = buildHarness()

    await Promise.all([
      harness.service.check('BUSINESS-TOPUP-TEST', 'tenant-1'),
      harness.service.check('BUSINESS-TOPUP-TEST', 'tenant-1'),
    ])

    expect(harness.claim).toHaveBeenCalledTimes(2)
    expect(harness.walletUpdate).toHaveBeenCalledTimes(1)
    expect(harness.walletUpdate).toHaveBeenCalledWith({
      where: { id: 'wallet-1' },
      data: { balanceUgx: { increment: 10_000 } },
    })
  })

  it('rejects cross-tenant topup status access before contacting the provider', async () => {
    const harness = buildHarness()

    await expect(
      harness.service.check('BUSINESS-TOPUP-TEST', 'tenant-2'),
    ).rejects.toBeInstanceOf(NotFoundException)

    expect(harness.provider.getPaymentStatus).not.toHaveBeenCalled()
  })

  it('does not credit an underpaid topup even when the provider status says success', async () => {
    const harness = buildHarness({ amount: '5000' })

    await harness.service.check('BUSINESS-TOPUP-TEST', 'tenant-1')

    expect(harness.prisma.$transaction).not.toHaveBeenCalled()
    expect(harness.walletUpdate).not.toHaveBeenCalled()
    expect(harness.outsideUpdateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          id: 'tx-1',
          tenantId: 'tenant-1',
          status: BillingTransactionStatus.PENDING,
        }),
        data: expect.objectContaining({
          status: BillingTransactionStatus.FAILED,
        }),
      }),
    )
  })
})
