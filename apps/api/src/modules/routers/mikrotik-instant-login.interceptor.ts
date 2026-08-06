import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common'
import { Observable } from 'rxjs'
import { map } from 'rxjs/operators'

export function appendInstantAloginInstaller(script: string) {
  if (!script || script.includes('hotspot/alogin.html')) {
    return script
  }

  const statusUrls =
    script.match(/https?:\/\/[^"\s]+\/mikrotik\/status-html\/[^"\s]+/g) ?? []
  const secureStatusUrl =
    statusUrls.find((url) => url.startsWith('https://')) ?? statusUrls[0]

  if (!secureStatusUrl) {
    return script
  }

  const fallbackStatusUrl =
    statusUrls.find((url) => url.startsWith('http://')) ??
    secureStatusUrl.replace(/^https:/, 'http:')
  const aloginUrl = secureStatusUrl.replace('/status-html/', '/alogin-html/')
  const fallbackAloginUrl = fallbackStatusUrl.replace('/status-html/', '/alogin-html/')

  return [
    script.trimEnd(),
    '',
    '# AROFi: replace MikroTik stock alogin.html with an immediate redirect',
    ':do { /file remove [find name="hotspot/alogin.html"] } on-error={}',
    ':local arofiAloginOk 0',
    ':do {',
    `  /tool fetch url="${aloginUrl}" check-certificate=no mode=https dst-path="hotspot/alogin.html"`,
    '  :if ([:len [/file find name="hotspot/alogin.html"]] > 0) do={',
    '    :set arofiAloginOk 1',
    '    :put "AROFi HotSpot alogin.html installed - post-login redirect is instant."',
    '  } else={',
    '    :error "alogin.html not found after fetch"',
    '  }',
    '} on-error={',
    '  :do {',
    `    /tool fetch url="${fallbackAloginUrl}" mode=http dst-path="hotspot/alogin.html"`,
    '    :if ([:len [/file find name="hotspot/alogin.html"]] > 0) do={',
    '      :set arofiAloginOk 1',
    '      :put "AROFi HotSpot alogin.html installed by HTTP fallback."',
    '    }',
    '  } on-error={',
    '    :put "WARNING: alogin.html install failed - MikroTik may keep showing its delayed post-login page."',
    '  }',
    '}',
    '',
  ].join('\n')
}

@Injectable()
export class MikrotikInstantLoginInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const request = context.switchToHttp().getRequest()
    const requestUrl = String(request?.originalUrl ?? request?.url ?? '')

    return next.handle().pipe(
      map((body) => {
        if (
          typeof body === 'string' &&
          /\/mikrotik\/script\/[^/?]+/.test(requestUrl)
        ) {
          return appendInstantAloginInstaller(body)
        }

        if (
          body &&
          typeof body === 'object' &&
          typeof body.provisioningScript === 'string'
        ) {
          return {
            ...body,
            provisioningScript: appendInstantAloginInstaller(body.provisioningScript),
          }
        }

        return body
      }),
    )
  }
}
