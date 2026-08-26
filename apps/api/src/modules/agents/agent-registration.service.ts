import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common'
import { AgentType } from '@prisma/client'
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

    const [tenant, passwordHash] = await Promise.all([
      this.prisma.tenant.findUnique({
        where: { id: tenantId },
        select: { id: true, name: true },
      }),
      temporaryPassword ? bcrypt.hash(temporaryPassword, 10) : Promise.resolve(null),
    ])

    if (!tenant) throw new NotFoundException('Business not found')

    const normalizedPhone = this.normalizePhoneNumber(dto.phoneNumber)
    const code = dto.code.trim().toUpperCase()
    const names = this.splitName(dto.name)

    return this.prisma.$transaction(async (tx) => {
      const duplicateAgent = await tx.agent.findFirst({
        where: {
          tenantId,
          OR: [
            { code },
            { phoneNumber: normalizedPhone },
            ...(email ? [{ email: { equals: email, mode: 'insensitive' as const } }] : []),
          ],
        },
        select: { code: true, phoneNumber: true, email: true },
      })

      if (duplicateAgent?.code === code) {
        throw new BadRequestException('An agent with this code already exists for this business')
      }
      if (duplicateAgent?.phoneNumber === normalizedPhone) {
        throw new BadRequestException('An agent with this phone number already exists for this business')
      }
      if (email && duplicateAgent?.email?.trim().toLowerCase() === email) {
        throw new BadRequestException('An agent with this login email already exists for this business')
      }

      let loginRole: { id: string } | null = null
      if (email && passwordHash) {
        const existingUser = await tx.user.findUnique({ where: { email } })
        if (existingUser) {
          throw new BadRequestException('A user with this email already exists')
        }

        loginRole = await tx.role.findUnique({
          where: { name: AGENT_LOGIN_ROLE },
          select: { id: true },
        })
        if (!loginRole) {
          throw new BadRequestException('VoucherAgent login role is not configured')
        }
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
  }

  async provisionLogin(agentId: string, tenantId: string, temporaryPassword: string) {
    await this.roleCatalogService.ensureStandardRoles()

    const agent = await this.prisma.agent.findFirst({
      where: { id: agentId, tenantId },
      select: { id: true, tenantId: true, name: true, email: true },
    })
    if (!agent) throw new NotFoundException('Agent not found')

    const email = agent.email?.trim().toLowerCase()
    if (!email) {
      throw new BadRequestException('Add a login email to this Agent before creating the login')
    }

    const passwordHash = await bcrypt.hash(temporaryPassword, 10)
    const names = this.splitName(agent.name)

    return this.prisma.$transaction(async (tx) => {
      const role = await tx.role.findUnique({
        where: { name: AGENT_LOGIN_ROLE },
        select: { id: true },
      })
      if (!role) throw new BadRequestException('VoucherAgent login role is not configured')

      const existing = await tx.user.findUnique({
        where: { email },
        select: { id: true, tenantId: true, roleId: true },
      })

      if (existing && (existing.tenantId !== tenantId || existing.roleId !== role.id)) {
        throw new BadRequestException('This email already belongs to another AROFi user account')
      }

      if (existing) {
        await tx.user.update({
          where: { id: existing.id },
          data: {
            firstName: names.firstName,
            lastName: names.lastName,
            password: passwordHash,
            isActive: true,
          },
        })
        return { agentId: agent.id, email, loginReady: true, restored: true }
      }

      await tx.user.create({
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
    })
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
