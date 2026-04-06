import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AuthModule } from './modules/auth/auth.module';
import { BillingModule } from './modules/billing/billing.module';
import { UsersModule } from './modules/users/users.module';
import { TenantsModule } from './modules/tenants/tenants.module';
import { HotspotsModule } from './modules/hotspots/hotspots.module';
import { PackagesModule } from './modules/packages/packages.module';
import { VouchersModule } from './modules/vouchers/vouchers.module';
import { WalletsModule } from './modules/wallets/wallets.module';
import { PrismaModule } from './prisma.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    PrismaModule,
    AuthModule,
    UsersModule,
    TenantsModule,
    HotspotsModule,
    PackagesModule,
    VouchersModule,
    BillingModule,
    WalletsModule,
  ],
  controllers: [],
  providers: [],
})
export class AppModule {}
