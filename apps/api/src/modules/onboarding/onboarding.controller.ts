import { Body, Controller, Post, Res, UseGuards } from '@nestjs/common'
import { Throttle } from '@nestjs/throttler'
import type { Response } from 'express'
import { AccessScopeService } from '../auth/access-scope.service'
import { AuthenticatedAdminUser, JwtAuthGuard, applySessionCookies } from '../auth/auth.module'
import { CurrentUser } from '../auth/current-user.decorator'
import { RegisterTenantDto } from './dto/register-tenant.dto'
import { OnboardingService } from './onboarding.service'

@Controller('onboarding')
export class OnboardingController {
  constructor(
    private readonly onboardingService: OnboardingService,
    private readonly accessScope: AccessScopeService,
  ) {}

  @Throttle({ default: { ttl: 60_000, limit: 5 } })
  @Post('register')
  async registerTenant(@Body() dto: RegisterTenantDto, @Res({ passthrough: true }) response: Response) {
    const result = await this.onboardingService.registerTenant(dto)
    // Session cookies are HttpOnly; the raw tokens never reach page JS.
    return applySessionCookies(response, result)
  }

  @UseGuards(JwtAuthGuard)
  @Post('complete')
  completeOnboarding(@CurrentUser() user: AuthenticatedAdminUser) {
    const tenantId = this.accessScope.requireTenantScope(user)
    return this.onboardingService.completeOnboarding(tenantId)
  }
}
