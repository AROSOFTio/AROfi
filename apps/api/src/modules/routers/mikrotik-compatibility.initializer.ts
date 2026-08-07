import { Injectable, Logger, OnModuleInit } from '@nestjs/common'
import { MikrotikService } from './mikrotik.service'

type ProvisioningInput = {
  routerName?: string
  hotspotNetworkName?: string | null
  remoteClientName?: string | null
}

type MutableMikrotikService = MikrotikService & {
  buildProvisioningScript: (input: ProvisioningInput) => string
  buildLoginHtml: (registrationKey: string, portalBaseUrl?: string | null) => string
}

/**
 * Runtime compatibility layer for RouterOS variants that expose different
 * wireless menus. Optional radio configuration must never abort the core
 * bridge, DHCP, HotSpot, RADIUS, portal, or callback setup.
 */
@Injectable()
export class MikrotikCompatibilityInitializer implements OnModuleInit {
  private readonly logger = new Logger(MikrotikCompatibilityInitializer.name)

  constructor(private readonly mikrotikService: MikrotikService) {}

  onModuleInit() {
    const service = this.mikrotikService as MutableMikrotikService
    const originalBuildProvisioningScript = service.buildProvisioningScript.bind(service)
    const originalBuildLoginHtml = service.buildLoginHtml.bind(service)

    service.buildProvisioningScript = (input: ProvisioningInput) =>
      this.hardenProvisioningScript(originalBuildProvisioningScript(input), input)

    service.buildLoginHtml = (registrationKey: string, portalBaseUrl?: string | null) =>
      this.addFreeTrialFlow(originalBuildLoginHtml(registrationKey, portalBaseUrl))
  }

  private hardenProvisioningScript(script: string, input: ProvisioningInput) {
    const ssid = (input.hotspotNetworkName || input.routerName || 'AROFi Free WiFi').slice(0, 32)
    const remoteClientName = input.remoteClientName || 'AROFI_REMOTE'
    const wirelessStart = '# 3c. Put Wi-Fi (RouterOS v6 wireless and v7 wifi) on the hotspot bridge'
    const wirelessEnd = '# 3d. DHCP, DNS and NAT for hotspot clients (additive; your existing NAT is untouched)'
    const startIndex = script.indexOf(wirelessStart)
    const endIndex = script.indexOf(wirelessEnd)

    if (startIndex >= 0 && endIndex > startIndex) {
      script =
        script.slice(0, startIndex) +
        this.buildWirelessCompatibilityBlock(ssid) +
        '\n\n' +
        script.slice(endIndex)
    } else {
      this.logger.warn('Could not locate the generated wireless block; leaving it unchanged')
    }

    const genericAddressFallback = [
      ':if ($wanIface = "") do={',
      '  :foreach addr in=[/ip address find] do={',
    ].join('\n')

    if (script.includes(genericAddressFallback)) {
      const listWanSource =
        `:global arofiWanIface; :if ($arofiWanIface = "") do={ ` +
        `:foreach member in=[/interface list member find list="WAN"] do={ ` +
        `:local candidate [/interface list member get $member interface]; ` +
        `:if ($candidate != "" && $candidate != "arofi-hotspot" && $candidate != "${this.escapeRouterValue(remoteClientName)}") do={ :set arofiWanIface $candidate } ` +
        `} }`
      const dhcpWanSource =
        `:global arofiWanIface; :if ($arofiWanIface = "") do={ ` +
        `:foreach client in=[/ip dhcp-client find status=bound] do={ ` +
        `:local candidate [/ip dhcp-client get $client interface]; ` +
        `:if ($candidate != "" && $candidate != "arofi-hotspot" && $candidate != "${this.escapeRouterValue(remoteClientName)}") do={ :set arofiWanIface $candidate } ` +
        `} }`

      script = script.replace(
        genericAddressFallback,
        [
          this.runtimeGuard(listWanSource, 'AROFi: WAN interface-list scan skipped.'),
          ':set wanIface $arofiWanIface',
          this.runtimeGuard(dhcpWanSource, 'AROFi: DHCP WAN scan skipped.'),
          ':set wanIface $arofiWanIface',
          genericAddressFallback,
        ].join('\n'),
      )
    }

    const blockingNat = [
      ':if ($wanIface != "") do={',
      '  /ip firewall nat add chain=srcnat src-address=10.55.0.0/24 out-interface=$wanIface action=masquerade comment="AROFi hotspot nat"',
      '} else={',
      '  :error "AROFi: WAN interface not detected. Configure your WAN (DHCP client, PPPoE, or static IP) and re-run this script."',
      '}',
    ].join('\n')
    const nonBlockingNat = [
      ':if ($wanIface != "") do={',
      '  /ip firewall nat add chain=srcnat src-address=10.55.0.0/24 out-interface=$wanIface action=masquerade comment="AROFi hotspot nat"',
      '} else={',
      '  /ip firewall nat add chain=srcnat src-address=10.55.0.0/24 action=masquerade comment="AROFi hotspot nat"',
      '  :put "AROFi: WAN interface name was not identified; route-based NAT fallback enabled without blocking setup."',
      '}',
    ].join('\n')
    script = script.replace(blockingNat, nonBlockingNat)

    const blockingForward =
      '/ip firewall filter add chain=forward action=accept src-address=10.55.0.0/24 out-interface=$wanIface comment="AROFi hotspot forward"'
    const nonBlockingForward = [
      ':if ($wanIface != "") do={',
      '  /ip firewall filter add chain=forward action=accept src-address=10.55.0.0/24 out-interface=$wanIface comment="AROFi hotspot forward"',
      '} else={',
      '  /ip firewall filter add chain=forward action=accept src-address=10.55.0.0/24 comment="AROFi hotspot forward"',
      '}',
    ].join('\n')
    script = script.replace(blockingForward, nonBlockingForward)

    const oldSuccess = `:put "AROFi customer HotSpot is live. Broadcasting SSID: ${this.escapeRouterValue(ssid)}"`
    const newSuccess = [
      ':put "AROFi customer HotSpot is live. HotSpot, RADIUS, DHCP and portal services are active."',
      `:put "AROFi requested SSID: ${this.escapeRouterValue(ssid)}. Local radios were configured where supported; ethernet-only and CAPsMAN-managed routers continue without blocking."`,
    ].join('\n')
    script = script.replace(oldSuccess, newSuccess)

    return script
  }

