import { Body, Controller, Post } from '@nestjs/common'
import { RegisterTenantDto } from './dto/register-tenant.dto'
import { OnboardingService } from './onboarding.service'

@Controller('onboarding')
export class OnboardingController {
  constructor(private readonly onboardingService: OnboardingService) {}

  @Post('register')
  registerTenant(@Body() dto: RegisterTenantDto) {
    return this.onboardingService.registerTenant(dto)
  }
}
