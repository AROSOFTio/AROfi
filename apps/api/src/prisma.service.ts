import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PrismaService.name);

  async onModuleInit() {
    let retries = 5;
    while (retries > 0) {
      try {
        await this.$connect();
        this.logger.log('Successfully connected to the database');
        break;
      } catch (err) {
        retries--;
        this.logger.error(`Failed to connect to database. Retrying... (${retries} attempts left)`);
        this.logger.error(err);
        if (retries === 0) throw err;
        await new Promise(resolve => setTimeout(resolve, 5000));
      }
    }
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }
}
