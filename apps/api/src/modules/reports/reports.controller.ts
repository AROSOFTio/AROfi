import { BadRequestException, Controller, Get, Param, Query, Res, UseGuards } from '@nestjs/common'
import type { Response } from 'express'
import { AccessScopeService } from '../auth/access-scope.service'
import { AuthenticatedAdminUser, JwtAuthGuard } from '../auth/auth.module'
import { PermissionsGuard } from '../auth/permissions.guard'
import { CurrentUser } from '../auth/current-user.decorator'
import { RequirePermissions } from '../auth/permissions.decorator'
import { PERMISSIONS } from '../auth/permissions.constants'
import { ReportFilters, ReportFormat, ReportType, ReportsService } from './reports.service'

const REPORT_TYPES: ReportType[] = ['sales', 'disbursements', 'vouchers']
const REPORT_FORMATS: ReportFormat[] = ['csv', 'xlsx', 'pdf']

@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('reports')
export class ReportsController {
  constructor(
    private readonly reportsService: ReportsService,
    private readonly accessScope: AccessScopeService,
  ) {}

  @RequirePermissions(PERMISSIONS.reportsRead)
  @Get(':type/preview')
  preview(
    @CurrentUser() user: AuthenticatedAdminUser,
    @Param('type') type: string,
    @Query() query: Record<string, string>,
  ) {
    const reportType = this.assertReportType(type)
    const tenantId = this.accessScope.resolveTenantScope(user, query.tenantId)
    return this.reportsService.preview(reportType, this.toFilters(query), tenantId, this.accessScope.isSuperAdmin(user))
  }

  @RequirePermissions(PERMISSIONS.reportsRead)
  @Get(':type/export')
  async export(
    @CurrentUser() user: AuthenticatedAdminUser,
    @Param('type') type: string,
    @Query() query: Record<string, string>,
    @Res() response: Response,
  ) {
    const reportType = this.assertReportType(type)
    const format = REPORT_FORMATS.includes(query.format as ReportFormat) ? (query.format as ReportFormat) : 'csv'
    const tenantId = this.accessScope.resolveTenantScope(user, query.tenantId)

    const file = await this.reportsService.exportReport(
      reportType,
      format,
      this.toFilters(query),
      tenantId,
      this.accessScope.isSuperAdmin(user),
    )
    response.setHeader('Content-Type', file.contentType)
    response.setHeader('Content-Disposition', `attachment; filename="${file.filename}"`)
    response.send(file.buffer)
  }

  private assertReportType(type: string): ReportType {
    if (!REPORT_TYPES.includes(type as ReportType)) {
      throw new BadRequestException('Unknown report type')
    }
    return type as ReportType
  }

  private toFilters(query: Record<string, string>): ReportFilters {
    return {
      from: query.from || undefined,
      to: query.to || undefined,
      status: query.status || undefined,
      channel: query.channel || undefined,
      search: query.search || undefined,
    }
  }
}
