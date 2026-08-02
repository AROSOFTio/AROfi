import {
  BadRequestException,
  Body,
  Controller,
  ForbiddenException,
  Get,
  HttpException,
  HttpStatus,
  Injectable,
  Logger,
  Module,
  Param,
  Post,
  Query,
  Req,
  Res,
  ServiceUnavailableException,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common'
import { ConfigModule, ConfigService } from '@nestjs/config'
import { JwtModule, JwtService } from '@nestjs/jwt'
import { PassportModule } from '@nestjs/passport'
import { PassportStrategy } from '@nestjs/passport'
import { Throttle } from '@nestjs/throttler'
import type { Request, Response } from 'express'
import * as bcrypt from 'bcrypt'
import { createHash, randomBytes, randomInt } from 'crypto'
import { AuthGuard } from '@nestjs/passport'
import { ExtractJwt, Strategy } from 'passport-jwt'
import { IsBoolean, IsEmail, IsNotEmpty, IsOptional, IsPhoneNumber, IsString, Length, MinLength } from 'class-validator'
import { EmailChangeRequestStatus } from '@prisma/client'
import { PrismaService } from '../../prisma.service'
import { PrismaModule } from '../../prisma.module'
import { MailModule } from '../mail/mail.module'
import { MailService } from '../mail/mail.service'
import { UsersModule, UsersService } from '../users/users.module'
import { AccessScopeService } from './access-scope.service'
import { PermissionsGuard } from './permissions.guard'
import { RoleCatalogService } from './role-catalog.service'

export { AccessScopeService, PermissionsGuard, RoleCatalogService }

export const ACCESS_COOKIE_NAME = 'arofi_admin_token'
const REFRESH_COOKIE_NAME = 'arofi_admin_refresh'
const TRUSTED_DEVICE_COOKIE_NAME = 'arofi_admin_trusted_device'
const REFRESH_TOKEN_TTL_MS = 30 * 24 * 60 * 60 * 1000
const TRUSTED_DEVICE_TTL_MS = 30 * 24 * 60 * 60 * 1000
// Must match the JWT expiresIn below — the cookie should die with the token.
const ACCESS_TOKEN_TTL_MS = 60 * 60 * 1000
const PASSWORD_RESET_TTL_MS = 60 * 60 * 1000

// "bangella23@gmail.com" -> "ba*******3@gmail.com" — enough for the owner to
// recognise their address without handing it to whoever typed the phone number.
function maskEmail(email: string) {
  const [local, domain] = email.split('@')
  if (!domain) return email
  if (local.length <= 3) {
    return `${local[0]}${'*'.repeat(Math.max(2, local.length - 1))}@${domain}`
  }
  return `${local.slice(0, 2)}${'*'.repeat(local.length - 3)}${local.slice(-1)}@${domain}`
}

// Email OTP policy. All values are clamped to safe ranges so a typo'd env var
// can't silently produce a 24-hour OTP or unlimited attempts.
const OTP_LENGTH = 6
const otpTtlMinutes = () =>
  Math.min(10, Math.max(5, Number.parseInt(process.env.ADMIN_OTP_TTL_MINUTES ?? '10', 10) || 10))
const otpMaxAttempts = () =>
  Math.min(10, Math.max(3, Number.parseInt(process.env.ADMIN_OTP_MAX_ATTEMPTS ?? '5', 10) || 5))
const otpResendCooldownSeconds = () =>
  Math.min(600, Math.max(30, Number.parseInt(process.env.ADMIN_OTP_RESEND_COOLDOWN_SECONDS ?? '60', 10) || 60))
const loginMaxFailures = () =>
  Math.min(50, Math.max(3, Number.parseInt(process.env.ADMIN_LOGIN_MAX_FAILURES ?? '8', 10) || 8))
const loginLockoutWindowMinutes = () =>
  Math.min(120, Math.max(5, Number.parseInt(process.env.ADMIN_LOGIN_LOCKOUT_WINDOW_MINUTES ?? '15', 10) || 15))

class LoginStartDto {
  @IsEmail()
  email: string

  @IsString()
  @IsNotEmpty()
  password: string
}

class LoginVerifyDto {
  @IsEmail()
  email: string

  @IsString()
  @Length(OTP_LENGTH, OTP_LENGTH)
  otp: string

  @IsOptional()
  @IsBoolean()
  rememberDevice?: boolean
}

class LoginResendDto {
  @IsEmail()
  email: string
}

class PasswordResetRequestDto {
  @IsEmail()
  email: string
}

class PasswordResetConfirmDto {
  @IsString()
  @IsNotEmpty()
  token: string

  @IsString()
  @MinLength(8)
  password: string
}

class ChangePasswordDto {
  @IsString()
  @IsNotEmpty()
  currentPassword: string

  @IsString()
  @MinLength(8)
  newPassword: string
}

class ForgotEmailDto {
  @IsString()
  @IsNotEmpty()
  @IsPhoneNumber()
  phoneNumber: string
}

class EmailChangeRequestDto {
  @IsEmail()
  newEmail: string

  @IsString()
  @MinLength(10)
  reason: string

  @IsString()
  @IsNotEmpty()
  currentPassword: string
}

class EmailChangeReviewDto {
  @IsBoolean()
  approve: boolean

  @IsOptional()
  @IsString()
  note?: string
}

type JwtPayload = {
  sub: string
  email: string
  role: string
  tenantId: string | null
}

export type AuthenticatedAdminUser = {
  id: string
  email: string
  role: string
  permissions: string[]
  tenantId: string | null
  tenantName: string | null
  displayName: string
}

type RequestMeta = {
  ipAddress?: string | null
  userAgent?: string | null
}

function extractJwtFromAdminCookie(request: Request) {
  const rawCookie = request.headers.cookie
  if (!rawCookie) {
    return null
  }

  const cookie = rawCookie
    .split(';')
    .map((item) => item.trim())
    .find((item) => item.startsWith(`${ACCESS_COOKIE_NAME}=`))

  if (!cookie) {
    return null
  }

  return decodeURIComponent(cookie.split('=').slice(1).join('='))
}

type AuthenticatedRequest = Request & {
  user: AuthenticatedAdminUser
}

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name)

  constructor(
    private readonly usersService: UsersService,
    private readonly jwtService: JwtService,
    private readonly roleCatalogService: RoleCatalogService,
    private readonly prisma: PrismaService,
    private readonly mailService: MailService,
  ) {}

  // ── Step 1: email + password → OTP email ─────────────────────────────────
  async startLogin(
    email: string,
    password: string,
    meta: RequestMeta = {},
    rawTrustedDeviceToken?: string | null,
  ) {
    await this.roleCatalogService.ensureStandardRoles()
    await this.assertNotLockedOut(email)

    const user = await this.usersService.findOneByEmail(email)
    const passwordMatches =
      user && user.isActive ? await bcrypt.compare(password, user.password) : false

    if (!user || !user.isActive || !passwordMatches) {
      await this.recordAuthAudit({
        action: 'auth.login.failed',
        email,
        userId: user?.id,
        tenantId: user?.tenantId ?? null,
        severity: 'WARNING',
        message: 'Invalid email or password',
        meta,
      })
      throw new UnauthorizedException('Invalid credentials')
    }

    const rotatedTrustedDeviceToken = rawTrustedDeviceToken
      ? await this.rotateTrustedDevice(user.id, rawTrustedDeviceToken, meta)
      : null

    if (rotatedTrustedDeviceToken) {
      const session = await this.issueSessionForUserId(user.id)
      await this.recordAuthAudit({
        action: 'auth.login.succeeded',
        email: user.email,
        userId: user.id,
        tenantId: user.tenantId ?? null,
        message: 'Admin login completed on a remembered device',
        meta,
      })
      return {
        ...session,
        otpRequired: false as const,
        trusted_device_token: rotatedTrustedDeviceToken,
      }
    }

    const otp = this.generateOtp()
    const otpHash = await bcrypt.hash(otp, 10)
    const now = new Date()
    const expiresAt = new Date(now.getTime() + otpTtlMinutes() * 60 * 1000)
    const resendAvailableAt = new Date(now.getTime() + otpResendCooldownSeconds() * 1000)

    // One pending challenge per user: a fresh password login invalidates any
    // previous unverified codes.
    await this.prisma.adminLoginOtp.deleteMany({
      where: { userId: user.id, verifiedAt: null },
    })
    await this.prisma.adminLoginOtp.create({
      data: {
        userId: user.id,
        otpHash,
        expiresAt,
        maxAttempts: otpMaxAttempts(),
        resendAvailableAt,
        requestIp: meta.ipAddress ?? null,
        userAgent: meta.userAgent ?? null,
      },
    })

    const otpDelivered = await this.deliverOtpEmail(user.email, this.displayNameOf(user), otp)

    await this.recordAuthAudit({
      action: 'auth.otp.sent',
      email: user.email,
      userId: user.id,
      tenantId: user.tenantId ?? null,
      message: 'Login OTP sent by email',
      meta,
    })

    return {
      otpRequired: true as const,
      email: user.email,
      expiresAt: expiresAt.toISOString(),
      resendAvailableAt: resendAvailableAt.toISOString(),
      ...(otpDelivered ? {} : { otpFallback: otp }),
    }
  }

  // ── Step 2: OTP → session tokens ──────────────────────────────────────────
  async verifyLogin(
    email: string,
    otp: string,
    meta: RequestMeta = {},
    rememberDevice = false,
  ) {
    await this.assertNotLockedOut(email)

    const user = await this.usersService.findOneByEmail(email)
    if (!user || !user.isActive) {
      throw new UnauthorizedException('Invalid or expired verification code')
    }

    const challenge = await this.prisma.adminLoginOtp.findFirst({
      where: { userId: user.id, verifiedAt: null },
      orderBy: { createdAt: 'desc' },
    })

    if (!challenge || challenge.expiresAt <= new Date()) {
      await this.recordAuthAudit({
        action: 'auth.otp.failed',
        email,
        userId: user.id,
        tenantId: user.tenantId ?? null,
        severity: 'WARNING',
        message: 'OTP expired or no pending challenge',
        meta,
      })
      throw new UnauthorizedException('The verification code has expired. Sign in again to get a new one.')
    }

    if (challenge.attempts >= challenge.maxAttempts) {
      await this.recordAuthAudit({
        action: 'auth.otp.failed',
        email,
        userId: user.id,
        tenantId: user.tenantId ?? null,
        severity: 'WARNING',
        message: 'OTP attempt limit exceeded',
        meta,
      })
      throw new UnauthorizedException('Too many incorrect codes. Sign in again to get a new one.')
    }

    const otpMatches = await bcrypt.compare(otp, challenge.otpHash)
    if (!otpMatches) {
      await this.prisma.adminLoginOtp.update({
        where: { id: challenge.id },
        data: { attempts: { increment: 1 } },
      })
      await this.recordAuthAudit({
        action: 'auth.otp.failed',
        email,
        userId: user.id,
        tenantId: user.tenantId ?? null,
        severity: 'WARNING',
        message: 'Incorrect OTP entered',
        meta,
      })
      throw new UnauthorizedException('Incorrect verification code')
    }

    await this.prisma.adminLoginOtp.update({
      where: { id: challenge.id },
      data: { verifiedAt: new Date() },
    })
    // Verified challenges are one-shot; remove any strays.
    await this.prisma.adminLoginOtp.deleteMany({
      where: { userId: user.id, verifiedAt: null },
    })

    const authenticatedUser = this.toAuthenticatedUser({
      id: user.id,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      roleName: user.role.name,
      permissions: user.role.permissions,
      tenantId: user.tenantId,
      tenantName: user.tenant?.name ?? null,
    })

    await this.recordAuthAudit({
      action: 'auth.login.succeeded',
      email: user.email,
      userId: user.id,
      tenantId: user.tenantId ?? null,
      message: 'Admin login completed with email OTP',
      meta,
    })

    return {
      access_token: await this.signAccessToken(authenticatedUser),
      refresh_token: await this.issueRefreshToken(authenticatedUser.id),
      trusted_device_token: rememberDevice
        ? await this.issueTrustedDevice(authenticatedUser.id, meta)
        : null,
      user: authenticatedUser,
    }
  }

  // Resend is only possible while a pending (password-verified) challenge
  // exists, so knowing an email address alone cannot be used to spam OTPs.
  async resendLoginOtp(email: string, meta: RequestMeta = {}) {
    await this.assertNotLockedOut(email)

    const user = await this.usersService.findOneByEmail(email)
    if (!user || !user.isActive) {
      throw new UnauthorizedException('Sign in with your password first')
    }

    const challenge = await this.prisma.adminLoginOtp.findFirst({
      where: { userId: user.id, verifiedAt: null, expiresAt: { gt: new Date() } },
      orderBy: { createdAt: 'desc' },
    })

    if (!challenge) {
      throw new UnauthorizedException('Sign in with your password first')
    }

    if (challenge.resendAvailableAt > new Date()) {
      const waitSeconds = Math.ceil((challenge.resendAvailableAt.getTime() - Date.now()) / 1000)
      throw new HttpException(
        `Please wait ${waitSeconds}s before requesting another code`,
        HttpStatus.TOO_MANY_REQUESTS,
      )
    }

    const otp = this.generateOtp()
    const now = new Date()
    await this.prisma.adminLoginOtp.update({
      where: { id: challenge.id },
      data: {
        otpHash: await bcrypt.hash(otp, 10),
        attempts: 0,
        expiresAt: new Date(now.getTime() + otpTtlMinutes() * 60 * 1000),
        resendAvailableAt: new Date(now.getTime() + otpResendCooldownSeconds() * 1000),
      },
    })

    await this.deliverOtpEmail(user.email, this.displayNameOf(user), otp)
    await this.recordAuthAudit({
      action: 'auth.otp.resent',
      email: user.email,
      userId: user.id,
      tenantId: user.tenantId ?? null,
      message: 'Login OTP re-sent by email',
      meta,
    })

    return { otpRequired: true as const, email: user.email }
  }

  // Rotates the refresh token on every use: the old one is revoked and a new
  // one issued, so a stolen-but-unused refresh token becomes worthless the
  // next time the legitimate session refreshes.
  async refresh(rawToken: string) {
    const tokenHash = this.hashToken(rawToken)
    const record = await this.prisma.refreshToken.findUnique({ where: { tokenHash } })

    if (!record || record.expiresAt < new Date()) {
      throw new UnauthorizedException('Session expired, please sign in again')
    }

    // Refresh tokens rotate on every use (old one revoked, new one issued) —
    // but several requests can legitimately race to refresh the SAME token
    // at once (a background timer, a page navigation, and the dashboard's
    // own auth-recovery check can all fire within milliseconds of each
    // other). Without tolerance for that, the request that loses the race
    // gets hard-rejected as "already used" even though the session is
    // completely valid — which is exactly what was bouncing users to
    // /login across the app. Tolerate reuse of a just-rotated token for a
    // short grace window; only a token revoked LONGER ago than that is
    // treated as a genuine stale/stolen-token rejection.
    const REFRESH_GRACE_MS = 10_000
    if (record.revokedAt && Date.now() - record.revokedAt.getTime() > REFRESH_GRACE_MS) {
      throw new UnauthorizedException('Session expired, please sign in again')
    }

    const alreadyRotatedInGraceWindow = Boolean(record.revokedAt)
    if (!alreadyRotatedInGraceWindow) {
      await this.prisma.refreshToken.update({
        where: { id: record.id },
        data: { revokedAt: new Date() },
      })
    }

    const authenticatedUser = await this.validateAccessTokenUser(record.userId)
    const access_token = await this.signAccessToken(authenticatedUser)
    // Inside the grace window, don't rotate again — reuse the same raw
    // token so the browser's cookie doesn't need to change and no extra
    // RefreshToken rows pile up for one legitimate race.
    const refresh_token = alreadyRotatedInGraceWindow ? rawToken : await this.issueRefreshToken(authenticatedUser.id)

    return {
      access_token,
      refresh_token,
      user: authenticatedUser,
    }
  }

  async logout(rawToken: string | null) {
    if (!rawToken) {
      return
    }
    await this.prisma.refreshToken.updateMany({
      where: { tokenHash: this.hashToken(rawToken), revokedAt: null },
      data: { revokedAt: new Date() },
    })
  }

  private async signAccessToken(user: AuthenticatedAdminUser) {
    const payload: JwtPayload = {
      sub: user.id,
      email: user.email,
      role: user.role,
      tenantId: user.tenantId,
    }
    return this.jwtService.signAsync(payload)
  }

  private async issueRefreshToken(userId: string): Promise<string | null> {
    const rawToken = randomBytes(48).toString('hex')
    try {
      await this.prisma.refreshToken.create({
        data: {
          userId,
          tokenHash: this.hashToken(rawToken),
          expiresAt: new Date(Date.now() + REFRESH_TOKEN_TTL_MS),
        },
      })
    } catch (error) {
      // Fail closed in production: silently degrading to an access-token-only
      // session would hide a broken/missing RefreshToken migration and leave
      // sessions unrevocable. Outside production we degrade so local stacks
      // without the migration still work.
      if (process.env.NODE_ENV === 'production') {
        this.logger.error(
          `Refresh token storage unavailable: ${error instanceof Error ? error.message : String(error)}`,
        )
        throw new ServiceUnavailableException(
          'Session storage is unavailable. Run the database migrations and try again.',
        )
      }
      return null
    }
    return rawToken
  }

  private async issueTrustedDevice(
    userId: string,
    meta: RequestMeta,
  ): Promise<string | null> {
    const rawToken = randomBytes(48).toString('hex')
    const now = new Date()
    try {
      await this.prisma.adminTrustedDevice.deleteMany({
        where: {
          userId,
          OR: [{ expiresAt: { lte: now } }, { revokedAt: { not: null } }],
        },
      })
      await this.prisma.adminTrustedDevice.create({
        data: {
          userId,
          tokenHash: this.hashToken(rawToken),
          userAgent: meta.userAgent ?? null,
          expiresAt: new Date(now.getTime() + TRUSTED_DEVICE_TTL_MS),
        },
      })
      return rawToken
    } catch (error) {
      this.logger.error(
        `Trusted-device storage unavailable: ${error instanceof Error ? error.message : String(error)}`,
      )
      return null
    }
  }

  private async rotateTrustedDevice(
    userId: string,
    rawToken: string,
    meta: RequestMeta,
  ): Promise<string | null> {
    try {
      const record = await this.prisma.adminTrustedDevice.findUnique({
        where: { tokenHash: this.hashToken(rawToken) },
      })
      const now = new Date()
      if (!record || record.userId !== userId || record.revokedAt || record.expiresAt <= now) {
        if (record && !record.revokedAt) {
          await this.prisma.adminTrustedDevice.update({
            where: { id: record.id },
            data: { revokedAt: now },
          })
        }
        return null
      }

      const rotatedToken = randomBytes(48).toString('hex')
      await this.prisma.adminTrustedDevice.update({
        where: { id: record.id },
        data: {
          tokenHash: this.hashToken(rotatedToken),
          lastUsedAt: now,
          userAgent: meta.userAgent ?? record.userAgent,
        },
      })
      return rotatedToken
    } catch (error) {
      this.logger.error(
        `Trusted-device validation unavailable: ${error instanceof Error ? error.message : String(error)}`,
      )
      return null
    }
  }

  private hashToken(rawToken: string) {
    return createHash('sha256').update(rawToken).digest('hex')
  }

  async validateAccessTokenUser(userId: string) {
    const user = await this.usersService.findOneById(userId)
    if (!user || !user.isActive) {
      throw new UnauthorizedException('Session expired')
    }

    return this.toAuthenticatedUser({
      id: user.id,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      roleName: user.role.name,
      permissions: user.role.permissions,
      tenantId: user.tenantId,
      tenantName: user.tenant?.name ?? null,
    })
  }

  // Best-effort session lookup for endpoints that behave differently for
  // signed-in vs anonymous callers but must never reject an anonymous
  // request (e.g. the public/authenticated hybrid AI chat endpoint). Unlike
  // validateAccessTokenUser, this never throws — an invalid, expired, or
  // missing token just resolves to null.
  async tryAuthenticateFromRawToken(rawToken: string | null | undefined): Promise<AuthenticatedAdminUser | null> {
    if (!rawToken) {
      return null
    }
    try {
      const payload = await this.jwtService.verifyAsync<JwtPayload>(rawToken)
      return await this.validateAccessTokenUser(payload.sub)
    } catch {
      return null
    }
  }

  // ── Forgot password ──────────────────────────────────────────────────────

  async requestPasswordReset(email: string) {
    // Same body whether or not the account exists, so this endpoint can't be
    // used to probe which emails are registered.
    const generic = { ok: true, message: 'If an account with that email exists, a password reset link has been sent.' }
    const user = await this.prisma.user.findUnique({ where: { email: email.trim().toLowerCase() } })
    if (!user || !user.isActive) {
      return generic
    }

    const rawToken = randomBytes(32).toString('hex')
    await this.prisma.passwordResetToken.create({
      data: {
        userId: user.id,
        tokenHash: this.hashToken(rawToken),
        expiresAt: new Date(Date.now() + PASSWORD_RESET_TTL_MS),
      },
    })

    const baseUrl = process.env.ADMIN_BASE_URL || 'https://arofi.net'
    const link = `${baseUrl}/reset-password?token=${rawToken}`
    await this.mailService.sendMail({
      to: user.email,
      subject: 'Reset your AROFi password',
      html: `<p>Hello${user.firstName ? ` ${user.firstName}` : ''},</p>
        <p>We received a request to reset your AROFi password. Click the link below to choose a new one. The link expires in 1 hour.</p>
        <p><a href="${link}">${link}</a></p>
        <p>If you didn't request this, you can safely ignore this email — your password stays unchanged.</p>`,
    })
    return generic
  }

  async confirmPasswordReset(rawToken: string, newPassword: string) {
    const record = await this.prisma.passwordResetToken.findUnique({
      where: { tokenHash: this.hashToken(rawToken) },
    })
    if (!record || record.usedAt || record.expiresAt.getTime() < Date.now()) {
      throw new BadRequestException('This reset link is invalid or has expired. Request a new one.')
    }

    const passwordHash = await bcrypt.hash(newPassword, 10)
    await this.prisma.$transaction([
      this.prisma.user.update({ where: { id: record.userId }, data: { password: passwordHash } }),
      // Burn every outstanding reset link and live session for this user —
      // whoever just proved control of the mailbox owns the account now.
      this.prisma.passwordResetToken.updateMany({
        where: { userId: record.userId, usedAt: null },
        data: { usedAt: new Date() },
      }),
      this.prisma.refreshToken.updateMany({
        where: { userId: record.userId, revokedAt: null },
        data: { revokedAt: new Date() },
      }),
      this.prisma.adminTrustedDevice.updateMany({
        where: { userId: record.userId, revokedAt: null },
        data: { revokedAt: new Date() },
      }),
    ])
    return { ok: true, message: 'Password updated. You can now sign in with your new password.' }
  }

  async changePassword(userId: string, currentPassword: string, newPassword: string) {
    const account = await this.prisma.user.findUnique({ where: { id: userId } })
    if (!account || !(await bcrypt.compare(currentPassword, account.password))) {
      throw new UnauthorizedException('Current password is incorrect.')
    }
    if (await bcrypt.compare(newPassword, account.password)) {
      throw new BadRequestException('Choose a new password that is different from your current password.')
    }

    const now = new Date()
    const passwordHash = await bcrypt.hash(newPassword, 10)
    await this.prisma.$transaction([
      this.prisma.user.update({ where: { id: userId }, data: { password: passwordHash } }),
      this.prisma.refreshToken.updateMany({ where: { userId, revokedAt: null }, data: { revokedAt: now } }),
      this.prisma.adminTrustedDevice.updateMany({ where: { userId, revokedAt: null }, data: { revokedAt: now } }),
        this.prisma.adminLoginOtp.deleteMany({ where: { userId } }),
    ])
    return { ok: true, message: 'Password changed. Sign in again on this device.' }
  }

  // ── Forgot email (reveal masked account email by registration phone) ─────

  async revealEmailByPhone(phoneNumber: string) {
    const digits = phoneNumber.replace(/\D/g, '')
    if (digits.length < 9) {
      throw new BadRequestException('Enter the full phone number you registered with.')
    }
    // Compare on the last 9 digits so 0787..., +256787... and 256787... all
    // match regardless of the format the tenant was registered with.
    const last9 = digits.slice(-9)
    const tenant = await this.prisma.tenant.findFirst({
      where: { supportPhone: { endsWith: last9 } },
      select: { id: true },
    })
    const user = tenant
      ? await this.prisma.user.findFirst({
          where: { tenantId: tenant.id, isActive: true },
          orderBy: { createdAt: 'asc' },
          select: { email: true },
        })
      : null

    if (!user) {
      return { ok: true, maskedEmail: null, message: 'No account matched that phone number. Contact support@arofi.net for help recovering your account.' }
    }

    return { ok: true, maskedEmail: maskEmail(user.email), message: 'This is the email registered with that phone number.' }
  }

  // ── Email change requests (user submits, platform admin approves) ────────

  async createEmailChangeRequest(user: AuthenticatedAdminUser, newEmail: string, reason: string, currentPassword: string) {
    const normalizedNewEmail = newEmail.trim().toLowerCase()
    const account = await this.prisma.user.findUnique({ where: { id: user.id } })
    if (!account || !(await bcrypt.compare(currentPassword, account.password))) {
      throw new UnauthorizedException('Current password is incorrect.')
    }
    if (normalizedNewEmail === account.email) {
      throw new BadRequestException('That is already your current email address.')
    }
    const emailTaken = await this.prisma.user.findUnique({ where: { email: normalizedNewEmail }, select: { id: true } })
    if (emailTaken) {
      throw new BadRequestException('That email address is already in use by another account.')
    }
    const pending = await this.prisma.emailChangeRequest.findFirst({
      where: { userId: user.id, status: EmailChangeRequestStatus.PENDING },
      select: { id: true },
    })
    if (pending) {
      throw new BadRequestException('You already have a pending email change request. Wait for it to be reviewed.')
    }

    const request = await this.prisma.emailChangeRequest.create({
      data: {
        userId: user.id,
        currentEmail: account.email,
        requestedEmail: normalizedNewEmail,
        reason: reason.trim(),
      },
    })

    // Fire-and-forget notifications — the request itself is already saved.
    void this.mailService.sendMail({
      to: process.env.SUPPORT_EMAIL || 'support@arofi.net',
      subject: `Email change request from ${account.email}`,
      html: `<p>${user.displayName} (${account.email}${user.tenantName ? `, ${user.tenantName}` : ''}) requested to change their sign-in email to <strong>${normalizedNewEmail}</strong>.</p>
        <p><strong>Reason:</strong> ${reason.trim()}</p>
        <p>Review it in the admin console under Email Approvals.</p>`,
    })

    return {
      ok: true,
      requestId: request.id,
      message: 'Email change request submitted. You will be notified once it is reviewed.',
    }
  }

  async listEmailChangeRequests(reviewer: AuthenticatedAdminUser, status?: string) {
    this.requirePlatformAdmin(reviewer)
    const where =
      status && ['PENDING', 'APPROVED', 'REJECTED'].includes(status)
        ? { status: status as EmailChangeRequestStatus }
        : {}
    return this.prisma.emailChangeRequest.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: 100,
      include: { user: { select: { email: true, firstName: true, lastName: true, tenant: { select: { name: true } } } } },
    })
  }

  async reviewEmailChangeRequest(reviewer: AuthenticatedAdminUser, requestId: string, approve: boolean, note?: string) {
    this.requirePlatformAdmin(reviewer)
    const request = await this.prisma.emailChangeRequest.findUnique({ where: { id: requestId } })
    if (!request) {
      throw new BadRequestException('Email change request not found.')
    }
    if (request.status !== EmailChangeRequestStatus.PENDING) {
      throw new BadRequestException('This request has already been reviewed.')
    }

    if (!approve) {
      await this.prisma.emailChangeRequest.update({
        where: { id: requestId },
        data: { status: EmailChangeRequestStatus.REJECTED, reviewedBy: reviewer.email, reviewedAt: new Date(), reviewNote: note?.trim() || null },
      })
      void this.mailService.sendMail({
        to: request.currentEmail,
        subject: 'Your AROFi email change request was declined',
        html: `<p>Your request to change your sign-in email to ${request.requestedEmail} was declined.${note ? ` Reason: ${note.trim()}` : ''}</p>
          <p>If you believe this is a mistake, contact support@arofi.net.</p>`,
      })
      return { ok: true, status: 'REJECTED' }
    }

    const emailTaken = await this.prisma.user.findUnique({ where: { email: request.requestedEmail }, select: { id: true } })
    if (emailTaken) {
      throw new BadRequestException('The requested email address is now in use by another account. Reject this request instead.')
    }

    await this.prisma.$transaction([
      this.prisma.user.update({ where: { id: request.userId }, data: { email: request.requestedEmail } }),
      this.prisma.emailChangeRequest.update({
        where: { id: requestId },
        data: { status: EmailChangeRequestStatus.APPROVED, reviewedBy: reviewer.email, reviewedAt: new Date(), reviewNote: note?.trim() || null },
      }),
      // Email is the login identifier — force re-authentication everywhere.
      this.prisma.refreshToken.updateMany({
        where: { userId: request.userId, revokedAt: null },
        data: { revokedAt: new Date() },
      }),
      this.prisma.adminTrustedDevice.updateMany({
        where: { userId: request.userId, revokedAt: null },
        data: { revokedAt: new Date() },
      }),
    ])

    for (const recipient of [request.currentEmail, request.requestedEmail]) {
      void this.mailService.sendMail({
        to: recipient,
        subject: 'Your AROFi sign-in email has changed',
        html: `<p>The sign-in email for your AROFi account was changed from ${request.currentEmail} to <strong>${request.requestedEmail}</strong> after an approved request.</p>
          <p>If you did not request this, contact support@arofi.net immediately.</p>`,
      })
    }
    return { ok: true, status: 'APPROVED' }
  }

  private requirePlatformAdmin(user: AuthenticatedAdminUser) {
    if (!user.permissions.includes('ALL')) {
      throw new ForbiddenException('Only platform administrators can review email change requests.')
    }
  }

  async issueSessionForUserId(userId: string) {
    const authenticatedUser = await this.validateAccessTokenUser(userId)

    return {
      access_token: await this.signAccessToken(authenticatedUser),
      refresh_token: await this.issueRefreshToken(authenticatedUser.id),
      user: authenticatedUser,
    }
  }

  private generateOtp() {
    // crypto.randomInt is uniform and unbiased; pad so leading zeros survive.
    return randomInt(0, 10 ** OTP_LENGTH).toString().padStart(OTP_LENGTH, '0')
  }

  private async deliverOtpEmail(to: string, recipientName: string, otp: string) {
    const sent = await this.mailService.sendAdminLoginOtpEmail({
      to,
      recipientName,
      otp,
      expiresMinutes: otpTtlMinutes(),
    })

    if (!sent) {
      if (process.env.NODE_ENV === 'production') {
        this.logger.error(`OTP email delivery failed for ${to}; returning fallback code to keep admin login available`)
      } else {
        // Non-production only: SMTP is usually not configured on dev machines.
        // Logging the code locally keeps the full OTP flow testable end-to-end.
        this.logger.warn(`SMTP not configured — development login OTP for ${to}: ${otp}`)
      }
    }

    return sent
  }

  // Account-level lockout on top of per-IP throttling: too many failed
  // password or OTP attempts for one email inside the window rejects further
  // tries regardless of source IP (defeats slow distributed guessing).
  private async assertNotLockedOut(email: string) {
    const windowStart = new Date(Date.now() - loginLockoutWindowMinutes() * 60 * 1000)
    const failures = await this.prisma.auditLog.count({
      where: {
        action: { in: ['auth.login.failed', 'auth.otp.failed'] },
        actorEmail: email.toLowerCase(),
        createdAt: { gte: windowStart },
      },
    })

    if (failures >= loginMaxFailures()) {
      throw new HttpException(
        `Too many failed sign-in attempts. Try again in ${loginLockoutWindowMinutes()} minutes.`,
        HttpStatus.TOO_MANY_REQUESTS,
      )
    }
  }

  private async recordAuthAudit(input: {
    action: string
    email: string
    userId?: string | null
    tenantId?: string | null
    severity?: 'INFO' | 'WARNING' | 'CRITICAL'
    message: string
    meta: RequestMeta
  }) {
    try {
      await this.prisma.auditLog.create({
        data: {
          tenantId: input.tenantId ?? null,
          userId: input.userId ?? null,
          actorEmail: input.email.toLowerCase(),
          action: input.action,
          entity: 'AdminLogin',
          severity: input.severity ?? 'INFO',
          ipAddress: input.meta.ipAddress ?? null,
          userAgent: input.meta.userAgent ?? null,
          details: { message: input.message },
        },
      })
    } catch (error) {
      this.logger.error(
        `Failed to write auth audit log (${input.action}): ${error instanceof Error ? error.message : String(error)}`,
      )
    }
  }

  private displayNameOf(user: { firstName?: string | null; lastName?: string | null; email: string }) {
    return (
      [user.firstName?.trim(), user.lastName?.trim()].filter(Boolean).join(' ') || user.email
    )
  }

  private toAuthenticatedUser(input: {
    id: string
    email: string
    firstName?: string | null
    lastName?: string | null
    roleName: string
    permissions: string[]
    tenantId: string | null
    tenantName: string | null
  }): AuthenticatedAdminUser {
    const displayName = [input.firstName?.trim(), input.lastName?.trim()]
      .filter((value): value is string => Boolean(value))
      .join(' ')

    return {
      id: input.id,
      email: input.email,
      role: input.roleName,
      permissions: input.permissions,
      tenantId: input.tenantId,
      tenantName: input.tenantName,
      displayName: displayName || input.email,
    }
  }
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    configService: ConfigService,
    private readonly authService: AuthService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromExtractors([
        ExtractJwt.fromAuthHeaderAsBearerToken(),
        extractJwtFromAdminCookie,
      ]),
      ignoreExpiration: false,
      secretOrKey: configService.get<string>('JWT_SECRET') ?? '',
    })
  }

  async validate(payload: JwtPayload) {
    return this.authService.validateAccessTokenUser(payload.sub)
  }
}

