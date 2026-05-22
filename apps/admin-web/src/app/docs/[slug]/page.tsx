import Link from 'next/link'
import { notFound } from 'next/navigation'
import DocsCommandBlock from '@/components/DocsCommandBlock'

type DocPage = {
  title: string
  intro: string
  sections: Array<{ heading: string; body: string[]; commandBlocks?: Array<{ title: string; commands: string[] }> }>
}

const docs: Record<string, DocPage> = {
  'getting-started': {
    title: 'Getting started',
    intro: 'Use this checklist to move from AROFi router registration to a working MikroTik captive portal. The normal flow is: register router, copy the one-run command, paste it in WinBox Terminal, then apply the final RouterOS 6 verification block when the router is behind an upstream/Savana router.',
    sections: [
      {
        heading: '1. Sign in and prepare AROFi',
        body: [
          'Sign in to the vendor workspace as the vendor admin.',
          'Create or confirm the hotspot site, router group, and at least one customer package.',
          'Open Routers, click Register MikroTik Router, enter the router display name, branch/site name, HotSpot server name, and select Fresh full captive Wi-Fi for a fresh RouterOS 6 access point.',
          'If you want to know the WinBox password after the script runs, open Advanced Settings and enter Router Admin Password. The generated script applies that password on the MikroTik.',
        ],
      },
      {
        heading: '2. Connect to MikroTik before running the command',
        body: [
          'Plug the upstream/Savana internet router into ether1 on the MikroTik.',
          'Connect your laptop to ether2, ether3, ether4, ether5, or connect through WinBox Neighbors/MAC. IP login may disconnect when ether1 is moved out of bridgeLocal.',
          'Open WinBox, login with admin and the current router password. If it is freshly reset, the password may be empty until the AROFi script sets the Router Admin Password.',
          'Open New Terminal, paste the one-run command from AROFi, and wait for the provisioning callback message.',
        ],
      },
      {
        heading: '3. One-run AROFi command',
        body: [
          'After registration, copy the one-run command shown on the router page. It downloads the generated .rsc file from AROFi, imports it, and removes the temporary file.',
          'The registration key is unique per router. Use the command from your router page, not the example below.',
        ],
        commandBlocks: [
          {
            title: 'Example one-run command',
            commands: [
              '/tool fetch url="https://arofi.arosoft.io/api/mikrotik/script/YOUR_ROUTER_REGISTRATION_KEY" dst-path="arofi-setup.rsc" mode=https; /import file-name="arofi-setup.rsc"; /file remove "arofi-setup.rsc"',
            ],
          },
        ],
      },
      {
        heading: '4. Final RouterOS 6 upstream-router fix',
        body: [
          'Use this final block after the AROFi script when the HotSpot exists but customers do not redirect, or when customer devices still receive 192.168.1.x instead of 10.50.0.x.',
          'This separates ether1 as WAN, makes bridgeLocal the captive LAN, recreates the AROFi DHCP pool, recreates DHCP service, fixes NAT, and binds the HotSpot to bridgeLocal.',
          'Replace Vincent Cneter and arofi-c308ea29 with the actual HotSpot name and AROFi profile shown by /ip hotspot print detail and /ip hotspot profile print detail.',
        ],
        commandBlocks: [
          {
            title: 'Final post-script fix',
            commands: [
              '/interface bridge port remove [find interface=ether1]',
              '/ip dhcp-client remove [find interface=bridgeLocal]',
              '/ip dhcp-client remove [find interface=ether1]',
              '/ip dhcp-client add interface=ether1 add-default-route=yes use-peer-dns=yes disabled=no comment="AROFi WAN"',
              '/ip address remove [find address="192.168.1.2/24"]',
              '/ip address remove [find address="10.50.0.1/24"]',
              '/ip address add address=10.50.0.1/24 interface=bridgeLocal',
              '/ip pool remove [find name=arofi-pool]',
              '/ip pool add name=arofi-pool ranges=10.50.0.10-10.50.0.254',
              '/ip dhcp-server remove [find name=arofi-dhcp]',
              '/ip dhcp-server network remove [find address="10.50.0.0/24"]',
              '/ip dhcp-server network add address=10.50.0.0/24 gateway=10.50.0.1 dns-server=10.50.0.1,1.1.1.1',
              '/ip dhcp-server add name=arofi-dhcp interface=bridgeLocal address-pool=arofi-pool disabled=no',
              '/ip dns set allow-remote-requests=yes servers=1.1.1.1,8.8.8.8',
              '/ip firewall nat remove [find comment="AROFi nat"]',
              '/ip firewall nat add chain=srcnat out-interface=ether1 action=masquerade comment="AROFi nat"',
              '/ip hotspot set [find name="Vincent Cneter"] interface=bridgeLocal address-pool=arofi-pool disabled=no',
              '/ip hotspot profile set [find name="arofi-c308ea29"] hotspot-address=10.50.0.1 html-directory=hotspot login-by=cookie,http-chap,http-pap use-radius=yes radius-accounting=yes',
            ],
          },
        ],
      },
      {
        heading: '5. Verify redirect',
        body: [
          'Disconnect and reconnect the customer device to the MikroTik Wi-Fi. The customer device should receive 10.50.0.x, not 192.168.1.x.',
          'Open http://neverssl.com or http://10.50.0.1 from the customer device. It should redirect to the AROFi captive portal.',
          'If redirect still fails, inspect HotSpot hosts, active sessions, DHCP leases, and login.html.',
        ],
        commandBlocks: [
          {
            title: 'Verification commands',
            commands: [
              '/ip dhcp-client print',
              '/ip address print',
              '/ip route print',
              '/ip hotspot print detail',
              '/ip hotspot host print',
              '/ip hotspot active print',
              '/ip dhcp-server lease print',
              '/file print where name~"hotspot"',
              '/ping 8.8.8.8 count=4',
              '/ping arofi.arosoft.io count=4',
            ],
          },
        ],
      },
      {
        heading: '6. RouterOS 6 wireless note',
        body: [
          'RouterOS 6 uses /interface wireless, not /interface wifi. If wlan1 is managed by CAPsMAN or disabled, disable CAP mode and configure wlan1 manually.',
          'If the AROFi script already created the SSID and clients can connect, do not rerun this section.',
        ],
        commandBlocks: [
          {
            title: 'Manual Wi-Fi recovery',
            commands: [
              '/interface wireless cap set enabled=no',
              '/interface wireless security-profiles add name=arofi-open mode=none authentication-types=""',
              '/interface wireless set wlan1 disabled=no mode=ap-bridge ssid="Kitintale Market" security-profile=arofi-open',
              '/interface bridge port add bridge=bridgeLocal interface=wlan1',
            ],
          },
        ],
      },
      {
        heading: '7. Important limits',
        body: [
          'The script can configure supported MikroTik settings, but it cannot create upstream internet where none exists.',
          'Remote WinBox/API from AROFi still requires public IP, port forwarding, VPN, or a supported tunnel when the router is behind ISP NAT.',
          'The correct firewall command is /ip firewall filter print, not firewall filter print.',
        ],
      },
    ],
  },
  payments: {
    title: 'Payments',
    intro: 'AROfi keeps customer payment UX simple while routing to configured providers in the backend.',
    sections: [
      {
        heading: 'Customer checkout',
        body: [
          'Customers select a package, choose MTN or Airtel, enter their phone number, and press Pay.',
          'Gateway names and API keys are never shown to customers. The frontend sends packageId, network, and phone only.',
          'The backend loads the real package price from the database and validates the phone prefix against the selected network.',
        ],
      },
      {
        heading: 'Activation rule',
        body: [
          'Internet access is activated only after provider status is confirmed successful.',
          'Pending and failed payments must not create active sessions or increase withdrawable wallet balance.',
        ],
      },
      {
        heading: 'Testing before MTN API credentials',
        body: [
          'Pesapal can be used temporarily as the backend AGGREGATOR collection route while direct MTN credentials are pending.',
          'Customer screens still show only MTN, Airtel, phone number, and Pay. Gateway names must not be shown on the portal.',
          'Set MTN_COLLECTION_PROVIDER=AGGREGATOR and/or AIRTEL_COLLECTION_PROVIDER=AGGREGATOR, then configure PESAPAL_BASE_URL, PESAPAL_CONSUMER_KEY, PESAPAL_CONSUMER_SECRET, and PESAPAL_IPN_ID.',
          'If Pesapal is configured and direct MTN/Airtel collection keys are missing, AROFi falls back to the AGGREGATOR collection route instead of failing the customer with missing MTN/Airtel key errors.',
          'Do not set disbursement providers to AGGREGATOR. Vendor withdrawals remain on direct MTN/Airtel payout adapters.',
          'Internet access is still activated only after the provider status is confirmed successful.',
        ],
      },
      {
        heading: 'Auto-connect and expiry',
        body: [
          'After a successful provider status check, AROFi creates an activation, provisions RADIUS credentials, and the captive portal reconnects the customer device through MikroTik login automatically.',
          'The RADIUS reply includes Session-Timeout based on the package duration. When time expires, MikroTik ends the session and AROFi disables the credential during the lifecycle worker pass.',
          'Set ACCESS_WORKER_INTERVAL_MS=5000 for near-real-time expiry cleanup. Enable RADIUS_DISCONNECT_ENABLED=true only after Disconnect-Request secrets and router CoA/disconnect support are configured.',
        ],
      },
    ],
  },
  'mtn-payments': {
    title: 'MTN payments',
    intro: 'MTN MoMo is implemented as collection and disbursement provider adapters.',
    sections: [
      {
        heading: 'Collection',
        body: [
          'Configure the collection base URL, subscription key, API user, API key, target environment, callback URL, currency, and allowed prefixes.',
          'For live Uganda use MTN_MOMO_COLLECTION_BASE_URL=https://proxy.momoapi.mtn.com and MTN_MOMO_TARGET_ENVIRONMENT=mtnuganda.',
        ],
      },
      {
        heading: 'Disbursement',
        body: [
          'Configure the MTN disbursement API user, API key, subscription key, base URL, and callback URL before enabling automatic vendor withdrawals.',
          'Provider acceptance moves a withdrawal into processing; final completion should be confirmed by webhook or status check.',
        ],
      },
    ],
  },
  'airtel-payments': {
    title: 'Airtel payments',
    intro: 'Airtel remains available in the UI and is routed through the Airtel adapter when credentials are configured.',
    sections: [
      {
        heading: 'Configuration',
        body: [
          'Set Airtel collection/disbursement base URLs, client ID, client secret, public key, country, currency, and callback URLs from official Airtel documentation.',
          'Do not hardcode unofficial live endpoints. Missing Airtel credentials must produce a configuration warning, not a fake success.',
        ],
      },
      {
        heading: 'Customer behavior',
        body: [
          'Airtel remains selectable on customer checkout.',
          'If Airtel is not configured, the customer receives a temporary unavailable message and can try MTN or contact support.',
        ],
      },
    ],
  },
  disbursements: {
    title: 'Disbursements',
    intro: 'Vendor withdrawals are controlled wallet debits to registered payout numbers.',
    sections: [
      {
        heading: 'Vendor controls',
        body: [
          'A vendor can register up to two payout numbers. Withdrawals can go only to an active registered number.',
          'Each withdrawal requires the vendor secret key, phone possession confirmation, and final disbursement terms acceptance.',
          'The backend checks amount plus charges against available wallet balance and rejects overdraws server-side.',
        ],
      },
      {
        heading: 'Provider finality',
        body: [
          'The wallet is reserved before provider submission. If provider submission is rejected before acceptance, the reserve is released.',
          'Once provider payout is accepted, the payout is treated as final from AROFi operations, subject to provider webhook/status reconciliation.',
        ],
      },
    ],
  },
  commissions: {
    title: 'Commissions',
    intro: 'Commissions define how platform and agent earnings are separated from vendor revenue.',
    sections: [
      {
        heading: 'Platform commission',
        body: [
          'Platform commission is calculated before funds become withdrawable by the vendor.',
          'Commission settings should be configured by platform admins and shown clearly in reports, wallet ledger, and settlement summaries.',
        ],
      },
      {
        heading: 'Agent commission',
        body: [
          'Voucher agents can have commission rates. Their commission is accrued from eligible sales and settled through controlled disbursement flows.',
          'Pending customer payments must not generate withdrawable commissions.',
        ],
      },
    ],
  },
  'router-onboarding': {
    title: 'Router onboarding',
    intro: 'Router onboarding is honest automation: AROFi configures supported MikroTik settings, but the network still has to be reachable.',
    sections: [
      {
        heading: 'What the script can do',
        body: [
          'The generated script configures RADIUS, HotSpot profile, captive portal redirect, walled garden entries, optional API/API-SSL service, and callback to AROFi.',
          'The script can report back so AROFi can learn the router public/NAT source IP and update router diagnostics.',
        ],
      },
      {
        heading: 'What the script cannot do',
        body: [
          'It cannot create internet connectivity, fix DNS, bypass ISP NAT, choose the correct physical cable, or guarantee remote RouterOS/WinBox reachability.',
          'Remote WinBox works only if the copied address is reachable from your computer and TCP 8291 is open, forwarded, or reachable through VPN/tunnel.',
        ],
      },
    ],
  },
  'winbox-setup': {
    title: 'WinBox setup',
    intro: 'WinBox is used for initial MikroTik access and for manual recovery when automatic setup cannot complete.',
    sections: [
      {
        heading: 'Run the script',
        body: [
          'Open WinBox, connect to the router, go to New Terminal, paste the generated command or downloaded .rsc script, and press Enter.',
          'Wait for the success or warning messages, then return to AROFi and run Health Check.',
        ],
      },
      {
        heading: 'Remote WinBox address',
        body: [
          'The AROFi router page can show an address to copy into WinBox. That address is not magic; it connects only when routing, firewall, NAT, and WinBox service exposure allow it.',
          'Leaving the WinBox password empty works only for routers whose admin password is actually blank. Existing production routers should use their real router credentials.',
        ],
      },
    ],
  },
  'captive-portal': {
    title: 'Captive portal',
    intro: 'The captive portal is optimized for weak WiFi/captive-network conditions.',
    sections: [
      {
        heading: 'Loading behavior',
        body: [
          'The portal renders a lightweight shell first and fetches packages after first paint.',
          'Static Next assets are cacheable; portal HTML can remain no-store where captive network safety requires it.',
        ],
      },
      {
        heading: 'Customer flow',
        body: [
          'Customers select a package, choose MTN or Airtel, enter a phone number, tap Pay, approve on the phone, then wait for confirmed activation.',
          'The portal polls payment status and shows retry/pending/success states without exposing backend gateway names.',
        ],
      },
    ],
  },
  'packages-and-vouchers': {
    title: 'Packages and vouchers',
    intro: 'Packages and vouchers define what customers buy and how offline sales are handled.',
    sections: [
      { heading: 'Packages', body: ['Publish active packages with clear durations, data limits, device limits, speed limits, and UGX prices.'] },
      { heading: 'Vouchers', body: ['Generate voucher batches for offline sales, kiosk sales, and reseller agents. Voucher sales should still post to billing and ledger records.'] },
    ],
  },
  troubleshooting: {
    title: 'Troubleshooting',
    intro: 'Troubleshooting starts with the actual state: payment, activation, RADIUS, router callback, and accounting.',
    sections: [
      {
        heading: 'Paid but not connected',
        body: [
          'Check payment status, activation record, RADIUS credential creation, router callback, walled garden, and last accounting packet.',
          'Do not manually activate internet unless the payment is confirmed successful or a controlled support override exists.',
        ],
      },
      {
        heading: 'Router not live',
        body: [
          'Check router internet, DNS, time/NTP, interface selection, RADIUS server reachability, and whether the script callback reached AROFi.',
          'If pings to 8.8.8.8 and arofi.arosoft.io fail from the MikroTik terminal, fix WAN first. For Savana/upstream routers, ether1 must be WAN and must not remain inside bridgeLocal.',
          'If remote API/WinBox fails, check public IP, VPN, port forwarding, firewall rules, and ISP NAT.',
        ],
      },
    ],
  },
  faq: {
    title: 'FAQ',
    intro: 'Common production questions for vendors and platform operators.',
    sections: [
      {
        heading: 'Can the script make a router instantly live?',
        body: [
          'No guarantee. It can configure supported settings, but the router must already have internet, DNS, correct time, correct interface selection, and reachability to AROFi/RADIUS.',
          'Health Check proves readiness. Without successful callback/RADIUS/accounting signals, the router is not confirmed live.',
        ],
      },
      {
        heading: 'Can the copied IP connect to WinBox remotely?',
        body: [
          'Only if that IP/host is reachable from your computer and the MikroTik WinBox service on TCP 8291 is allowed through firewall, NAT, VPN, or tunnel.',
          'If the router is behind ISP NAT without forwarding or VPN, the copied address will not connect remotely.',
        ],
      },
    ],
  },
}

