import { Global, Module } from '@nestjs/common'
import { AuthModule } from '../auth/auth.module'
import { EventsController } from './events.controller'
import { RealtimeEventsService } from './realtime-events.service'

// Global so lifecycle services (payments, radius, routers, portal) can inject
// RealtimeEventsService without creating module import cycles.
@Global()
@Module({
  imports: [AuthModule],
  controllers: [EventsController],
  providers: [RealtimeEventsService],
  exports: [RealtimeEventsService],
})
export class EventsModule {}
