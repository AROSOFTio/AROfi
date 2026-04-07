import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AgentsModule } from './modules/agents/agents.module';
import { AuthModule } from './modules/auth/auth.module';
import { BillingModule } from './modules/billing/billing.module';
import { UsersModule } from './modules/users/users.module';
import { TenantsModule } from './modules/tenants/tenants.module';
import { HotspotsModule } from './modules/hotspots/hotspots.module';
import { PackagesModule } from './modules/packages/packages.module';
import { PaymentsModule } from './modules/payments/payments.module';
import { PortalModule } from './modules/portal/portal.module';
import { RadiusModule } from './modules/radius/radius.module';
import { RoutersModule } from './modules/routers/routers.module';
import { SessionsModule } from './modules/sessions/sessions.module';
import { VouchersModule } from './modules/vouchers/vouchers.module';
import { WalletsModule } from './modules/wallets/wallets.module';
import { PrismaModule } from './prisma.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    PrismaModule,
    AgentsModule,
    AuthModule,
    UsersModule,
    TenantsModule,
    HotspotsModule,
    RoutersModule,
    SessionsModule,
    RadiusModule,
    PackagesModule,
    PaymentsModule,
    PortalModule,
    VouchersModule,
    BillingModule,
    WalletsModule,
  ],
  controllers: [],
  providers: [],
})
export class AppModule {}
