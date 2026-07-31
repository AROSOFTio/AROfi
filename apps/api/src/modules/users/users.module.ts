import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  Injectable,
  Module,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common'
import { AuthGuard } from '@nestjs/passport'
import * as bcrypt from 'bcrypt'
import { PrismaService } from '../../prisma.service'
import { AccessScopeService } from '../auth/access-scope.service'
import type { AuthenticatedAdminUser } from '../auth/auth.module'
import { CurrentUser } from '../auth/current-user.decorator'
import { RequirePermissions } from '../auth/permissions.decorator'
import { PermissionsGuard } from '../auth/permissions.guard'
import { PERMISSIONS } from '../auth/permissions.constants'
import { RoleCatalogService } from '../auth/role-catalog.service'
import { CreateUserDto } from './dto/create-user.dto'

type UpdateUserInput = Partial<Pick<CreateUserDto, 'firstName' | 'lastName' | 'email' | 'password' | 'roleName'>> & {
  isActive?: boolean
}

class JwtAuthGuard extends AuthGuard('jwt') {}

@Injectable()
export class UsersService {
  constructor(
    private prisma: PrismaService,
    private readonly roleCatalogService: RoleCatalogService,
  ) {}

  async findOneByEmail(email: string) {
    return this.prisma.user.findUnique({
      where: { email },
      include: {
        role: true,
        tenant: true,
      },
    })
  }

  async findOneById(id: string) {
    return this.prisma.user.findUnique({
      where: { id },
      include: {
        role: true,
        tenant: true,
      },
    })
  }

  async list(scopedTenantId?: string) {
    await this.roleCatalogService.ensureStandardRoles()

    const [roles, users] = await Promise.all([
      this.prisma.role.findMany({
        orderBy: { name: 'asc' },
      }),
      this.prisma.user.findMany({
        where: scopedTenantId ? { tenantId: scopedTenantId } : undefined,
        include: {
          role: true,
          tenant: true,
        },
        orderBy: { createdAt: 'desc' },
      }),
    ])

    return {
      roles: roles.map((role) => ({
        id: role.id,
        name: role.name,
        permissions: role.permissions,
      })),
      users: users.map((user) => this.toPublicUser(user)),
    }
  }

  async create(dto: CreateUserDto, tenantId: string, actor: AuthenticatedAdminUser) {
    await this.roleCatalogService.ensureStandardRoles()

    const role = await this.prisma.role.findUnique({
      where: { name: dto.roleName },
    })

    if (!role) {
      throw new BadRequestException('Selected role does not exist')
    }

    if (!actor.permissions.includes(PERMISSIONS.all) && role.permissions.includes(PERMISSIONS.all)) {
      throw new ForbiddenException('Business users cannot create platform administrator accounts')
    }

    const existingUser = await this.prisma.user.findUnique({
      where: { email: dto.email.toLowerCase().trim() },
    })

    if (existingUser) {
      throw new BadRequestException('A user with this email already exists')
    }

    const password = await bcrypt.hash(dto.password, 10)
    const user = await this.prisma.user.create({
      data: {
        email: dto.email.toLowerCase().trim(),
        firstName: dto.firstName.trim(),
        lastName: dto.lastName.trim(),
        password,
        roleId: role.id,
        tenantId,
      },
      include: {
        role: true,
        tenant: true,
      },
    })

    return this.toPublicUser(user)
  }

  async update(userId: string, dto: UpdateUserInput, scopedTenantId: string | undefined, actor: AuthenticatedAdminUser) {
    await this.roleCatalogService.ensureStandardRoles()
    const existing = await this.prisma.user.findFirst({
      where: { id: userId, ...(scopedTenantId ? { tenantId: scopedTenantId } : {}) },
      include: { role: true, tenant: true },
    })
    if (!existing) {
      throw new BadRequestException('User not found')
    }
    if (existing.id === actor.id && dto.isActive === false) {
      throw new BadRequestException('You cannot deactivate your own account')
    }

    const data: Record<string, unknown> = {}
    if (dto.firstName !== undefined) data.firstName = dto.firstName.trim()
    if (dto.lastName !== undefined) data.lastName = dto.lastName.trim()
    if (dto.email !== undefined) {
      const email = dto.email.toLowerCase().trim()
      const duplicate = await this.prisma.user.findFirst({ where: { email, id: { not: userId } } })
      if (duplicate) throw new BadRequestException('A user with this email already exists')
      data.email = email
    }
    if (dto.password) data.password = await bcrypt.hash(dto.password, 10)
    if (dto.isActive !== undefined) data.isActive = dto.isActive
    if (dto.roleName) {
      const role = await this.prisma.role.findUnique({ where: { name: dto.roleName } })
      if (!role) throw new BadRequestException('Selected role does not exist')
      if (!actor.permissions.includes(PERMISSIONS.all) && role.permissions.includes(PERMISSIONS.all)) {
        throw new ForbiddenException('Business users cannot assign platform administrator accounts')
      }
      data.roleId = role.id
    }

    const user = await this.prisma.user.update({
      where: { id: userId },
      data,
      include: { role: true, tenant: true },
    })
    return this.toPublicUser(user)
  }