@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {}

function extractRefreshCookie(request: Request) {
  const rawCookie = request.headers.cookie
  if (!rawCookie) {
    return null
  }

  const cookie = rawCookie
    .split(';')
    .map((item) => item.trim())
    .find((item) => item.startsWith(`${REFRESH_COOKIE_NAME}=`))

  return cookie ? decodeURIComponent(cookie.split('=').slice(1).join('=')) : null
}

function extractTrustedDeviceCookie(request: Request) {
  const rawCookie = request.headers.cookie
  if (!rawCookie) {
    return null
  }

  const cookie = rawCookie
    .split(';')
    .map((item) => item.trim())
    .find((item) => item.startsWith(`${TRUSTED_DEVICE_COOKIE_NAME}=`))

  return cookie ? decodeURIComponent(cookie.split('=').slice(1).join('=')) : null
}

// The session cookie must be scoped to the parent domain (".arofi.net") so
// it stays valid across every subdomain of the site — without it, a cookie
// set on one host never reaches another and the dashboard's SSR auth check
// bounces a freshly registered user straight to /login.
//
// The cookie domain is resolved automatically from the request host so this
// works with zero configuration: a request to arofi.net (or any subdomain)
// yields ".arofi.net". Set AUTH_COOKIE_DOMAIN to force a specific value
// (e.g. for a multi-part TLD the auto-derivation below can't handle, like
// ".example.co.uk").
const COOKIE_DOMAIN_OVERRIDE = process.env.AUTH_COOKIE_DOMAIN || undefined

