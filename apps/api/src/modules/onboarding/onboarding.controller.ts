import { Body, Controller, Post } from '@nestjs/common'
import { Throttle } from '@nestjs/throttler'
import { RegisterTenantDto } from './dto/register-tenant.dto'
import { OnboardingService } from './onboarding.service'

@Controller('onboarding')
export class OnboardingController {
  constructor(private readonly onboardingService: OnboardingService) {}

  @Throttle({ default: { ttl: 60_000, limit: 5 } })
  @Post('register')
  registerTenant(@Body() dto: RegisterTenantDto) {
    return this.onboardingService.registerTenant(dto)
  }
}
