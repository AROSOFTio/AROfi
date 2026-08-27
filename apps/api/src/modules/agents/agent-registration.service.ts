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
    const temporaryPassword = dto.temporaryPassword?.trim() || null
    if (temporaryPassword && !email) {
      throw new BadRequestException('Agent login email is required when a temporary password is supplied')
    }

    await this.roleCatalogService.ensureStandardRoles()

    // Resolve cheap lookup-only inputs first. Do not spend bcrypt CPU for a
    // registration that will immediately fail because the business or login
    // role does not exist.
    const [tenant, loginRole] = await Promise.all([
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
    ])

    if (!tenant) throw new NotFoundException('Business not found')
    if (email && temporaryPassword && !loginRole) {
      throw new BadRequestException('VoucherAgent login role is not configured')
    }

    // Bcrypt remains outside the write transaction, but only runs after the
    // registration has passed the cheap existence/configuration checks above.
    const passwordHash = temporaryPassword ? await bcrypt.hash(temporaryPassword, 10) : null
    const normalizedPhone = this.normalizePhoneNumber(dto.phoneNumber)
    const code = dto.code.trim().toUpperCase()
    const names = this.splitName(dto.name)

    try {
      return await this.prisma.$transaction(async (tx) => {
        const [duplicateAgent, existingUser] = await Promise.all([
          tx.agent.findFirst({
            where: {
              tenantId,
              OR: [
                { code },
                { phoneNumber: normalizedPhone },
                ...(email ? [{ email: { equals: email, mode: 'insensitive' as const } }] : []),
              ],
            },
            select: { code: true, phoneNumber: true, email: true },
          }),
          email && passwordHash
            ? tx.user.findUnique({
                where: { email },
                select: { id: true },
              })
            : Promise.resolve(null),
        ])

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
      // Preflight duplicate checks give specific messages in the normal path.
      // Keep the transaction race-safe as well: if another request inserts the
      // same unique Agent/User value between our check and create, return a
      // controlled client error instead of leaking a Prisma P2002 as a 500.
      if (this.isUniqueConstraintError(error)) {
        throw new BadRequestException('Agent code, phone number, or login email is already in use')
      }
      throw error
    }
  }

  async provisionLogin(agentId: string, tenantId: string, temporaryPassword: string) {
    await this.roleCatalogService.ensureStandardRoles()

    // Resolve all cheap prerequisites before bcrypt. Provisioning changes only
    // one User row, so it does not need to hold a database transaction open.
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
    const passwordHash = await bcrypt.hash(temporaryPassword, 10)

    if (existing) {
      await this.restoreLogin(existing.id, names, passwordHash)
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

      // Another provisioning request may have created this email after the
      // initial lookup. Re-read it and only restore it when it is the exact
      // same tenant + VoucherAgent identity; never overwrite another account.
      const concurrentUser = await this.prisma.user.findUnique({
        where: { email },
        select: { id: true, tenantId: true, roleId: true },
      })
      if (!concurrentUser || concurrentUser.tenantId !== tenantId || concurrentUser.roleId !== role.id) {
        throw new BadRequestException('This email already belongs to another AROFi user account')
      }

      await this.restoreLogin(concurrentUser.id, names, passwordHash)
      return { agentId: agent.id, email, loginReady: true, restored: true }
    }
  }

  private restoreLogin(
    userId: string,
    names: { firstName: string; lastName: string },
    passwordHash: string,
  ) {
    return this.prisma.user.update({
      where: { id: userId },
      data: {
        firstName: names.firstName,
        lastName: names.lastName,
        password: passwordHash,
        isActive: true,
      },
    })
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
