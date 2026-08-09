import { Global, Module } from '@nestjs/common'
import { APP_INTERCEPTOR } from '@nestjs/core'
import { RedisCacheInterceptor } from './redis-cache.interceptor'
import { RedisCacheService } from './redis-cache.service'

@Global()
@Module({
  providers: [
    RedisCacheService,
    {
      provide: APP_INTERCEPTOR,
      useClass: RedisCacheInterceptor,
    },
  ],
  exports: [RedisCacheService],
})
export class RedisCacheModule {}
