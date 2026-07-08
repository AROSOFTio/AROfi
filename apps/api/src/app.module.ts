import { Controller, Get, Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { APP_FILTER, APP_GUARD } from '@nestjs/core';
import { SentryGlobalFilter, SentryModule } from '@sentry/nestjs/setup';
import { AgentsModule } from './modules/agents/agents.module';
import { AuthModule } from './modules/auth/auth.module';
import { BillingModule } from './modules/billing/billing.module';
import { BlogModule } from './modules/blog/blog.module';
import { UsersModule } from './modules/users/users.module';
import { TenantsModule } from './modules/tenants/tenants.module';
import { HotspotsModule } from './modules/hotspots/hotspots.module';
import { OnboardingModule } from './modules/onboarding/onboarding.module';
import { PackagesModule } from './modules/packages/packages.module';
import { PaymentsModule } from './modules/payments/payments.module';
import { PortalModule } from './modules/portal/portal.module';
import { RadiusModule } from './modules/radius/radius.module';
import { RoutersModule } from './modules/routers/routers.module';
import { SessionsModule } from './modules/sessions/sessions.module';
import { SystemModule } from './modules/system/system.module';
import { VouchersModule } from './modules/vouchers/vouchers.module';
import { WalletsModule } from './modules/wallets/wallets.module';
import { PrismaModule } from './prisma.module';
import { ChatModule } from './modules/chat/chat.module';
import { ComplianceModule } from './modules/compliance/compliance.module';
import { SubscriptionModule } from './modules/subscription/subscription.module';
import { MailModule } from './modules/mail/mail.module';
import { EventsModule } from './modules/events/events.module';

@Controller('health')
export class HealthController {
  @Get()
  check() {
    return { status: 'ok', timestamp: new Date().toISOString() }
  }
}

@Module({
  imports: [
    SentryModule.forRoot(),
    ConfigModule.forRoot({ isGlobal: true }),
    ThrottlerModule.forRoot([
      {
        ttl: 60_000,
        limit: 120,
      },
    ]),
    PrismaModule,
    EventsModule,
    AgentsModule,
    AuthModule,
    UsersModule,
    OnboardingModule,
    TenantsModule,
    HotspotsModule,
    RoutersModule,
    SessionsModule,
    SystemModule,
    RadiusModule,
    PackagesModule,
    PaymentsModule,
    PortalModule,
    VouchersModule,
    BillingModule,
    WalletsModule,
    ChatModule,
    ComplianceModule,
    SubscriptionModule,
    MailModule,
    BlogModule,
  ],
  controllers: [HealthController],
  providers: [
    {
      provide: APP_FILTER,
      useClass: SentryGlobalFilter,
    },
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
  ],
})
export class AppModule {}
