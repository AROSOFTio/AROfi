import { Module } from '@nestjs/common';
import { PrismaService } from '../prisma.service';

export class HotspotsService {
  constructor(private prisma: PrismaService) {}
  async findAll() { return []; }
}

@Module({
  providers: [HotspotsService, PrismaService],
  exports: [HotspotsService],
})
export class HotspotsModule {}
