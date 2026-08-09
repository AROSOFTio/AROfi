import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common'
import { Reflector } from '@nestjs/core'
import { from, lastValueFrom, map, mergeMap, Observable } from 'rxjs'
import {
  REDIS_CACHE_INVALIDATE_METADATA,
  REDIS_CACHE_METADATA,
  RedisCacheOptions,
} from './redis-cache.decorators'
import { RedisCacheService } from './redis-cache.service'

@Injectable()
export class RedisCacheInterceptor implements NestInterceptor {
  constructor(
    private readonly reflector: Reflector,
    private readonly cache: RedisCacheService,
  ) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (context.getType() !== 'http') {
      return next.handle()
    }

    const cacheOptions = this.reflector.getAllAndOverride<RedisCacheOptions>(REDIS_CACHE_METADATA, [
      context.getHandler(),
      context.getClass(),
    ])
    const invalidationNamespaces = this.reflector.getAllAndOverride<string[]>(REDIS_CACHE_INVALIDATE_METADATA, [
      context.getHandler(),
      context.getClass(),
    ])

    if (cacheOptions) {
      const request = context.switchToHttp().getRequest()
      if (request.method !== 'GET') {
        return next.handle()
      }
      const key = this.cache.buildHttpKey(cacheOptions.namespace, request)
      return from(
        this.cache.remember(key, cacheOptions.ttlSeconds, () => lastValueFrom(next.handle())),
      )
    }

    if (invalidationNamespaces?.length) {
      return next.handle().pipe(
        mergeMap((value) =>
          from(this.cache.invalidateNamespaces(invalidationNamespaces)).pipe(map(() => value)),
        ),
      )
    }

    return next.handle()
  }
}