  private buildWirelessCompatibilityBlock(ssid: string) {
    const escapedSsid = this.escapeRouterValue(ssid)
    const bridgePort =
      ':if ([:len [/interface bridge port find interface=$radioName]]=0) do={ ' +
      '/interface bridge port add bridge=arofi-hotspot interface=$radioName ' +
      '} else={ /interface bridge port set [find interface=$radioName] bridge=arofi-hotspot }'

    const legacySecurity =
      ':if ([:len [/interface wireless security-profiles find name="arofi-open"]]>0) do={ ' +
      '/interface wireless security-profiles set [find name="arofi-open"] mode=none authentication-types="" ' +
      '} else={ /interface wireless security-profiles add name="arofi-open" mode=none authentication-types="" }'

    const legacyRadios =
      ':foreach radio in=[/interface wireless find] do={ ' +
      ':local radioName [/interface wireless get $radio name]; ' +
      ':local radioMode ""; ' +
      ':do { :set radioMode [/interface wireless get $radio mode] } on-error={}; ' +
      ':if ($radioMode != "station" && $radioMode != "station-bridge" && $radioMode != "station-pseudobridge" && $radioMode != "station-pseudobridge-clone") do={ ' +
      ':do { /interface wireless set $radio disabled=no mode=ap-bridge ssid="' +
      escapedSsid +
      '" security-profile=arofi-open; ' +
      bridgePort +
      ' } on-error={ :put ("AROFi: legacy radio " . $radioName . " is CAPsMAN-managed or unavailable - skipped.") } ' +
      '} else={ :put ("AROFi: legacy station/WAN radio " . $radioName . " preserved.") } ' +
      '}'

    const modernRadios = (menu: 'wifi' | 'wifiwave2') =>
      `:foreach radio in=[/interface ${menu} find] do={ ` +
      `:local radioName [/interface ${menu} get $radio name]; ` +
      ':local radioMode ""; ' +
      `:do { :set radioMode [/interface ${menu} get $radio configuration.mode] } on-error={}; ` +
      ':if ($radioMode != "station") do={ ' +
      `:do { /interface ${menu} set $radio disabled=no configuration.mode=ap configuration.ssid="${escapedSsid}"; ` +
      bridgePort +
      ` } on-error={ :put ("AROFi: ${menu} radio " . $radioName . " is managed or unavailable - skipped.") } ` +
      '} else={ :put ("AROFi: station/WAN radio " . $radioName . " preserved.") } ' +
      '}'

    const modernOpenSecurity = (menu: 'wifi' | 'wifiwave2') =>
      `:foreach radio in=[/interface ${menu} find] do={ ` +
      `:do { /interface ${menu} set $radio security.authentication-types="" } ` +
      `on-error={ :local radioName [/interface ${menu} get $radio name]; :put ("AROFi: open security could not be applied to " . $radioName . " - existing security retained.") } ` +
      '}'

    return [
      '# 3c. Configure any available local Wi-Fi radio; every family is optional and non-blocking',
      '# Supports RouterOS 6 wireless, RouterOS 7 wifi, older wifiwave2, custom interface names, ethernet-only and CAPsMAN routers.',
      this.runtimeGuard(legacySecurity, 'AROFi: RouterOS 6 wireless package not present - skipped.'),
      this.runtimeGuard(legacyRadios, 'AROFi: RouterOS 6 wireless radios not available - skipped.'),
      this.runtimeGuard(modernRadios('wifi'), 'AROFi: RouterOS 7 wifi package not present - skipped.'),
      this.runtimeGuard(modernOpenSecurity('wifi'), 'AROFi: RouterOS 7 wifi open-security step skipped.'),
      this.runtimeGuard(modernRadios('wifiwave2'), 'AROFi: wifiwave2 package not present - skipped.'),
      this.runtimeGuard(modernOpenSecurity('wifiwave2'), 'AROFi: wifiwave2 open-security step skipped.'),
      ':put "AROFi: optional Wi-Fi detection completed. Missing or managed radios do not stop HotSpot setup."',
    ].join('\n')
  }

