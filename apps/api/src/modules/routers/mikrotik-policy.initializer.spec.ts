import { MikrotikPolicyInitializer } from './mikrotik-policy.initializer'
import { MikrotikService } from './mikrotik.service'
import { RoutersService } from './routers.service'

const unsafeProvisioningScript = [
  '# generated router script',
  '/ip hotspot profile set [find name="arofi-test"] use-radius=yes login-by=mac,cookie,http-pap mac-auth-mode=mac-as-username-and-password',
  '/ip hotspot user profile set [find default=yes] shared-users=1 add-mac-cookie=yes mac-cookie-timeout=1d keepalive-timeout=30d',
  ':put "Warning: AROFi provisioning callback failed. Check WAN internet, DNS, HTTPS, and VPS port 4012."',
].join('\n')

const unsafeRemoteAccessScript = [
  '# AROFi Remote Access WinBox Tunnel Setup',
  ':local sstpOk 0',
  ':local sstpTarget "remote.arofi.net:443"',
  '/interface sstp-client add name="AROFI_REMOTE" connect-to=$sstpTarget user="router-test" password="secret" authentication=pap profile="AROFi_Profile" add-default-route=no disabled=yes keepalive-timeout=60 verify-server-certificate=no',
  ':do { /interface sstp-client enable [find name="AROFI_REMOTE"]; :set sstpOk 1 } on-error={}',
  ':if ($sstpOk = 0) do={ :put "ERROR: SSTP client could not be enabled." }',
  ':if ($sstpOk = 1) do={ :put "AROFi Remote Access configured." }',
].join('\n')

describe('MikrotikPolicyInitializer', () => {
  function createSubject() {
    const mikrotik: { buildProvisioningScript: (...args: any[]) => string } = {
      buildProvisioningScript: jest.fn(() => unsafeProvisioningScript),
    }
    const routers: {
      getProvisioningScriptByKey: (key: string) => Promise<string>
      getRemoteAccessInstallScript: (token: string) => Promise<string>
    } = {
      getProvisioningScriptByKey: jest.fn(async () => unsafeProvisioningScript),
      getRemoteAccessInstallScript: jest.fn(async () => unsafeRemoteAccessScript),
    }

    const initializer = new MikrotikPolicyInitializer(
      mikrotik as unknown as MikrotikService,
      routers as unknown as RoutersService,
    )
    initializer.onModuleInit()

    return { mikrotik, routers }
  }

  it('removes automatic MAC authentication from generated and delivered scripts', async () => {
    const { mikrotik, routers } = createSubject()

    const generated = mikrotik.buildProvisioningScript({})
    const delivered = await routers.getProvisioningScriptByKey('test-key')

    for (const script of [generated, delivered]) {
      expect(script).toContain('login-by=cookie,mac-cookie,http-pap')
      expect(script).not.toMatch(/login-by=mac(?:,|\s|$)/)
      expect(script).not.toContain('mac-auth-mode=')
      expect(script).toContain('shared-users=1 add-mac-cookie=yes mac-cookie-timeout=30d idle-timeout=none keepalive-timeout=none session-timeout=0s')
      expect(script).toContain('public AROFi route on ports 80/443')
      expect(script).not.toContain('VPS port 4012')
    }
  })

  it('marks remote access successful only after the SSTP tunnel is running', async () => {
    const { routers } = createSubject()

    const script = await routers.getRemoteAccessInstallScript('test-token')

    expect(script).toContain('/interface sstp-client get [:pick $sstpId 0] running')
    expect(script).toContain('Remote access was NOT installed')
    expect(script).toContain('Remote access was NOT marked active')
    expect(script).toContain(':error "AROFi remote access installation failed"')
    expect(script).toContain(':error "AROFi SSTP tunnel verification failed"')
    expect(script).toContain('AROFi Remote Access connected and verified.')
    expect(script).not.toContain(':set sstpOk 1 } on-error={}')
    expect(script).not.toContain('AROFi Remote Access configured.')
  })

  it('does not duplicate policy blocks when the script passes through both wrappers', async () => {
    const { routers } = createSubject()

    const once = await routers.getProvisioningScriptByKey('test-key')
    const marker = '# AROFi immutable authentication and active-bundle policy'

    expect(once.split(marker)).toHaveLength(2)
  })
})
