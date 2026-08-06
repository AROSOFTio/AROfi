import { Injectable, OnModuleInit } from '@nestjs/common'
import { VouchersService } from './vouchers.service'

type VoucherQrUrlBuilder = {
  buildVoucherPortalUrl: (voucherCode: string, hotspotDomain?: string) => string
}

/**
 * Keeps printed voucher QR codes on a public HTTPS URL.
 *
 * Older vouchers used a router-local `*.wifi/login` address. A phone camera can
 * open that address before Android has committed to the hotspot network, which
 * produces a browser/network error instead of reaching the captive portal.
 * The public URL is safe in both cases:
 * - on the hotspot, MikroTik intercepts it and passes the voucher through `dst`;
 * - off the hotspot, the customer portal opens with the voucher pre-filled and
 *   tells the customer to join the venue WiFi before redeeming it.
 *
 * VouchersService owns the PDF renderer and its URL helper is currently private.
 * This initializer applies the routing policy to the service instance without
 * duplicating the large PDF-rendering implementation.
 */
@Injectable()
export class VoucherQrRoutingInitializer implements OnModuleInit {
  constructor(private readonly vouchersService: VouchersService) {}

  onModuleInit() {
    const service = this.vouchersService as unknown as VoucherQrUrlBuilder

    service.buildVoucherPortalUrl = (voucherCode: string) => {
      const configuredBase =
        process.env.VOUCHER_QR_BASE_URL ??
        process.env.PORTAL_PUBLIC_HOST ??
        process.env.API_PUBLIC_HOST ??
        'arofi.net'
      const withProtocol = /^https?:\/\//i.test(configuredBase)
        ? configuredBase
        : `https://${configuredBase}`
      const normalized = withProtocol.replace(/\/$/, '')
      const portalBase = normalized.endsWith('/portal') ? normalized : `${normalized}/portal`
      const url = new URL(portalBase)

      url.searchParams.set('voucher', voucherCode.trim().toUpperCase())
      url.searchParams.set('intent', 'connect')
      return url.toString()
    }
  }
}
