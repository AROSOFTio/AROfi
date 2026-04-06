import { Module } from '@nestjs/common';
import { UsersModule } from '../users/users.module';

export class AuthService {
  async validateUser() { return true; }
  async login() { return { access_token: 'dummy_jwt_token' }; }
}

export class AuthController {
  constructor(private authService: AuthService) {}
  // @Post('login') dummy mapping
}

@Module({
  imports: [UsersModule],
  providers: [AuthService],
  controllers: [AuthController],
  exports: [AuthService],
})
export class AuthModule {}
