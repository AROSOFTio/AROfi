import { Injectable, Logger, OnModuleInit } from '@nestjs/common'
import { MikrotikService } from './mikrotik.service'

type ProvisioningInput = {
  routerName?: string
  hotspotNetworkName?: string | null
  remoteClientName?: string | null
  wanInterface?: string | null
}

type MutableMikrotikService = {
  buildProvisioningScript: (...args: any[]) => string
}

/**
 * Final RouterOS compatibility pass.
 *
 * The core generator keeps the proven RouterOS 6/7 commands. This initializer
 * only supplements them for renamed radios, wifiwave2/new WiFi packages,
 * automatic wired-port assignment, and cross-version WAN discovery. It must
 * never replace the known-good legacy wireless block again.
 */
@Injectable()
export class MikrotikCompatibilityInitializer implements OnModuleInit {
  private readonly logger = new Logger(MikrotikCompatibilityInitializer.name)

  constructor(private readonly mikrotikService: MikrotikService) {}

  onModuleInit() {
    const service = this.mikrotikService as unknown as MutableMikrotikService
    const originalBuildProvisioningScript = service.buildProvisioningScript.bind(service)

    service.buildProvisioningScript = (...args: any[]) => {
      const input = (args[0] ?? {}) as ProvisioningInput
      return this.hardenProvisioningScript(originalBuildProvisioningScript(...args), input)
    }
  }

  private hardenProvisioningScript(script: string, input: ProvisioningInput) {
    const ssid = (input.hotspotNetworkName || input.routerName || 'AROFi Free WiFi').slice(0, 32)
    const remoteClientName = input.remoteClientName || 'AROFI_REMOTE'
    const selectedWan = this.normalizeInterfaceName(input.wanInterface)

    script = this.extendWirelessSetup(script, ssid, selectedWan)
    script = this.replaceWiredPortSetup(script, remoteClientName, selectedWan)
    script = this.addWanFallbacks(script, remoteClientName)
    script = this.makeNatAndForwardingNonBlocking(script)
    script = this.addProvisioningCallbackFallbacks(script, remoteClientName)
    script = this.replaceSuccessMessage(script, ssid)

    return script
  }

  /**
   * Preserve the original, previously working wireless block. Yesterday's
   * regression came from replacing it and dropping the legacy CAP-disable step.
   * Add the compatibility pass immediately after it instead.
   */
  private extendWirelessSetup(script: string, ssid: string, selectedWan: string | null) {
    const wirelessStart = '# 3c. Put Wi-Fi (RouterOS v6 wireless and v7 wifi) on the hotspot bridge'
    const wirelessEnd = '# 3d. DHCP, DNS and NAT for hotspot clients (additive; your existing NAT is untouched)'
    const startIndex = script.indexOf(wirelessStart)
    const endIndex = script.indexOf(wirelessEnd)

    if (startIndex < 0 || endIndex <= startIndex) {
      this.logger.warn('Could not locate the generated wireless block; leaving it unchanged')
      return script
    }

    const extension = this.buildWirelessCompatibilityExtension(ssid, selectedWan)
    return `${script.slice(0, endIndex)}${extension}\n\n${script.slice(endIndex)}`
  }