  private addFreeTrialFlow(html: string) {
    const trialHelperMarker = '    function normMac(v){'
    if (html.includes(trialHelperMarker) && !html.includes('function isTrialPkg(p){')) {
      html = html.replace(
        trialHelperMarker,
        [
          '    function isTrialPkg(p){',
          "      if(!p)return false;",
          "      var h=((p.name||'')+' '+(p.code||'')).toLowerCase();",
          "      return p.isTrialEnabled===true||Number(p.amountUgx||0)<=0||h.indexOf('trial')>=0;",
          '    }',
          '',
          trialHelperMarker,
        ].join('\n'),
      )
    }

    const oldPackageCard =
      "          c.innerHTML='<span><span class=\"pk-name\">'+esc(p.name)+'</span><span class=\"pk-dur\">'+esc(dur)+'</span></span><span class=\"pk-price\">UGX '+fn(p.amountUgx)+'</span><span class=\"pk-buy\">BUY</span>';"
    const newPackageCard = [
      '          var trial=isTrialPkg(p);',
      "          c.innerHTML='<span><span class=\"pk-name\">'+esc(p.name)+'</span><span class=\"pk-dur\">'+esc(dur)+'</span></span><span class=\"pk-price\">'+(trial?'FREE':'UGX '+fn(p.amountUgx))+'</span><span class=\"pk-buy\">'+(trial?'START':'BUY')+'</span>';",
    ].join('\n')
    html = html.replace(oldPackageCard, newPackageCard)

    const selectionMarker = '      selTv=isTvPkg(pkg);'
    if (html.includes(selectionMarker) && !html.includes('if(isTrialPkg(pkg)){startTrial(pkg);return;}')) {
      html = html.replace(
        selectionMarker,
        selectionMarker + '\n      if(isTrialPkg(pkg)){startTrial(pkg);return;}',
      )
    }

    const payMarker = '    function pay(){'
    if (html.includes(payMarker) && !html.includes('    function startTrial(pkg){')) {
      const startTrialFunction = [
        '    function startTrial(pkg){',
        "      if(!pkg||!pkg.id){sst('Free trial package is unavailable.','err');return;}",
        "      if(!mac&&!ip){sst('Open this page from the WiFi login screen so this device can be identified.','err');return;}",
        "      sst('Starting your free trial...','info');",
        "      apiCall('POST','/api/portal/start-trial',{packageId:pkg.id,macAddress:mac,clientIp:ip,routerKey:RKEY,hotspotServerName:srv,loginUrl:lo},function(err,res){",
        "        if(err){sst(err.message||'Free trial could not be started.','err');return;}",
        "        if(res&&res.reconnect&&res.reconnect.username){sst('Free trial activated. Connecting...','ok');conn(res.reconnect);return;}",
        "        sst('Free trial activated. Disconnect and reconnect to this WiFi to continue.','ok');",
        '      });',
        '    }',
        '',
      ].join('\n')
      html = html.replace(payMarker, startTrialFunction + payMarker)
    }

    return html
  }

  private runtimeGuard(inner: string, errorMessage: string) {
    const escaped = inner
      .replace(/\\/g, '\\\\')
      .replace(/"/g, '\\"')
      .replace(/\$/g, '\\$')
    return `:do { :local arofiApply [:parse "${escaped}"]; $arofiApply } on-error={ :put "${this.escapeRouterValue(errorMessage)}" }`
  }

  private escapeRouterValue(value: string) {
    return value.replace(/"/g, '\\"')
  }
}
