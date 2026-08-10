import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common'
import { map } from 'rxjs/operators'

const SESSION_PERSISTENCE_MARKER = '# AROFi: permanent active-bundle and returning-device policy'
const ALOGIN_INSTALLER_MARKER = '# AROFi: replace MikroTik stock alogin.html with an immediate redirect'

export function appendInstantAloginInstaller(script: string) {
  if (!script) {
    return script
  }

  const statusUrls =
    script.match(/https?:\/\/[^"\s]+\/mikrotik\/status-html\/[^"\s]+/g) ?? []
  const looksLikeProvisioningScript =
    statusUrls.length > 0 ||
    script.includes('/ip hotspot') ||
    script.includes('AROFi MikroTik onboarding script')

  if (!looksLikeProvisioningScript) {
    return script
  }

  const additions: string[] = []

  // Defensive fallback. RouterCaptiveFlowInitializer normally installs the
  // self-healing version of this policy before the response reaches this
  // interceptor. These commands protect any alternate provisioning response
  // path without introducing automatic RADIUS MAC authentication.
  if (!script.includes(SESSION_PERSISTENCE_MARKER)) {
    additions.push(
      SESSION_PERSISTENCE_MARKER,
      '# Active bundles end only at RADIUS/package expiry, quota exhaustion, or explicit revocation.',
      '# mac-cookie is a trusted post-login reconnect cookie; login-by=mac remains forbidden.',
      ':foreach arofiHotspotProfile in=[/ip hotspot profile find] do={',
      '  :do {',
      '    /ip hotspot profile set $arofiHotspotProfile login-by=cookie,mac-cookie,http-pap http-cookie-lifetime=30d',
      '  } on-error={',
      '    :put "WARNING: Could not update one HotSpot profile for returning-device reconnect."',
      '  }',
      '}',
      ':foreach arofiUserProfile in=[/ip hotspot user profile find] do={',
      '  :do {',
      '    /ip hotspot user profile set $arofiUserProfile idle-timeout=none keepalive-timeout=none session-timeout=0s shared-users=1 add-mac-cookie=yes mac-cookie-timeout=30d',
      '  } on-error={',
      '    :put "WARNING: Could not update one HotSpot user profile for persistent access."',
      '  }',
      '}',
      ':put "AROFi HotSpot persistence installed - active bundles stay online and returning devices reconnect automatically."',
      '',
    )
  }

  if (!script.includes(ALOGIN_INSTALLER_MARKER)) {
    const secureStatusUrl =
      statusUrls.find((url) => url.startsWith('https://')) ?? statusUrls[0]

    if (secureStatusUrl) {
      const fallbackStatusUrl =
        statusUrls.find((url) => url.startsWith('http://')) ??
        secureStatusUrl.replace(/^https:/, 'http:')
      const aloginUrl = secureStatusUrl.replace('/status-html/', '/alogin-html/')
      const fallbackAloginUrl = fallbackStatusUrl.replace('/status-html/', '/alogin-html/')

      additions.push(
        ALOGIN_INSTALLER_MARKER,
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
      )
    }
  }

  if (additions.length === 0) {
    return script
  }

  return [script.trimEnd(), '', ...additions].join('\n')
}

@Injectable()
export class MikrotikInstantLoginInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler) {
    const request = context.switchToHttp().getRequest()
    const requestUrl = String(request?.originalUrl ?? request?.url ?? '')

    // npm workspaces can install a second physical RxJS copy inside apps/api.
    // Nest's CallHandler is typed against the root copy, while this operator may
    // resolve against the workspace copy. The operator is runtime-compatible;
    // erase only that duplicate-package type identity so the API build remains
    // stable without weakening the response transformation itself.
    const transformResponse = map((body: any) => {
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
    }) as any

    return next.handle().pipe(transformResponse)
  }
}
