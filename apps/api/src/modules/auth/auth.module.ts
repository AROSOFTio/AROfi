import { Module, Controller, Post, Injectable } from '@nestjs/common';
import { UsersModule } from '../users/users.module';

@Injectable()
export class AuthService {
  async validateUser() { return true; }
  async login() { return { access_token: 'dummy_jwt_token' }; }
}

@Controller('auth')
export class AuthController {
  constructor(private authService: AuthService) {}
  
  @Post('login')
  async login() {
    return this.authService.login();
  }
}

@Module({
  imports: [UsersModule],
  providers: [AuthService],
  controllers: [AuthController],
  exports: [AuthService],
})
export class AuthModule {}
