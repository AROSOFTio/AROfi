import { Body, Controller, Headers, Post } from '@nestjs/common'
import { Throttle } from '@nestjs/throttler'
import { PortalRoamingService } from './portal-roaming.service'

@Controller('portal')
export class PortalRoamingController {
  constructor(private readonly roamingService: PortalRoamingService) {}

  @Throttle({ default: { ttl: 60_000, limit: 12 } })
  @Post('roam')
  roam(
    @Headers('authorization') authorization: string | undefined,
    @Body()
    dto: {
      macAddress?: string
      ipAddress?: string
      routerId?: string
      routerKey?: string
      hotspotServerName?: string
      loginUrl?: string
    },
  ) {
    return this.roamingService.roam(authorization, dto)
  }
}
