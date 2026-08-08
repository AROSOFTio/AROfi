import { VoucherQrRoutingInitializer } from './voucher-qr-routing.initializer'
import { VouchersService } from './vouchers.service'

describe('VoucherQrRoutingInitializer', () => {
  it('routes printed QR codes through the exact business wifi hostname', () => {
    const service = {
      buildVoucherPortalUrl: jest.fn(),
    }
    const initializer = new VoucherQrRoutingInitializer(service as unknown as VouchersService)

    initializer.onModuleInit()

    expect(service.buildVoucherPortalUrl(' ab-12 ', 'KampalaKiosk.wifi')).toBe(
      'http://kampalakiosk.wifi/login?voucher=AB-12',
    )
  })

  it('never falls back to the hard-coded HotSpot gateway IP', () => {
    const service = {
      buildVoucherPortalUrl: jest.fn(),
    }
    const initializer = new VoucherQrRoutingInitializer(service as unknown as VouchersService)

    initializer.onModuleInit()

    const url = service.buildVoucherPortalUrl('ABC123', undefined)
    expect(url).toBe('http://arofi.wifi/login?voucher=ABC123')
    expect(url).not.toContain('10.55.0.1')
    expect(url).not.toContain('/login/voucher=')
  })
})
