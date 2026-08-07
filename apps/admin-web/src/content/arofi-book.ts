export type BookBlock =
  | { type: 'p'; text: string }
  | { type: 'h2'; text: string }
  | { type: 'h3'; text: string }
  | { type: 'ul'; items: string[] }
  | { type: 'ol'; items: string[] }
  | { type: 'callout'; tone: 'note' | 'success' | 'warning'; title: string; text: string }
  | { type: 'table'; headers: string[]; rows: string[][] }
  | { type: 'code'; title?: string; lines: string[] }

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
    title: 'Welcome to AROFi',
    summary: 'What AROFi does, who it is for, and the operating model behind the platform.',
    audience: 'Everyone',
    blocks: [
      { type: 'p', text: 'AROFi is a WiFi hotspot billing and operations platform for businesses that sell internet access through MikroTik routers. It brings packages, Mobile Money, vouchers, customer access, router visibility, agent accountability, wallets and reports into one workspace.' },
      { type: 'h2', text: 'Core operating principle' },
      { type: 'p', text: 'AROFi separates stock, payment, access and accounting. A package defines the service. A payment or voucher redemption creates the sale. RADIUS and MikroTik enforce the customer session. The wallet and reports record the financial result.' },
      { type: 'ul', items: ['Businesses manage only their own routers, customers, vouchers and money.', 'Customers buy a package or redeem a voucher from the captive portal.', 'Agents can receive accountable voucher stock by name and location.', 'Platform administrators control global fees, payment routing, limits and compliance.', 'Generating or printing a voucher is stock movement, not revenue. Redemption records the sale.'] },
      { type: 'callout', tone: 'success', title: 'Single source of truth', text: 'This handbook replaces the old public documentation. Product behaviour described here follows the current AROFi application and should be updated whenever the product changes.' },
    ],
  },
  {
    slug: 'platform-map',
    chapter: 'Chapter 2',
    title: 'Platform map',
    summary: 'How the customer portal, dashboard, API, database, RADIUS and MikroTik work together.',
    audience: 'Everyone',
    blocks: [
      { type: 'h2', text: 'The request path' },
      { type: 'ol', items: ['A customer joins the hotspot SSID.', 'MikroTik redirects the device to the AROFi captive portal.', 'The customer selects a package, pays, or enters a voucher.', 'AROFi confirms the transaction and creates or updates access credentials.', 'MikroTik authenticates through RADIUS and opens internet access.', 'Accounting updates keep active sessions, usage and expiry visible in the dashboard.'] },
      { type: 'h2', text: 'Main components' },
      { type: 'table', headers: ['Component', 'Responsibility'], rows: [['Business dashboard', 'Packages, routers, vouchers, customers, wallets, reports and settings'], ['Captive portal', 'Package selection, Mobile Money or card checkout, voucher redemption and Smart TV flow'], ['API', 'Business rules, payments, access, reporting and audit records'], ['PostgreSQL', 'Tenants, packages, transactions, vouchers, sessions, wallets and settings'], ['FreeRADIUS', 'Authentication and accounting between AROFi and MikroTik'], ['MikroTik', 'Captive portal, active sessions, traffic control and customer connectivity']] },
      { type: 'callout', tone: 'note', title: 'Availability', text: 'Payment methods and provider features appear only when the selected gateway is configured and approved for production.' },
    ],
  },
  {
    slug: 'business-onboarding',
    chapter: 'Chapter 3',
    title: 'Create and prepare a business',
    summary: 'The minimum setup required before the first customer connects.',
    audience: 'Business owner',
    blocks: [
      { type: 'h2', text: 'Preparation checklist' },
      { type: 'ol', items: ['Create the business workspace and complete the owner profile.', 'Confirm the business name, support phone, email and branding.', 'Choose Starter or activate Pro.', 'Create internet packages and review the included Free Trial.', 'Register the MikroTik router and run its current onboarding script.', 'Confirm the captive portal opens from a test phone.', 'Test one low-value payment and one voucher before opening to customers.'] },
      { type: 'h2', text: 'Workspace isolation' },
      { type: 'p', text: 'Each business operates inside a tenant workspace. Business users should never enter platform credentials, payment secrets or router secrets in public notes, screenshots or support messages.' },
      { type: 'callout', tone: 'warning', title: 'Before going live', text: 'Do not accept production money through a provider test wallet. Use approved live credentials and complete the provider callback tests first.' },
    ],
  },
  {
    slug: 'router-onboarding',
    chapter: 'Chapter 4',
    title: 'Connect a MikroTik router',
    summary: 'Register, provision, verify and remotely manage a hotspot router.',
    audience: 'Network operator',
    blocks: [
      { type: 'h2', text: 'Register the router' },
      { type: 'p', text: 'Open Network → Routers, register the device, identify its site, and use the scripts generated for that exact router. Scripts contain router-specific credentials and should not be reused on another device.' },
      { type: 'h2', text: 'Run scripts in order' },
      { type: 'ol', items: ['Connect to the MikroTik with WinBox.', 'Open New Terminal.', 'Paste the onboarding script and wait for completion.', 'Paste the remote-access script when remote WinBox is required.', 'Return to AROFi and confirm heartbeat, RADIUS and portal status.'] },
      { type: 'h2', text: 'Persistent paid sessions' },
      { type: 'p', text: 'AROFi provisioning removes local idle and keepalive cut-offs that could end a paid session while its package is still active. Package expiry, quota exhaustion, explicit revocation and RADIUS disconnect remain authoritative.' },
      { type: 'callout', tone: 'warning', title: 'Never publish scripts', text: 'Router scripts and tunnel credentials are secrets. Rotate them if they appear in a public screenshot or shared log.' },
    ],
  },
  {
    slug: 'packages',
    chapter: 'Chapter 5',
    title: 'Packages and access products',
    summary: 'Internet, multi-device, Smart TV and Free Trial package behaviour.',
    audience: 'Business owner',
    blocks: [
      { type: 'h2', text: 'Package types' },
      { type: 'table', headers: ['Type', 'Use'], rows: [['Internet', 'Standard access for one device'], ['Multi-device', 'One purchase shared by the configured number of devices'], ['TV / Smart TV', 'Access bound to a television wireless MAC address'], ['Free Trial', 'Built-in trial package that can be enabled, disabled and assigned a duration']] },
      { type: 'h2', text: 'Package fields' },
      { type: 'ul', items: ['Name and code', 'Price in UGX', 'Duration', 'Optional data limit', 'Download and upload speed', 'Device limit', 'Active status and portal visibility'] },
      { type: 'callout', tone: 'note', title: 'Free Trial', text: 'The Free Trial is provisioned by the platform. A business can switch it on or off and adjust its duration; it is not created as a normal paid package.' },
    ],
  },
  {
    slug: 'customer-checkout',
    chapter: 'Chapter 6',
    title: 'Customer checkout and activation',
    summary: 'What happens from package selection to internet access.',
    audience: 'Business owner',
    blocks: [
      { type: 'h2', text: 'Mobile Money flow' },
      { type: 'ol', items: ['Customer selects a package.', 'Customer enters an MTN or Airtel number.', 'AROFi sends the request through the gateway selected by Platform Admin.', 'The customer approves the prompt.', 'AROFi verifies the provider result.', 'Access is activated and the browser leaves the payment screen.'] },
      { type: 'h2', text: 'Card checkout' },
      { type: 'p', text: 'When ioTec Pay is selected and card collection is configured, AROFi can offer a hosted Visa or Mastercard checkout in UGX. Internet access is granted only after the transaction is confirmed.' },
      { type: 'callout', tone: 'warning', title: 'Do not trust the browser alone', text: 'A success screen is not the financial authority. Provider status and callbacks determine whether the transaction is completed.' },
    ],
  },
  {
    slug: 'vouchers',
    chapter: 'Chapter 7',
    title: 'Vouchers and QR codes',
    summary: 'Generate, preview, print, share and redeem accountable voucher stock.',
    audience: 'Business owner',
    blocks: [
      { type: 'h2', text: 'Issue a batch' },
      { type: 'ol', items: ['Choose Main / Owner stock or assign the batch to an agent.', 'Select the package and number of vouchers.', 'Choose code length and character format.', 'Set an optional expiry and review the batch.', 'Generate, preview, download or share the PDF.'] },
      { type: 'h2', text: 'Code and price rules' },
      { type: 'ul', items: ['Voucher value is taken from the selected package price.', 'Codes can use uppercase, lowercase, mixed characters or numbers.', 'The printed document identifies the assigned agent and location.', 'Friendly batch names include owner or agent, location, package, month and sequence.', 'A voucher is sold only when it is successfully redeemed.'] },
      { type: 'h2', text: 'QR redemption' },
      { type: 'p', text: 'The QR opens the hotspot login route with the voucher code. The portal reads the code and attempts redemption. A live phone test on the real MikroTik network is still required because local DNS, walled-garden rules and captive-portal behaviour are part of the complete path.' },
      { type: 'callout', tone: 'success', title: 'Accounting rule', text: 'Generation, printing and assignment are inventory events. Successful redemption records the sale, revenue and agent commission.' },
    ],
  },
  {
    slug: 'agents',
    chapter: 'Chapter 8',
    title: 'Agents, stock and locations',
    summary: 'Issue traceable stock and reconcile every agent and territory.',
    audience: 'Business owner',
    blocks: [
      { type: 'h2', text: 'Agent accountability' },
      { type: 'p', text: 'An agent has a code, name, phone, territory or location, commission rate and status. Voucher batches assigned to an agent remain traceable to that agent in stock, redemption and commission reports.' },
      { type: 'h2', text: 'Key measures' },
      { type: 'table', headers: ['Measure', 'Meaning'], rows: [['Assigned', 'All vouchers issued to the agent'], ['Available', 'Unredeemed and valid stock'], ['Redeemed', 'Confirmed voucher sales'], ['Expired / voided', 'Stock that can no longer be sold'], ['Gross sales', 'Value of redeemed agent vouchers'], ['Commission', 'Agent earning calculated at redemption'], ['Cash due', 'Gross agent sales less commission and completed settlement coverage']] },
      { type: 'h2', text: 'Live dashboard' },
      { type: 'p', text: 'The business dashboard shows recent voucher redemptions, top agents, top locations, stock value, expiring stock and cash accountability. The green Live state represents an open realtime event connection; polling remains a fallback.' },
    ],
  },
  {
    slug: 'wallets',
    chapter: 'Chapter 9',
    title: 'Wallets and withdrawals',
    summary: 'Understand balances, reserves, payout numbers and withdrawal processing.',
    audience: 'Business owner',
    blocks: [
      { type: 'h2', text: 'Wallet records' },
      { type: 'p', text: 'Completed sales post financial entries to the appropriate business or platform wallet. Pending withdrawals reserve funds so the same balance cannot be withdrawn twice.' },
      { type: 'h2', text: 'Withdrawal flow' },
      { type: 'ol', items: ['Choose an approved payout number.', 'Enter the amount and withdrawal security information.', 'AROFi reserves the required balance.', 'The active payment gateway processes the disbursement.', 'A successful callback completes the withdrawal.', 'A confirmed failure releases the reserved amount.'] },
      { type: 'callout', tone: 'warning', title: 'Provider approval', text: 'Automatic API disbursement still depends on the provider account, wallet balance, limits, KYC and production permissions.' },
    ],
  },
  {
    slug: 'payment-gateways',
    chapter: 'Chapter 10',
    title: 'Payment gateways',
    summary: 'How Platform Admin selects one route for new collections and disbursements.',
    audience: 'Platform administrator',
    blocks: [
      { type: 'h2', text: 'Visible gateway choices' },
      { type: 'table', headers: ['Gateway', 'Use'], rows: [['Yo! Uganda', 'Mobile Money collections and disbursements when configured'], ['ioTec Pay', 'Mobile Money collections, disbursements and hosted UGX card checkout when configured'], ['Direct MTN + Airtel', 'Routes MTN numbers to MTN APIs and Airtel numbers to Airtel APIs']] },
      { type: 'p', text: 'Pesapal remains hidden from Platform Admin selection until its complete AROFi capability and payout requirements are approved.' },
      { type: 'h2', text: 'Safe switching' },
      { type: 'p', text: 'The selected global gateway applies to new package payments, subscription activation, SMS purchases, wallet top-ups and withdrawals. Existing pending transactions keep the provider that created them.' },
      { type: 'callout', tone: 'warning', title: 'Secrets', text: 'Store provider credentials only in the deployment secret store. Rotate any credential exposed in chat, email forwarding, screenshots, logs or source control.' },
    ],
  },
  {
    slug: 'operations',
    chapter: 'Chapter 11',
    title: 'Live operations',
    summary: 'Monitor routers, sessions, sales and exceptions without manual refreshing.',
    audience: 'Network operator',
    blocks: [
      { type: 'h2', text: 'Operational views' },
      { type: 'ul', items: ['Router heartbeat and online state', 'Active hotspot users and session changes', 'Package activations and expiries', 'Payment completion and failure', 'Voucher redemption', 'Disconnect requests and results', 'Stock and cash-accountability alerts'] },
      { type: 'h2', text: 'Realtime behaviour' },
      { type: 'p', text: 'The dashboard uses server-sent events for immediate updates and periodic requests as fallback. A new voucher redemption publishes a realtime event after the sale transaction is committed.' },
      { type: 'callout', tone: 'note', title: 'WiFi connected is not internet authorised', text: 'A device may remain associated with the WiFi radio while its hotspot session is unauthorised. Check MikroTik active users, RADIUS status, package expiry and accounting—not only the WiFi icon.' },
    ],
  },
  {
    slug: 'reports',
    chapter: 'Chapter 12',
    title: 'Reports and exports',
    summary: 'Filter, reconcile and export business activity.',
    audience: 'Business owner',
    blocks: [
      { type: 'h2', text: 'Voucher reporting' },
      { type: 'ul', items: ['Main versus agent stock', 'Agent and location', 'Package and batch', 'Date range', 'Available, expiring, expired and voided stock', 'Gross sales, fees, net sales, commission and cash due'] },
      { type: 'h2', text: 'Exports' },
      { type: 'p', text: 'Voucher reporting supports CSV, Excel and PDF outputs. Dashboard exports use the currently selected date period, while the full report supports deeper filters.' },
      { type: 'h2', text: 'Reconciliation sequence' },
      { type: 'ol', items: ['Confirm the report period.', 'Reconcile completed payments against provider records.', 'Reconcile redeemed vouchers against assigned stock.', 'Review commissions, settlements and cash due.', 'Investigate expired, voided or unmatched items.', 'Export and retain the final report.'] },
    ],
  },
  {
    slug: 'pricing',
    chapter: 'Chapter 13',
    title: 'Plans and pricing',
    summary: 'Starter and Pro subscription structure and default transaction rates.',
    audience: 'Everyone',
    blocks: [
      { type: 'table', headers: ['Plan', 'Subscription', 'Default Mobile Money fee', 'Default voucher fee'], rows: [['Starter', 'UGX 0', '8%', '2%'], ['Pro', 'UGX 20,000 / 30 days', '4%', '0%']] },
      { type: 'h2', text: 'Starter' },
      { type: 'ul', items: ['Unlimited routers and hotspots', 'Mobile Money collection when a gateway is configured', 'Voucher sales and wallets', 'Cloud WinBox tunnels', 'Live sales dashboard', 'AROFi branding'] },
      { type: 'h2', text: 'Pro' },
      { type: 'ul', items: ['Everything in Starter', 'Lower default Mobile Money fee', 'Zero voucher commission', 'Custom branding', '100 SMS per month included', 'Additional SMS purchases', 'Outage compensation alerts', '30-day analytics history', 'Priority support'] },
      { type: 'callout', tone: 'note', title: 'Rates are configurable', text: 'The values above are current platform defaults. Platform Admin can change plan rates, and the application reads the configured values live.' },
    ],
  },
  {
    slug: 'security',
    chapter: 'Chapter 14',
    title: 'Security and compliance',
    summary: 'Protect credentials, money, customer data and production infrastructure.',
    audience: 'Everyone',
    blocks: [
      { type: 'h2', text: 'Minimum controls' },
      { type: 'ul', items: ['Use unique administrator accounts and strong passwords.', 'Keep payment, JWT, RADIUS, router and webhook secrets in Coolify environment variables.', 'Rotate any secret that appears outside the secret store.', 'Restrict staff permissions to their responsibilities.', 'Approve payout numbers and verify business KYC.', 'Keep database and file backups outside the application server.', 'Review failed payments, withdrawal reversals and unusual voucher activity.'] },
      { type: 'h2', text: 'Webhook verification' },
      { type: 'p', text: 'Collection and disbursement callbacks must be authenticated using the configured provider mechanism or webhook secret. Production should reject unauthorised callbacks.' },
      { type: 'callout', tone: 'warning', title: 'Never send private keys in chat', text: 'Use a secure secret manager or controlled administrative session. Exposed SSH keys and payment secrets must be revoked and replaced.' },
    ],
  },
  {
    slug: 'troubleshooting',
    chapter: 'Chapter 15',
    title: 'Troubleshooting',
    summary: 'A systematic path for payment, portal, router, session and deployment failures.',
    audience: 'Network operator',
    blocks: [
      { type: 'h2', text: 'Customer paid but is not connected' },
      { type: 'ol', items: ['Confirm the payment is completed in AROFi.', 'Confirm a package activation was created.', 'Check the device MAC address and current MikroTik active users.', 'Check RADIUS authentication and accounting.', 'Confirm the router is online and using the current provisioning configuration.', 'Reconnect the device once if its previous hotspot session was already removed.'] },
      { type: 'h2', text: 'Connected to WiFi but no internet' },
      { type: 'ul', items: ['Confirm the package has not expired and quota remains.', 'Check that the hotspot session is authorised.', 'Check upstream internet and DNS from the router.', 'Confirm local hotspot profile timeouts are not ending paid access.', 'Review disconnect and accounting events.'] },
      { type: 'h2', text: 'Deployment fails' },
      { type: 'ol', items: ['Open the newest Coolify deployment log.', 'Find the final fatal command—not earlier warnings.', 'Separate compile, image export, database health and container startup failures.', 'Fix the exact stage and deploy the new commit.', 'Confirm API, Admin, Portal, PostgreSQL, FreeRADIUS and nginx health after startup.'] },
    ],
  },
  {
    slug: 'glossary',
    chapter: 'Chapter 16',
    title: 'Glossary',
    summary: 'Common terms used throughout AROFi.',
    audience: 'Everyone',
    blocks: [
      { type: 'table', headers: ['Term', 'Meaning'], rows: [['Activation', 'A customer entitlement created after payment or valid redemption'], ['Agent', 'A person accountable for assigned voucher stock'], ['Batch', 'A generated group of vouchers'], ['Captive portal', 'The customer page shown before internet access'], ['Collection', 'Money received from a customer'], ['Disbursement', 'Money sent from a wallet to a payout number'], ['Heartbeat', 'Regular router status update'], ['RADIUS', 'Authentication and accounting service used by MikroTik'], ['Redemption', 'Successful use of a voucher; this records the voucher sale'], ['Settlement', 'A completed accounting period or cash reconciliation'], ['Tenant', 'An isolated AROFi business workspace'], ['Walled garden', 'Destinations permitted before hotspot authentication']] },
    ],
  },
]

export const arofiBookBySlug = Object.fromEntries(arofiBook.map((page) => [page.slug, page])) as Record<string, BookPage>
