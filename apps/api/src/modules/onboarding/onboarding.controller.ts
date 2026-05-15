import { Body, Controller, Post, UseGuards } from '@nestjs/common'
import { Throttle } from '@nestjs/throttler'
import { JwtAuthGuard, PermissionsGuard } from '../auth/auth.module'
import { PERMISSIONS } from '../auth/permissions.constants'
import { RequirePermissions } from '../auth/permissions.decorator'
import { RegisterTenantDto } from './dto/register-tenant.dto'
import { OnboardingService } from './onboarding.service'

@Controller('onboarding')
export class OnboardingController {
  constructor(private readonly onboardingService: OnboardingService) {}

  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePermissions(PERMISSIONS.all)
  @Throttle({ default: { ttl: 60_000, limit: 5 } })
  @Post('register')
  registerTenant(@Body() dto: RegisterTenantDto) {
    return this.onboardingService.registerTenant(dto)
  }
}
