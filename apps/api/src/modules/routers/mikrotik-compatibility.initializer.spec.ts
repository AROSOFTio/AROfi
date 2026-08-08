import { MikrotikCompatibilityInitializer } from './mikrotik-compatibility.initializer'
import { MikrotikService } from './mikrotik.service'

function baseGeneratedScript() {
  return [
    '# AROFi MikroTik onboarding script',
    '# 3c. Put Wi-Fi (RouterOS v6 wireless and v7 wifi) on the hotspot bridge',
    ':do { :local originalLegacy [:parse "/interface wireless cap set enabled=no"]; $originalLegacy } on-error={}',
    '# 3d. DHCP, DNS and NAT for hotspot clients (additive; your existing NAT is untouched)',
    ':local wanIface ""',
    ':global arofiWanIface',
    ':set arofiWanIface $wanIface',
    ':if ($wanIface = "") do={',
    '  :foreach addr in=[/ip address find] do={',
    '    :local addrIf [/ip address get $addr interface]',
    '    :if ($addrIf != "arofi-hotspot") do={ :set wanIface $addrIf }',
    '  }',
    '}',
    '# 3d-2. Preserve owner management while assigning unused wired ports',
    ':foreach e in=[/interface ethernet find] do={ :put $e }',
    '/ip firewall nat remove [find comment="AROFi hotspot nat"]',
    ':if ($wanIface != "") do={',
    '  /ip firewall nat add chain=srcnat src-address=10.55.0.0/24 out-interface=$wanIface action=masquerade comment="AROFi hotspot nat"',
    '} else={',
    '  :error "AROFi: WAN interface not detected. Configure your WAN (DHCP client, PPPoE, or static IP) and re-run this script."',
    '}',
    '/ip firewall filter add chain=forward action=accept src-address=10.55.0.0/24 out-interface=$wanIface comment="AROFi hotspot forward"',
    '# 6. Tell AROFi the script imported so it can learn the router NAS IP',
    ':local nasIp ""',
    ':local cbWanIface ""',
    ':do {',
    '  :if ($cbWanIface != "") do={',
    '    :local rawAddr [/ip address get [find interface=$cbWanIface] address]',
    '    :set nasIp [:pick $rawAddr 0 [:find $rawAddr "/"]]',
    '  }',
    '} on-error={}',
    ':put "AROFi customer HotSpot is live. Broadcasting SSID: Test WiFi"',
  ].join('\n')
}

describe('MikrotikCompatibilityInitializer', () => {
  it('keeps the proven base radio block and appends compatibility after it', () => {
    const mutableService = {
      buildProvisioningScript: jest.fn(() => baseGeneratedScript()),
    }
    const initializer = new MikrotikCompatibilityInitializer(
      mutableService as unknown as MikrotikService,
    )
    initializer.onModuleInit()

    const script = mutableService.buildProvisioningScript({
      routerName: 'Test Router',
      hotspotNetworkName: 'Test WiFi',
      remoteClientName: 'AROFI_REMOTE',
      wanInterface: 'ether3',
    })

    const originalIndex = script.indexOf('originalLegacy')
    const compatibilityIndex = script.indexOf('AROFi radio compatibility extension')

    expect(originalIndex).toBeGreaterThanOrEqual(0)
    expect(compatibilityIndex).toBeGreaterThan(originalIndex)
    expect(script).toContain('/interface wireless cap set enabled=no')
    expect(script).toContain('configuration.manager=local')
    expect(script).toContain('configuration.mode=ap')
    expect(script).toContain('security.authentication-types=')
    expect(script).toContain('local radio(s) are broadcasting the requested SSID')
  })

  it('uses the selected WAN and preserves only one management port on wired routers', () => {
    const mutableService = {
      buildProvisioningScript: jest.fn(() => baseGeneratedScript()),
    }
    const initializer = new MikrotikCompatibilityInitializer(
      mutableService as unknown as MikrotikService,
    )
    initializer.onModuleInit()

    const script = mutableService.buildProvisioningScript({
      routerName: 'hEX',
      hotspotNetworkName: 'Test WiFi',
      remoteClientName: 'AROFI_REMOTE',
      wanInterface: 'ether3',
    })

    expect(script).toContain(':local arofiRequestedWan \\"ether3\\"')
    expect(script).toContain('Preserve one owner-management port')
    expect(script).toContain('customer HotSpot port enabled on')
    expect(script).toContain('owner management preserved on')
    expect(script).not.toContain('$ethRunning = false')
    expect(script).not.toContain('Put wired LAN ports on the captive hotspot bridge too')
  })

  it('adds WAN and callback fallbacks without making setup fatal', () => {
    const mutableService = {
      buildProvisioningScript: jest.fn(() => baseGeneratedScript()),
    }
    const initializer = new MikrotikCompatibilityInitializer(
      mutableService as unknown as MikrotikService,
    )
    initializer.onModuleInit()

    const script = mutableService.buildProvisioningScript({
      routerName: 'Router',
      hotspotNetworkName: 'Test WiFi',
      remoteClientName: 'AROFI_REMOTE',
    })

    expect(script).toContain('/interface list member find where list=')
    expect(script).toContain('/ip dhcp-client find where status=bound')
    expect(script).toContain('route-based NAT fallback enabled without blocking setup')
    expect(script).toContain(':if ($cbWanIface = \\"\\") do={')
    expect(script).toContain('HotSpot, RADIUS, DHCP and portal services are active')
  })
})
