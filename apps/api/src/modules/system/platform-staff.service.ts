import { BadRequestException, ForbiddenException, Injectable } from '@nestjs/common'
import * as bcrypt from 'bcrypt'
import { PrismaService } from '../../prisma.service'
import type { AuthenticatedAdminUser } from '../auth/auth.module'
import { PERMISSIONS } from '../auth/permissions.constants'
import { RoleCatalogService } from '../auth/role-catalog.service'
import { CreatePlatformStaffDto, UpdatePlatformStaffDto } from './dto/support-floor.dto'

const PLATFORM_STAFF_ROLES = new Set([
  'SuperAdmin',
  'Support',
  'ReadOnlySupport',
  'NetworkOperator',
  'FinanceManager',
  'WifiAdmin',
])

@Injectable()
export class PlatformStaffService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly roleCatalogService: RoleCatalogService,
  ) {}

  async list(actor: AuthenticatedAdminUser) {
    this.assertSuperAdmin(actor)
    await this.roleCatalogService.ensureStandardRoles()

    const [roles, users] = await Promise.all([
      this.prisma.role.findMany({
        where: { name: { in: Array.from(PLATFORM_STAFF_ROLES) } },
        orderBy: { name: 'asc' },
      }),
      this.prisma.user.findMany({
        where: { tenantId: null },
        include: { role: true },
        orderBy: [{ isActive: 'desc' }, { firstName: 'asc' }, { lastName: 'asc' }, { email: 'asc' }],
      }),
    ])

    return {
      roles: roles.map((role) => ({ id: role.id, name: role.name, permissions: role.permissions })),
      users: users
        .filter((user) => PLATFORM_STAFF_ROLES.has(user.role.name))
        .map((user) => this.present(user)),
    }
  }

  async create(dto: CreatePlatformStaffDto, actor: AuthenticatedAdminUser) {
    this.assertSuperAdmin(actor)
    await this.roleCatalogService.ensureStandardRoles()
    const role = await this.requireAllowedRole(dto.roleName)
    const email = dto.email.trim().toLowerCase()

    const duplicate = await this.prisma.user.findUnique({ where: { email } })
    if (duplicate) throw new BadRequestException('A user with this email already exists')

    const user = await this.prisma.user.create({
      data: {
        tenantId: null,
        firstName: dto.firstName.trim(),
        lastName: dto.lastName.trim(),
        email,
        password: await bcrypt.hash(dto.password, 10),
        roleId: role.id,
        isActive: true,
      },
      include: { role: true },
    })
    return this.present(user)
  }

  async update(userId: string, dto: UpdatePlatformStaffDto, actor: AuthenticatedAdminUser) {
    this.assertSuperAdmin(actor)
    await this.roleCatalogService.ensureStandardRoles()

    const existing = await this.prisma.user.findFirst({
      where: { id: userId, tenantId: null },
      include: { role: true },
    })
    if (!existing || !PLATFORM_STAFF_ROLES.has(existing.role.name)) {
      throw new BadRequestException('Platform staff user not found')
    }
    if (existing.id === actor.id && dto.isActive === false) {
      throw new BadRequestException('You cannot deactivate your own Developer Admin account')
    }

    // The fields below are deliberately constrained by the DTO + role checks;
    // `any` here keeps the incremental Prisma payload assignable while still
    // preventing callers from passing arbitrary database fields.
    const data: any = {}
    if (dto.firstName !== undefined) data.firstName = dto.firstName.trim()
    if (dto.lastName !== undefined) data.lastName = dto.lastName.trim()
    if (dto.email !== undefined) {
      const email = dto.email.trim().toLowerCase()
      const duplicate = await this.prisma.user.findFirst({ where: { email, id: { not: userId } } })
      if (duplicate) throw new BadRequestException('A user with this email already exists')
      data.email = email
    }
    if (dto.password) data.password = await bcrypt.hash(dto.password, 10)
    if (dto.isActive !== undefined) data.isActive = dto.isActive
    if (dto.roleName !== undefined) {
      const role = await this.requireAllowedRole(dto.roleName)
      if (existing.id === actor.id && role.name !== 'SuperAdmin') {
        throw new BadRequestException('You cannot remove Developer Admin access from your own account')
      }
      data.roleId = role.id
    }

    const updated = await this.prisma.user.update({
      where: { id: existing.id },
      data,
      include: { role: true },
    })
    return this.present(updated)
  }

  async deactivate(userId: string, actor: AuthenticatedAdminUser) {
    return this.update(userId, { isActive: false }, actor)
  }

  async activate(userId: string, actor: AuthenticatedAdminUser) {
    return this.update(userId, { isActive: true }, actor)
  }

  private async requireAllowedRole(roleName: string) {
    if (!PLATFORM_STAFF_ROLES.has(roleName)) {
      throw new BadRequestException('Select an approved AROFi platform staff role')
    }
    const role = await this.prisma.role.findUnique({ where: { name: roleName } })
    if (!role) throw new BadRequestException('Selected role does not exist')
    return role
  }

  private assertSuperAdmin(actor: AuthenticatedAdminUser) {
    if (!actor.permissions.includes(PERMISSIONS.all)) {
      throw new ForbiddenException('Only Developer Admin can manage AROFi platform staff')
    }
  }

  private present(user: {
    id: string
    email: string
    firstName: string | null
    lastName: string | null
    isActive: boolean
    createdAt: Date
    updatedAt: Date
    role: { id: string; name: string; permissions: string[] }
  }) {
    return {
      id: user.id,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      displayName: [user.firstName, user.lastName].filter(Boolean).join(' ').trim() || user.email,
      isActive: user.isActive,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
      role: {
        id: user.role.id,
        name: user.role.name,
        permissions: user.role.permissions,
      },
    }
  }
}
