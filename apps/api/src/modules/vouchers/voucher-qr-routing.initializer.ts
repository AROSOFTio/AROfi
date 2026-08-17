import { Injectable, OnModuleInit } from '@nestjs/common'
import { VouchersService } from './vouchers.service'
import { buildVoucherHotspotUrl } from '../../common/tenant-hotspot-domain'

type VoucherQrUrlBuilder = {
  buildVoucherPortalUrl: (voucherCode: string, hotspotDomain?: string) => string
}

/**
 * Keeps printed voucher QR codes on the MikroTik-local login URL. Customers
 * scan after joining the hotspot Wi-Fi, so the QR must not depend on public
 * internet access before the captive portal has authenticated them.
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
      return buildVoucherHotspotUrl(voucherCode, hotspotDomain)
    }
  }
}
