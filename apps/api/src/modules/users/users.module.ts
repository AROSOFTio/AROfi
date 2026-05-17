import {
  BadRequestException,
  Body,
  Controller,
  ForbiddenException,
  Get,
  Injectable,
  Module,
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
      throw new ForbiddenException('Tenant users cannot create platform administrator accounts')
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

  @RequirePermissions(PERMISSIONS.usersManage)
  @Post()
  create(@CurrentUser() user: AuthenticatedAdminUser, @Body() dto: CreateUserDto) {
    const tenantId = this.accessScope.requireTenantScope(user, dto.tenantId)
    return this.usersService.create(dto, tenantId, user)
  }
}

@Module({
  controllers: [UsersController],
  providers: [UsersService, AccessScopeService, RoleCatalogService],
  exports: [UsersService],
})
export class UsersModule {}