  async deactivate(userId: string, scopedTenantId: string | undefined, actor: AuthenticatedAdminUser) {
    return this.update(userId, { isActive: false }, scopedTenantId, actor)
  }

  async activate(userId: string, scopedTenantId: string | undefined, actor: AuthenticatedAdminUser) {
    return this.update(userId, { isActive: true }, scopedTenantId, actor)
  }

  async listCustomers(scopedTenantId: string | undefined, filters: { search?: string; from?: string; to?: string }) {
    const where = {
      ...(scopedTenantId ? { tenantId: scopedTenantId } : {}),
      ...(this.buildDateFilter(filters).createdAt ? { createdAt: this.buildDateFilter(filters).createdAt } : {}),
      ...(filters.search
        ? {
            OR: [
              { phoneNumber: { contains: filters.search, mode: 'insensitive' as const } },
              { customerReference: { contains: filters.search, mode: 'insensitive' as const } },
            ],
          }
        : {}),
    }

    const [payments, sessions, activations] = await Promise.all([
      this.prisma.payment.findMany({
        where,
        include: {
          package: { select: { id: true, name: true, code: true } },
        },
        orderBy: { createdAt: 'desc' },
        take: 500,
      }),
      this.prisma.networkSession.findMany({
        where: {
          ...(scopedTenantId ? { tenantId: scopedTenantId } : {}),
          ...(filters.search
            ? {
                OR: [
                  { phoneNumber: { contains: filters.search, mode: 'insensitive' as const } },
                  { customerReference: { contains: filters.search, mode: 'insensitive' as const } },
                ],
              }
            : {}),
        },
        orderBy: { startedAt: 'desc' },
        take: 500,
      }),
      this.prisma.packageActivation.findMany({
        where: {
          ...(scopedTenantId ? { tenantId: scopedTenantId } : {}),
          status: 'ACTIVE',
          endsAt: { gt: new Date() },
          ...(filters.search
            ? {
                OR: [
                  { accessPhoneNumber: { contains: filters.search, mode: 'insensitive' as const } },
                  { customerReference: { contains: filters.search, mode: 'insensitive' as const } },
                ],
              }
            : {}),
        },
        include: { package: { select: { id: true, name: true, code: true } } },
        orderBy: { endsAt: 'desc' },
        take: 500,
      }),
    ])

    const customers = new Map<string, {
      id: string
      phoneNumber: string
      customerReference?: string | null
      activePackage?: { id: string; name: string; code: string } | null
      lastPayment?: { id: string; amountUgx: number; status: string; network: string; createdAt: Date } | null
      totalSpentUgx: number
      dataUsedMb: number
      status: 'active' | 'expired'
      lastSeen?: Date | null
    }>()

    for (const payment of payments) {
      const key = payment.normalizedPhone ?? payment.phoneNumber ?? payment.customerReference ?? payment.id
      const existing = customers.get(key) ?? {
        id: key,
        phoneNumber: payment.normalizedPhone ?? payment.phoneNumber,
        customerReference: payment.customerReference,
        activePackage: null,
        lastPayment: null,
        totalSpentUgx: 0,
        dataUsedMb: 0,
        status: 'expired' as const,
        lastSeen: null,
      }
      if (payment.status === 'COMPLETED') {
        existing.totalSpentUgx += payment.amountUgx
      }
      if (!existing.lastPayment || payment.createdAt > existing.lastPayment.createdAt) {
        existing.lastPayment = {
          id: payment.id,
          amountUgx: payment.amountUgx,
          status: payment.status,
          network: payment.network,
          createdAt: payment.createdAt,
        }
      }
      customers.set(key, existing)
    }

    for (const activation of activations) {
      const key = activation.accessPhoneNumber ?? activation.customerReference ?? activation.id
      const existing = customers.get(key) ?? {
        id: key,
        phoneNumber: activation.accessPhoneNumber ?? activation.customerReference ?? '',
        customerReference: activation.customerReference,
        activePackage: null,
        lastPayment: null,
        totalSpentUgx: 0,
        dataUsedMb: 0,
        status: 'expired' as const,
        lastSeen: null,
      }
      existing.activePackage = activation.package
      existing.status = 'active'
      customers.set(key, existing)
    }

    for (const session of sessions) {
      const key = session.phoneNumber ?? session.customerReference ?? session.username
      const existing = customers.get(key) ?? {
        id: key,
        phoneNumber: session.phoneNumber ?? '',
        customerReference: session.customerReference,
        activePackage: null,
        lastPayment: null,
        totalSpentUgx: 0,
        dataUsedMb: 0,
        status: session.status === 'ACTIVE' ? 'active' as const : 'expired' as const,
        lastSeen: null,
      }
      existing.dataUsedMb += Number(((session.inputOctets + session.outputOctets) / 1024n / 1024n))
      existing.lastSeen = session.lastAccountingAt ?? session.endedAt ?? session.startedAt
      if (session.status === 'ACTIVE') {
        existing.status = 'active'
      }
      customers.set(key, existing)
    }

    const items = Array.from(customers.values()).sort((a, b) => {
      const aTime = a.lastSeen?.getTime() ?? a.lastPayment?.createdAt.getTime() ?? 0
      const bTime = b.lastSeen?.getTime() ?? b.lastPayment?.createdAt.getTime() ?? 0
      return bTime - aTime
    })

    return {
      summary: {
        totalCustomers: items.length,
        activeCustomers: items.filter((item) => item.status === 'active').length,
        totalSpentUgx: items.reduce((total, item) => total + item.totalSpentUgx, 0),
      },
      items,
    }
  }