// Derives the shareable parent domain from a request Host header. Returns
// undefined for anything that must stay host-only: IP literals, localhost,
// or a bare single-label host — browsers reject a Domain attribute on those.
export function resolveCookieDomain(request?: Request): string | undefined {
  if (COOKIE_DOMAIN_OVERRIDE) {
    return COOKIE_DOMAIN_OVERRIDE
  }
  const hostHeader = request?.headers?.host
  if (!hostHeader) {
    return undefined
  }
  // Strip any :port suffix.
  const host = hostHeader.split(':')[0].trim().toLowerCase()
  if (!host || host === 'localhost') {
    return undefined
  }
  // Bare IPv4 / IPv6 addresses can't carry a Domain attribute.
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(host) || host.includes(':') || /^[0-9a-f:]+$/.test(host)) {
    return undefined
  }
  const labels = host.split('.')
  if (labels.length < 2) {
    return undefined
  }
  // Share across subdomains of the registrable domain (last two labels).
  // Good for arofi.net and its subdomains. Multi-part TLDs (co.uk) need the
  // explicit AUTH_COOKIE_DOMAIN override above.
  return `.${labels.slice(-2).join('.')}`
}

export function setRefreshCookie(response: Response, token: string | null, domain?: string) {
  if (!token) {
    return
  }
  response.cookie(REFRESH_COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    maxAge: REFRESH_TOKEN_TTL_MS,
    path: '/api/auth',
    ...(domain ? { domain } : {}),
  })
}

