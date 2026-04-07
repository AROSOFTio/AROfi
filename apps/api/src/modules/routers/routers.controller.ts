import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common'
import { CreateRouterDto } from './dto/create-router.dto'
import { CreateRouterGroupDto } from './dto/create-router-group.dto'
import { RoutersService } from './routers.service'

@Controller('routers')
export class RoutersController {
  constructor(private readonly routersService: RoutersService) {}

  @Get('overview')
  getOverview(@Query('tenantId') tenantId?: string) {
    return this.routersService.getOverview(tenantId)
  }

  @Post('groups')
  createGroup(@Body() dto: CreateRouterGroupDto) {
    return this.routersService.createGroup(dto)
  }

  @Post()
  createRouter(@Body() dto: CreateRouterDto) {
    return this.routersService.createRouter(dto)
  }

  @Get(':routerId/setup')
  getRouterSetup(@Param('routerId') routerId: string) {
    return this.routersService.getRouterSetup(routerId)
  }

  @Post(':routerId/health-check')
  runHealthCheck(@Param('routerId') routerId: string) {
    return this.routersService.runHealthCheck(routerId)
  }
}