  // Customers on a hotspot are never named anywhere in the checkout flow —
  // they're only ever identified by phone number / customerReference. This
  // pulls every record tied to one identifier into a single detail view
  // instead of just the flat summary row on the directory list.
  async getCustomerDetail(reference: string, scopedTenantId: string | undefined) {
    const matches = (field: string) => ({
      OR: [
        { [field]: reference },
        { customerReference: reference },
      ],
    })

    const [payments, activations, sessions, redemptions] = await Promise.all([
      this.prisma.payment.findMany({
        where: {
          ...(scopedTenantId ? { tenantId: scopedTenantId } : {}),
          OR: [{ phoneNumber: reference }, { normalizedPhone: reference }, { customerReference: reference }],
        },
        include: { package: { select: { id: true, name: true, code: true } } },
        orderBy: { createdAt: 'desc' },
        take: 100,
      }),
      this.prisma.packageActivation.findMany({
        where: {
          ...(scopedTenantId ? { tenantId: scopedTenantId } : {}),
          ...matches('accessPhoneNumber'),
        },
        include: { package: { select: { id: true, name: true, code: true } } },
        orderBy: { createdAt: 'desc' },
        take: 100,
      }),
      this.prisma.networkSession.findMany({
        where: {
          ...(scopedTenantId ? { tenantId: scopedTenantId } : {}),
          ...matches('phoneNumber'),
        },
        orderBy: { startedAt: 'desc' },
        take: 100,
      }),
      this.prisma.voucherRedemption.findMany({
        where: {
          ...(scopedTenantId ? { tenantId: scopedTenantId } : {}),
          customerReference: reference,
        },
        include: {
          voucher: { select: { code: true, faceValueUgx: true } },
          package: { select: { id: true, name: true, code: true } },
        },
        orderBy: { createdAt: 'desc' },
        take: 100,
      }),
    ])

    return {
      reference,
      summary: {
        totalPayments: payments.length,
        totalSpentUgx: payments.filter((p) => p.status === 'COMPLETED').reduce((total, p) => total + p.amountUgx, 0),
        totalSessions: sessions.length,
        totalRedemptions: redemptions.length,
      },
      payments,
      activations,
      sessions,
      redemptions,
    }
  }

