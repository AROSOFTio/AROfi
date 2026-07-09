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

// This file is the single source of truth for what operators are told about
// how AROFi actually works. Every claim here should be checked against the
// real code (apps/api/src/modules/*, apps/admin-web/src/components/*) before
// it's changed — stale docs are worse than no docs, because operators act on
// them. Last full accuracy pass: July 2026.
export const docs: Record<string, DocPage> = {
  'getting-started': {
    title: 'Getting started',
    intro: 'Move from router registration to a working MikroTik captive portal in four steps: register the router in AROFi, paste the generated one-run command in WinBox, wait for the provisioning callback, then verify the redirect on a real device.',
    sections: [
      {
        heading: '1. Sign in and prepare AROFi',
        body: [
          'Sign in to your business workspace as the operator/vendor admin.',
          'Create or confirm the hotspot site and at least one customer package before registering a router — the provisioning script needs a package to exist so it can build the checkout screen.',
          'Open Routers, click Register Router, enter the router display name, site label, HotSpot server name, and choose either "Add a fresh customer hotspot" (builds a new isolated hotspot) or "Wire an existing hotspot to AROFi RADIUS" if the router already has a working HotSpot you don\'t want touched.',
          'If you want to set the WinBox admin password from AROFi, open the router\'s Advanced Settings and enter Router Admin Password before generating the command — the script applies it during setup.',
        ],
      },
      {
        heading: '2. Connect to MikroTik before running the command',
        body: [
          'Plug the upstream/ISP internet connection into ether1 on the MikroTik (or whatever port already carries your WAN — the script auto-detects it either way).',
          'Connect your laptop to any other Ethernet port, or to WinBox via Neighbors/MAC discovery.',
          'Open WinBox and log in with the router\'s current admin credentials (blank password on a factory-reset router).',
          'Open New Terminal, paste the one-run command from the router\'s AROFi page, and wait for the success message.',
        ],
      },
      {
        heading: '3. What the one-run command actually does',
        body: [
          'The exact command is generated per router (it embeds your unique registration key) and does more than a single fetch: it first makes sure the router has working DNS and a correct system clock — both are silently broken on many factory-reset or power-cycled routers and will make every HTTPS request fail without an obvious error.',
          'It then downloads the real provisioning script over plain HTTP first (works even if the clock is wrong), falling back to HTTPS, retrying up to three rounds with a 5-second pause between attempts. If all three rounds fail it prints a clear diagnostic instead of doing nothing — check WAN connectivity, that ports 80 and 443 are not blocked, and the router\'s system clock.',
          'Once downloaded, it imports and safely deletes the temporary script file. Nothing about your admin login is touched — the script never changes your WinBox username or password.',
        ],
        commandBlocks: [
          {
            title: 'What you actually paste (shape, not a literal example)',
            commands: [
              '# The real command is generated on your router\'s page in AROFi and is',
              '# unique to that router — always copy it from there, not from docs.',
              '# It fetches https://<your-domain>/api/mikrotik/script/<your-registration-key>',
            ],
          },
        ],
      },
      {
        heading: '4. What the script configures on the router',
        body: [
          'For a fresh customer hotspot, the script builds everything on an isolated bridge and subnet (10.55.0.0/24) chosen specifically to avoid clashing with your existing LAN or management network — it does not touch your existing addressing.',
          'It auto-detects your WAN interface (default route, then PPPoE, then LTE, then any interface with a real IP that isn\'t the hotspot bridge) and excludes it from the hotspot bridge, configures NAT masquerade against it, and adds firewall rules that block WinBox/API access from the hotspot subnet — so customers on the guest network can never reach your router\'s management interface.',
          'It registers your RADIUS server(s) for HotSpot authentication and accounting, and separately registers the AROFi VPN tunnel gateway addresses so Disconnect-Request (CoA) packets — the mechanism that instantly logs a device out when its package expires — are accepted rather than silently dropped. See the RADIUS_COA_SOURCE_IPS section below.',
          'It sets DHCP, the HotSpot login redirect, and the walled-garden hosts customers need to reach before they\'ve paid (AROFi\'s own domain plus the active payment provider\'s API host) automatically — nothing to configure by hand.',
        ],
      },
      {
        heading: '5. Verify the redirect',
        body: [
          'Disconnect and reconnect a real customer device to the MikroTik Wi-Fi. It should receive an address in the 10.55.0.x range for a fresh hotspot (or your existing subnet if you used the "wire an existing hotspot" mode).',
          'Open http://neverssl.com from the customer device — it should redirect to the AROFi captive portal.',
          'If redirect fails, check HotSpot hosts, active sessions, DHCP leases, and the router\'s login.html from WinBox.',
        ],
        commandBlocks: [
          {
            title: 'Verification commands',
            commands: [
              '/ip address print',
              '/ip route print',
              '/ip hotspot print detail',
              '/ip hotspot host print',
              '/ip hotspot active print',
              '/ip dhcp-server lease print',
              '/ping 8.8.8.8 count=4',
              '/ping arofi.net count=4',
            ],
          },
        ],
      },
      {
        heading: '6. Why devices disconnect instantly at expiry (RADIUS_COA_SOURCE_IPS)',
        body: [
          'When a package expires, AROFi sends the router a RADIUS Disconnect-Request (CoA) so the device is logged out immediately — not just cut off from the internet while staying "logged in" until a session timeout eventually fires.',
          'RouterOS silently drops incoming Disconnect-Requests whose source IP isn\'t in its own /radius list. Because those packets travel down the AROFi VPN tunnel, the router sees them arriving from the VPS-side tunnel address, not the public RADIUS host it already trusts — so the provisioning script also registers the tunnel gateway address(es) as additional /radius entries specifically for this purpose. This is automatic on every router provisioned by the current script.',
          'If you provisioned a router before this was added, instant disconnect may not work until you re-run the one-run command, or add the tunnel gateway manually via WinBox as directed by support.',
        ],
      },
      {
        heading: '7. Important limits',
        body: [
          'The script configures everything RouterOS allows it to configure, but it cannot create upstream internet where none exists.',
          'Remote WinBox/API access from AROFi still requires the SSTP remote-access tunnel to be installed and its port opened — see the Remote WinBox Access guide.',
          'The correct firewall inspection command is /ip firewall filter print, not firewall filter print.',
        ],
      },
    ],
  },
  'how-to-start-wifi-business-uganda': {
    title: 'How to Start a WiFi Hotspot Business in Uganda (Complete 2026 Guide)',
    intro: 'A step-by-step business and technical guide to launching a wireless hotspot business in Kampala, Wakiso, and across Uganda using the AROFi billing platform.',
    sections: [
      {
        heading: '1. Why Start a WiFi Hotspot Business in Uganda?',
        body: [
          'High mobile data costs and fast-growing smartphone adoption make local WiFi hotspots attractive. Students, traders, remote workers, and residents are constantly seeking fast, affordable internet.',
          'Instead of paying expensive daily bundles, customers often prefer local WiFi access. High-density areas such as university hostels, markets, transit parks, trading centers, and rental apartments are common hotspot business locations.',
          'AROFi lets you run an automated WiFi hotspot that accepts Mobile Money payments, operates without manual intervention, and can issue printed vouchers for offline/agent sales.',
        ],
      },
      {
        heading: '2. Required Hardware and Equipment',
        body: [
          'You need standard networking equipment:',
          '1. MikroTik Router: acts as the gateway, captive portal, and DHCP server. For small venues, a hEX S or hAP ac² is common. For larger sites, a Cloud Core Router (CCR) or a MikroTik CHR on a server.',
          '2. Access Points: broadcast the WiFi signal. Choose access points rated for your expected concurrent user count.',
          '3. Outdoor-rated Ethernet cabling where runs are exposed to weather.',
          '4. A UPS or backup power source so load-shedding doesn\'t take your hotspot offline.',
        ],
      },
      {
        heading: '3. Securing Internet Bandwidth (ISPs)',
        body: [
          'You need a steady, adequately fast internet supply — avoid heavily capped bundles for a paid-access hotspot.',
          'Compare fiber and dedicated-internet-access (DIA) offers from ISPs serving your area; DIA typically gives symmetric upload/download and a real SLA, which matters once you have paying customers.',
          'Connect the ISP modem/router to your MikroTik\'s WAN port and let AROFi\'s provisioning script auto-detect it — it does not need to be ether1 specifically.',
        ],
      },
      {
        heading: '4. Registering and Onboarding on AROFi',
        body: [
          'AROFi is a hotspot billing platform built so you don\'t need to run your own billing server or configure RADIUS by hand.',
          '1. Create an account at arofi.net.',
          '2. Register your router from the Routers page and choose a hotspot mode.',
          '3. Copy the generated one-run script, paste it into WinBox New Terminal, and wait for the success message.',
          'The script configures RADIUS auth, walled-garden entries for the active payment provider, and redirects clients to your branded captive portal automatically.',
        ],
      },
      {
        heading: '5. Setting Up Packages and Vouchers',
        body: [
          'Configure packages that fit your target audience — time-based (e.g. 1 hour, 24 hours, 7 days) or data-capped bundles, priced in UGX.',
          'Generate voucher batches from the Vouchers page for offline, kiosk, or agent sales, and print them as PDF sheets directly from AROFi.',
          'Register resellers/agents on the Agent PoS page so a physical seller can move printed vouchers or sell directly through AROFi with commission tracked automatically — see the Agent PoS &amp; Resellers guide.',
        ],
      },
      {
        heading: '6. Live Operations and Cash Flow',
        body: [
          'When a customer connects to your WiFi, a captive portal loads automatically on their phone.',
          'They pick a package, choose MTN or Airtel, enter their phone number, and pay — a Mobile Money PIN prompt appears on their phone.',
          'Once payment is confirmed by the provider, AROFi activates the session, provisions RADIUS credentials, and the device is connected — the customer never sees which payment gateway processed the transaction.',
          'You can request a withdrawal from your AROFi wallet to a verified MTN or Airtel number once your account has completed the compliance review — see the Business Compliance and Disbursements guides.',
        ],
      },
    ],
  },
  'setup-mtn-airtel-wifi-billing': {
    title: 'How to Accept MTN MoMo & Airtel Money on Your Hotspot',
    intro: 'Step-by-step guide to how customer Mobile Money checkout actually works on an AROFi hotspot today, and how to withdraw the money you collect.',
    sections: [
      {
        heading: '1. Overview of Mobile Money Collection',
        body: [
          'Cash collection at a hotspot is inefficient and easy to lose track of. Mobile Money collection lets customers buy internet 24/7, with funds landing directly in your AROFi wallet.',
          'Checkout flow: customer connects to WiFi → portal loads available packages → customer enters phone number → Mobile Money PIN prompt appears on their phone → they pay → internet activates automatically once payment is confirmed.',
          'No external web pages or checkout redirects are involved — the payment prompt happens on the customer\'s own phone via their Mobile Money app/USSD.',
        ],
      },
      {
        heading: '2. Who actually processes the payment',
        body: [
          'Both MTN and Airtel collections are currently routed through a single Mobile Money aggregator (Yo! Uganda) — you do not need separate MTN and Airtel merchant accounts to accept both networks.',
          'The customer only ever sees "MTN" or "Airtel" as their network choice; gateway/aggregator names are never shown on the checkout screen.',
          'This is a platform-level setting, not something each business configures — nothing for you to set up here beyond having a business account in good standing.',
        ],
      },
      {
        heading: '3. Walled garden (automatic)',
        body: [
          'Before a customer pays, their phone has no internet access — except to the small set of hosts needed to complete payment (AROFi\'s own domain and the active payment provider\'s API host).',
          'These hosts are added to the MikroTik HotSpot walled garden automatically by the provisioning script. You do not need to add them by hand; use the command below only to verify they\'re present if a customer reports a payment page that won\'t load.',
        ],
        commandBlocks: [
          {
            title: 'Verify walled-garden entries (read-only)',
            commands: [
              '/ip hotspot walled-garden print',
            ],
          },
        ],
      },
      {
        heading: '4. Withdrawing what you collect',
        body: [
          'All collected revenue accumulates in your AROFi wallet. To withdraw:',
          '1. Complete business compliance review — withdrawals are blocked until your account is verified. See Business Compliance.',
          '2. In Wallet / Earnings, register a payout number (MTN or Airtel). New numbers need Dev Admin approval before they can receive funds.',
          '3. Set a withdrawal secret code (separate from your login password) — this is required on every withdrawal, not a one-time setup step.',
          '4. Click Withdraw, choose your verified payout number, enter the amount, confirm you have that phone with you and accept the terms, then enter your secret code.',
          'See the Disbursements guide for the full set of rules (minimum amount, fees, approval thresholds, and what happens if your secret code is entered wrong too many times).',
        ],
      },
    ],
  },
  'block-hotspot-sharing-tethering': {
    title: 'How to Block Hotspot Sharing/Tethering on MikroTik RouterOS',
    intro: 'How AROFi prevents a single paid login from being shared across multiple devices via Wi-Fi hotspot sharing, USB tethering, or Bluetooth sharing.',
    sections: [
      {
        heading: '1. Why Block Hotspot Sharing?',
        body: [
          'A common problem: a customer buys one voucher or session, then shares it to several other devices via their phone\'s hotspot/tethering feature.',
          'This causes bandwidth congestion, slows the connection for paying customers, and reduces your revenue per device actually using the network.',
          'AROFi\'s provisioning script enforces a one-device-per-login rule automatically — you don\'t need to configure the items below by hand, but it helps to understand what\'s already active so you don\'t accidentally undo it.',
        ],
      },
      {
        heading: '2. Single session per login',
        body: [
          'The script sets every HotSpot user profile to Shared Users = 1, so one set of login credentials can only be active on one device at a time.',
          'Important: the keepalive timeout is deliberately set very long (30 days), not 30 seconds. An earlier, shorter keepalive value caused a real production bug — MikroTik\'s own ARP-based keepalive probe was force-disconnecting customers whose phone screen simply locked or went briefly idle, even though the device never actually left the network. Session limits are enforced by Shared Users plus RADIUS session control, not by an aggressive keepalive.',
          'Do not manually shorten this value — it will reintroduce the false-disconnect bug for paying customers.',
        ],
        commandBlocks: [
          {
            title: 'What the script sets (reference only)',
            commands: [
              '/ip hotspot user profile set [find default=yes] shared-users=1 keepalive-timeout=30d',
            ],
          },
        ],
      },
      {
        heading: '3. The TTL Mangle Block (Anti-Tethering)',
        body: [
          'Shared Users = 1 alone doesn\'t stop a customer from turning on their phone\'s own hotspot/tethering — the MikroTik still only sees one device (the phone), so it can\'t tell it\'s being shared.',
          'AROFi applies a TTL (Time To Live) mangle rule automatically during provisioning: every packet leaving the hotspot interface gets its TTL set to 1. The customer\'s phone can process that packet locally, but if it tries to forward it to a tethered device, the TTL hits 0 and the packet is dropped by the phone\'s own network stack.',
          'This makes WiFi sharing, tethering, and hotspot apps effectively useless on the client device, without needing any client-side software.',
        ],
      },
      {
        heading: '4. Testing',
        body: [
          '1. Log in to the hotspot on your phone using a voucher or live billing.',
          '2. Turn on your phone\'s hotspot/tethering feature.',
          '3. Connect a second device (e.g. a laptop) to your phone\'s shared hotspot.',
          '4. Try to load a website from the second device — it should fail or time out, while your phone stays fully connected.',
        ],
      },
    ],
  },
  payments: {
    title: 'Payments',
    intro: 'How customer Mobile Money checkout works today, and what actually drives instant activation.',
    sections: [
      {
        heading: 'Customer checkout',
        body: [
          'Customers select a package, choose MTN or Airtel, enter their phone number, and press Pay.',
          'Gateway/aggregator names are never shown to customers — the frontend only ever sends packageId, network, and phone number. The backend loads the real package price from the database and validates the phone prefix against the selected network.',
        ],
      },
      {
        heading: 'Who processes the payment today',
        body: [
          'Both MTN and Airtel collection, and all vendor disbursements, currently route through a single Mobile Money aggregator (Yo! Uganda) rather than direct per-network merchant APIs.',
          'Direct MTN MoMo and Airtel Money API integrations, and a Pesapal aggregator route, exist in the codebase and remain fully built, but are not the active path today — they can be re-enabled by a platform admin if the business ever needs to switch providers, without any change to the customer-facing checkout screen.',
        ],
      },
      {
        heading: 'Activation rule',
        body: [
          'Internet access is activated only after the provider confirms the payment succeeded.',
          'Pending and failed payments never create an active session or increase withdrawable wallet balance.',
        ],
      },
      {
        heading: 'Auto-connect and expiry',
        body: [
          'After a successful payment, AROFi creates an activation, provisions RADIUS credentials, and the captive portal reconnects the customer through MikroTik login automatically.',
          'The RADIUS reply includes a Session-Timeout based on the package duration. Expiry is driven primarily by a real-time Postgres notification bridge and the admin event stream, not by polling — a background sweep (every 2 seconds by default) exists purely as a fallback in case a real-time event is missed.',
          'When a package expires, AROFi sends a RADIUS Disconnect-Request (CoA) so the device is logged out immediately — not just cut off from data while remaining logged in. This is on by default; see the CoA source-IP note in Getting Started if a specific router doesn\'t disconnect instantly.',
        ],
      },
    ],
  },
  disbursements: {
    title: 'Disbursements & Withdrawals',
    intro: 'Vendor withdrawals are controlled wallet debits to a verified payout number, with several safety checks that must all pass before money moves.',
    sections: [
      {
        heading: 'Before you can withdraw at all',
        body: [
          'Business compliance must be approved (see Business Compliance) — this is the KYC gate.',
          'Your account must be in good standing: not held for fraud review, and not blocked by a platform admin.',
          'You cannot have a pending payout-number change request in progress at the same time.',
        ],
      },
      {
        heading: 'Registering a payout number',
        body: [
          'You can register up to two payout numbers (MTN or Airtel) — this limit is a platform setting, not a hard-coded rule.',
          'A newly added number needs Dev Admin approval before it can receive funds — it doesn\'t become usable the moment you add it.',
          'Withdrawals can only go to your primary verified number, not to any registered-but-secondary number.',
        ],
      },
      {
        heading: 'The withdrawal secret code',
        body: [
          'Separately from your login password, you set a withdrawal secret code (minimum 8 characters) — this is required on every single withdrawal, not just the first one.',
          'Changing the secret requires your current password or current secret, so it can\'t be reset by anyone who only has your login session.',
          'Entering the wrong secret too many times in a row temporarily locks withdrawals on your account for a cooldown period, as a brute-force protection — both the failure threshold and the lockout duration are platform-configurable.',
        ],
      },
      {
        heading: 'Making a withdrawal',
        body: [
          'Open Wallet, click Withdraw. Choose your verified payout number, enter an amount (no less than the platform\'s configured minimum), and the screen shows the fee and the amount you\'ll actually receive before you confirm — both are platform-configurable and may be zero.',
          'You must confirm two things: that you physically have the destination phone with you right now, and that you accept the final disbursement terms. Both are required, not just a formality — the backend rejects the request if either is missing.',
          'Enter your withdrawal secret code to confirm.',
        ],
      },
      {
        heading: 'What happens after you submit',
        body: [
          'Depending on platform settings, a withdrawal is either processed instantly, or flagged for manual review — for example, a business\'s very first withdrawal, or any withdrawal above a configured amount, can require Dev Admin approval before it\'s sent.',
          'Your wallet balance is reserved the moment you submit, before the payout provider is even contacted, so the same funds can\'t be double-spent by a second withdrawal request. If the provider rejects the payout before accepting it, the reserved amount is released back to your balance automatically.',
          'Once the payout provider accepts the transfer, it is treated as final on the AROFi side — completion is then confirmed by the provider\'s own webhook or status check, same as the payment collection side.',
        ],
      },
    ],
  },
  commissions: {
    title: 'Commissions',
    intro: 'How platform and agent earnings are separated from the revenue that lands in a business\'s withdrawable wallet.',
    sections: [
      {
        heading: 'Platform commission',
        body: [
          'A platform commission is calculated before funds become withdrawable — it never appears as a separate deduction the business has to manually account for.',
          'Businesses see their net earnings on their own dashboard and reports; platform-fee figures are only ever shown to Dev Admin, never to a business or its staff.',
        ],
      },
      {
        heading: 'Agent commission',
        body: [
          'Registered agents/resellers can have a commission rate (set as a percentage when the agent is registered). Commission accrues automatically whenever a sale is attributed to that agent — for example, through the Sell Voucher point-of-sale flow. See Agent PoS &amp; Resellers.',
          'Pending or failed customer payments never generate a commission — only a completed sale accrues one.',
          'Accrued commission is settled through the same controlled disbursement flow as vendor withdrawals, not paid out ad hoc.',
        ],
      },
    ],
  },
  'router-onboarding': {
    title: 'Router onboarding',
    intro: 'Router onboarding is honest automation: AROFi configures every supported MikroTik setting it can, but the network still has to physically work.',
    sections: [
      {
        heading: 'What the script can do',
        body: [
          'Configures RADIUS, the HotSpot profile, captive portal redirect, walled-garden entries for the active payment provider, an isolated hotspot bridge and subnet that won\'t clash with your existing network, WAN auto-detection, NAT, anti-tethering, and a callback so AROFi learns the router is live.',
          'For routers set to "wire an existing hotspot" mode, the script only adds RADIUS auth/accounting to your current HotSpot — it does not rebuild your network.',
        ],
      },
      {
        heading: 'What the script cannot do',
        body: [
          'It cannot create internet connectivity where none exists, fix a broken ISP link, bypass ISP-side NAT for remote access, or choose the correct physical cable for you.',
          'Remote WinBox only works once the SSTP remote-access tunnel (a separate install step) is installed and its port is opened — see Remote WinBox Access.',
        ],
      },
    ],
  },
  'remote-winbox': {
    title: 'Remote WinBox Access (SSTP VPN)',
    intro: 'AROFi Remote Access uses an outbound SSTP VPN tunnel from the MikroTik router to AROFi\'s VPN gateway, so operators and support can reach routers behind CGNAT, firewalls, or dynamic WAN IPs without any port forwarding on your side.',
    sections: [
      {
        heading: '1. How It Works (Bypassing CGNAT)',
        body: [
          'Most residential/small-business ISP connections in Uganda assign private IPs behind CGNAT, which makes direct remote WinBox access (TCP 8291) impossible from outside.',
          'To bypass this, the router dials an outbound SSTP VPN connection to AROFi\'s VPN gateway — the connection is initiated by the router, so no inbound port forwarding is needed on your ISP connection.',
          'Once connected, the router gets a static address inside the 10.8.0.0/24 tunnel network. When you open a remote port, AROFi maps a dedicated public port (from the 31000-31100 range) through the tunnel to the router\'s WinBox port (8291).',
        ],
      },
      {
        heading: '2. Supported Devices',
        body: [
          'Because SSTP is a native RouterOS feature, remote access works on any MikroTik regardless of hardware architecture — from low-end home routers to CCR-series and Cloud Hosted Routers (CHR).',
          'Some RouterOS 7 boards ship with SSTP client access restricted by default; the install script switches the router to "enterprise" device-mode automatically when needed.',
        ],
      },
      {
        heading: '3. Step-by-Step Installation',
        body: [
          'Step 1: Open the router\'s detail page in AROFi and go to Remote Access.',
          'Step 2: Copy the generated installation script.',
          'Step 3: Open WinBox, connect to the router locally, go to New Terminal, paste the script, and press Enter.',
          'The script creates an SSTP client interface named AROFI_REMOTE. Wait a few seconds for it to show as connected.',
        ],
      },
      {
        heading: '4. Opening and Closing Ports',
        body: [
          'From the Remote Access panel:',
          '• Open Port maps your dedicated public port through to the router\'s WinBox port. The status changes to Connected.',
          '• Close Port immediately tears the mapping down once you\'re done.',
          'Dev/Platform Admin accounts have an "Enable All Remote Ports" action for turning on every already-provisioned router\'s port at once — useful for support sweeps, not something a single business needs day to day.',
        ],
      },
      {
        heading: '5. VPN Server Configuration',
        body: [
          'The SSTP VPN server runs on the AROFi host and listens on a configurable port (4443 by default, set via VPN_SERVER_PORT) — this is an AROFi platform-side setting, not something a business configures.',
          'Traffic forwarding for the 31000-31100 public port range is handled automatically by the AROFi API container.',
        ],
      },
      {
        heading: '6. Security Best Practices',
        body: [
          'Close your remote port as soon as you\'re done with a maintenance task — a port left open indefinitely is a brute-force target.',
          'Make sure your MikroTik has a real admin password set; don\'t leave it blank in production.',
          'AROFi\'s provisioning script already blocks WinBox/API access from the customer-facing hotspot subnet at the firewall level, so guests can never reach router management even without the VPN.',
        ],
      },
    ],
  },
  'winbox-setup': {
    title: 'WinBox setup',
    intro: 'WinBox is used for the initial MikroTik setup and for manual recovery when automatic provisioning can\'t complete on its own.',
    sections: [
      {
        heading: 'Run the script',
        body: [
          'Open WinBox, connect to the router, go to New Terminal, paste the generated one-run command, and press Enter.',
          'Wait for the success message, then return to AROFi — the router\'s status should update once the provisioning callback is received.',
        ],
      },
      {
        heading: 'Remote WinBox address',
        body: [
          'A router\'s AROFi page can show a remote address once the SSTP remote-access tunnel is installed and its port is open — see Remote WinBox Access. It only connects while the tunnel is up and the port is open.',
          'A blank WinBox password only works on a router whose admin password is genuinely blank. Production routers should always use their real credentials.',
        ],
      },
    ],
  },
  'captive-portal': {
    title: 'Captive portal',
    intro: 'The captive portal is optimized for weak WiFi/captive-network conditions, since that\'s exactly the environment it always runs in.',
    sections: [
      {
        heading: 'Loading behavior',
        body: [
          'The portal renders a lightweight shell first and fetches packages after first paint, so it stays usable on a slow or just-connected hotspot link.',
          'Static assets are cacheable; the portal HTML itself is served without caching where captive-network correctness requires it.',
        ],
      },
      {
        heading: 'Customer flow',
        body: [
          'Customer selects a package, chooses MTN or Airtel, enters a phone number, taps Pay, approves on their phone, then waits for confirmed activation.',
          'The portal polls payment status and shows retry/pending/success states without ever exposing the backend payment provider\'s name.',
          'The walled-garden hosts a customer needs before paying (AROFi\'s domain plus the active payment provider\'s API host) are added automatically during router provisioning — see Getting Started.',
        ],
      },
    ],
  },
  'packages-and-vouchers': {
    title: 'Packages and vouchers',
    intro: 'Packages define what customers buy; vouchers turn a package into something you can sell offline, print, or hand to an agent.',
    sections: [
      {
        heading: 'Packages',
        body: [
          'Publish active packages with clear durations, data limits, device limits, speed limits, and UGX prices — these are exactly what the customer sees on the captive portal checkout screen.',
        ],
      },
      {
        heading: 'Vouchers',
        body: [
          'Generate a voucher batch for a package, choosing a code format (mixed letters+numbers, numbers only, or letters only) and code length. Codes deliberately exclude visually ambiguous characters like 0/O and 1/I/L so they\'re easy to read off a printed card.',
          'Each batch can be printed as a PDF voucher sheet with a choice of print templates (a signal-bar card, a ticket style, a receipt style, a compact agent strip, and a low-ink thermal-printer style), each including a QR code that opens the portal with the code pre-filled.',
          'A voucher batch can only be deleted while every voucher in it is still unused — once any voucher has been sold or redeemed, the batch is kept permanently to protect the financial and access records tied to it.',
          'Voucher sales always post to billing and the ledger, whether the voucher was sold through the Vouchers page, redeemed directly by a customer, or sold through the Agent PoS point-of-sale flow — see Agent PoS &amp; Resellers.',
        ],
      },
    ],
  },
  'business-compliance': {
    title: 'Business Compliance',
    intro: 'AROFi is built for authorised, compliant hotspot operators. Compliance review confirms who you are and where you\'re operating before you can withdraw funds.',
    sections: [
      {
        heading: 'What you submit',
        body: [
          'Business name, owner name, phone number, and email.',
          'Country and district, plus the physical hotspot location — where the network you\'re billing for actually is.',
          'Business type, and your ISP\'s name (and package, if you know it) — the internet supply behind your hotspot.',
          'How many routers you\'re running and, optionally, your expected number of users, plus any notes you want a reviewer to see.',
          'A payout phone number if you want to pre-fill it for later wallet setup.',
        ],
      },
      {
        heading: 'Review states',
        body: [
          'Not Submitted — no compliance profile exists yet for your business.',
          'Pending Review — submitted and waiting on a Dev Admin reviewer.',
          'Needs More Information — a reviewer needs something clarified before they can approve; check the reviewer note on your Compliance page and resubmit.',
          'Approved — your business is verified. Withdrawals and other gated features unlock.',
          'Rejected — the submission did not pass review; the reviewer note explains why.',
          'Submitting again after Needs More Information or Rejected resets your status back to Pending Review and clears the previous verdict.',
        ],
      },
      {
        heading: 'Why it matters',
        body: [
          'Withdrawals are blocked until your compliance status is Approved — this is the platform\'s core KYC gate, not a separate optional step. See Disbursements &amp; Withdrawals.',
          'Every submission and every review decision sends an email notification, so you always know your current status without needing to check the dashboard.',
        ],
      },
    ],
  },
  'agent-pos': {
    title: 'Agent PoS & Resellers',
    intro: 'Register field agents or resellers, then use the Sell Voucher point-of-sale flow to sell a voucher to a walk-in customer with commission tracked automatically.',
    sections: [
      {
        heading: 'Registering an agent',
        body: [
          'From the Agent PoS page, click Register Agent. Set an agent code (e.g. KLA-AGENT-01), name, phone number, agent type (Reseller or Field Agent), optional territory, a commission percentage (5% by default), and an optional float limit.',
          'Registering an agent here only creates the agent record — it does not create a login. If the agent needs to sign in themselves, create a separate staff user under Users &amp; Roles with the VoucherAgent role.',
        ],
      },
      {
        heading: 'Selling a voucher (point of sale)',
        body: [
          'Click Sell Voucher on the Agent PoS page. Choose a package, optionally attribute the sale to a registered agent, and enter the customer\'s phone number.',
          'AROFi automatically assigns the oldest unused voucher in stock for that package — you don\'t pick a specific code, and if none are left it tells you to generate a new batch first (see Packages and vouchers).',
          'The sale is recorded immediately: the voucher is marked sold, a billing transaction is posted, and — if you picked an agent — their commission accrues automatically as part of the same transaction. Nothing further to do manually.',
        ],
      },
      {
        heading: 'Agent float and settlement',
        body: [
          'Agents can be loaded with float from the business wallet and can return unused float, both as controlled, ledgered transfers.',
          'Accrued commission is settled and paid out through the same disbursement flow used for vendor withdrawals, not paid ad hoc — see Commissions and Disbursements &amp; Withdrawals.',
        ],
      },
    ],
  },
  notifications: {
    title: 'Notifications',
    intro: 'In-app notifications from AROFi to your business — never a browser pop-up, and never something you need to opt into separately.',
    sections: [
      {
        heading: 'How you see them',
        body: [
          'Every signed-in user has a notification bell in the top bar showing an unread count. Opening it lists your notifications, newest first, and you can mark one or all as read.',
          'Notifications are checked automatically about once a minute while you have the dashboard open — there\'s no separate "enable notifications" step or browser permission prompt.',
        ],
      },
      {
        heading: 'Who sends them',
        body: [
          'Only Dev Admin can send a notification — this is a platform-to-business channel, not something businesses send to each other or to customers.',
          'A notification can target one specific business, or every business on the platform at once.',
        ],
      },
      {
        heading: 'Attachments',
        body: [
          'A notification can include up to five file attachments (each up to 10MB) — useful for sending a signed agreement, a policy update, or a screenshot alongside the message.',
          'Attachments are only visible to whoever the notification was actually sent to (the target business, or everyone if it was sent to all businesses).',
        ],
      },
    ],
  },
  reports: {
    title: 'Reports',
    intro: 'Filtered, exportable reports for Sales, Disbursements, and Vouchers — preview on screen, then export to CSV, Excel, or PDF.',
    sections: [
      {
        heading: 'Report types',
        body: [
          'Sales — every Mobile Money and voucher sale, with status, channel, and reference detail.',
          'Disbursements — every payout, including which agent (if any) it belongs to, its method, and status.',
          'Vouchers — every generated voucher and its current status, from generated through sold or redeemed.',
        ],
      },
      {
        heading: 'Filters',
        body: [
          'Every report supports a date range, a status filter (options depend on report type), and a free-text search across phone numbers, voucher codes, and references. Sales reports add a channel filter (Mobile Money vs Voucher).',
          'The on-screen preview shows the first 50 matching rows and a total count before you export anything.',
        ],
      },
      {
        heading: 'Export formats',
        body: [
          'CSV — plain rows for spreadsheets or accounting software.',
          'Excel (.xlsx) — a formatted workbook with a styled header row.',
          'PDF — a printable table with the applied filters and record count shown in the header, automatically switching to landscape for wider reports.',
          'Fee and net-revenue columns only appear for Dev Admin — a business never sees platform-fee figures in its own report exports, matching every other screen in AROFi.',
        ],
      },
    ],
  },
  troubleshooting: {
    title: 'Troubleshooting',
    intro: 'Troubleshooting starts with the actual state: payment, activation, RADIUS, router callback, and accounting — not guesswork.',
    sections: [
      {
        heading: 'Paid but not connected',
        body: [
          'Check payment status, the activation record, RADIUS credential creation, the router\'s provisioning callback, walled-garden entries, and the last accounting packet, in that order.',
          'Do not manually activate internet access unless the payment is confirmed successful, or a controlled support override is being used deliberately.',
        ],
      },
      {
        heading: 'Device stays "logged in" after expiry but has no internet',
        body: [
          'This means the RADIUS Disconnect-Request (CoA) that should log the device out instantly isn\'t reaching the router — usually because the router was provisioned before CoA source-IP registration was added to the script.',
          'Re-run the router\'s one-run command to pick up the current script, or ask support to add the tunnel gateway address manually via WinBox. See the RADIUS_COA_SOURCE_IPS section in Getting Started.',
        ],
      },
      {
        heading: 'Router not live',
        body: [
          'Check the router\'s internet, DNS, system clock, WAN interface selection, RADIUS reachability, and whether the provisioning callback actually reached AROFi.',
          'If pings to 8.8.8.8 and arofi.net fail from the MikroTik terminal, fix WAN connectivity first — nothing downstream of that will work.',
          'If remote WinBox/API fails, check that the SSTP remote-access tunnel is installed and its port is open — see Remote WinBox Access.',
        ],
      },
    ],
  },
  faq: {
    title: 'FAQ',
    intro: 'Common questions from businesses and platform operators.',
    sections: [
      {
        heading: 'Can the one-run script make a router instantly live on its own?',
        body: [
          'No guarantee. It configures every supported setting, but the router still needs working internet, DNS, a correct clock, and the right WAN interface selected.',
        ],
      },
      {
        heading: 'Can I use the copied remote address to connect to WinBox from anywhere?',
        body: [
          'Only once the SSTP remote-access tunnel is installed on that router and its port is opened from the Remote Access panel — see Remote WinBox Access.',
        ],
      },
      {
        heading: 'Why can\'t I withdraw yet even though my wallet has a balance?',
        body: [
          'Withdrawals are blocked until your business compliance status is Approved. Check the Compliance page for a reviewer note if your status is Needs More Information or Rejected.',
        ],
      },
      {
        heading: 'Do I need to configure anything for notifications to work?',
        body: [
          'No — every signed-in user automatically has a notification bell in the top bar. There\'s no browser permission prompt and nothing to enable.',
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
      canonical: `https://arofi.net/docs/${slug}`
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
              <span className="text-xs text-slate-400">Updated: July 2026</span>
            </div>
          </article>
        </section>
      </div>
    </main>
  )
}
