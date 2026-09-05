import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common'
import { Observable } from 'rxjs'

/**
 * The generated RouterOS login.html is a release artifact, not cacheable web
 * content. Routers periodically fetch this endpoint and must always receive the
 * newest captive portal shell; otherwise Cloudflare/proxies can leave a tenant
 * on an older local design even after the API has been deployed.
 */
@Injectable()
export class MikrotikLoginCacheInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const http = context.switchToHttp()
    const request = http.getRequest<{ originalUrl?: string; url?: string }>()
    const response = http.getResponse<{ setHeader: (name: string, value: string) => void }>()
    const url = request.originalUrl || request.url || ''

    if (url.includes('/mikrotik/login-html/')) {
      response.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0')
      response.setHeader('Pragma', 'no-cache')
      response.setHeader('Expires', '0')
      response.setHeader('Surrogate-Control', 'no-store')
    }

    return next.handle()
  }
}
