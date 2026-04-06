import { Module, Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma.service';

@Injectable()
export class HotspotsService {
  constructor(private prisma: PrismaService) {}
  async findAll() { return []; }
}

@Module({
  providers: [HotspotsService],
  exports: [HotspotsService],
})
export class HotspotsModule {}
