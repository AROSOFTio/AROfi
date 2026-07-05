import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common'
import { createHmac } from 'crypto'
import { PaymentNetwork, PaymentStatus } from '@prisma/client'
import { PhoneNumberService } from './phone-number.service'
import { PaymentsService } from './payments.service'

function buildService(overrides: {
  prisma?: Record<string, unknown>
  config?: Record<string, unknown>
  paymentRouter?: Record<string, unknown>
  phoneNumbers?: Record<string, unknown>
  mail?: Record<string, unknown>
  realtime?: Record<string, unknown>
} = {}) {
  const realtime = overrides.realtime ?? { publish: jest.fn() }
  const mail = overrides.mail ?? { sendOperationalAlertEmail: jest.fn().mockResolvedValue(true) }
  return {
    service: new PaymentsService(
      (overrides.prisma ?? {}) as never,
      (overrides.config ?? { get: jest.fn() }) as never,
      {} as never,
      (overrides.paymentRouter ?? {}) as never,
      (overrides.phoneNumbers ?? {}) as never,
      {} as never,
      mail as never,
      {} as never,
      realtime as never,
    ),
    realtime,
    mail,
  }
}

describe('PaymentsService', () => {
  const service = new PaymentsService(
    {} as never,
    { get: jest.fn() } as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    { publish: jest.fn() } as never,
  )

  it('normalizes local Uganda phone numbers to 256 format', () => {
    expect((service as any).normalizePhoneNumber('0772000000')).toBe('256772000000')
    expect((service as any).normalizePhoneNumber('772000000')).toBe('256772000000')
    expect((service as any).normalizePhoneNumber('+256 772 000000')).toBe('256772000000')
  })

  it('maps provider statuses into internal payment states', () => {
    expect(
      (service as any).mapProviderStatus({
        status: 'OK',
        statusCode: 0,
        transactionStatus: 'SUCCESSFUL',
      }),
    ).toBe(PaymentStatus.COMPLETED)

    expect(
      (service as any).mapProviderStatus({
        status: 'OK',
        statusCode: 1,
        transactionStatus: 'PENDING',
      }),
    ).toBe(PaymentStatus.PENDING)

    expect(
      (service as any).mapProviderStatus({
        status: 'ERROR',
        statusCode: -1,
        transactionStatus: 'FAILED',
      }),
    ).toBe(PaymentStatus.FAILED)
  })

  it('extracts webhook references from common callback payload shapes', () => {
    expect(
      (service as any).extractWebhookReferences({
        ExternalReference: 'AROFI-PAY-001',
        network_ref: 'YO-1234',
      }),
    ).toEqual({
      externalReference: 'AROFI-PAY-001',
      providerReference: 'YO-1234',
    })
  })
})

describe('PaymentsService captive-portal purchase requirements', () => {
  function buildInitiateHarness() {
    const pkg = {
      id: 'pkg-1',
      status: 'ACTIVE',
      tenantId: 'tenant-1',
      tenant: { domain: 'demo.arofi.net' },
      prices: [{ amountUgx: 2000, currency: 'UGX', endsAt: null }],
      name: '1 Hour',
      code: 'H1',
    }
    const prisma = {
      package: { findUnique: jest.fn().mockResolvedValue(pkg) },
      payment: { findUnique: jest.fn().mockResolvedValue(null), create: jest.fn() },
    }
    const paymentRouter = {
      providerFor: jest.fn().mockReturnValue('AGGREGATOR'),
      resolveCollection: jest.fn(),
    }
    const phoneNumbers = {
      normalizeForNetwork: jest.fn().mockReturnValue('256772000000'),
    }
    return buildService({ prisma, paymentRouter, phoneNumbers })
  }

  it('rejects a payment initiated without a device MAC address', async () => {
    const { service } = buildInitiateHarness()

    await expect(
      service.initiatePortalPayment({
        packageId: 'pkg-1',
        phoneNumber: '0772000000',
        network: PaymentNetwork.MTN,
        routerKey: 'router-key',
      } as never),
    ).rejects.toThrow(BadRequestException)
  })

  it('rejects a payment initiated without a router identity', async () => {
    const { service } = buildInitiateHarness()

    await expect(
      service.initiatePortalPayment({
        packageId: 'pkg-1',
        phoneNumber: '0772000000',
        network: PaymentNetwork.MTN,
        macAddress: 'AA:BB:CC:DD:EE:FF',
      } as never),
    ).rejects.toThrow(BadRequestException)
  })
})

