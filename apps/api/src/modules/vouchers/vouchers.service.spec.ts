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

  it('keeps printed voucher QR codes on the authoritative local hotspot URL', () => {
    process.env.VOUCHER_QR_BASE_URL = 'https://arofi.net/portal'

    const service = buildService()

    expect((service as any).buildVoucherPortalUrl('ABC123')).toBe('http://arofi.wifi/login?voucher=ABC123')
  })

  it('keeps the public portal host for display while QR login stays local', () => {
    delete process.env.VOUCHER_QR_BASE_URL
    process.env.PORTAL_PUBLIC_HOST = 'wifi.example.com'

    const service = buildService()

    expect((service as any).buildVoucherPortalUrl('ZX-90')).toBe('http://arofi.wifi/login?voucher=ZX-90')
    expect((service as any).getVoucherPortalHost()).toBe('wifi.example.com')
  })

  it('builds a tenant-only local hotspot URL for QR vouchers', () => {
    const service = buildService()

    expect((service as any).buildTenantHotspotDomain('AROFI WIFI Opio')).toBe('opio.wifi')
    expect((service as any).buildVoucherPortalUrl('747774', 'opio.wifi')).toBe(
      'http://opio.wifi/login?voucher=747774',
    )
  })
})