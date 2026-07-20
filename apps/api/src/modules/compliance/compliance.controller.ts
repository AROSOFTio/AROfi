import { Body, Controller, Get, Param, Post, Query, Req, UseGuards } from '@nestjs/common'
import { Throttle } from '@nestjs/throttler'
import type { Request } from 'express'
import { IsEmail, IsInt, IsNotEmpty, IsOptional, IsPhoneNumber, IsString, Max, MaxLength, Min } from 'class-validator'
import { Type } from 'class-transformer'
import { AuthenticatedAdminUser, JwtAuthGuard, AccessScopeService } from '../auth/auth.module'
import { ComplianceService } from './compliance.service'

class SubmitComplianceDto {
  @IsString() @IsNotEmpty() @MaxLength(160)
  businessName: string

  @IsString() @IsNotEmpty() @MaxLength(120)
  ownerName: string

  @IsString() @IsNotEmpty() @IsPhoneNumber() @MaxLength(30)
  phoneNumber: string

  @IsEmail()
  email: string

  @IsOptional() @IsString() @MaxLength(80)
  country?: string

  @IsString() @IsNotEmpty() @MaxLength(120)
  district: string

  @IsString() @IsNotEmpty() @MaxLength(240)
  hotspotLocation: string

  @IsString() @IsNotEmpty() @MaxLength(120)
  businessType: string

  @IsString() @IsNotEmpty() @MaxLength(120)
  ispName: string

  @IsOptional() @IsString() @MaxLength(160)
  ispPackage?: string

  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(1000)
  routerCount?: number

  @IsOptional() @Type(() => Number) @IsInt() @Min(1)
  expectedUsers?: number

  @IsOptional() @IsString() @IsPhoneNumber() @MaxLength(30)
  payoutPhoneNumber?: string

  @IsOptional() @IsString() @MaxLength(2000)
  notes?: string
}

class ReviewComplianceDto {
  @IsString() @IsNotEmpty()
  verdict: string

  @IsOptional() @IsString() @MaxLength(2000)
  note?: string
}

type AuthenticatedRequest = Request & { user: AuthenticatedAdminUser }

@UseGuards(JwtAuthGuard)
@Controller('compliance')
export class ComplianceController {
  constructor(
    private readonly complianceService: ComplianceService,
    private readonly accessScope: AccessScopeService,
  ) {}

  @Get('me')
  getMine(@Req() request: AuthenticatedRequest) {
    const tenantId = this.accessScope.requireTenantScope(request.user, undefined)
    return this.complianceService.getMine(tenantId)
  }

  @Throttle({ default: { ttl: 300_000, limit: 5 } })
  @Post('submit')
  submit(@Req() request: AuthenticatedRequest, @Body() dto: SubmitComplianceDto) {
    const tenantId = this.accessScope.requireTenantScope(request.user, undefined)
    return this.complianceService.submit(request.user, tenantId, dto)
  }

  @Get('requests')
  list(@Req() request: AuthenticatedRequest, @Query('status') status?: string) {
    return this.complianceService.listForReview(request.user, status)
  }

  @Post('requests/:id/review')
  review(@Req() request: AuthenticatedRequest, @Param('id') id: string, @Body() dto: ReviewComplianceDto) {
    return this.complianceService.review(request.user, id, dto.verdict, dto.note)
  }
}
