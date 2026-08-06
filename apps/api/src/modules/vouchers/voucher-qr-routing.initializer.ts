import { Injectable, OnModuleInit } from '@nestjs/common'
import { VouchersService } from './vouchers.service'

type VoucherQrUrlBuilder = {
  buildVoucherPortalUrl: (voucherCode: string, hotspotDomain?: string) => string
}

/**
 * Keeps printed voucher QR codes on a stable public HTTPS URL, then hands the
 * voucher to the router-local login page so MikroTik can supply MAC address,
 * login URL, router identity, and the rest of the captive-portal context.
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

    service.buildVoucherPortalUrl = (voucherCode: string, hotspotDomain?: string) => {
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
      const url = new URL(`${portalBase}/qr`)
      const localHost = (hotspotDomain ?? '')
        .replace(/^https?:\/\//i, '')
        .replace(/\/.*$/, '')
        .toLowerCase()

      url.searchParams.set('voucher', voucherCode.trim().toUpperCase())
      url.searchParams.set('intent', 'connect')
      if (/^[a-z0-9.-]+\.wifi$/i.test(localHost)) {
        url.searchParams.set('host', localHost)
      }
      return url.toString()
    }
  }
}
