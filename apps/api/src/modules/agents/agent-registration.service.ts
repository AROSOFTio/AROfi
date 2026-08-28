import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common'
import { AgentType, Prisma } from '@prisma/client'
import * as bcrypt from 'bcrypt'
import { PrismaService } from '../../prisma.service'
import { RoleCatalogService } from '../auth/role-catalog.service'
import { CreateAgentDto } from './dto/create-agent.dto'

const AGENT_LOGIN_ROLE = 'VoucherAgent'

/**
 * Owns the link between an Agent seller profile and its VoucherAgent login.
 * New registrations are all-or-nothing, and older profile-only Agents can be
 * provisioned without exposing the generic /users endpoint to this workflow.
 */
@Injectable()
export class AgentRegistrationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly roleCatalogService: RoleCatalogService,
  ) {}

  async register(dto: CreateAgentDto) {
    const tenantId = dto.tenantId
    if (!tenantId) throw new BadRequestException('Business is required')

    const email = dto.email?.trim().toLowerCase() || null
    const temporaryPassword = this.normalizeTemporaryPassword(dto.temporaryPassword)
    if (temporaryPassword && !email) {
      throw new BadRequestException('Agent login email is required when a temporary password is supplied')
    }

    await this.roleCatalogService.ensureStandardRoles()

    const normalizedPhone = this.normalizePhoneNumber(dto.phoneNumber)
    const code = dto.code.trim().toUpperCase()
    const names = this.splitName(dto.name)

    // Resolve all cheap prerequisites and conflicts before spending bcrypt CPU
    // or opening the write transaction. Keep the normal duplicate lookup exact
    // and index-friendly; only legacy Agent rows with differently-cased emails
    // need the slower case-insensitive fallback below.
    const [tenant, loginRole, exactDuplicateAgent, existingUser] = await Promise.all([
      this.prisma.tenant.findUnique({
        where: { id: tenantId },
        select: { id: true, name: true },
      }),
      email && temporaryPassword
        ? this.prisma.role.findUnique({
            where: { name: AGENT_LOGIN_ROLE },
            select: { id: true },
          })
        : Promise.resolve(null),
      this.prisma.agent.findFirst({
        where: {
          tenantId,
          OR: [
            { code },
            { phoneNumber: normalizedPhone },
            ...(email ? [{ email }] : []),
          ],
        },
        select: { code: true, phoneNumber: true, email: true },
      }),
      email && temporaryPassword
        ? this.prisma.user.findUnique({
            where: { email },
            select: { id: true },
          })
        : Promise.resolve(null),
    ])

    const duplicateAgent = exactDuplicateAgent ?? (email
      ? await this.prisma.agent.findFirst({
          where: {
            tenantId,
            email: { equals: email, mode: 'insensitive' },
          },
          select: { code: true, phoneNumber: true, email: true },
        })
      : null)

    if (!tenant) throw new NotFoundException('Business not found')
    if (email && temporaryPassword && !loginRole) {
      throw new BadRequestException('VoucherAgent login role is not configured')
    }
    if (duplicateAgent?.code === code) {
      throw new BadRequestException('An agent with this code already exists for this business')
    }
    if (duplicateAgent?.phoneNumber === normalizedPhone) {
      throw new BadRequestException('An agent with this phone number already exists for this business')
    }
    if (email && duplicateAgent?.email?.trim().toLowerCase() === email) {
      throw new BadRequestException('An agent with this login email already exists for this business')
    }
    if (existingUser) {
      throw new BadRequestException('A user with this email already exists')
    }

    const passwordHash = temporaryPassword ? await bcrypt.hash(temporaryPassword, 10) : null

    try {
      return await this.prisma.$transaction(async (tx) => {
        const agent = await tx.agent.create({
          data: {
            tenantId,
            code,
            name: dto.name.trim(),
            phoneNumber: normalizedPhone,
            email,
            type: dto.type ?? AgentType.FIELD_AGENT,
            territory: dto.territory?.trim() || null,
            commissionRateBps: dto.commissionRateBps,
            floatLimitUgx: dto.floatLimitUgx,
            notes: dto.notes?.trim() || null,
          },
        })

        if (email && passwordHash && loginRole) {
          await tx.user.create({
            data: {
              email,
              firstName: names.firstName,
              lastName: names.lastName,
              password: passwordHash,
              roleId: loginRole.id,
              tenantId,
            },
          })
        }

        return {
          ...agent,
          wallet: null,
          tenant,
          loginReady: Boolean(email && passwordHash && loginRole),
        }
      })
    } catch (error) {
      if (this.isUniqueConstraintError(error)) {
        throw new BadRequestException('Agent code, phone number, or login email is already in use')
      }
      throw error
    }
  }

  async provisionLogin(agentId: string, tenantId: string, temporaryPassword: string) {
    const normalizedTemporaryPassword = this.normalizeTemporaryPassword(temporaryPassword)
    if (!normalizedTemporaryPassword) {
      throw new BadRequestException('Temporary password is required')
    }

    await this.roleCatalogService.ensureStandardRoles()

    const [agent, role] = await Promise.all([
      this.prisma.agent.findFirst({
        where: { id: agentId, tenantId },
        select: { id: true, tenantId: true, name: true, email: true },
      }),
      this.prisma.role.findUnique({
        where: { name: AGENT_LOGIN_ROLE },
        select: { id: true },
      }),
    ])

    if (!agent) throw new NotFoundException('Agent not found')
    if (!role) throw new BadRequestException('VoucherAgent login role is not configured')

    const email = agent.email?.trim().toLowerCase()
    if (!email) {
      throw new BadRequestException('Add a login email to this Agent before creating the login')
    }

    const existing = await this.prisma.user.findUnique({
      where: { email },
      select: { id: true, tenantId: true, roleId: true },
    })

    if (existing && (existing.tenantId !== tenantId || existing.roleId !== role.id)) {
      throw new BadRequestException('This email already belongs to another AROFi user account')
    }

    const names = this.splitName(agent.name)
    const passwordHash = await bcrypt.hash(normalizedTemporaryPassword, 10)

    if (existing) {
      await this.restoreLogin(existing.id, tenantId, role.id, names, passwordHash)
      return { agentId: agent.id, email, loginReady: true, restored: true }
    }

    try {
      await this.prisma.user.create({
        data: {
          email,
          firstName: names.firstName,
          lastName: names.lastName,
          password: passwordHash,
          roleId: role.id,
          tenantId,
        },
      })
      return { agentId: agent.id, email, loginReady: true, restored: false }
    } catch (error) {
      if (!this.isUniqueConstraintError(error)) throw error

      const concurrentUser = await this.prisma.user.findUnique({
        where: { email },
        select: { id: true, tenantId: true, roleId: true },
      })
      if (!concurrentUser || concurrentUser.tenantId !== tenantId || concurrentUser.roleId !== role.id) {
        throw new BadRequestException('This email already belongs to another AROFi user account')
      }

      await this.restoreLogin(concurrentUser.id, tenantId, role.id, names, passwordHash)
      return { agentId: agent.id, email, loginReady: true, restored: true }
    }
  }

  private async restoreLogin(
    userId: string,
    tenantId: string,
    roleId: string,
    names: { firstName: string; lastName: string },
    passwordHash: string,
  ) {
    // Keep the tenant + VoucherAgent role predicate on the write itself, not
    // only on the preceding read. If another request reassigns the account
    // between those operations, do not overwrite that newly reassigned user.
    const result = await this.prisma.user.updateMany({
      where: { id: userId, tenantId, roleId },
      data: {
        firstName: names.firstName,
        lastName: names.lastName,
        password: passwordHash,
        isActive: true,
      },
    })

    if (result.count !== 1) {
      throw new BadRequestException('Agent login changed while it was being restored; try again')
    }
  }

  private normalizeTemporaryPassword(password?: string) {
    if (password === undefined) return null
    const normalized = password.trim()
    if (normalized.length < 8) {
      throw new BadRequestException('Temporary password must be at least 8 characters')
    }
    return normalized
  }

  private isUniqueConstraintError(error: unknown) {
    return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002'
  }

  private splitName(name: string) {
    const parts = name.trim().split(/\s+/).filter(Boolean)
    return {
      firstName: parts[0] || 'Agent',
      lastName: parts.slice(1).join(' ') || 'Agent',
    }
  }

  private normalizePhoneNumber(phoneNumber: string) {
    const digits = phoneNumber.replace(/\D/g, '')
    if (/^256\d{9}$/.test(digits)) return digits
    if (/^0\d{9}$/.test(digits)) return `256${digits.slice(1)}`
    if (/^7\d{8}$/.test(digits)) return `256${digits}`
    throw new BadRequestException('Phone number must be a valid Uganda mobile number')
  }
}
