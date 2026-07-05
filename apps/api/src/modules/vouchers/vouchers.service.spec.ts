import { VouchersService } from './vouchers.service'

describe('VouchersService voucher QR URLs', () => {
  const originalVoucherQrBaseUrl = process.env.VOUCHER_QR_BASE_URL
  const originalPortalPublicHost = process.env.PORTAL_PUBLIC_HOST
  const originalApiPublicHost = process.env.API_PUBLIC_HOST

  function buildService() {
    return new VouchersService(
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
    )
  }

  afterEach(() => {
    if (originalVoucherQrBaseUrl === undefined) delete process.env.VOUCHER_QR_BASE_URL
    else process.env.VOUCHER_QR_BASE_URL = originalVoucherQrBaseUrl

    if (originalPortalPublicHost === undefined) delete process.env.PORTAL_PUBLIC_HOST
    else process.env.PORTAL_PUBLIC_HOST = originalPortalPublicHost

    if (originalApiPublicHost === undefined) delete process.env.API_PUBLIC_HOST
    else process.env.API_PUBLIC_HOST = originalApiPublicHost
  })

  it('uses the configured public portal URL for printed voucher QR codes', () => {
    process.env.VOUCHER_QR_BASE_URL = 'https://arofi.net/portal'

    const service = buildService()

    expect((service as any).buildVoucherPortalUrl('ABC123')).toBe('https://arofi.net/portal?voucher=ABC123')
  })

  it('falls back to the public portal host and appends /portal when needed', () => {
    delete process.env.VOUCHER_QR_BASE_URL
    process.env.PORTAL_PUBLIC_HOST = 'wifi.example.com'

    const service = buildService()

    expect((service as any).buildVoucherPortalUrl('ZX-90')).toBe('https://wifi.example.com/portal?voucher=ZX-90')
    expect((service as any).getVoucherPortalHost()).toBe('wifi.example.com')
  })
})