export function setTrustedDeviceCookie(response: Response, token: string | null, domain?: string) {
  if (!token) {
    return
  }
  response.cookie(TRUSTED_DEVICE_COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    maxAge: TRUSTED_DEVICE_TTL_MS,
    path: '/api/auth',
    ...(domain ? { domain } : {}),
  })
}

// The access token is delivered ONLY as an HttpOnly cookie. It must never be
// readable from JavaScript (XSS cannot exfiltrate it) and never appear in a
// response body. CSRF is mitigated by SameSite=Lax plus the locked-down
// credentialed CORS policy in main.ts (admin origins only).
export function setAdminAccessCookie(response: Response, token: string, domain?: string) {
  response.cookie(ACCESS_COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    maxAge: ACCESS_TOKEN_TTL_MS,
    path: '/',
    ...(domain ? { domain } : {}),
  })
}

export function clearAdminSessionCookies(response: Response, request?: Request) {
  const domain = resolveCookieDomain(request)
  response.clearCookie(ACCESS_COOKIE_NAME, { path: '/', ...(domain ? { domain } : {}) })
  response.clearCookie(REFRESH_COOKIE_NAME, { path: '/api/auth', ...(domain ? { domain } : {}) })
}

// Shared by auth + onboarding: apply both session cookies and strip the raw
// tokens out of the JSON body so they are never exposed to page JavaScript.
// Pass the request so the cookie Domain is derived from the host the client
// actually reached us on (see resolveCookieDomain).
export function applySessionCookies<
  T extends { access_token: string; refresh_token: string | null },
