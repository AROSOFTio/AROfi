import { HttpException, ServiceUnavailableException, UnauthorizedException } from '@nestjs/common'
import * as bcrypt from 'bcrypt'
import { AuthService } from './auth.module'

const PASSWORD = 'correct-horse-battery'

function buildUser(overrides: Record<string, unknown> = {}) {
  return {
    id: 'user-1',
    email: 'admin@arofi.net',
    password: bcrypt.hashSync(PASSWORD, 4),
    isActive: true,
    firstName: 'Ada',
    lastName: 'Admin',
    tenantId: 'tenant-1',
    tenant: { name: 'Tenant One' },
    role: { name: 'ADMIN', permissions: ['ALL'] },
    ...overrides,
  }
}

function buildHarness(options: {
  user?: ReturnType<typeof buildUser> | null
  challenge?: Record<string, unknown> | null
  failureCount?: number
  refreshCreateError?: Error
} = {}) {
  const user = options.user === undefined ? buildUser() : options.user

  const usersService = {
    findOneByEmail: jest.fn().mockResolvedValue(user),
    findOneById: jest.fn().mockResolvedValue(user),
  }
  const jwtService = { signAsync: jest.fn().mockResolvedValue('signed-jwt') }
  const roleCatalogService = { ensureStandardRoles: jest.fn().mockResolvedValue(undefined) }
  const mailService = { sendAdminLoginOtpEmail: jest.fn().mockResolvedValue(true) }
  const prisma = {
    adminLoginOtp: {
      deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
      create: jest.fn().mockResolvedValue({ id: 'otp-1' }),
      findFirst: jest.fn().mockResolvedValue(options.challenge ?? null),
      update: jest.fn().mockResolvedValue({}),
    },
    auditLog: {
      create: jest.fn().mockResolvedValue({}),
      count: jest.fn().mockResolvedValue(options.failureCount ?? 0),
    },
    refreshToken: {
      create: options.refreshCreateError
        ? jest.fn().mockRejectedValue(options.refreshCreateError)
        : jest.fn().mockResolvedValue({}),
    },
  }

  const service = new AuthService(
    usersService as never,
    jwtService as never,
    roleCatalogService as never,
    prisma as never,
    mailService as never,
  )

  return { service, usersService, prisma, mailService, jwtService }
}

function buildChallenge(overrides: Record<string, unknown> = {}) {
  return {
    id: 'otp-1',
    userId: 'user-1',
    otpHash: bcrypt.hashSync('123456', 4),
    expiresAt: new Date(Date.now() + 10 * 60 * 1000),
    attempts: 0,
    maxAttempts: 5,
    verifiedAt: null,
    resendAvailableAt: new Date(Date.now() - 1000),
    createdAt: new Date(),
    ...overrides,
  }
}

describe('AuthService email OTP login', () => {
  it('startLogin verifies credentials, stores a hashed OTP and emails the code', async () => {
    const { service, prisma, mailService } = buildHarness()

    const result = await service.startLogin('admin@arofi.net', PASSWORD)

    expect(result.otpRequired).toBe(true)
    expect(prisma.adminLoginOtp.create).toHaveBeenCalled()
    const createData = prisma.adminLoginOtp.create.mock.calls[0][0].data
    // Stored value is a bcrypt hash, never the raw code.
    expect(createData.otpHash).toMatch(/^\$2[aby]\$/)
    const sentOtp = mailService.sendAdminLoginOtpEmail.mock.calls[0][0].otp as string
    expect(sentOtp).toMatch(/^\d{6}$/)
    expect(bcrypt.compareSync(sentOtp, createData.otpHash)).toBe(true)
    // Audit trail for the OTP send.
    expect(prisma.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ action: 'auth.otp.sent' }) }),
    )
  })

  it('startLogin rejects a wrong password and audits the failure', async () => {
    const { service, prisma } = buildHarness()

    await expect(service.startLogin('admin@arofi.net', 'wrong-password')).rejects.toThrow(
      UnauthorizedException,
    )
    expect(prisma.adminLoginOtp.create).not.toHaveBeenCalled()
    expect(prisma.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ action: 'auth.login.failed' }) }),
    )
  })

  it('locks the account after too many recent failures regardless of source IP', async () => {
    const { service } = buildHarness({ failureCount: 8 })

    await expect(service.startLogin('admin@arofi.net', PASSWORD)).rejects.toThrow(HttpException)
  })

  it('verifyLogin issues a session for the correct OTP and marks it verified', async () => {
    const { service, prisma } = buildHarness({ challenge: buildChallenge() })

    const session = await service.verifyLogin('admin@arofi.net', '123456')

    expect(session.access_token).toBe('signed-jwt')
    expect(session.refresh_token).toEqual(expect.any(String))
    expect(session.user.email).toBe('admin@arofi.net')
    expect(prisma.adminLoginOtp.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { verifiedAt: expect.any(Date) } }),
    )
    expect(prisma.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ action: 'auth.login.succeeded' }) }),
    )
  })

  it('verifyLogin rejects a wrong OTP and increments the attempt counter', async () => {
    const { service, prisma } = buildHarness({ challenge: buildChallenge() })

    await expect(service.verifyLogin('admin@arofi.net', '999999')).rejects.toThrow(
      UnauthorizedException,
    )
    expect(prisma.adminLoginOtp.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { attempts: { increment: 1 } } }),
    )
  })

  it('verifyLogin rejects an expired OTP', async () => {
    const { service } = buildHarness({
      challenge: buildChallenge({ expiresAt: new Date(Date.now() - 1000) }),
    })

    await expect(service.verifyLogin('admin@arofi.net', '123456')).rejects.toThrow(
      /expired/i,
    )
  })

  it('verifyLogin rejects once the attempt limit is exhausted, even with the right code', async () => {
    const { service } = buildHarness({
      challenge: buildChallenge({ attempts: 5, maxAttempts: 5 }),
    })

    await expect(service.verifyLogin('admin@arofi.net', '123456')).rejects.toThrow(
      /too many/i,
    )
  })

  it('resendLoginOtp enforces the cooldown window', async () => {
    const { service } = buildHarness({
      challenge: buildChallenge({ resendAvailableAt: new Date(Date.now() + 30_000) }),
    })

    await expect(service.resendLoginOtp('admin@arofi.net')).rejects.toThrow(HttpException)
  })

  it('resendLoginOtp requires a pending password-verified challenge', async () => {
    const { service } = buildHarness({ challenge: null })

    await expect(service.resendLoginOtp('admin@arofi.net')).rejects.toThrow(
      UnauthorizedException,
    )
  })

  it('fails closed in production when refresh-token storage is unavailable', async () => {
    const previousEnv = process.env.NODE_ENV
    process.env.NODE_ENV = 'production'
    try {
      const { service } = buildHarness({
        challenge: buildChallenge(),
        refreshCreateError: new Error('relation "RefreshToken" does not exist'),
      })

      await expect(service.verifyLogin('admin@arofi.net', '123456')).rejects.toThrow(
        ServiceUnavailableException,
      )
    } finally {
      process.env.NODE_ENV = previousEnv
    }
  })
})
