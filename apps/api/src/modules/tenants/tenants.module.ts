import { Module, Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma.service';

@Injectable()
export class TenantsService {
  constructor(private prisma: PrismaService) {}
  async findAll() { return []; }
}

@Module({
  providers: [TenantsService, PrismaService],
  exports: [TenantsService],
})
export class TenantsModule {}