describe('PaymentsService status-token protection', () => {
  it('rejects an unauthenticated status check with a wrong token', async () => {
    const prisma = {
      payment: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'payment-1',
          tenantId: 'tenant-1',
          status: PaymentStatus.PENDING,
          statusToken: 'correct-token',
        }),
      },
    }
    const { service } = buildService({ prisma })

    await expect(
      service.checkPaymentStatus('payment-1', undefined, 'wrong-token'),
    ).rejects.toThrow(ForbiddenException)
  })

  it('rejects an unauthenticated status check with no token at all', async () => {
    const prisma = {
      payment: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'payment-1',
          tenantId: 'tenant-1',
          status: PaymentStatus.PENDING,
          statusToken: 'correct-token',
        }),
      },
    }
    const { service } = buildService({ prisma })

    await expect(service.checkPaymentStatus('payment-1')).rejects.toThrow(ForbiddenException)
  })
})

describe('PaymentsService portal tenant resolution', () => {
  it('no longer guesses the newest tenant when no domain or router context is given', async () => {
    const previous = process.env.PORTAL_DEFAULT_TENANT_DOMAIN
    delete process.env.PORTAL_DEFAULT_TENANT_DOMAIN
    try {
      const prisma = {
        tenant: {
          findUnique: jest.fn().mockResolvedValue(null),
          findFirst: jest.fn(),
        },
      }
      const { service } = buildService({ prisma })

      await expect((service as any).resolvePortalTenant(undefined, undefined)).rejects.toThrow(
        NotFoundException,
      )
      // The dangerous "latest tenant with active packages" query is gone.
      expect(prisma.tenant.findFirst).not.toHaveBeenCalled()
    } finally {
      if (previous !== undefined) process.env.PORTAL_DEFAULT_TENANT_DOMAIN = previous
    }
  })

  it('uses the explicitly configured default tenant domain when set', async () => {
    const previous = process.env.PORTAL_DEFAULT_TENANT_DOMAIN
    process.env.PORTAL_DEFAULT_TENANT_DOMAIN = 'default.arofi.net'
    try {
      const tenant = { id: 'tenant-x', domain: 'default.arofi.net' }
      const prisma = {
        tenant: {
          findUnique: jest.fn().mockResolvedValue(tenant),
        },
      }
      const { service } = buildService({ prisma })

      await expect((service as any).resolvePortalTenant(undefined, undefined)).resolves.toEqual(tenant)
    } finally {
      if (previous !== undefined) {
        process.env.PORTAL_DEFAULT_TENANT_DOMAIN = previous
      } else {
        delete process.env.PORTAL_DEFAULT_TENANT_DOMAIN
      }
    }
  })
})

describe('PaymentsService amount mismatch protection', () => {
  it('withholds activation and publishes an alert when the provider reports underpayment', async () => {
    const payment = {
      id: 'payment-1',
      tenantId: 'tenant-1',
      packageId: 'pkg-1',
      status: PaymentStatus.PENDING,
      amountUgx: 5000,
      externalReference: 'AROFI-PAY-777',
      providerReference: null,
      customerReference: null,
      providerStatus: null,
      statusMessage: null,
      completedAt: null,
      failedAt: null,
      metadata: { routerId: 'router-1' },
      billingTransaction: null,
      activation: null,
    }
    const tx = {
      payment: {
        findUnique: jest
          .fn()
          .mockResolvedValueOnce(payment)
          .mockResolvedValueOnce({ ...payment, status: PaymentStatus.FAILED }),
        update: jest.fn().mockResolvedValue(payment),
      },
      paymentWebhook: {
        create: jest.fn().mockResolvedValue({}),
      },
      package: { findUnique: jest.fn() },
    }
    const prisma = {
      $transaction: jest.fn((callback: (client: unknown) => unknown) => callback(tx)),
    }
    const { service, realtime, mail } = buildService({ prisma })

    await (service as any).applyProviderTransition('payment-1', {
      status: 'OK',
      statusCode: 0,
      transactionStatus: 'SUCCESSFUL',
      amount: '1000', // paid 1000 for a 5000 order
      rawRequest: '',
      rawResponse: '{}',
    }, { eventType: 'WEBHOOK_PROCESSED' })

    // Payment forced to FAILED with the mismatch recorded; no activation.
    expect(tx.payment.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: PaymentStatus.FAILED,
          statusMessage: expect.stringContaining('Amount mismatch'),
        }),
      }),
    )
    expect(tx.package.findUnique).not.toHaveBeenCalled()
    const publishedTypes = (realtime as { publish: jest.Mock }).publish.mock.calls.map((call) => call[0])
    expect(publishedTypes).toContain('payment.amount_mismatch')
    expect((mail as { sendOperationalAlertEmail: jest.Mock }).sendOperationalAlertEmail).toHaveBeenCalled()
  })
})

