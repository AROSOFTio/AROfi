import { Module } from '@nestjs/common';
import { PrismaService } from '../prisma.service';

export class TenantsService {
  constructor(private prisma: PrismaService) {}
  async findAll() { return []; }
}

@Module({
  providers: [TenantsService, PrismaService],
  exports: [TenantsService],
})
export class TenantsModule {}
