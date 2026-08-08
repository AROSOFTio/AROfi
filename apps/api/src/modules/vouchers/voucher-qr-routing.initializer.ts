import { Injectable, OnModuleInit } from '@nestjs/common'
import { buildVoucherHotspotUrl } from '../../common/tenant-hotspot-domain'
import { VouchersService } from './vouchers.service'

type VoucherQrUrlBuilder = {
  buildVoucherPortalUrl: (voucherCode: string, hotspotDomain?: string) => string
}

/**
 * Keeps printed voucher QR codes on the exact MikroTik-local business hostname:
 *
 *   http://<business>.wifi/login?voucher=<CODE>
 *
 * The hostname is the same value installed as the router HotSpot dns-name and
 * static DNS record. It intentionally works after the customer joins that
 * venue's Wi-Fi and never falls back to a hard-coded gateway IP.
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