  private buildWirelessCompatibilityExtension(ssid: string, selectedWan: string | null) {
    const escapedSsid = this.escapeRouterValue(ssid)
    const escapedWan = this.escapeRouterValue(selectedWan ?? '')

    const bridgeRadio =
      ':local radioBridgePort [/interface bridge port find where interface=$radioName]; ' +
      ':if ([:len $radioBridgePort]=0) do={ ' +
      '/interface bridge port add bridge=arofi-hotspot interface=$radioName ' +
      '} else={ /interface bridge port set [:pick $radioBridgePort 0] bridge=arofi-hotspot }'

    const interfaceIsWan =
      `:local arofiRadioIsWan false; ` +
      `:if ("${escapedWan}" != "" && $radioName = "${escapedWan}") do={ :set arofiRadioIsWan true }; ` +
      `:if ($arofiRadioIsWan = false) do={ ` +
      `  :foreach member in=[/interface list member find where list="WAN"] do={ ` +
      `    :if ([/interface list member get $member interface] = $radioName) do={ :set arofiRadioIsWan true } ` +
      `  } ` +
      `}; ` +
      `:if ($arofiRadioIsWan = false && [:len [/ip dhcp-client find where interface=$radioName status=bound]] > 0) do={ :set arofiRadioIsWan true }`

    const legacySecurity =
      ':if ([:len [/interface wireless security-profiles find name="arofi-open"]]>0) do={ ' +
      '/interface wireless security-profiles set [find name="arofi-open"] mode=none authentication-types="" ' +
      '} else={ /interface wireless security-profiles add name="arofi-open" mode=none authentication-types="" }'

    const legacyRadios =
      ':foreach radio in=[/interface wireless find] do={ ' +
      ':local radioName [/interface wireless get $radio name]; ' +
      ':local radioMaster ""; ' +
      ':do { :set radioMaster [/interface wireless get $radio master-interface] } on-error={}; ' +
      interfaceIsWan + '; ' +
      ':if (($radioMaster = "" || $radioMaster = "none") && $arofiRadioIsWan = false) do={ ' +
      ':do { /interface wireless set $radio disabled=no mode=ap-bridge ssid="' +
      escapedSsid +
      '" hide-ssid=no security-profile=arofi-open; ' +
      bridgeRadio +
      '; :put ("AROFi: broadcasting ' + escapedSsid + ' on " . $radioName) ' +
      '} on-error={ :put ("AROFi: legacy radio " . $radioName . " could not be configured.") } ' +
      '} else={ :if ($arofiRadioIsWan = true) do={ :put ("AROFi: preserving WAN radio " . $radioName) } } ' +
      '}'

    const modernRadios = (menu: 'wifi' | 'wifiwave2') =>
      `:foreach radio in=[/interface ${menu} find] do={ ` +
      `:local radioName [/interface ${menu} get $radio name]; ` +
      ':local radioMaster ""; :local remoteCap ""; ' +
      `:do { :set radioMaster [/interface ${menu} get $radio master-interface] } on-error={}; ` +
      `:do { :set remoteCap [/interface ${menu} get $radio cap] } on-error={}; ` +
      interfaceIsWan + '; ' +
      ':if (($radioMaster = "" || $radioMaster = "none") && $remoteCap = "" && $arofiRadioIsWan = false) do={ ' +
      ':local configured false; ' +
      `:do { /interface ${menu} set $radio disabled=no configuration.manager=local configuration.mode=ap configuration.ssid="${escapedSsid}" configuration.hide-ssid=no security.authentication-types=""; :set configured true } ` +
      `on-error={ :do { /interface ${menu} set $radio disabled=no configuration.mode=ap configuration.ssid="${escapedSsid}" security.authentication-types=""; :set configured true } on-error={} }; ` +
      ':if ($configured = true) do={ ' +
      bridgeRadio +
      `; :put ("AROFi: broadcasting ${escapedSsid} on " . $radioName) ` +
      `} else={ :put ("AROFi: ${menu} radio " . $radioName . " could not be configured.") } ` +
      '} else={ :if ($arofiRadioIsWan = true) do={ :put ("AROFi: preserving WAN radio " . $radioName) } } ' +
      '}'

    const verifyLegacy =
      ':global arofiRadioCount; :foreach radio in=[/interface wireless find] do={ ' +
      ':local radioSsid ""; :local radioDisabled true; ' +
      ':do { :set radioSsid [/interface wireless get $radio ssid]; :set radioDisabled [/interface wireless get $radio disabled] } on-error={}; ' +
      `:if ($radioDisabled = false && $radioSsid = "${escapedSsid}") do={ :set arofiRadioCount ($arofiRadioCount + 1) } ` +
      '}'

    const verifyModern = (menu: 'wifi' | 'wifiwave2') =>
      `:global arofiRadioCount; :foreach radio in=[/interface ${menu} find] do={ ` +
      ':local radioSsid ""; :local radioDisabled true; :local remoteCap ""; ' +
      `:do { :set radioSsid [/interface ${menu} get $radio configuration.ssid]; :set radioDisabled [/interface ${menu} get $radio disabled]; :set remoteCap [/interface ${menu} get $radio cap] } on-error={}; ` +
      `:if ($remoteCap = "" && $radioDisabled = false && $radioSsid = "${escapedSsid}") do={ :set arofiRadioCount ($arofiRadioCount + 1) } ` +
      '}'

    return [
      '# AROFi radio compatibility extension - keeps the proven base configuration above',
      ':global arofiRadioCount; :set arofiRadioCount 0',
      this.runtimeGuard('/interface wireless cap set enabled=no', 'AROFi: legacy CAP control not present - skipped.'),
      this.runtimeGuard(legacySecurity, 'AROFi: RouterOS 6 wireless package not present - skipped.'),
      this.runtimeGuard(legacyRadios, 'AROFi: RouterOS 6 local radios not available - skipped.'),
      this.runtimeGuard('/interface wifi cap set enabled=no', 'AROFi: RouterOS 7 WiFi CAP control not present - skipped.'),
      this.runtimeGuard(modernRadios('wifi'), 'AROFi: RouterOS 7 WiFi radios not available - skipped.'),
      this.runtimeGuard('/interface wifiwave2 cap set enabled=no', 'AROFi: wifiwave2 CAP control not present - skipped.'),
      this.runtimeGuard(modernRadios('wifiwave2'), 'AROFi: wifiwave2 radios not available - skipped.'),
      this.runtimeGuard(verifyLegacy, 'AROFi: legacy radio verification skipped.'),
      this.runtimeGuard(verifyModern('wifi'), 'AROFi: RouterOS 7 WiFi verification skipped.'),
      this.runtimeGuard(verifyModern('wifiwave2'), 'AROFi: wifiwave2 verification skipped.'),
      ':if ($arofiRadioCount > 0) do={ :put ("AROFi: " . $arofiRadioCount . " local radio(s) are broadcasting the requested SSID.") } else={ :put "AROFi: no local broadcast radio was activated; wired HotSpot ports remain available for an external access point." }',
    ].join('\n')
  }

