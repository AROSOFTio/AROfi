import { BadRequestException } from '@nestjs/common'
import { PaymentNetwork, PaymentStatus } from '@prisma/client'
import { PhoneNumberService } from './phone-number.service'
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
