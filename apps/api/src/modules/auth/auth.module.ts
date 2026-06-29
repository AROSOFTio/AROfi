import {
  Body,
  Controller,
  Get,
  Injectable,
  Module,
  Post,
  Req,
  Res,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common'
import { ConfigModule, ConfigService } from '@nestjs/config'
import { JwtModule, JwtService } from '@nestjs/jwt'
import { PassportModule } from '@nestjs/passport'
import { PassportStrategy } from '@nestjs/passport'
import type { Request, Response } from 'express'
import * as bcrypt from 'bcrypt'
import { createHash, randomBytes } from 'crypto'
import { AuthGuard } from '@nestjs/passport'
import { ExtractJwt, Strategy } from 'passport-jwt'
import { IsEmail, IsNotEmpty, IsString } from 'class-validator'
import { PrismaService } from '../../prisma.service'
import { PrismaModule } from '../../prisma.module'
import { UsersModule, UsersService } from '../users/users.module'
import { AccessScopeService } from './access-scope.service'
import { PermissionsGuard } from './permissions.guard'
import { RoleCatalogService } from './role-catalog.service'

export { AccessScopeService, PermissionsGuard, RoleCatalogService }

const REFRESH_COOKIE_NAME = 'arofi_admin_refresh'
const REFRESH_TOKEN_TTL_MS = 30 * 24 * 60 * 60 * 1000

class LoginDto {
  @IsEmail()
  email: string

  @IsString()
  @IsNotEmpty()
  password: string
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

function extractJwtFromAdminCookie(request: Request) {
  const rawCookie = request.headers.cookie
  if (!rawCookie) {
    return null
  }

  const cookie = rawCookie
    .split(';')
    .map((item) => item.trim())
    .find((item) => item.startsWith('arofi_admin_token='))

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
  constructor(
    private readonly usersService: UsersService,
    private readonly jwtService: JwtService,
    private readonly roleCatalogService: RoleCatalogService,
    private readonly prisma: PrismaService,
  ) {}

  async login(email: string, password: string) {
    await this.roleCatalogService.ensureStandardRoles()

    const user = await this.usersService.findOneByEmail(email)
    if (!user || !user.isActive) {
      throw new UnauthorizedException('Invalid credentials')
    }

    const passwordMatches = await bcrypt.compare(password, user.password)
    if (!passwordMatches) {
      throw new UnauthorizedException('Invalid credentials')
    }

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

    const access_token = await this.signAccessToken(authenticatedUser)
    const refresh_token = await this.issueRefreshToken(authenticatedUser.id)

    return {
      access_token,
      refresh_token,
      user: authenticatedUser,
    }
  }

  // Rotates the refresh token on every use: the old one is revoked and a new
  // one issued, so a stolen-but-unused refresh token becomes worthless the
  // next time the legitimate session refreshes.
  async refresh(rawToken: string) {
    const tokenHash = this.hashToken(rawToken)
    const record = await this.prisma.refreshToken.findUnique({ where: { tokenHash } })

    if (!record || record.revokedAt || record.expiresAt < new Date()) {
      throw new UnauthorizedException('Session expired, please sign in again')
    }

    await this.prisma.refreshToken.update({
      where: { id: record.id },
      data: { revokedAt: new Date() },
    })

    const authenticatedUser = await this.validateAccessTokenUser(record.userId)
    const access_token = await this.signAccessToken(authenticatedUser)
    const refresh_token = await this.issueRefreshToken(authenticatedUser.id)

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
    } catch {
      // If the RefreshToken migration hasn't been applied yet on this
      // deployment, degrade to an access-token-only session instead of
      // blocking login entirely.
      return null
    }
    return rawToken
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

  async issueSessionForUserId(userId: string) {
    const authenticatedUser = await this.validateAccessTokenUser(userId)

    return {
      access_token: await this.signAccessToken(authenticatedUser),
      refresh_token: await this.issueRefreshToken(authenticatedUser.id),
      user: authenticatedUser,
    }
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

export function setRefreshCookie(response: Response, token: string | null) {
  if (!token) {
    return
  }
  response.cookie(REFRESH_COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    maxAge: REFRESH_TOKEN_TTL_MS,
    path: '/api/auth',
  })
}

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('login')
  async login(@Body() dto: LoginDto, @Res({ passthrough: true }) response: Response) {
    const { refresh_token, ...result } = await this.authService.login(dto.email, dto.password)
    setRefreshCookie(response, refresh_token)
    return result
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
    const { refresh_token, ...result } = await this.authService.refresh(token)
    setRefreshCookie(response, refresh_token)
    return result
  }

  @Post('logout')
  async logout(@Req() request: Request, @Res({ passthrough: true }) response: Response) {
    await this.authService.logout(extractRefreshCookie(request))
    response.clearCookie(REFRESH_COOKIE_NAME, { path: '/api/auth' })
    return { ok: true }
  }

  @UseGuards(JwtAuthGuard)
  @Get('me')
  getMe(@Req() request: AuthenticatedRequest) {
    return {
      user: request.user,
    }
  }
}

@Module({
  imports: [
    ConfigModule,
    PrismaModule,
    UsersModule,
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