  /**
   * Keep one owner-management Ethernet port and put every other eligible LAN
   * port on the customer bridge. Do not preserve every active link: an external
   * AP connected to hEX is active and must still become a HotSpot port.
   */
  private replaceWiredPortSetup(
    script: string,
    remoteClientName: string,
    selectedWan: string | null,
  ) {
    const startMarkers = [
      '# 3d-2. Preserve owner management while assigning unused wired ports',
      '# 3d-2. Put wired LAN ports on the captive hotspot bridge too',
    ]
    const endMarker = '/ip firewall nat remove [find comment="AROFi hotspot nat"]'
    const start = startMarkers
      .map((marker) => script.indexOf(marker))
      .filter((index) => index >= 0)
      .sort((a, b) => a - b)[0]

    if (start === undefined) {
      this.logger.warn('Could not locate the wired-port section; leaving it unchanged')
      return script
    }

    const end = script.indexOf(endMarker, start)
    if (end <= start) {
      this.logger.warn('Could not locate the end of the wired-port section; leaving it unchanged')
      return script
    }

    const replacement = this.buildWiredPortCompatibilityBlock(remoteClientName, selectedWan)
    return `${script.slice(0, start)}${replacement}\n${script.slice(end)}`
  }

  private buildWiredPortCompatibilityBlock(remoteClientName: string, selectedWan: string | null) {
    const escapedRemote = this.escapeRouterValue(remoteClientName)
    const escapedWan = this.escapeRouterValue(selectedWan ?? '')

    return [
      '# 3d-2. Preserve one owner-management port and assign all remaining LAN ports',
      '# Works with hEX/hAP/RB/CCR/CRS and renamed Ethernet interfaces; no ether1/ether2 assumption.',
      `:local arofiRequestedWan "${escapedWan}"`,
      ':if ($arofiRequestedWan = "") do={ :set arofiRequestedWan $wanIface }',
      ':local arofiManagementBridge ""',
      ':local arofiManagementPort ""',
      ':foreach addrId in=[/ip address find] do={',
      '  :local addrIf [/ip address get $addrId interface]',
      '  :if ($arofiManagementPort = "" && [:len [/interface ethernet find where name=$addrIf]] > 0 && $addrIf != $arofiRequestedWan) do={ :set arofiManagementPort $addrIf }',
      '  :if ($arofiManagementBridge = "" && $addrIf != "arofi-hotspot" && [:len [/interface bridge find where name=$addrIf]] > 0) do={ :set arofiManagementBridge $addrIf }',
      '}',
      ':foreach e in=[/interface ethernet find] do={',
      '  :local ethName [/interface ethernet get $e name]',
      '  :local ethRunning [/interface ethernet get $e running]',
      '  :local ethBridge ""',
      '  :local ethBridgePort [/interface bridge port find where interface=$ethName]',
      '  :if ([:len $ethBridgePort] > 0) do={ :set ethBridge [/interface bridge port get [:pick $ethBridgePort 0] bridge] }',
      `  :if ($arofiManagementPort = "" && $ethName != $arofiRequestedWan && $ethName != $wanIface && $ethName != "${escapedRemote}" && $ethRunning = true && ($arofiManagementBridge = "" || $ethBridge = $arofiManagementBridge)) do={ :set arofiManagementPort $ethName }`,
      '}',
      ':if ($arofiManagementPort = "" && [:len [/interface ethernet find where name="ether2"]] > 0 && "ether2" != $arofiRequestedWan && "ether2" != $wanIface) do={ :set arofiManagementPort "ether2" }',
      ':if ($arofiManagementPort = "") do={',
      '  :foreach e in=[/interface ethernet find] do={',
      '    :local ethName [/interface ethernet get $e name]',
      `    :if ($arofiManagementPort = "" && $ethName != $arofiRequestedWan && $ethName != $wanIface && $ethName != "${escapedRemote}") do={ :set arofiManagementPort $ethName }`,
      '  }',
      '}',
      ':if ($arofiRequestedWan = "" || $arofiManagementPort = "") do={',
      '  :put "AROFi: WAN or management port could not be identified safely; existing Ethernet bridge membership was preserved."',
      '} else={',
      '  :foreach e in=[/interface ethernet find] do={',
      '    :local ethName [/interface ethernet get $e name]',
      '    :local ethBridge ""',
      '    :local ethBridgePort [/interface bridge port find where interface=$ethName]',
      '    :if ([:len $ethBridgePort] > 0) do={ :set ethBridge [/interface bridge port get [:pick $ethBridgePort 0] bridge] }',
      '    :local arofiIsWan false',
      '    :if ($ethName = $arofiRequestedWan || $ethName = $wanIface || $ethBridge = $arofiRequestedWan || $ethBridge = $wanIface) do={ :set arofiIsWan true }',
      `    :if ($ethName != $arofiManagementPort && $ethName != "${escapedRemote}" && $arofiIsWan = false) do={`,
      '      :if ([:len $ethBridgePort] = 0) do={ /interface bridge port add bridge=arofi-hotspot interface=$ethName } else={ /interface bridge port set [:pick $ethBridgePort 0] bridge=arofi-hotspot }',
      '      :put ("AROFi: customer HotSpot port enabled on " . $ethName)',
      '    }',
      '  }',
      '  :put ("AROFi: owner management preserved on " . $arofiManagementPort)',
      '}',
    ].join('\n')
  }

