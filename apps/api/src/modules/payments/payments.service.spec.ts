import { PaymentStatus } from '@prisma/client'
import { PaymentsService } from './payments.service'

describe('PaymentsService', () => {
  const service = new PaymentsService(
    {} as never,
    { get: jest.fn() } as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
  )

  it('normalizes local Uganda phone numbers to 256 format', () => {
    expect((service as any).normalizePhoneNumber('0772000000')).toBe('256772000000')
    expect((service as any).normalizePhoneNumber('772000000')).toBe('256772000000')
    expect((service as any).normalizePhoneNumber('+256 772 000000')).toBe('256772000000')
  })

  it('maps Yo provider statuses into internal payment states', () => {
    expect(
      (service as any).mapProviderStatus({
        status: 'OK',
        statusCode: 0,
        transactionStatus: 'SUCCEEDED',
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

  it('extracts webhook references from common Yo callback payload shapes', () => {
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
