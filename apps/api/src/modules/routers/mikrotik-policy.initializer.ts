import { Injectable, Logger, OnModuleInit } from '@nestjs/common'
import { MikrotikService } from './mikrotik.service'
import { RoutersService } from './routers.service'

type MutableMikrotikService = {
  buildProvisioningScript: (...args: any[]) => string
}

type MutableRoutersService = {
  getProvisioningScriptByKey: (key: string) => Promise<string | null | undefined>
  getRemoteAccessInstallScript: (token: string) => Promise<string | null | undefined>
}

const AUTH_POLICY_MARKER = '# AROFi immutable authentication and active-bundle policy'
const REMOTE_POLICY_MARKER = '# AROFi verified SSTP completion policy'

/**
 * Last-mile RouterOS safety policy.
 *
 * This initializer deliberately wraps both the generator and the final API
 * delivery methods. That makes the policy survive future generator refactors:
 * a script cannot leave the API with automatic MAC authentication or a false
 * SSTP success message, even if an older line is accidentally restored.
 */
@Injectable()
export class MikrotikPolicyInitializer implements OnModuleInit {
  private readonly logger = new Logger(MikrotikPolicyInitializer.name)

  constructor(
    private readonly mikrotikService: MikrotikService,
    private readonly routersService: RoutersService,
  ) {}

  onModuleInit() {
    this.wrapGenerator()
    this.wrapFinalDelivery()
  }

  private wrapGenerator() {
    const service = this.mikrotikService as unknown as MutableMikrotikService
    const original = service.buildProvisioningScript.bind(service)

    service.buildProvisioningScript = (...args: any[]) =>
      this.hardenProvisioningScript(original(...args))
  }

  private wrapFinalDelivery() {
    const service = this.routersService as unknown as MutableRoutersService

    const originalProvisioning = service.getProvisioningScriptByKey.bind(service)
    service.getProvisioningScriptByKey = async (key: string) => {
      const script = await originalProvisioning(key)
      return script ? this.hardenProvisioningScript(script) : script
    }

    const originalRemoteAccess = service.getRemoteAccessInstallScript.bind(service)
    service.getRemoteAccessInstallScript = async (token: string) => {
      const script = await originalRemoteAccess(token)
      return script ? this.hardenRemoteAccessScript(script) : script
    }
  }

  private hardenProvisioningScript(input: string) {
    let script = input

    // Automatic MAC authentication must never be used. mac-cookie is allowed
    // only after a successful voucher/Mobile Money login and still rechecks the
    // RADIUS credential, so an expired activation cannot regain internet.
    script = script.replace(
      /login-by=(?:"[^"]*"|[^\s\r\n]+)/g,
      'login-by=cookie,mac-cookie,http-pap',
    )
    script = script.replace(
      /\s+mac-auth-mode=(?:"[^"]*"|[^\s\r\n]+)/g,
      '',
    )

    // Do not tell operators to expose an internal API/container port. RouterOS
    // callbacks use the public AROFi HTTP/HTTPS route.
    script = script.replace(
      /Check WAN internet, DNS, HTTPS, and VPS port 4012\./g,
      'Check WAN internet, DNS, and the public AROFi route on ports 80/443.',
    )

    if (!script.includes(AUTH_POLICY_MARKER)) {
      script += `\n\n${[
        AUTH_POLICY_MARKER,
        '# No login-by=mac. Trusted return uses mac-cookie only; RADIUS remains authoritative.',
        ':foreach hp in=[/ip hotspot profile find where use-radius=yes] do={ :do { /ip hotspot profile set $hp login-by=cookie,mac-cookie,http-pap } on-error={ :put "WARNING: AROFi could not enforce the HotSpot login policy on one profile." } }',
        '# Active customers are not logged out for inactivity. Package/trial expiry is enforced by RADIUS Session-Timeout and server disconnect.',
        ':foreach up in=[/ip hotspot user profile find] do={ :do { /ip hotspot user profile set $up shared-users=1 add-mac-cookie=yes mac-cookie-timeout=30d idle-timeout=none keepalive-timeout=none session-timeout=0s } on-error={ :put "WARNING: AROFi could not enforce the active-bundle policy on one user profile." } }',
        ':put "AROFi authentication policy active: cookie/mac-cookie/http-pap only; automatic MAC authentication disabled."',
      ].join('\n')}\n`
    }

    if (/login-by=mac(?:,|\s|$)/.test(script) || /mac-auth-mode=/.test(script)) {
      this.logger.error('Blocked a generated MikroTik script that still contained automatic MAC authentication')
      throw new Error('Unsafe MikroTik authentication policy detected')
    }

    return script
  }

  private hardenRemoteAccessScript(input: string) {
    if (input.includes(REMOTE_POLICY_MARKER)) {
      return input
    }

    const clientMatch = input.match(/\/interface sstp-client add name="([^"]+)"/)
    if (!clientMatch) {
      this.logger.warn('Remote-access script has no SSTP client definition; leaving it unchanged')
      return input
    }

    const clientName = clientMatch[1]
    const lines = input.split(/\r?\n/)
    const kept = lines.filter((line) => {
      const trimmed = line.trim()
      if (/^:do \{ \/interface sstp-client enable .*:set sstpOk 1 \} on-error=\{\}$/.test(trimmed)) {
        return false
      }
      if (/^:if \(\$sstpOk = [01]\) do=\{/.test(trimmed)) {
        return false
      }
      return true
    })

    const verification = [
      REMOTE_POLICY_MARKER,
      `:do { /interface sstp-client enable [find name="${clientName}"] } on-error={}`,
      ':local sstpWait 0',
      ':while ($sstpWait < 15 && $sstpOk < 2) do={',
      '  :set sstpWait ($sstpWait + 1)',
      `  :local sstpId [/interface sstp-client find name="${clientName}"]`,
      '  :if ([:len $sstpId] > 0) do={',
      '    :local sstpDisabled true',
      '    :local sstpRunning false',
      '    :do { :set sstpDisabled [/interface sstp-client get [:pick $sstpId 0] disabled] } on-error={}',
      '    :do { :set sstpRunning [/interface sstp-client get [:pick $sstpId 0] running] } on-error={}',
      '    :if ($sstpDisabled = false) do={ :set sstpOk 1 }',
      '    :if ($sstpRunning = true) do={ :set sstpOk 2 }',
      '  }',
      '  :if ($sstpOk < 2) do={ :delay 1s }',
      '}',
      ':if ($sstpOk = 0) do={',
      '  :put "ERROR: SSTP client could not be enabled. Remote access was NOT installed."',
      '  :put "RouterOS 7 device-mode action: run /system device-mode update mode=enterprise, confirm physically when prompted, reboot, then run this installer again."',
      '  :error "AROFi remote access installation failed"',
      '}',
      ':if ($sstpOk = 1) do={',
      '  :put "ERROR: SSTP client is enabled but the tunnel is not connected. Remote access was NOT marked active."',
      '  :put "Check the SSTP server, DNS, credentials, certificate and firewall, then run this installer again."',
      '  :error "AROFi SSTP tunnel verification failed"',
      '}',
      ':if ($sstpOk = 2) do={ :log info "AROFi Remote Access connected and verified."; :put "AROFi Remote Access connected and verified." }',
    ]

    return `${kept.join('\n')}\n${verification.join('\n')}\n`
  }
}
