import { buildTenantHotspotDomain, buildVoucherHotspotUrl } from './tenant-hotspot-domain'

describe('tenant hotspot domain', () => {
  it('builds the same compact local hostname used by MikroTik and vouchers', () => {
    expect(buildTenantHotspotDomain('AROFi WIFI Kampala Kiosk')).toBe('kampalakiosk.wifi')
    expect(buildTenantHotspotDomain('Café Déjà Vu')).toBe('cafedejavu.wifi')
    expect(buildTenantHotspotDomain('')).toBe('arofi.wifi')
  })

  it('builds the exact local voucher QR URL with a query parameter', () => {
    expect(buildVoucherHotspotUrl(' ab-12 ', 'KampalaKiosk.WIFI')).toBe(
      'http://kampalakiosk.wifi/login?voucher=AB-12',
    )
  })

  it('never accepts a gateway IP, public host or slash-style voucher route', () => {
    expect(buildVoucherHotspotUrl('ABC123', '10.55.0.1')).toBe(
      'http://arofi.wifi/login?voucher=ABC123',
    )
    expect(buildVoucherHotspotUrl('ABC123', 'arofi.net')).toBe(
      'http://arofi.wifi/login?voucher=ABC123',
    )
    expect(buildVoucherHotspotUrl('ABC123', 'business.wifi/path')).toBe(
      'http://business.wifi/login?voucher=ABC123',
    )
    expect(buildVoucherHotspotUrl('ABC123', 'business.wifi')).not.toContain('/login/voucher=')
  })
})