export function generateStaticParams() {
  return Object.keys(docs).map((slug) => ({ slug }))
}

export default async function DocsPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const doc = docs[slug]
  if (!doc) notFound()

  return (
    <main className="min-h-screen bg-slate-50 px-4 py-8 text-slate-950">
      <article className="mx-auto max-w-5xl">
        <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
          <Link href="/" className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-bold text-slate-700 shadow-sm hover:bg-slate-100">
            Back Home
          </Link>
          <Link href="/docs" className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-2 text-sm font-bold text-emerald-800">
            All Docs
          </Link>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
          <p className="text-sm font-bold uppercase tracking-[0.18em] text-emerald-700">AROfi Docs</p>
          <h1 className="mt-3 text-4xl font-black tracking-tight">{doc.title}</h1>
          <p className="mt-4 max-w-3xl text-lg leading-8 text-slate-600">{doc.intro}</p>
        </div>
        <div className="mt-8 space-y-6 text-base leading-7 text-slate-700">
          {doc.sections.map((section) => (
            <section key={section.heading} className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
              <h2 className="text-2xl font-black text-slate-950">{section.heading}</h2>
              <div className="mt-4 space-y-3">
                {section.body.map((paragraph) => <p key={paragraph}>{paragraph}</p>)}
              </div>
              {section.commandBlocks?.map((block) => (
                <DocsCommandBlock key={block.title} title={block.title} commands={block.commands} />
              ))}
            </section>
          ))}
        </div>
      </article>
    </main>
  )
}
