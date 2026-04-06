import { Module } from '@nestjs/common';
import { PrismaService } from '../prisma.service';

export class UsersService {
  constructor(private prisma: PrismaService) {}
  
  async findOneByEmail(email: string) {
    // This is a placeholder
    return { id: 1, email }; 
  }
}

@Module({
  providers: [UsersService, PrismaService],
  exports: [UsersService],
})
export class UsersModule {}
