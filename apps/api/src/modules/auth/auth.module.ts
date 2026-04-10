import {
  Body,
  Controller,
  Get,
  Injectable,
  Module,
  Post,
  Req,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common'
import { ConfigModule, ConfigService } from '@nestjs/config'
import { JwtModule, JwtService } from '@nestjs/jwt'
import { PassportModule } from '@nestjs/passport'
import { PassportStrategy } from '@nestjs/passport'
import type { Request } from 'express'
import * as bcrypt from 'bcrypt'
import { AuthGuard } from '@nestjs/passport'
import { ExtractJwt, Strategy } from 'passport-jwt'
import { IsEmail, IsNotEmpty, IsString } from 'class-validator'
import { UsersModule, UsersService } from '../users/users.module'

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
  tenantId: string | null
}

type AuthenticatedRequest = Request & {
  user: AuthenticatedAdminUser
}

@Injectable()
export class AuthService {
  constructor(
    private readonly usersService: UsersService,
    private readonly jwtService: JwtService,
  ) {}

  async login(email: string, password: string) {
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
      roleName: user.role.name,
      tenantId: user.tenantId,
    })

    const payload: JwtPayload = {
      sub: authenticatedUser.id,
      email: authenticatedUser.email,
      role: authenticatedUser.role,
      tenantId: authenticatedUser.tenantId,
    }

    return {
      access_token: await this.jwtService.signAsync(payload),
      user: authenticatedUser,
    }
  }

  async validateAccessTokenUser(userId: string) {
    const user = await this.usersService.findOneById(userId)
    if (!user || !user.isActive) {
      throw new UnauthorizedException('Session expired')
    }

    return this.toAuthenticatedUser({
      id: user.id,
      email: user.email,
      roleName: user.role.name,
      tenantId: user.tenantId,
    })
  }

  private toAuthenticatedUser(input: {
    id: string
    email: string
    roleName: string
    tenantId: string | null
  }): AuthenticatedAdminUser {
    return {
      id: input.id,
      email: input.email,
      role: input.roleName,
      tenantId: input.tenantId,
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
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: configService.get<string>('JWT_SECRET') ?? 'change_this_in_production',
    })
  }

  async validate(payload: JwtPayload) {
    return this.authService.validateAccessTokenUser(payload.sub)
  }
}

@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {}

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('login')
  async login(@Body() dto: LoginDto) {
    return this.authService.login(dto.email, dto.password)
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
    UsersModule,
    PassportModule,
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        secret: configService.get<string>('JWT_SECRET') ?? 'change_this_in_production',
        signOptions: {
          expiresIn: '30d',
        },
      }),
    }),
  ],
  providers: [AuthService, JwtStrategy, JwtAuthGuard],
  controllers: [AuthController],
  exports: [AuthService, JwtAuthGuard],
})
export class AuthModule {}