  private addWanFallbacks(script: string, remoteClientName: string) {
    const genericAddressFallback = [
      ':if ($wanIface = "") do={',
      '  :foreach addr in=[/ip address find] do={',
    ].join('\n')

    if (!script.includes(genericAddressFallback)) {
      return script
    }

    const escapedRemote = this.escapeRouterValue(remoteClientName)
    const listWanSource =
      `:global arofiWanIface; :if ($arofiWanIface = "") do={ ` +
      `:foreach member in=[/interface list member find where list="WAN"] do={ ` +
      `:local candidate [/interface list member get $member interface]; ` +
      `:if ($candidate != "" && $candidate != "arofi-hotspot" && $candidate != "${escapedRemote}") do={ :set arofiWanIface $candidate } ` +
      `} }`
    const dhcpWanSource =
      `:global arofiWanIface; :if ($arofiWanIface = "") do={ ` +
      `:foreach client in=[/ip dhcp-client find where status=bound] do={ ` +
      `:local candidate [/ip dhcp-client get $client interface]; ` +
      `:if ($candidate != "" && $candidate != "arofi-hotspot" && $candidate != "${escapedRemote}") do={ :set arofiWanIface $candidate } ` +
      `} }`

    return script.replace(
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

  private makeNatAndForwardingNonBlocking(script: string) {
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
    return script.replace(blockingForward, nonBlockingForward)
  }

  private addProvisioningCallbackFallbacks(script: string, remoteClientName: string) {
    const callbackStart = script.indexOf('# 6. Tell AROFi the script imported')
    if (callbackStart < 0) {
      return script
    }

    const marker = ':do {\n  :if ($cbWanIface != "") do={'
    const markerIndex = script.indexOf(marker, callbackStart)
    if (markerIndex < 0) {
      return script
    }

    const escapedRemote = this.escapeRouterValue(remoteClientName)
    const fallback = [
      ':if ($cbWanIface = "") do={',
      '  :foreach client in=[/ip dhcp-client find where status=bound] do={',
      '    :local candidate [/ip dhcp-client get $client interface]',
      `    :if ($candidate != "" && $candidate != "arofi-hotspot" && $candidate != "${escapedRemote}") do={ :set cbWanIface $candidate }`,
      '  }',
      '}',
      ':if ($cbWanIface = "") do={',
      '  :foreach member in=[/interface list member find where list="WAN"] do={',
      '    :local candidate [/interface list member get $member interface]',
      `    :if ($candidate != "" && $candidate != "arofi-hotspot" && $candidate != "${escapedRemote}") do={ :set cbWanIface $candidate }`,
      '  }',
      '}',
      ':if ($cbWanIface = "") do={',
      '  :foreach addrId in=[/ip address find] do={',
      '    :local candidate [/ip address get $addrId interface]',
      `    :if ($candidate != "" && $candidate != "arofi-hotspot" && $candidate != "${escapedRemote}") do={ :set cbWanIface $candidate }`,
      '  }',
      '}',
    ].join('\n')

    return `${script.slice(0, markerIndex)}${fallback}\n${script.slice(markerIndex)}`
  }

  private replaceSuccessMessage(script: string, ssid: string) {
    const oldSuccess = `:put "AROFi customer HotSpot is live. Broadcasting SSID: ${this.escapeRouterValue(ssid)}"`
    const compatibilitySuccess = [
      ':put "AROFi customer HotSpot is live. HotSpot, RADIUS, DHCP and portal services are active."',
      ':if ($arofiRadioCount > 0) do={',
      `  :put "AROFi WiFi broadcast active: ${this.escapeRouterValue(ssid)}"`,
      '} else={',
      '  :put "AROFi wired HotSpot active. This router has no usable local radio; connect an access point to a customer HotSpot port."',
      '}',
    ].join('\n')
    return script.replace(oldSuccess, compatibilitySuccess)
  }

  private normalizeInterfaceName(value?: string | null) {
    const trimmed = value?.trim()
    if (!trimmed || trimmed.toUpperCase() === 'AUTO') {
      return null
    }
    return /^[A-Za-z0-9._:+-]{1,32}$/.test(trimmed) ? trimmed : null
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
