import { Body, Controller, Delete, Get, Param, Post, UseGuards } from '@nestjs/common'
import { AccessScopeService } from '../auth/access-scope.service'
import { AuthenticatedAdminUser, JwtAuthGuard } from '../auth/auth.module'
import { CurrentUser } from '../auth/current-user.decorator'
import { RequirePermissions } from '../auth/permissions.decorator'
import { PERMISSIONS } from '../auth/permissions.constants'
import { PermissionsGuard } from '../auth/permissions.guard'
import {
  CreateEnterprisePaymentConnectorDto,
  EnterpriseConnectorCollectDto,
  EnterpriseConnectorStatusDto,
} from './dto/enterprise-payment-connector.dto'
import { EnterprisePaymentConnectorService } from './enterprise-payment-connector.service'

@Controller('enterprise-payment-connectors')
export class EnterprisePaymentConnectorController {
  constructor(
    private readonly connectors: EnterprisePaymentConnectorService,
    private readonly accessScope: AccessScopeService,
  ) {}

  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePermissions(PERMISSIONS.settingsManage)
  @Get()
  list(@CurrentUser() user: AuthenticatedAdminUser) {
    const tenantId = this.accessScope.requireTenantScope(user)
    return this.connectors.list(tenantId)
  }

  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePermissions(PERMISSIONS.settingsManage)
  @Post()
  create(@CurrentUser() user: AuthenticatedAdminUser, @Body() dto: CreateEnterprisePaymentConnectorDto) {
    const tenantId = this.accessScope.requireTenantScope(user)
    return this.connectors.create(tenantId, dto)
  }

  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePermissions(PERMISSIONS.settingsManage)
  @Post(':connectorId/validate')
  validate(@CurrentUser() user: AuthenticatedAdminUser, @Param('connectorId') connectorId: string) {
    const tenantId = this.accessScope.requireTenantScope(user)
    return this.connectors.validate(tenantId, connectorId)
  }

  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePermissions(PERMISSIONS.settingsManage)
  @Post(':connectorId/collect')
  collect(
    @CurrentUser() user: AuthenticatedAdminUser,
    @Param('connectorId') connectorId: string,
    @Body() dto: EnterpriseConnectorCollectDto,
  ) {
    const tenantId = this.accessScope.requireTenantScope(user)
    return this.connectors.collect(tenantId, connectorId, dto)
  }

  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePermissions(PERMISSIONS.settingsManage)
  @Post(':connectorId/status')
  status(
    @CurrentUser() user: AuthenticatedAdminUser,
    @Param('connectorId') connectorId: string,
    @Body() dto: EnterpriseConnectorStatusDto,
  ) {
    const tenantId = this.accessScope.requireTenantScope(user)
    return this.connectors.status(tenantId, connectorId, dto)
  }

  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePermissions(PERMISSIONS.settingsManage)
  @Delete(':connectorId')
  remove(@CurrentUser() user: AuthenticatedAdminUser, @Param('connectorId') connectorId: string) {
    const tenantId = this.accessScope.requireTenantScope(user)
    return this.connectors.remove(tenantId, connectorId)
  }

  // Provider-facing callback. The long per-connector token is part of the URL,
  // so this endpoint does not require an AROFi admin session.
  @Post('webhooks/:connectorId/:token')
  webhook(
    @Param('connectorId') connectorId: string,
    @Param('token') token: string,
    @Body() payload: Record<string, unknown>,
  ) {
    return this.connectors.handleWebhook(connectorId, token, payload)
  }
}
