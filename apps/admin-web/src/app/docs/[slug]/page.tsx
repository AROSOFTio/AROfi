import Link from 'next/link'
import { notFound } from 'next/navigation'
import type { Metadata } from 'next'
import { ArrowLeft, BookOpen, ChevronRight, Home, CheckCircle2 } from 'lucide-react'
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
              '/ip hotspot profile set [find name="arofi-c308ea29"] hotspot-address=10.50.0.1 html-directory=hotspot login-by=http-pap,cookie use-radius=yes radius-accounting=yes',
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
  'how-to-start-wifi-business-uganda': {
    title: 'How to Start a WiFi Hotspot Business in Uganda (Complete 2026 Guide)',
    intro: 'A step-by-step business and technical guide to launching a profitable wireless hotspot business in Kampala, Wakiso, and across Uganda using the AROFi billing platform.',
    sections: [
      {
        heading: '1. Why Start a WiFi Hotspot Business in Uganda?',
        body: [
          'High mobile data costs and fast-growing smartphone adoption make local WiFi hotspots highly profitable. Students, traders, remote workers, and residents are constantly seeking fast, affordable, and unlimited internet connectivity.',
          'Instead of paying expensive daily bundles, customers prefer buying high-speed local WiFi access. High-density areas such as university hostels (Makerere, MUBS, Kyambogo), local markets (Kitintale, Nakasero), public transit parks, trading centers, and rental apartments are goldmines for WiFi business setups.',
          'With AROFi, you can set up a fully automated WiFi hotspot that accepts payments via MTN Mobile Money and Airtel Money, operates 24/7 without manual intervention, and issues printed vouchers for physical retail sales.'
        ]
      },
      {
        heading: '2. Required Hardware and Equipment',
        body: [
          'To start, you need the following standard networking equipment:',
          '1. MikroTik Router: This acts as the gateway, captive portal, and DHCP server. For small venues, a hEX S (RB760iGS) or hAP ac² is perfect. For large hubs or busy markets, use a Cloud Core Router (CCR) or MikroTik CHR on a local server.',
          '2. High-Performance Access Points (APs): Access points broadcast the WiFi signal. Ubiquiti UniFi (e.g., UniFi AC Mesh for outdoor, AC Lite for indoor) or TP-Link Omada (e.g., EAP225/EAP610) are highly recommended for handling high concurrent user loads.',
          '3. Ethernet Cables: Category 6 (Cat6) outdoor-rated shielded cables to prevent interference and packet loss.',
          '4. Uninterruptible Power Supply (UPS) / Backup Power: Load shedding can disrupt business. A mini-UPS (12V/24V) keeps your MikroTik and access points online during power cuts.'
        ]
      },
      {
        heading: '3. Securing Internet Bandwidth (ISPs)',
        body: [
          'You need a steady, high-speed unlimited internet supply. Avoid limited gigabyte bundles; you must secure an unlimited package.',
          'Airtel Broadband or MTN Wanaanchi/Fiber offer competitive home and business internet packages in Kampala. Other providers like Liquid Intelligent Technologies, Roke Telecom, or local metro fiber resellers offer dedicated internet access (DIA) which provides symmetric upload/download speeds and higher SLA guarantees.',
          'Connect the internet modem/router via ethernet cable to ether1 (WAN port) of your MikroTik router, and configure it to obtain an IP address automatically via DHCP client.'
        ]
      },
      {
        heading: '4. Registering and Onboarding on AROFi',
        body: [
          'AROFi is Uganda\'s leading multi-tenant SaaS platform that makes hotspot billing automatic. You don\'t need to install local billing servers or configure complex RADIUS databases manually.',
          '1. Create a free account at arofi.arosoftlabs.com.',
          '2. Add a new Hotspot Site and create a Router Group in your operator dashboard.',
          '3. Register your MikroTik Router by filling in the router name and selecting your Hotspot configuration.',
          '4. AROFi will generate a unique one-run RouterOS script. Copy the command, open WinBox, go to New Terminal, paste the command, and press Enter.',
          'The script automatically configures RADIUS auth, Walled Gardens for mobile money, and redirects clients to your branded captive portal page.'
        ]
      },
      {
        heading: '5. Setting Up Packages and Vouchers',
        body: [
          'Configure attractive packages that fit the purchasing power of your target audience:',
          '• Time-Based Bundles: E.g., 1 Hour Unlimited (UGX 500), 4 Hours (UGX 1,500), 24 Hours (UGX 3,000), or 7 Days (UGX 15,000).',
          '• Data-Capped Bundles: E.g., 1GB valid for 24 hours (UGX 1,000) or 5GB valid for 7 days (UGX 5,000).',
          '• Voucher Batches: Generate and print PDF voucher sheets from AROFi. You can distribute these vouchers to local shops, canteens, and agents near your hotspot site, giving them a 10% to 15% commission to drive local physical sales.'
        ]
      },
      {
        heading: '6. Live Operations and Cash Flow',
        body: [
          'When customers connect to your WiFi network (e.g., "Kitintale Free WiFi"), a captive portal window pops up automatically on their phone.',
          'They choose their preferred package, enter their MTN or Airtel phone number, and click Pay. The system initiates an instant USSD/STK Push payment prompt on their phone.',
          'Once they enter their Mobile Money PIN, AROFi receives the success callback, registers the transaction, updates your dashboard wallet, and RADIUS automatically logs the client onto the internet.',
          'You can request a withdrawal at any time from your AROFi dashboard directly to your registered MTN or Airtel wallet. Disbursements are paid out instantly.'
        ]
      }
    ]
  },
  'setup-mtn-airtel-wifi-billing': {
    title: 'How to Setup MTN MoMo & Airtel Money WiFi Billing',
    intro: 'Step-by-step guide to configuring automated Mobile Money collection and RADIUS validation for your MikroTik hotspot network in Uganda.',
    sections: [
      {
        heading: '1. Overview of Mobile Money Integration',
        body: [
          'In Uganda, cash collection is inefficient and prone to theft. Automated mobile money collection enables clients to buy internet packages 24/7, with funds deposited directly into your AROFi virtual wallet.',
          'The checkout flow is seamless: Client connects to WiFi → Portal loads available packages → Client inputs phone number → Mobile Money PIN prompt appears → Client pays → Internet is activated instantly.',
          'No external web pages or complex checkout redirection are required; the payment prompt displays directly over the captive portal frame.'
        ]
      },
      {
        heading: '2. Configuring the Collection Adapter (SaaS or Custom)',
        body: [
          'AROFi supports two payment collection routes in Uganda:',
          '1. Aggregator Route (Default & Easiest): Uses Pesapal to route collections. This is the fastest way to get started and requires no complex business registrations. Set MTN_COLLECTION_PROVIDER=AGGREGATOR and AIRTEL_COLLECTION_PROVIDER=AGGREGATOR in your environment, and input your Pesapal client key/secret.',
          '2. Direct API Integration: If you have your own MTN MoMo API merchant account or Airtel Money Developer account, you can plug your direct credentials (API User, API Key, Client Secret) into AROFi to avoid aggregator fees.'
        ]
      },
      {
        heading: '3. Captive Portal Walled Garden Settings',
        body: [
          'Before a customer pays, they have no internet access. However, their phone must be allowed to communicate with MTN, Airtel, and AROFi servers to process the payment API calls.',
          'This is done by adding the payment provider domains to the MikroTik Hotspot Walled Garden. The AROFi onboarding script adds these automatically, but you should verify them manually in WinBox under /ip hotspot walled-garden.',
          'If you use Pesapal, make sure the following domains are allowed:'
        ],
        commandBlocks: [
          {
            title: 'Walled Garden verification commands',
            commands: [
              '/ip hotspot walled-garden add dst-host=*.pesapal.com action=allow comment="Pesapal Gateways"',
              '/ip hotspot walled-garden add dst-host=pay.pesapal.com action=allow comment="Pesapal Checkout"',
              '/ip hotspot walled-garden add dst-host=*.arosoftlabs.com action=allow comment="AROFi Backend"',
              '/ip hotspot walled-garden add dst-host=*.momoapi.mtn.com action=allow comment="MTN API"',
              '/ip hotspot walled-garden add dst-host=*.airtel.com action=allow comment="Airtel API"'
            ]
          }
        ]
      },
      {
        heading: '4. Setting Up MTU and Radius Timeout',
        body: [
          'Mobile Money prompt delays can sometimes cause the hotspot login page to time out. Ensure your MikroTik RADIUS client has an adequate timeout configuration.',
          'We recommend setting the RADIUS timeout to 10 seconds (default is 300ms) to allow the customer sufficient time to input their mobile money PIN and confirm the transaction.'
        ],
        commandBlocks: [
          {
            title: 'Optimizing RADIUS Client Timeout in WinBox',
            commands: [
              '/radius set [find service=hotspot] timeout=10s',
              '/ip dhcp-server set [find name=arofi-dhcp] lease-time=1h'
            ]
          }
        ]
      },
      {
        heading: '5. Setting Up Automated Vendor Withdrawals (Disbursements)',
        body: [
          'All collected revenue is accumulated in your AROFi wallet. To withdraw funds to your MTN or Airtel wallet:',
          '1. Go to Wallet Settings in your AROFi admin panel.',
          '2. Under Payout Accounts, add your MTN MoMo or Airtel registered phone number (must match the name on your national ID).',
          '3. Click Withdraw, enter the amount, and confirm with your secure account PIN.',
          'The system uses MTN/Airtel direct payout APIs to instantly disburse the cash to your phone.'
        ]
      }
    ]
  },
  'block-hotspot-sharing-tethering': {
    title: 'How to Block Hotspot Sharing/Tethering on MikroTik RouterOS',
    intro: 'Learn how to prevent clients from tethering their active Wi-Fi hotspot connection to other phones and computers, preserving your paid bandwidth.',
    sections: [
      {
        heading: '1. Why Block Hotspot Sharing?',
        body: [
          'A common issue for wireless hotspot operators is when a customer buys a single voucher or logs in on one device, and then uses Wi-Fi sharing, USB tethering, or Bluetooth sharing to connect multiple other devices (like laptops, TVs, or friends\' phones).',
          'This practice allows multiple users to browse on a single paid session, which causes high bandwidth congestion, slows down the connection for paying users, and significantly reduces your overall sales revenue.',
          'To run a profitable and premium hotspot network, you must enforce a one-device-per-login rule at the router level.'
        ]
      },
      {
        heading: '2. Enforcing One-User Session Limits',
        body: [
          'The first line of defense is restricting your user profiles to only allow a single active connection.',
          'In RouterOS, navigate to /ip hotspot user profile. Edit the default profile (and any custom profiles you have generated) and set Shared Users = 1.',
          'You should also set a Keepalive Timeout of 30 seconds. This ensures that if a user disconnects or turns off their Wi-Fi, the router detects it quickly and frees up the session, preventing the credential from being stuck as active on the server.'
        ],
        commandBlocks: [
          {
            title: 'Enforce Single Session & Keepalive in RouterOS Terminal',
            commands: [
              '/ip hotspot user profile set [find default=yes] shared-users=1 keepalive-timeout=30s',
              ':foreach profile in=[/ip hotspot user profile find] do={ /ip hotspot user profile set $profile shared-users=1 keepalive-timeout=30s }'
            ]
          }
        ]
      },
      {
        heading: '3. The TTL Mangle Block (Anti-Tethering)',
        body: [
          'Even with Shared Users set to 1, a client can still turn on their phone\'s Wi-Fi hotspot or tethering app to share internet. Because the phone acts as a NAT gateway/router, the MikroTik only sees one MAC address and one IP address, allowing it to bypass the standard hotspot checks.',
          'To block this, we use the TTL (Time To Live) mangle technique. Every packet transmitted has a TTL value that is decremented by 1 every time it passes through a router/gateway.',
          'By setting the TTL of all outbound packets leaving the MikroTik hotspot interface to exactly 1, the client\'s phone receives the packet and can process it locally. However, if the phone tries to forward that packet to a tethered device, it decrements the TTL to 0. The phone\'s sharing engine then drops the packet instantly.',
          'This renders all tethering, Wi-Fi sharing, and hotspot apps completely useless on the client device.'
        ],
        commandBlocks: [
          {
            title: 'Apply TTL Mangle Rules',
            commands: [
              '/ip firewall mangle remove [find comment="AROFi anti-tether"]',
              ':foreach h in=[/ip hotspot find] do={',
              '  :local hotInterface [/ip hotspot get $h interface]',
              '  :if ($hotInterface != "") do={',
              '    /ip firewall mangle add chain=postrouting action=change-ttl new-ttl=set:1 passthrough=no out-interface=$hotInterface comment="AROFi anti-tether"',
              '  }',
              '}'
            ]
          }
        ]
      },
      {
        heading: '4. Testing Your Setup',
        body: [
          '1. Log in to the Wi-Fi hotspot on your phone using a voucher or dynamic billing.',
          '2. Turn on the Wi-Fi Hotspot sharing feature on your phone.',
          '3. Connect a secondary device (like a laptop) to your phone\'s shared hotspot network.',
          '4. Try to load any website or ping a public IP address from the secondary device. The connection will fail or time out, while your phone remains fully connected.',
          'Note: AROFi\'s automated MikroTik provisioning script includes this aggressive TTL anti-tethering protection automatically during router onboarding.'
        ]
      }
    ]
  },
  payments: {
    title: 'Payments',
    intro: 'AROFi keeps customer payment UX simple while routing to configured providers in the backend.',
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
          'When using Pesapal from a captive hotspot, the MikroTik walled garden must allow pay.pesapal.com and *.pesapal.com so unauthenticated customers can open the Pesapal checkout page.',
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
  'remote-winbox': {
    title: 'Remote WinBox Access (SSTP VPN)',
    intro: 'AROFi Remote Access utilizes a secure outbound SSTP (Secure Socket Tunneling Protocol) VPN client tunnel on the MikroTik router. This allows operators and technical support to connect to routers behind CGNAT (Carrier-Grade NAT), firewalls, or dynamic WAN IPs without any public IP or port forwarding setup.',
    sections: [
      {
        heading: '1. How It Works (Bypassing CGNAT)',
        body: [
          'Most ISP connections in Uganda (MTN, Airtel, Roke) assign private IP addresses to customers behind CGNAT. This makes direct remote WinBox access (TCP 8291) impossible.',
          'To bypass this, AROFi creates an SSTP VPN interface on the MikroTik router. The router establishes a secure SSL/TLS connection outwards to the central AROFi VPN gateway (e.g. vpn2.arofi.arosoft.io).',
          'Once connected, the router is assigned a static IP in the VPN network. When you request a remote port, AROFi maps a high-range public port (e.g. 30000-30100) to the router\'s WinBox port (8291) through the tunnel.',
        ],
      },
      {
        heading: '2. Supported Devices',
        body: [
          'Because SSTP VPN is a native RouterOS feature, AROFi remote access supports ANY MikroTik router regardless of hardware architecture (mipsbe, mmips, arm, arm64, tile, x86).',
          'It works perfectly on low-end models (RB951, hAP mini, hAP lite, hEX) as well as enterprise cores (CCR series, Cloud Hosted Routers / CHR).',
        ],
      },
      {
        heading: '3. Step-by-Step Installation',
        body: [
          'Step 1: Open the router details under the Routers section in your AROFi dashboard.',
          'Step 2: Navigate to the Remote WinBox Access card and select the Install tab.',
          'Step 3: Copy the generated automatic installation script.',
          'Step 4: Open WinBox, connect to your router locally, go to New Terminal, paste the script, and press Enter.',
          'The script downloads and imports the configuration, creating an interface named AROFI_REMOTE. Wait a few seconds for the interface status to show connected.',
        ],
        commandBlocks: [
          {
            title: 'VPN Installation Command Template',
            commands: [
              '/tool fetch url="https://YOUR_DOMAIN/api/mikrotik/remote-access/install/YOUR_REMOTE_TOKEN" check-certificate=no dst-path="vpn.rsc" mode=https; :delay 2s; /import file-name="vpn.rsc"; :delay 1s; /file remove "vpn.rsc"',
            ],
          },
        ],
      },
      {
        heading: '4. Opening and Closing Ports',
        body: [
          'To maintain security, AROFi allows tenants/vendors to open and close their remote ports on demand.',
          'Under the Status tab of the Remote WinBox Access panel:',
          '• Click Open Port to enable the port mapping. The status changes to Connected, and the public port becomes active.',
          '• Click Close Port to immediately tear down the mapping when you are finished managing the router.',
          'If you are a Dev/Platform Admin, you can use the "Enable All Remote Ports" button in the main toolbar to temporarily turn on all ports for technical support, audits, or emergency troubleshooting.',
        ],
      },
      {
        heading: '5. VPN Server Configuration on Contabo VPS',
        body: [
          'To allow routers to dial SSTP tunnels, ensure an SSTP VPN server (like sstpd or accel-ppp) is installed on your Contabo host VPS and listening on port 443 (or proxied via Nginx).',
          'Ensure the SSTP server subnet is configured to allocate IP addresses matching the 10.8.0.x subnet.',
          'Traffic forwarding from ports 30000-30100 is automatically managed by the AROFi API container. Simply expose port range 30000-30100 in docker-compose.yml (already configured).',
        ],
      },
      {
        heading: '6. Security Best Practices',
        body: [
          'Warning: Keeping remote ports open indefinitely exposes your router to malicious automated brute-force attacks.',
          '1. Always close your remote port immediately after completing your maintenance task.',
          '2. Ensure your MikroTik has a strong admin password configured. Do not leave the password empty.',
          '3. Under /ip service in WinBox, consider changing the default WinBox port or setting an Allowed-From subnet filter for added protection.',
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
          'For Pesapal test routing, keep Pesapal checkout hosts in the HotSpot walled garden: pay.pesapal.com, www.pesapal.com, cybqa.pesapal.com, and *.pesapal.com.',
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

// Generate static routes for compilation
export function generateStaticParams() {
  return Object.keys(docs).map((slug) => ({ slug }))
}

// SEO Meta-tags generation per document page
export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params
  const doc = docs[slug]
  if (!doc) return {}
  
  return {
    title: `${doc.title} | AROFi WiFi Billing Uganda Docs`,
    description: doc.intro.substring(0, 155),
    alternates: {
      canonical: `https://arofi.arosoftlabs.com/docs/${slug}`
    }
  }
}

export default async function DocsPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const doc = docs[slug]
  if (!doc) notFound()

  // Generate sidebar page list
  const sidebarLinks = Object.entries(docs).map(([key, value]) => ({
    slug: key,
    title: value.title,
  }))

  return (
    <main className="min-h-screen bg-slate-50 text-slate-900 font-sans antialiased relative overflow-hidden">
      {/* Background Dot grid effect - light theme */}
      <div className="absolute inset-0 bg-[linear-gradient(to_right,#e2e8f0_1px,transparent_1px),linear-gradient(to_bottom,#e2e8f0_1px,transparent_1px)] bg-[size:4rem_4rem] [mask-image:radial-gradient(ellipse_60%_50%_at_50%_0%,#000_70%,transparent_100%)] pointer-events-none" />

      {/* Main Layout Grid */}
      <div className="relative z-10 max-w-7xl mx-auto flex flex-col md:flex-row">
        
        {/* Left Sidebar Navigation */}
        <aside className="w-full md:w-80 md:shrink-0 md:sticky md:top-0 md:h-screen overflow-y-auto border-b md:border-b-0 md:border-r border-slate-200 bg-white/80 backdrop-blur-md p-6">
          <div className="flex items-center gap-3 pb-6 border-b border-slate-200 mb-6">
            <BookOpen className="w-6 h-6 text-blue-600" />
            <div>
              <Link href="/docs" className="hover:text-blue-600 transition">
                <span className="text-sm font-bold uppercase tracking-wider text-slate-500">AROFi Docs</span>
              </Link>
              <h2 className="text-xs text-slate-400 mt-0.5">Knowledgebase &amp; SOPs</h2>
            </div>
          </div>

          <div className="mb-6">
            <Link 
              href="/docs" 
              className="flex items-center gap-2 rounded-lg bg-slate-100 border border-slate-200 px-3 py-2 text-xs font-semibold hover:bg-slate-200 transition text-slate-700"
            >
              <Home className="w-3.5 h-3.5 text-slate-500" />
              All Documentation
            </Link>
          </div>

          <nav className="space-y-1">
            <p className="text-[10px] font-extrabold uppercase tracking-wider text-slate-400 mb-2 px-3">Available Guides</p>
            {sidebarLinks.map((link) => {
              const isActive = link.slug === slug
              return (
                <Link 
                  key={link.slug} 
                  href={`/docs/${link.slug}`}
                  className={`flex items-center justify-between rounded-lg px-3 py-2.5 text-xs font-medium transition ${
                    isActive 
                      ? 'bg-blue-50 border border-blue-100 text-blue-600 font-semibold' 
                      : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900 border border-transparent'
                  }`}
                >
                  <span className="truncate max-w-[200px]">{link.title}</span>
                  {isActive && <ChevronRight className="w-3 h-3 text-blue-600 shrink-0" />}
                </Link>
              )
            })}
          </nav>
        </aside>

        {/* Right Article Body */}
        <section className="flex-1 p-6 md:p-12 overflow-x-hidden">
          <article className="max-w-3xl mx-auto">
            {/* Header Path */}
            <div className="flex items-center gap-2 text-xs font-semibold text-slate-400 mb-4 uppercase tracking-wider">
              <span>Docs</span>
              <ChevronRight className="w-3.5 h-3.5 text-slate-300" />
              <span className="text-blue-600">{doc.title}</span>
            </div>

            {/* Document Hero */}
            <div className="bg-white border border-slate-200 rounded-2xl p-6 md:p-8 mb-8 shadow-sm">
              <h1 className="text-3xl md:text-4xl font-extrabold tracking-tight text-slate-900 leading-tight">
                {doc.title}
              </h1>
              <p className="mt-4 text-base md:text-lg text-slate-600 leading-relaxed">
                {doc.intro}
              </p>
            </div>

            {/* Document Sections */}
            <div className="space-y-8">
              {doc.sections.map((section, idx) => (
                <section key={section.heading + idx} className="border-t border-slate-200 pt-8 first:border-0 first:pt-0">
                  <h2 className="text-xl md:text-2xl font-bold text-slate-900 flex items-center gap-3">
                    <CheckCircle2 className="w-5 h-5 text-blue-600 shrink-0" />
                    {section.heading}
                  </h2>
                  <div className="mt-4 space-y-4 text-sm md:text-base text-slate-700 leading-relaxed">
                    {section.body.map((paragraph, pIdx) => (
                      <p key={pIdx}>{paragraph}</p>
                    ))}
                  </div>
                  {section.commandBlocks?.map((block, bIdx) => (
                    <div key={block.title + bIdx} className="mt-4 shadow-sm">
                      <DocsCommandBlock title={block.title} commands={block.commands} />
                    </div>
                  ))}
                </section>
              ))}
            </div>

            {/* Back Button */}
            <div className="mt-12 pt-8 border-t border-slate-200 flex items-center justify-between">
              <Link 
                href="/docs" 
                className="flex items-center gap-2 text-xs font-semibold text-slate-500 hover:text-slate-900 transition"
              >
                <ArrowLeft className="w-4 h-4" />
                Back to All Docs
              </Link>
              <span className="text-xs text-slate-400">Updated: June 2026</span>
            </div>
          </article>
        </section>
      </div>
    </main>
  )
}