>(response: Response, session: T, request?: Request): Omit<T, 'access_token' | 'refresh_token'> {
  const { access_token, refresh_token, ...rest } = session
  const domain = resolveCookieDomain(request)
  setAdminAccessCookie(response, access_token, domain)
  setRefreshCookie(response, refresh_token, domain)
  return rest
}

export function applyLoginCookies<
  T extends {
    access_token: string
    refresh_token: string | null
    trusted_device_token?: string | null
  },
>(
  response: Response,
  session: T,
  request?: Request,
): Omit<T, 'access_token' | 'refresh_token' | 'trusted_device_token'> {
  const { access_token, refresh_token, trusted_device_token, ...rest } = session
  const domain = resolveCookieDomain(request)
  setAdminAccessCookie(response, access_token, domain)
  setRefreshCookie(response, refresh_token, domain)
  setTrustedDeviceCookie(response, trusted_device_token ?? null, domain)
  return rest
}

function requestMeta(request: Request): RequestMeta {
  const forwardedFor = request.headers['x-forwarded-for']
  const firstForwarded = Array.isArray(forwardedFor)
    ? forwardedFor[0]
    : forwardedFor?.split(',')[0]?.trim()

  return {
    ipAddress: (firstForwarded || request.ip || '').replace(/^::ffff:/, '') || null,
    userAgent: typeof request.headers['user-agent'] === 'string' ? request.headers['user-agent'] : null,
  }
}

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  // Step 1 — password check + OTP email. Also mounted at the legacy /login
  // path so an out-of-date client fails loudly into the OTP flow instead of
  // silently receiving a session without OTP.
  @Throttle({ default: { ttl: 60_000, limit: 30 } })
  @Post(['login', 'login/start'])
  async loginStart(
    @Body() dto: LoginStartDto,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    const result = await this.authService.startLogin(
      dto.email,
      dto.password,
      requestMeta(request),
      extractTrustedDeviceCookie(request),
    )
    return 'access_token' in result ? applyLoginCookies(response, result, request) : result
  }

  // Step 2 — OTP check, issues the session as HttpOnly cookies.
  @Throttle({ default: { ttl: 60_000, limit: 30 } })
  @Post('login/verify')
  async loginVerify(
    @Body() dto: LoginVerifyDto,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    const session = await this.authService.verifyLogin(
      dto.email,
      dto.otp,
      requestMeta(request),
      dto.rememberDevice ?? false,
    )
    return applyLoginCookies(response, session, request)
  }

  @Throttle({ default: { ttl: 300_000, limit: 3 } })
  @Post('login/resend')
  async loginResend(@Body() dto: LoginResendDto, @Req() request: Request) {
    return this.authService.resendLoginOtp(dto.email, requestMeta(request))
  }

  // The browser sends the httpOnly refresh cookie automatically; the access
  // token is short-lived on purpose, so the frontend calls this whenever a
  // request comes back 401 instead of forcing the user to log in again.
  @Post('refresh')
  async refresh(@Req() request: Request, @Res({ passthrough: true }) response: Response) {
    const token = extractRefreshCookie(request)
    if (!token) {
      throw new UnauthorizedException('No refresh token presented')
    }
    const session = await this.authService.refresh(token)
    return applySessionCookies(response, session, request)
  }

  @Post('logout')
  async logout(@Req() request: Request, @Res({ passthrough: true }) response: Response) {
    await this.authService.logout(extractRefreshCookie(request))
    clearAdminSessionCookies(response, request)
    return { ok: true }
  }

  @UseGuards(JwtAuthGuard)
  @Get('me')
  getMe(@Req() request: AuthenticatedRequest) {
    return {
      user: request.user,
    }
  }

  @UseGuards(JwtAuthGuard)
  @Throttle({ default: { ttl: 300_000, limit: 5 } })
  @Post('password/change')
  changePassword(@Req() request: AuthenticatedRequest, @Body() dto: ChangePasswordDto) {
    return this.authService.changePassword(request.user.id, dto.currentPassword, dto.newPassword)
  }

  // ── Account recovery (public) ─────────────────────────────────────────────

  @Throttle({ default: { ttl: 300_000, limit: 3 } })
  @Post('password-reset/request')
  requestPasswordReset(@Body() dto: PasswordResetRequestDto) {
    return this.authService.requestPasswordReset(dto.email)
  }

  @Throttle({ default: { ttl: 60_000, limit: 5 } })
  @Post('password-reset/confirm')
  confirmPasswordReset(@Body() dto: PasswordResetConfirmDto) {
    return this.authService.confirmPasswordReset(dto.token, dto.password)
  }

  @Throttle({ default: { ttl: 300_000, limit: 5 } })
  @Post('forgot-email')
  forgotEmail(@Body() dto: ForgotEmailDto) {
    return this.authService.revealEmailByPhone(dto.phoneNumber)
  }

  // ── Email change requests ─────────────────────────────────────────────────

  @UseGuards(JwtAuthGuard)
  @Throttle({ default: { ttl: 300_000, limit: 3 } })
  @Post('email-change-requests')
  createEmailChangeRequest(@Req() request: AuthenticatedRequest, @Body() dto: EmailChangeRequestDto) {
    return this.authService.createEmailChangeRequest(request.user, dto.newEmail, dto.reason, dto.currentPassword)
  }

  @UseGuards(JwtAuthGuard)
  @Get('email-change-requests')
  listEmailChangeRequests(@Req() request: AuthenticatedRequest, @Query('status') status?: string) {
    return this.authService.listEmailChangeRequests(request.user, status)
  }

  @UseGuards(JwtAuthGuard)
  @Post('email-change-requests/:id/review')
  reviewEmailChangeRequest(
    @Req() request: AuthenticatedRequest,
    @Param('id') id: string,
    @Body() dto: EmailChangeReviewDto,
  ) {
    return this.authService.reviewEmailChangeRequest(request.user, id, dto.approve, dto.note)
  }
}

@Module({
  imports: [
    ConfigModule,
    PrismaModule,
    UsersModule,
    MailModule,
    PassportModule,
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        secret: configService.get<string>('JWT_SECRET') ?? '',
        signOptions: {
          // Short-lived on purpose: the refresh-token flow (see AuthController)
          // re-issues this silently, so shortening it reduces the window a
          // stolen access token stays useful without costing UX.
          expiresIn: '1h',
        },
      }),
    }),
  ],
  providers: [
    AccessScopeService,
    AuthService,
    JwtStrategy,
    JwtAuthGuard,
    PermissionsGuard,
    RoleCatalogService,
  ],
  controllers: [AuthController],
  exports: [AccessScopeService, AuthService, JwtAuthGuard, PermissionsGuard, RoleCatalogService],
})
export class AuthModule {}