describe('PaymentsService webhook authorization', () => {
  const SECRET = 'webhook-secret-value'

  function buildWebhookService() {
    const previous = process.env.MTN_MOMO_COLLECTION_WEBHOOK_SECRET
    process.env.MTN_MOMO_COLLECTION_WEBHOOK_SECRET = SECRET
    const { service } = buildService({ config: { get: jest.fn() } })
    return {
      service,
      restore: () => {
        if (previous !== undefined) {
          process.env.MTN_MOMO_COLLECTION_WEBHOOK_SECRET = previous
        } else {
          delete process.env.MTN_MOMO_COLLECTION_WEBHOOK_SECRET
        }
      },
    }
  }

  it('accepts a valid x-webhook-secret header', () => {
    const { service, restore } = buildWebhookService()
    try {
      expect(() =>
        (service as any).assertWebhookSecret(
          'MTN_MOMO_COLLECTION_WEBHOOK_SECRET',
          {},
          { 'x-webhook-secret': SECRET },
        ),
      ).not.toThrow()
    } finally {
      restore()
    }
  })

  it('accepts a valid HMAC signature over the raw body', () => {
    const { service, restore } = buildWebhookService()
    try {
      const rawBody = Buffer.from(JSON.stringify({ status: 'SUCCESSFUL' }))
      const signature = createHmac('sha256', SECRET).update(rawBody).digest('hex')
      expect(() =>
        (service as any).assertWebhookSecret(
          'MTN_MOMO_COLLECTION_WEBHOOK_SECRET',
          {},
          { 'x-webhook-signature': signature },
          rawBody,
        ),
      ).not.toThrow()
    } finally {
      restore()
    }
  })

  it('rejects an invalid HMAC signature', () => {
    const { service, restore } = buildWebhookService()
    try {
      const rawBody = Buffer.from(JSON.stringify({ status: 'SUCCESSFUL' }))
      expect(() =>
        (service as any).assertWebhookSecret(
          'MTN_MOMO_COLLECTION_WEBHOOK_SECRET',
          {},
          { 'x-webhook-signature': 'deadbeef' },
          rawBody,
        ),
      ).toThrow(ForbiddenException)
    } finally {
      restore()
    }
  })

  it('ignores query-string secrets unless the migration flag is explicitly enabled', () => {
    const { service, restore } = buildWebhookService()
    const previousFlag = process.env.WEBHOOK_ALLOW_QUERY_SECRET
    delete process.env.WEBHOOK_ALLOW_QUERY_SECRET
    try {
      expect(() =>
        (service as any).assertWebhookSecret(
          'MTN_MOMO_COLLECTION_WEBHOOK_SECRET',
          { secret: SECRET },
          {},
        ),
      ).toThrow(ForbiddenException)

      process.env.WEBHOOK_ALLOW_QUERY_SECRET = 'true'
      expect(() =>
        (service as any).assertWebhookSecret(
          'MTN_MOMO_COLLECTION_WEBHOOK_SECRET',
          { secret: SECRET },
          {},
        ),
      ).not.toThrow()
    } finally {
      if (previousFlag !== undefined) {
        process.env.WEBHOOK_ALLOW_QUERY_SECRET = previousFlag
      } else {
        delete process.env.WEBHOOK_ALLOW_QUERY_SECRET
      }
      restore()
    }
  })
})

describe('PhoneNumberService', () => {
  const phoneService = new PhoneNumberService({
    get: jest.fn((key: string) => {
      if (key === 'MTN_ALLOWED_PREFIXES') return '077,078,076,079,031,039'
      if (key === 'AIRTEL_ALLOWED_PREFIXES') return '070,075,074'
      return undefined
    }),
  } as never)

  it.each([
    [PaymentNetwork.MTN, '0771234567', '256771234567'],
    [PaymentNetwork.MTN, '0781234567', '256781234567'],
    [PaymentNetwork.MTN, '0761234567', '256761234567'],
    [PaymentNetwork.MTN, '0791234567', '256791234567'],
    [PaymentNetwork.MTN, '0311234567', '256311234567'],
    [PaymentNetwork.MTN, '0391234567', '256391234567'],
    [PaymentNetwork.AIRTEL, '0701234567', '256701234567'],
    [PaymentNetwork.AIRTEL, '0751234567', '256751234567'],
    [PaymentNetwork.AIRTEL, '0741234567', '256741234567'],
    [PaymentNetwork.MTN, '+256771234567', '256771234567'],
    [PaymentNetwork.AIRTEL, '256701234567', '256701234567'],
  ])('validates %s number %s', (network, input, expected) => {
    expect(phoneService.normalizeForNetwork(input, network)).toBe(expected)
  })

  it('rejects numbers that do not match the selected network', () => {
    expect(() => phoneService.normalizeForNetwork('0751234567', PaymentNetwork.MTN)).toThrow(BadRequestException)
    expect(() => phoneService.normalizeForNetwork('0771234567', PaymentNetwork.AIRTEL)).toThrow(BadRequestException)
  })

  it('rejects invalid numbers', () => {
    expect(() => phoneService.normalizeForNetwork('12345', PaymentNetwork.MTN)).toThrow(BadRequestException)
  })
})
