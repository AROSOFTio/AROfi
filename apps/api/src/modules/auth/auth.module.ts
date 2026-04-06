import { Body, Controller, Injectable, Module, Post, UnauthorizedException } from '@nestjs/common';
import { IsEmail, IsNotEmpty, IsString } from 'class-validator';
import * as bcrypt from 'bcrypt';
import { UsersModule, UsersService } from '../users/users.module';

class LoginDto {
  @IsEmail()
  email: string

  @IsString()
  @IsNotEmpty()
  password: string
}

@Injectable()
export class AuthService {
  constructor(private readonly usersService: UsersService) {}

  async login(email: string, password: string) {
    const user = await this.usersService.findOneByEmail(email)
    if (!user) {
      throw new UnauthorizedException('Invalid credentials')
    }

    const passwordMatches = await bcrypt.compare(password, user.password)
    if (!passwordMatches) {
      throw new UnauthorizedException('Invalid credentials')
    }

    return {
      access_token: `token-${user.id}`,
      user: {
        id: user.id,
        email: user.email,
        role: user.role.name,
        tenantId: user.tenantId,
      },
    }
  }
}

@Controller('auth')
export class AuthController {
  constructor(private authService: AuthService) {}
  
  @Post('login')
  async login(@Body() dto: LoginDto) {
    return this.authService.login(dto.email, dto.password);
  }
}

@Module({
  imports: [UsersModule],
  providers: [AuthService],
  controllers: [AuthController],
  exports: [AuthService],
})
export class AuthModule {}
