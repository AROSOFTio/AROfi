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
    intro: 'Four steps from a brand-new router to a working, paid WiFi hotspot: register the router, run one setup command, wait for it to connect, then test it on a phone.',
    sections: [
      {
        heading: '1. Set up your business first',
        body: [
          'Sign in to your dashboard. Before registering a router, create at least one package (e.g. "1 Hour - UGX 1,000") — customers need something to buy the moment the hotspot goes live.',
          'Open Routers and click Register Router. Enter a name for the router and the site (e.g. the shop or estate it\'s at), and choose whether this is a brand-new hotspot or an existing one you just want connected to AROFi billing.',
        ],
      },
      {
        heading: '2. Run the setup command',
        body: [
          'Connect your laptop to the MikroTik and open it in WinBox using its admin login.',
          'Copy the setup command from the router\'s page in AROFi, open New Terminal in WinBox, paste it, and press Enter.',
          'Wait for the success message — this usually takes under a minute. The command is unique to that router, so always copy it fresh from the router\'s own page.',
        ],
      },
      {
        heading: '3. Confirm it worked',
        body: [
          'Back in AROFi, the router\'s status updates automatically once it connects — no need to refresh manually, though a "Check Now" button is there if you want to confirm sooner.',
          'On a phone, connect to the WiFi network and open any website — you should land on your AROFi checkout screen with your packages listed.',
          'If nothing happens, the most common cause is the internet connection into the router not being live yet, or the setup command not being pasted in full. Re-copy the command and try again, or contact support.',
        ],
      },
      {
        heading: '4. What happens automatically',
        body: [
          'Once a customer pays or redeems a voucher, they\'re connected to the internet automatically — no manual approval needed.',
          'When their package expires, they\'re disconnected automatically too, so no one keeps free access after their time or data runs out.',
          'Everything customers need to reach the payment screen is opened up for them automatically — you don\'t need to configure anything extra for payments to work.',
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
          'AROFi is a hotspot billing platform, so you don\'t need to run your own billing server or manage payments by hand.',
          '1. Create an account at arofi.net.',
          '2. Register your router from the Routers page and choose a hotspot mode.',
          '3. Copy the generated setup command, paste it into WinBox New Terminal, and wait for the success message.',
          'Your branded checkout screen and payment setup are configured automatically — see Getting Started for the full walkthrough.',
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
          'Once payment is confirmed, the device is connected automatically — customers never see any payment-processing detail beyond "Pay".',
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
        heading: '2. Nothing to configure for payments',
        body: [
          'You don\'t need a separate MTN or Airtel merchant account — accepting both networks works out of the box on every business account in good standing.',
          'Customers only ever see "MTN" or "Airtel" as their network choice on the checkout screen.',
          'Everything a customer\'s phone needs to reach the payment screen before they\'ve paid is opened up automatically the moment your router connects — there\'s nothing for you to configure.',
        ],
      },
      {
        heading: '3. Withdrawing what you collect',
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
          'Every login is limited to one active device at a time automatically — nothing to configure.',
          'If you ever see this setting in WinBox, leave the keepalive timeout alone: it\'s deliberately set long so a phone\'s screen locking or going briefly idle doesn\'t get mistaken for the customer leaving the network and disconnected by mistake.',
        ],
      },
      {
        heading: '3. Anti-tethering protection',
        body: [
          'Even with one device per login enforced, a customer could still try to share their connection using their phone\'s own hotspot or tethering feature.',
          'AROFi blocks this automatically for every hotspot it provisions — a shared/tethered device simply can\'t get a working connection, without needing any app or setup on the customer\'s side.',
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
          'Nothing about how the payment is processed is ever shown to the customer — just their package, network, and phone number.',
        ],
      },
      {
        heading: 'Activation rule',
        body: [
          'Internet access is activated only after the payment is confirmed successful.',
          'Pending and failed payments never create an active session or increase withdrawable wallet balance.',
        ],
      },
      {
        heading: 'Auto-connect and expiry',
        body: [
          'The moment a payment is confirmed, the customer is connected automatically — no manual approval step, day or night.',
          'When a package\'s time or data runs out, the customer is disconnected automatically too. If a specific router doesn\'t disconnect a device promptly, contact support — it\'s usually fixed by re-running that router\'s setup command.',
        ],
      },
    ],
  },
  disbursements: {
    title: 'Disbursements & Withdrawals',
    intro: 'Business withdrawals are controlled wallet debits to a verified payout number, with several safety checks that must all pass before money moves.',
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
          'You must confirm two things before submitting: that you physically have the destination phone with you right now, and that you accept the final disbursement terms. Both are required, not just a formality.',
          'Enter your withdrawal secret code to confirm.',
        ],
      },
      {
        heading: 'What happens after you submit',
        body: [
          'Depending on platform settings, a withdrawal is either processed instantly, or flagged for manual review — for example, a business\'s very first withdrawal, or any withdrawal above a configured amount, can require Dev Admin approval before it\'s sent.',
          'Your wallet balance is reserved the moment you submit, before the payout provider is even contacted, so the same funds can\'t be double-spent by a second withdrawal request. If the provider rejects the payout before accepting it, the reserved amount is released back to your balance automatically.',
          'Once the transfer is accepted, it\'s treated as final — you\'ll see it marked complete on your Wallet page shortly after.',
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
          'Accrued commission is settled through the same controlled disbursement flow as business withdrawals, not paid out ad hoc.',
        ],
      },
    ],
  },
  'remote-winbox': {
    title: 'Remote WinBox Access',
    intro: 'Reach your router\'s WinBox from anywhere, even when it\'s on a home or mobile internet connection that doesn\'t normally allow remote access — no networking setup required on your side.',
    sections: [
      {
        heading: '1. What it\'s for',
        body: [
          'Most internet connections don\'t allow you to reach a router remotely by default. Remote Access solves this by having the router connect out to AROFi itself, so there\'s nothing to configure on your internet connection or home network.',
          'It works on any MikroTik router, regardless of model.',
        ],
      },
      {
        heading: '2. Installing it',
        body: [
          'Open the router\'s page in AROFi and go to Remote Access.',
          'Copy the installation script, paste it into WinBox New Terminal (connected locally), and press Enter.',
          'Wait a few seconds for the connection status to show as connected.',
        ],
      },
      {
        heading: '3. Using it',
        body: [
          'Click Open Port when you need to connect — this makes the router briefly reachable from outside.',
          'Click Close Port as soon as you\'re done. Leaving it open when you don\'t need it isn\'t necessary and isn\'t recommended.',
        ],
      },
      {
        heading: '4. Security',
        body: [
          'Close your remote port as soon as you finish what you were doing.',
          'Make sure your MikroTik has a real admin password set — never leave it blank in production.',
          'Customers on your hotspot WiFi can never reach your router\'s management screen, remote access or not — that\'s blocked automatically.',
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
    intro: 'The screen your customers see the moment they connect to your WiFi — built to load fast even on a weak, just-connected signal.',
    sections: [
      {
        heading: 'Customer flow',
        body: [
          'Customer selects a package, chooses MTN or Airtel, enters a phone number, taps Pay, approves on their phone, then gets connected automatically once payment is confirmed.',
          'The portal shows clear waiting/success states the whole time, so customers always know their payment is being processed.',
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
          'Accrued commission is settled and paid out through the same disbursement flow used for business withdrawals, not paid ad hoc — see Commissions and Disbursements &amp; Withdrawals.',
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
    intro: 'The most common issues businesses run into, and what to check first before contacting support.',
    sections: [
      {
        heading: 'Customer paid but isn\'t connected',
        body: [
          'Ask the customer to confirm the Mobile Money payment actually completed on their phone — a cancelled or pending payment never connects a customer.',
          'Check the Transactions page for that payment\'s status. If it shows as successful there but the customer still isn\'t online, contact support with the reference.',
        ],
      },
      {
        heading: 'A device stays "connected" after its package expires but has no internet',
        body: [
          'This can happen on a router that was set up a while ago. Re-running that router\'s setup command from its AROFi page usually fixes it — it\'s the same command from Getting Started.',
          'If it keeps happening after that, contact support with the router name and we\'ll take a look.',
        ],
      },
      {
        heading: 'Router shows as offline',
        body: [
          'Confirm the router has a working internet connection — this is the most common cause.',
          'Check the router\'s system clock is correct (WinBox → System → Clock) — a wrong date/time can silently break connectivity to AROFi.',
          'If it\'s still offline after that, re-run the setup command, or contact support.',
        ],
      },
    ],
  },
  faq: {
    title: 'FAQ',
    intro: 'Common questions from businesses and platform operators.',
    sections: [
      {
        heading: 'Can the setup command make a router instantly live on its own?',
        body: [
          'No guarantee. It configures everything it can, but the router still needs a working internet connection and a correct clock to come online.',
        ],
      },
      {
        heading: 'Can I connect to WinBox from anywhere right away?',
        body: [
          'Only after Remote Access is installed on that router and its port is opened from the Remote Access panel — see Remote WinBox Access.',
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
