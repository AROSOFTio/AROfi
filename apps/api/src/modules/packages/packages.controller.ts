import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common'
import { CreatePackageDto } from './dto/create-package.dto'
import { CreatePackagePriceDto } from './dto/create-package-price.dto'
import { PackagesService } from './packages.service'

@Controller('packages')
export class PackagesController {
  constructor(private readonly packagesService: PackagesService) {}

  @Get()
  getCatalog(@Query('tenantId') tenantId?: string) {
    return this.packagesService.getCatalog(tenantId)
  }

  @Post()
  createPackage(@Body() dto: CreatePackageDto) {
    return this.packagesService.createPackage(dto)
  }

  @Post(':packageId/prices')
  addPricing(@Param('packageId') packageId: string, @Body() dto: CreatePackagePriceDto) {
    return this.packagesService.addPricing(packageId, dto)
  }
}
