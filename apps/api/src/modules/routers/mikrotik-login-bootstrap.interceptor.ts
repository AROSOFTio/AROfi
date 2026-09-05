import { CallHandler, ExecutionContext, Injectable, Logger, NestInterceptor } from '@nestjs/common'
import { PackageStatus } from '@prisma/client'
import { Observable } from 'rxjs'
import { mergeMap } from 'rxjs/operators'
import { PrismaService } from '../../prisma.service'

/**
 * The captive page is served from RouterOS hotspot/login.html, so a brand-new
 * unauthenticated phone can render the local HTML before it is able to reach
 * arofi.net through the walled garden.  Do not make the first paint depend on
 * that network request: embed a current package snapshot in the generated
 * login.html and satisfy only the first /api/portal/context GET from it.
 *
 * Voucher redemption, Mobile Money, recovery and all other API calls remain
 * live network requests.  A best-effort background context call is also made
 * after the local paint so an already-active returning device can reconnect.
 */
@Injectable()
export class MikrotikLoginBootstrapInterceptor implements NestInterceptor {
  private readonly logger = new Logger(MikrotikLoginBootstrapInterceptor.name)

  constructor(private readonly prisma: PrismaService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const http = context.switchToHttp()
    const request = http.getRequest<{
      originalUrl?: string
      url?: string
      params?: { key?: string }
    }>()
    const url = request.originalUrl || request.url || ''
    const key = request.params?.key?.trim()

    if (!key || !url.includes('/mikrotik/login-html/')) {
      return next.handle()
    }

    return next.handle().pipe(
      mergeMap(async (body: unknown) => {
        if (typeof body !== 'string' || body.includes('id="arofi-local-bootstrap-v1"')) {
          return body
        }

        try {
          const router = await this.prisma.router.findUnique({
            where: { registrationKey: key },
            select: {
              tenantId: true,
              tenant: {
                select: {
                  id: true,
                  name: true,
                  domain: true,
                  logoUrl: true,
                  brandColor: true,
                  portalTemplate: true,
                  supportPhone: true,
                  supportEmail: true,
                },
              },
            },
          })

          if (!router) return body

          const packages = await this.prisma.package.findMany({
            where: {
              tenantId: router.tenantId,
              status: PackageStatus.ACTIVE,
            },
            include: {
              prices: {
                orderBy: { startsAt: 'desc' },
              },
            },
            orderBy: [{ isFeatured: 'desc' }, { createdAt: 'desc' }],
          })

          const packageSnapshot = packages
            .map((pkg) => {
              const activePrice = pkg.prices.find((price) => price.endsAt === null) ?? pkg.prices[0]
              return {
                id: pkg.id,
                name: pkg.name,
                code: pkg.code,
                description: pkg.description,
                durationMinutes: pkg.durationMinutes,
                dataLimitMb: pkg.dataLimitMb,
                deviceLimit: pkg.deviceLimit,
                downloadSpeedKbps: pkg.downloadSpeedKbps,
                uploadSpeedKbps: pkg.uploadSpeedKbps,
                isFeatured: pkg.isFeatured,
                isTrialEnabled: pkg.isTrialEnabled,
                amountUgx: activePrice?.amountUgx ?? 0,
              }
            })
            .sort((a, b) => {
              if (a.isFeatured !== b.isFeatured) return a.isFeatured ? -1 : 1
              return a.amountUgx - b.amountUgx
            })

          const bootstrap = {
            tenant: {
              ...router.tenant,
              platformSupportPhone: null,
              platformSupportEmail: null,
            },
            packages: packageSnapshot,
            paymentNetworks: ['MTN', 'AIRTEL'],
            activeActivation: null,
            latestPayment: null,
            returningDevice: {
              existingActiveAccess: false,
              reconnect: null,
            },
            session: null,
          }

          const safeJson = JSON.stringify(bootstrap)
            .replace(/</g, '\\u003c')
            .replace(/>/g, '\\u003e')
            .replace(/&/g, '\\u0026')

          const script = `<script id="arofi-local-bootstrap-v1">
(function(){
  var BOOTSTRAP=${safeJson};
  var liveApiCall=typeof apiCall==='function'?apiCall:null;
  var contextServed=false;
  if(!liveApiCall||!BOOTSTRAP||!BOOTSTRAP.packages)return;

  apiCall=function(method,path,data,cb){
    var isContext=String(method||'GET').toUpperCase()==='GET'&&String(path||'').indexOf('/api/portal/context')===0;
    if(!isContext||contextServed){liveApiCall(method,path,data,cb);return;}

    contextServed=true;
    cb(null,BOOTSTRAP);

    // The local snapshot makes the page usable immediately.  This background
    // request only restores returning-device auto-connect when the API is
    // reachable; it is never allowed to put the spinner back on screen.
    setTimeout(function(){
      liveApiCall(method,path,data,function(err,fresh){
        if(err||!fresh)return;
        try{
          var rd=fresh.returningDevice;
          if(rd&&rd.existingActiveAccess&&rd.reconnect&&typeof conn==='function')conn(rd.reconnect);
        }catch(e){}
      });
    },0);
  };
})();
</script>`

          return body.replace('</body>', `${script}</body>`)
        } catch (error) {
          this.logger.warn(
            `Could not embed local captive package snapshot for router key ${key}: ${
              error instanceof Error ? error.message : String(error)
            }`,
          )
          return body
        }
      }),
    )
  }
}
