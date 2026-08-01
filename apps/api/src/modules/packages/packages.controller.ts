import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common'
import { AccessScopeService } from '../auth/access-scope.service'
import { AuthenticatedAdminUser, JwtAuthGuard } from '../auth/auth.module'
import { PermissionsGuard } from '../auth/permissions.guard'
import { CurrentUser } from '../auth/current-user.decorator'
import { RequirePermissions } from '../auth/permissions.decorator'
import { PERMISSIONS } from '../auth/permissions.constants'
import { CreatePackageDto } from './dto/create-package.dto'
import { CreatePackagePriceDto } from './dto/create-package-price.dto'
import { CreateTvActivationDto } from './dto/create-tv-activation.dto'
import { UpdatePackageDto } from './dto/update-package.dto'
import { PackagesService } from './packages.service'

@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('packages')
export class PackagesController {
  constructor(
    private readonly packagesService: PackagesService,
    private readonly accessScope: AccessScopeService,
  ) {}

  @RequirePermissions(PERMISSIONS.packagesRead)
  @Get()
  getCatalog(@CurrentUser() user: AuthenticatedAdminUser, @Query('tenantId') tenantId?: string) {
    const scopedTenantId = this.accessScope.resolveTenantScope(user, tenantId)
    return this.packagesService.getCatalog(scopedTenantId)
  }

  @RequirePermissions(PERMISSIONS.packagesManage)
  @Post()
  createPackage(@CurrentUser() user: AuthenticatedAdminUser, @Body() dto: CreatePackageDto) {
    const tenantId = this.accessScope.requireTenantScope(user, dto.tenantId)
    return this.packagesService.createPackage({
      ...dto,
      tenantId,
    })
  }

  @RequirePermissions(PERMISSIONS.packagesManage)
  @Patch(':packageId')
  updatePackage(
    @CurrentUser() user: AuthenticatedAdminUser,
    @Param('packageId') packageId: string,
    @Body() dto: UpdatePackageDto,
  ) {
    const tenantId = this.accessScope.resolveTenantScope(user)
    return this.packagesService.updatePackage(packageId, dto, tenantId)
  }

  @RequirePermissions(PERMISSIONS.packagesManage)
  @Delete(':packageId')
  deletePackage(@CurrentUser() user: AuthenticatedAdminUser, @Param('packageId') packageId: string) {
    const tenantId = this.accessScope.resolveTenantScope(user)
    return this.packagesService.deletePackage(packageId, tenantId)
  }

  @RequirePermissions(PERMISSIONS.packagesManage)
  @Post(':packageId/prices')
  addPricing(
    @CurrentUser() user: AuthenticatedAdminUser,
    @Param('packageId') packageId: string,
    @Body() dto: CreatePackagePriceDto,
  ) {
    const tenantId = this.accessScope.resolveTenantScope(user)
    return this.packagesService.addPricing(packageId, dto, tenantId)
  }

  @RequirePermissions(PERMISSIONS.packagesManage)
  @Post(':packageId/tv-activations')
  createTvActivation(
    @CurrentUser() user: AuthenticatedAdminUser,
    @Param('packageId') packageId: string,
    @Body() dto: CreateTvActivationDto,
  ) {
    const tenantId = this.accessScope.requireTenantScope(user, dto.tenantId)
    return this.packagesService.createTvActivation(packageId, tenantId, dto)
  }
}