  private toPublicUser(user: {
    id: string
    email: string
    firstName: string | null
    lastName: string | null
    isActive: boolean
    createdAt: Date
    updatedAt: Date
    role: { id: string; name: string; permissions: string[] }
    tenant: { id: string; name: string } | null
  }) {
    return {
      id: user.id,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      isActive: user.isActive,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
      tenant: user.tenant
        ? {
            id: user.tenant.id,
            name: user.tenant.name,
          }
        : null,
      role: {
        id: user.role.id,
        name: user.role.name,
        permissions: user.role.permissions,
      },
    }
  }

  private buildDateFilter(filters: { from?: string; to?: string }) {
    const createdAt: { gte?: Date; lte?: Date } = {}
    const from = filters.from ? new Date(filters.from) : null
    const to = filters.to ? new Date(filters.to) : null
    if (from && Number.isFinite(from.getTime())) createdAt.gte = from
    if (to && Number.isFinite(to.getTime())) createdAt.lte = to
    return Object.keys(createdAt).length > 0 ? { createdAt } : {}
  }
}

@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('users')
export class UsersController {
  constructor(
    private readonly usersService: UsersService,
    private readonly accessScope: AccessScopeService,
  ) {}

  @RequirePermissions(PERMISSIONS.usersRead)
  @Get()
  list(@CurrentUser() user: AuthenticatedAdminUser, @Query('tenantId') tenantId?: string) {
    const scopedTenantId = this.accessScope.resolveTenantScope(user, tenantId)
    return this.usersService.list(scopedTenantId)
  }

  @RequirePermissions(PERMISSIONS.usersRead)
  @Get('customers')
  listCustomers(
    @CurrentUser() user: AuthenticatedAdminUser,
    @Query('tenantId') tenantId?: string,
    @Query('search') search?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    const scopedTenantId = this.accessScope.resolveTenantScope(user, tenantId)
    return this.usersService.listCustomers(scopedTenantId, { search, from, to })
  }

  @RequirePermissions(PERMISSIONS.usersRead)
  @Get('customers/:reference')
  getCustomerDetail(
    @CurrentUser() user: AuthenticatedAdminUser,
    @Param('reference') reference: string,
    @Query('tenantId') tenantId?: string,
  ) {
    const scopedTenantId = this.accessScope.resolveTenantScope(user, tenantId)
    return this.usersService.getCustomerDetail(reference, scopedTenantId)
  }

  @RequirePermissions(PERMISSIONS.usersManage)
  @Post()
  create(@CurrentUser() user: AuthenticatedAdminUser, @Body() dto: CreateUserDto) {
    const tenantId = this.accessScope.requireTenantScope(user, dto.tenantId)
    return this.usersService.create(dto, tenantId, user)
  }

  @RequirePermissions(PERMISSIONS.usersManage)
  @Patch(':userId')
  update(@CurrentUser() user: AuthenticatedAdminUser, @Param('userId') userId: string, @Body() dto: UpdateUserInput) {
    const scopedTenantId = this.accessScope.resolveTenantScope(user)
    return this.usersService.update(userId, dto, scopedTenantId, user)
  }

  @RequirePermissions(PERMISSIONS.usersManage)
  @Post(':userId/deactivate')
  deactivate(@CurrentUser() user: AuthenticatedAdminUser, @Param('userId') userId: string) {
    const scopedTenantId = this.accessScope.resolveTenantScope(user)
    return this.usersService.deactivate(userId, scopedTenantId, user)
  }

  @RequirePermissions(PERMISSIONS.usersManage)
  @Post(':userId/activate')
  activate(@CurrentUser() user: AuthenticatedAdminUser, @Param('userId') userId: string) {
    const scopedTenantId = this.accessScope.resolveTenantScope(user)
    return this.usersService.activate(userId, scopedTenantId, user)
  }

  @RequirePermissions(PERMISSIONS.usersManage)
  @Delete(':userId')
  delete(@CurrentUser() user: AuthenticatedAdminUser, @Param('userId') userId: string) {
    const scopedTenantId = this.accessScope.resolveTenantScope(user)
    return this.usersService.deactivate(userId, scopedTenantId, user)
  }
}

@Module({
  controllers: [UsersController],
  providers: [UsersService, AccessScopeService, RoleCatalogService],
  exports: [UsersService],
})
export class UsersModule {}
