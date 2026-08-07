export type BookBlock =
  | { type: 'p'; text: string }
  | { type: 'h2'; text: string }
  | { type: 'h3'; text: string }
  | { type: 'ul'; items: string[] }
  | { type: 'ol'; items: string[] }
  | { type: 'callout'; tone: 'note' | 'success' | 'warning'; title: string; text: string }
  | { type: 'table'; headers: string[]; rows: string[][] }
  | { type: 'code'; title?: string; lines: string[] }
  | { type: 'image'; src: string; alt: string; caption: string }

export type BookPage = {
  slug: string
  chapter: string
  title: string
  summary: string
  audience: 'Everyone' | 'Business owner' | 'Network operator' | 'Platform administrator'
  blocks: BookBlock[]
}

export const arofiBook: BookPage[] = [
  {
    slug: 'welcome',
    chapter: 'Chapter 1',
    title: 'The AROFi operations handbook',
    summary: 'A practical visual guide to WiFi billing, MikroTik operations, vouchers, Mobile Money and business reporting.',
    audience: 'Everyone',
    blocks: [
      { type: 'image', src: '/docs/book-cover.svg', alt: 'AROFi operations handbook cover', caption: 'The production handbook for the AROFi WiFi billing platform.' },
      { type: 'h2', text: 'What AROFi manages' },
      { type: 'p', text: 'AROFi is a cloud operating system for businesses that sell internet access through MikroTik routers. It combines internet packages, customer checkout, Mobile Money, vouchers, QR redemption, routers, sessions, agents, wallets and reports in one workspace.' },
      { type: 'ul', items: ['Business workspaces remain isolated from one another.', 'A payment or successful voucher redemption records a sale.', 'MikroTik and RADIUS enforce customer access.', 'Agents receive traceable voucher stock by name and location.', 'Platform administrators control global fees, gateways, limits and compliance.'] },
      { type: 'callout', tone: 'success', title: 'One current source', text: 'This visual handbook replaces the old documentation directory. Product behaviour and pricing must be updated here whenever the production application changes.' },
    ],
  },
  {
    slug: 'platform-map',
    chapter: 'Chapter 2',
    title: 'How the platform fits together',
    summary: 'The path from a customer phone to the access point, MikroTik, payment gateway, RADIUS and dashboard.',
    audience: 'Everyone',
    blocks: [
      { type: 'image', src: '/docs/network-map.svg', alt: 'AROFi network and application architecture', caption: 'Customer traffic passes through the local network while authentication, payment and reporting are coordinated by AROFi.' },
      { type: 'h2', text: 'The customer request path' },
      { type: 'ol', items: ['The customer joins the hotspot WiFi network.', 'The access point bridges the customer to the MikroTik gateway.', 'MikroTik redirects the browser to the AROFi captive portal.', 'The customer buys a package or redeems a voucher.', 'AROFi confirms payment or redemption and prepares access.', 'MikroTik authenticates through RADIUS and opens the session.', 'Accounting updates keep usage, expiry and active sessions visible.'] },
      { type: 'table', headers: ['Component', 'Main responsibility'], rows: [['Access point', 'Wireless coverage and client connection'], ['MikroTik', 'HotSpot gateway, traffic control and session enforcement'], ['Captive portal', 'Package selection, payment and voucher redemption'], ['AROFi API', 'Business rules, payments, access, stock and reporting'], ['FreeRADIUS', 'Authentication and accounting'], ['Dashboard', 'Business operation, monitoring and reconciliation']] },
    ],
  },
  {
    slug: 'hardware',
    chapter: 'Chapter 3',
    title: 'Routers, access points and site design',
    summary: 'Understand which device performs each role before configuring the hotspot.',
    audience: 'Network operator',
    blocks: [
      { type: 'image', src: '/docs/router-ap-guide.svg', alt: 'Illustrated MikroTik router, indoor access point and outdoor access point', caption: 'The router controls access; access points provide coverage.' },
      { type: 'h2', text: 'MikroTik router' },
      { type: 'p', text: 'The MikroTik is the gateway between customers and the internet. It runs the HotSpot service, contacts RADIUS, applies speed and quota rules, and reports active sessions.' },
      { type: 'h2', text: 'Access points' },
      { type: 'p', text: 'Indoor and outdoor access points extend WiFi coverage. They should normally bridge customer traffic back to the MikroTik instead of running a separate captive portal.' },
      { type: 'ul', items: ['Use indoor ceiling or wall access points for rooms, shops and offices.', 'Use weather-resistant outdoor access points for compounds and open areas.', 'Plan channel use, mounting height, PoE power and surge protection.', 'Use one clear SSID strategy so customers reach the intended hotspot gateway.'] },
      { type: 'callout', tone: 'warning', title: 'Coverage is not capacity', text: 'A strong WiFi signal does not guarantee good service. Internet bandwidth, router capacity, interference and the number of clients must also be planned.' },
    ],
  },
  {
    slug: 'business-onboarding',
    chapter: 'Chapter 4',
    title: 'Create and prepare a business',
    summary: 'The minimum setup required before accepting the first production payment.',
    audience: 'Business owner',
    blocks: [
      { type: 'h2', text: 'Opening checklist' },
      { type: 'ol', items: ['Create the business workspace and complete the owner profile.', 'Set the business name, support phone, email and branding.', 'Select Starter or activate Pro.', 'Create packages and confirm the included Free Trial settings.', 'Register the MikroTik and run its generated setup scripts.', 'Open the captive portal from a real customer phone.', 'Test one low-value payment and one printed voucher.', 'Confirm the sale, wallet entry, session and report before opening publicly.'] },
      { type: 'h2', text: 'Business isolation' },
      { type: 'p', text: 'Each operator works inside a tenant workspace. Staff should only see the routers, packages, customers, vouchers and money that belong to the selected business.' },
      { type: 'callout', tone: 'warning', title: 'Use live credentials only after approval', text: 'Provider test wallets simulate transactions and must not be used to accept real customer money.' },
    ],
  },
  {
    slug: 'router-onboarding',
    chapter: 'Chapter 5',
    title: 'Connect a MikroTik router',
    summary: 'Register, provision, verify and remotely manage a hotspot router.',
    audience: 'Network operator',
    blocks: [
      { type: 'image', src: '/docs/router-ap-guide.svg', alt: 'MikroTik router and access point visual', caption: 'Register the gateway router first, then connect the access points that serve customers.' },
      { type: 'h2', text: 'Provisioning order' },
      { type: 'ol', items: ['Open Network and add the router with its correct site or location.', 'Connect to the router using WinBox.', 'Open New Terminal.', 'Paste the onboarding script generated for that router.', 'Run the remote-access script only when remote WinBox is required.', 'Return to AROFi and verify heartbeat, RADIUS and portal status.'] },
      { type: 'h2', text: 'Paid-session behaviour' },
      { type: 'p', text: 'Package expiry, quota exhaustion, explicit revocation and RADIUS disconnect are authoritative. Local idle settings should not unexpectedly end a still-valid paid package.' },
      { type: 'callout', tone: 'warning', title: 'Router scripts are secrets', text: 'Never publish generated scripts or tunnel credentials. Rotate them after accidental exposure in screenshots, logs or support messages.' },
    ],
  },
  {
    slug: 'packages',
    chapter: 'Chapter 6',
    title: 'Internet packages and status controls',
    summary: 'Create Internet, multi-device and Smart TV products with a compact professional management interface.',
    audience: 'Business owner',
    blocks: [
      { type: 'image', src: '/docs/package-controls.svg', alt: 'AROFi package management page with compact toggle switches', caption: 'Small status toggles keep package availability clear without dominating the page.' },
      { type: 'h2', text: 'Package types' },
      { type: 'table', headers: ['Type', 'Best use'], rows: [['Internet', 'Normal access for one customer device'], ['Multi-device', 'One purchase shared by the configured number of devices'], ['TV / Smart TV', 'Access linked to the television wireless MAC address'], ['Free Trial', 'Built-in trial that can be enabled, disabled and assigned a duration']] },
      { type: 'h2', text: 'Core fields' },
      { type: 'ul', items: ['Name and short code', 'Price in UGX', 'Duration', 'Optional data quota', 'Download and upload speed', 'Device limit', 'Active or inactive status', 'Portal visibility and featured status'] },
      { type: 'h2', text: 'Toggle meaning' },
      { type: 'p', text: 'Green means the package is active and available. Red means it is inactive. The control is intentionally small so the name, price, duration and device rules remain the primary information.' },
      { type: 'callout', tone: 'note', title: 'Free Trial', text: 'The platform provisions the Free Trial. A business adjusts its duration or availability instead of creating another trial package.' },
    ],
  },
  {
    slug: 'checkout',
    chapter: 'Chapter 7',
    title: 'Customer checkout and activation',
    summary: 'What happens from package selection to confirmed internet access.',
    audience: 'Business owner',
    blocks: [
      { type: 'image', src: '/docs/payment-flow.svg', alt: 'Five-step Mobile Money payment and activation flow', caption: 'The provider result, not the browser message alone, confirms the payment.' },
      { type: 'h2', text: 'Mobile Money flow' },
      { type: 'ol', items: ['The customer selects a package.', 'The customer enters an MTN or Airtel number.', 'AROFi routes the request through the active gateway.', 'The customer approves the phone prompt.', 'AROFi confirms the callback or status result.', 'RADIUS access is prepared and the internet session opens.'] },
      { type: 'h2', text: 'Card checkout' },
      { type: 'p', text: 'When ioTec Pay card collection is enabled for the live account, AROFi can open a hosted Visa or Mastercard checkout in UGX. Access is granted only after confirmation.' },
      { type: 'callout', tone: 'warning', title: 'Never activate from an unverified success screen', text: 'A browser can close, reload or display stale information. Provider callbacks and transaction status are the authoritative result.' },
    ],
  },
  {
    slug: 'vouchers',
    chapter: 'Chapter 8',
    title: 'Voucher batches, PDF printing and QR redemption',
    summary: 'Generate accountable stock, preview the printable document and trace every redemption.',
    audience: 'Business owner',
    blocks: [
      { type: 'image', src: '/docs/voucher-workflow.svg', alt: 'Voucher assignment, PDF preview, batch naming and QR redemption', caption: 'The printed voucher carries its agent and location, while the batch remains traceable in stock and sales reports.' },
      { type: 'h2', text: 'Issue a batch' },
      { type: 'ol', items: ['Choose Main / Owner stock or assign one accountable agent.', 'Select the internet package and quantity.', 'Choose uppercase, lowercase, mixed or numeric codes.', 'Choose the code length.', 'Set an optional expiry and review the batch.', 'Generate the PDF, keep the preview open, then download or share it.'] },
      { type: 'h2', text: 'Naming rule' },
      { type: 'code', title: 'Example', lines: ['Voucher-Enoch-Kansanga-Lite-AUGUST-0001'] },
      { type: 'p', text: 'New batch names contain the agent or owner, location, package, month and sequence. The physical voucher also prints the assigned agent and location.' },
      { type: 'h2', text: 'QR behaviour' },
      { type: 'p', text: 'The QR opens the hotspot login route with the voucher code. The portal reads and redeems the code. A real phone test on the actual MikroTik network is still required because DNS, walled-garden and captive-portal rules complete the path.' },
      { type: 'callout', tone: 'success', title: 'Revenue rule', text: 'Generating, assigning or printing vouchers moves inventory. Successful redemption records the sale and any agent commission.' },
    ],
  },
  {
    slug: 'agents',
    chapter: 'Chapter 9',
    title: 'Agents, locations and stock accountability',
    summary: 'Track who owns each voucher, where it is sold and what cash remains due.',
    audience: 'Business owner',
    blocks: [
      { type: 'image', src: '/docs/live-dashboard.svg', alt: 'Live voucher sales dashboard showing agents and locations', caption: 'Agent sales, stock, commission and location performance update in one operational view.' },
      { type: 'h2', text: 'Agent identity' },
      { type: 'p', text: 'An agent record contains a name, code, phone, territory or location, commission rate and status. Batches assigned to an agent stay linked through printing, redemption and reporting.' },
      { type: 'table', headers: ['Measure', 'Meaning'], rows: [['Assigned', 'All vouchers issued to the agent'], ['Available', 'Valid vouchers not yet redeemed'], ['Redeemed', 'Confirmed voucher sales'], ['Expired / voided', 'Stock that can no longer be sold'], ['Gross sales', 'Value of redeemed agent vouchers'], ['Commission', 'Agent earning calculated at redemption'], ['Cash due', 'Gross agent sales less commission and completed settlement coverage']] },
    ],
  },
  {
    slug: 'live-dashboard',
    chapter: 'Chapter 10',
    title: 'Live sales and stock dashboard',
    summary: 'Use recent redemptions, stock warnings and rankings without disturbing the main dashboard summary.',
    audience: 'Business owner',
    blocks: [
      { type: 'image', src: '/docs/live-dashboard.svg', alt: 'AROFi live voucher dashboard', caption: 'The voucher block appears below the existing top dashboard and leaves the main summary unchanged.' },
      { type: 'h2', text: 'What the block shows' },
      { type: 'ul', items: ['Voucher sales and redeemed count', 'Agent sales and active agent count', 'Cash accountability after commission and settlements', 'Available stock and stock value', 'Recent successful redemptions', 'Expiring, expired and voided stock alerts', 'Top agents and locations'] },
      { type: 'h2', text: 'Realtime state' },
      { type: 'p', text: 'Green Live indicates that the realtime event connection is open. Reconnecting indicates that live delivery is temporarily unavailable. Periodic refresh remains a fallback.' },
    ],
  },
  {
    slug: 'wallets',
    chapter: 'Chapter 11',
    title: 'Wallets, reserves and withdrawals',
    summary: 'Understand sale entries, reserved funds, approved payout numbers and disbursement status.',
    audience: 'Business owner',
    blocks: [
      { type: 'h2', text: 'Wallet movement' },
      { type: 'p', text: 'Completed sales create financial entries in the correct business or platform wallet. Pending withdrawals reserve funds to prevent the same balance from being withdrawn twice.' },
      { type: 'h2', text: 'Withdrawal flow' },
      { type: 'ol', items: ['Choose an approved MTN or Airtel payout number.', 'Enter the amount and withdrawal security information.', 'AROFi reserves the required balance.', 'The active gateway submits the disbursement.', 'A successful provider result completes the withdrawal.', 'A confirmed failure releases the reserve.'] },
      { type: 'callout', tone: 'warning', title: 'Automatic does not mean uncontrolled', text: 'Straight-through API withdrawals remain subject to live-wallet approval, sufficient balance, transaction limits, authentication and compliance controls.' },
    ],
  },
  {
    slug: 'gateways',
    chapter: 'Chapter 12',
    title: 'Payment gateways and production approval',
    summary: 'Select one live route for new collections and disbursements without changing old pending transactions.',
    audience: 'Platform administrator',
    blocks: [
      { type: 'image', src: '/docs/payment-flow.svg', alt: 'Payment gateway transaction flow', caption: 'The selected provider processes new requests while each pending transaction keeps its original provider identity.' },
      { type: 'table', headers: ['Gateway', 'AROFi use'], rows: [['Yo! Uganda', 'Mobile Money collection and disbursement when configured'], ['ioTec Pay', 'Mobile Money, disbursement and hosted card checkout when configured'], ['Direct MTN + Airtel', 'Routes each network through its direct API credentials']] },
      { type: 'p', text: 'Pesapal remains hidden from active gateway selection until its complete collection and payout requirements are approved for AROFi.' },
      { type: 'h2', text: 'Production requirements' },
      { type: 'ul', items: ['Approved live wallet and KYC', 'Production client credentials', 'Configured callback and webhook URLs', 'Webhook authentication secret', 'Sufficient wallet float where required', 'IP whitelisting when required by the provider', 'Tested collection, failure, reversal and disbursement flows'] },
      { type: 'callout', tone: 'warning', title: 'Rotate exposed secrets', text: 'Credentials shown in screenshots, chats, forwarded email or logs should be replaced before production use.' },
    ],
  },
  {
    slug: 'pricing',
    chapter: 'Chapter 13',
    title: 'Current public pricing and fees',
    summary: 'The handbook and public website use the same current plan values.',
    audience: 'Everyone',
    blocks: [
      { type: 'h2', text: 'Plan comparison' },
      { type: 'table', headers: ['Plan', 'Subscription', 'Gateway fee', 'Voucher fee'], rows: [['Starter', 'UGX 0', '3–8%', '2%'], ['Pro', 'UGX 20,000 / month', '3–5%', '0%']] },
      { type: 'h2', text: 'Starter includes' },
      { type: 'ul', items: ['Unlimited routers and hotspots', 'MTN MoMo and Airtel collection', 'Voucher sales and wallets', 'Cloud WinBox tunnels', 'Live sales dashboard', 'AROFi branding'] },
      { type: 'h2', text: 'Pro adds' },
      { type: 'ul', items: ['Lower Mobile Money fees', 'Zero voucher commission', 'Custom logo and colours', 'SMS alerts', 'Smart TV workflows', 'Router outage compensation alerts', '30-day analytics history', 'Priority support'] },
      { type: 'callout', tone: 'note', title: 'Gateway range', text: 'The exact percentage inside the published range depends on the active payment route and production provider arrangement. The Billing screen should show the applied plan and charge before activation.' },
    ],
  },
  {
    slug: 'reports',
    chapter: 'Chapter 14',
    title: 'Reports, filters and exports',
    summary: 'Reconcile voucher stock, agents, locations, packages and settlements with professional exports.',
    audience: 'Business owner',
    blocks: [
      { type: 'image', src: '/docs/reports-exports.svg', alt: 'AROFi voucher report with filters and exports', caption: 'The report keeps filters compact and separates summary figures from detailed rows.' },
      { type: 'h2', text: 'Available filters' },
      { type: 'ul', items: ['Main stock or agent stock', 'Specific agent', 'Location or territory', 'Package and batch', 'Date range', 'Available, redeemed, expiring, expired or voided', 'Settled or cash due'] },
      { type: 'h2', text: 'Exports' },
      { type: 'p', text: 'Voucher reporting supports CSV, Excel and PDF. The Excel workbook separates summary, agents, locations and recent sales so the data remains practical outside AROFi.' },
      { type: 'callout', tone: 'success', title: 'Report from confirmed events', text: 'Sales reports are based on confirmed payments or successful voucher redemptions, not merely generated vouchers or opened checkout pages.' },
    ],
  },
  {
    slug: 'public-pages',
    chapter: 'Chapter 15',
    title: 'Public pages, documentation and support',
    summary: 'Keep marketing claims, pricing, guides and support information aligned with production behaviour.',
    audience: 'Platform administrator',
    blocks: [
      { type: 'h2', text: 'Public information rule' },
      { type: 'p', text: 'The homepage, pricing section, FAQ, handbook, blog and support messages should describe the same current product. Avoid promising a provider feature before the live account and production flow are verified.' },
      { type: 'h2', text: 'Documentation design' },
      { type: 'ul', items: ['One visual page at a time', 'Permanent page number and chapter label', 'Searchable table of contents', 'Previous and next navigation', 'Keyboard arrows and touch drag navigation', 'Headings, ordered lists, unordered lists, tables, code examples and captions', 'Pictures for hardware, screens, controls and workflows'] },
      { type: 'callout', tone: 'note', title: 'Update together', text: 'When pricing, fees, providers or product limits change, update the application source, homepage and this handbook in the same release.' },
    ],
  },
  {
    slug: 'troubleshooting',
    chapter: 'Chapter 16',
    title: 'Troubleshooting and launch verification',
    summary: 'Diagnose the complete path instead of checking only the WiFi icon or browser screen.',
    audience: 'Network operator',
    blocks: [
      { type: 'h2', text: 'Customer paid but has no internet' },
      { type: 'ol', items: ['Confirm the provider transaction is completed.', 'Confirm the package or voucher redemption exists in AROFi.', 'Check that the router heartbeat is current.', 'Check RADIUS authentication and accounting.', 'Check the customer MAC address and active HotSpot session.', 'Check package expiry, quota and device limits.', 'Confirm DNS and walled-garden access to the captive portal.', 'Disconnect the stale session only after confirming the correct customer.'] },
      { type: 'h2', text: 'QR does not open or redeem' },
      { type: 'ul', items: ['Verify the printed QR contains the correct hotspot login URL.', 'Scan while connected to the actual hotspot WiFi.', 'Confirm the portal domain is allowed before authentication.', 'Confirm the voucher is available, valid and not expired.', 'Test manual code entry to separate QR scanning from redemption logic.'] },
      { type: 'h2', text: 'Production launch test' },
      { type: 'ol', items: ['Pay with MTN.', 'Pay with Airtel.', 'Redeem a typed voucher.', 'Scan a voucher QR.', 'Confirm one agent sale and commission.', 'Download PDF, Excel and CSV reports.', 'Submit and complete one controlled withdrawal.', 'Verify dashboard realtime updates and fallback refresh.'] },
      { type: 'callout', tone: 'warning', title: 'Do not declare success from code alone', text: 'A feature is production-ready only after deployment, service health, provider callbacks, MikroTik behaviour and a real end-to-end transaction have all been verified.' },
    ],
  },
]
