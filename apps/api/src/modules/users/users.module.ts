import { Module, Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma.service';

@Injectable()
export class UsersService {
  constructor(private prisma: PrismaService) {}
  
  async findOneByEmail(email: string) {
    return this.prisma.user.findUnique({
      where: { email },
      include: {
        role: true,
        tenant: true,
      },
    })
  }
}

@Module({
  providers: [UsersService],
  exports: [UsersService],
})
export class UsersModule {}
