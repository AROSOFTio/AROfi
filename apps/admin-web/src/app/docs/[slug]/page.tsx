import Link from 'next/link'
import { notFound } from 'next/navigation'

type DocPage = {
  title: string
  intro: string
  sections: Array<{ heading: string; body: string[] }>
}

const docs: Record<string, DocPage> = {
  'getting-started': {
    title: 'Getting started',
    intro: 'Move a vendor from registration to the first paid customer session with this production checklist.',
    sections: [
      {
        heading: 'Launch checklist',
        body: [
          'Create or approve the vendor tenant workspace, then sign in as the vendor admin.',
          'Add hotspot sites, publish at least one package, and configure MTN/Airtel payment settings before sending customers to the portal.',
          'Register a MikroTik router, generate the onboarding script, run it in WinBox Terminal, then run Health Check in AROFi.',
        ],
      },
      {
        heading: 'Manual prerequisites',
        body: [
          'The router must already have working internet, working DNS, correct date/time, and correct WAN/LAN or bridge interfaces.',
          'If the router is behind ISP NAT, remote management requires public IP, port forwarding, VPN, or a supported tunnel.',
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

export default function DocsPage({ params }: { params: { slug: string } }) {
  const doc = docs[params.slug]
  if (!doc) notFound()

  return (
    <main className="min-h-screen bg-slate-50 px-4 py-10 text-slate-950">
      <article className="mx-auto max-w-3xl">
        <Link href="/docs" className="text-sm font-semibold text-emerald-700">Docs</Link>
        <h1 className="mt-3 text-4xl font-bold">{doc.title}</h1>
        <p className="mt-4 text-lg leading-8 text-slate-600">{doc.intro}</p>
        <div className="mt-8 space-y-8 text-base leading-7 text-slate-700">
          {doc.sections.map((section) => (
            <section key={section.heading} className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
              <h2 className="text-xl font-bold text-slate-950">{section.heading}</h2>
              <div className="mt-4 space-y-3">
                {section.body.map((paragraph) => <p key={paragraph}>{paragraph}</p>)}
              </div>
            </section>
          ))}
        </div>
      </article>
    </main>
  )
}
