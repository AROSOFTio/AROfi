#!/usr/bin/env python3
"""Apply the package-duration and Smart TV portal UX improvements.

The database and API continue storing durationMinutes. The admin form now lets
operators enter a value and choose minutes/hours/days/weeks, then converts the
selection to minutes before saving. The portal gets a compact quick-access area
and a permanent /portal/tv route that reuses the existing MAC-bound voucher and
payment activation flow.
"""

from pathlib import Path
import re

ROOT = Path(__file__).resolve().parents[1]


def read(path: str) -> str:
    return (ROOT / path).read_text()


def write(path: str, text: str) -> None:
    (ROOT / path).write_text(text)


def replace_once(path: str, old: str, new: str, *, sentinel: str | None = None) -> None:
    text = read(path)
    if sentinel and sentinel in text:
        return
    if new in text:
        return
    count = text.count(old)
    if count != 1:
        raise RuntimeError(f"{path}: expected one match, found {count}: {old[:160]!r}")
    write(path, text.replace(old, new, 1))


def regex_once(path: str, pattern: str, replacement: str, *, sentinel: str | None = None) -> None:
    text = read(path)
    if sentinel and sentinel in text:
        return
    updated, count = re.subn(pattern, replacement, text, count=1, flags=re.S)
    if count != 1:
        raise RuntimeError(f"{path}: expected one regex match, found {count}: {pattern[:160]!r}")
    write(path, updated)


# ---------------------------------------------------------------------------
# Admin package form: human duration value + selectable unit.
# ---------------------------------------------------------------------------
packages = "apps/admin-web/src/components/PackagesManagerImproved.tsx"
replace_once(
    packages,
    "import Modal from './Modal'",
    "import Modal from './Modal'\nimport { DurationInput } from './DurationInput'",
    sentinel="import { DurationInput } from './DurationInput'",
)
replace_once(
    packages,
    """                <div className="form-group"><label className="form-label">Duration (minutes)</label><input className="form-input" type="number" min={1} value={form.durationMinutes} onChange={(event) => setForm((current) => ({ ...current, durationMinutes: event.target.value }))} required /></div>""",
    """                <div className="form-group">
                  <label className="form-label">Duration</label>
                  <DurationInput
                    valueMinutes={form.durationMinutes}
                    onChangeMinutes={(durationMinutes) => setForm((current) => ({ ...current, durationMinutes }))}
                    inputClassName="form-input"
                    selectClassName="form-input"
                  />
                </div>""",
    sentinel="onChangeMinutes={(durationMinutes) => setForm",
)
replace_once(
    packages,
    """          <div className="form-group">
            <label className="form-label">Duration (minutes)</label>
            <input className="form-input" type="number" min={1} value={trialDuration} onChange={(event) => setTrialDuration(event.target.value)} required />
          </div>""",
    """          <div className="form-group">
            <label className="form-label">Trial duration</label>
            <DurationInput
              valueMinutes={trialDuration}
              onChangeMinutes={setTrialDuration}
              inputClassName="form-input"
              selectClassName="form-input"
            />
          </div>""",
    sentinel="onChangeMinutes={setTrialDuration}",
)

# ---------------------------------------------------------------------------
# Customer portal: compact quick actions and dedicated Smart TV mode.
# ---------------------------------------------------------------------------
portal = "apps/portal-web/src/components/PortalCheckout.tsx"
replace_once(
    portal,
    "export default function PortalCheckout({ initialView = 'home' }: { initialView?: PortalView }) {",
    """export default function PortalCheckout({
  initialView = 'home',
  tvOnly = false,
}: {
  initialView?: PortalView
  tvOnly?: boolean
}) {""",
    sentinel="tvOnly = false",
)
replace_once(
    portal,
    "  const [voucherTvMode, setVoucherTvMode] = useState(false)",
    "  const [voucherTvMode] = useState(tvOnly)",
    sentinel="useState(tvOnly)",
)
replace_once(
    portal,
    """  const normalPackages = (context?.packages ?? []).filter((pkg) => !isTvPackage(pkg) && !isMultiDevicePackage(pkg))
  const smartTvPackages = (context?.packages ?? []).filter((pkg) => isTvPackage(pkg))
  const multiDevicePackages = (context?.packages ?? []).filter((pkg) => !isTvPackage(pkg) && isMultiDevicePackage(pkg))""",
    """  const normalPackages = (context?.packages ?? []).filter((pkg) => !isTvPackage(pkg) && !isMultiDevicePackage(pkg))
  const freeTrialPackage = normalPackages.find(
    (pkg) => Boolean(pkg.isTrialEnabled) || pkg.amountUgx <= 0 || /trial/i.test(pkg.name),
  )
  const paidNormalPackages = normalPackages.filter((pkg) => pkg.id !== freeTrialPackage?.id)
  const smartTvPackages = (context?.packages ?? []).filter((pkg) => isTvPackage(pkg))
  const multiDevicePackages = (context?.packages ?? []).filter((pkg) => !isTvPackage(pkg) && isMultiDevicePackage(pkg))""",
    sentinel="const freeTrialPackage = normalPackages.find",
)

quick_access = r'''              <div className="mt-5 rounded-xl border border-slate-200 bg-white/80 p-3 shadow-sm">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="text-sm font-extrabold text-slate-900">{tvOnly ? 'Connect a Smart TV' : 'Quick access'}</div>
                    <div className="mt-0.5 text-xs text-slate-500">
                      {tvOnly ? 'Enter a TV voucher or choose a TV package below.' : 'Voucher, TV, previous purchase, or free trial.'}
                    </div>
                  </div>
                  {tvOnly && (
                    <Link href="/" className={`rounded-lg border px-3 py-2 text-xs font-bold ${portalStyle.link}`}>
                      Back
                    </Link>
                  )}
                </div>

                <div className="mt-3 flex gap-2">
                  <input
                    value={voucherCode}
                    onChange={(event) => setVoucherCode(event.target.value)}
                    placeholder={tvOnly ? 'Enter TV voucher code' : 'Enter voucher code'}
                    className={`min-w-0 flex-1 rounded-lg border px-4 py-3 text-sm outline-none ${portalStyle.input}`}
                  />
                  <button
                    type="button"
                    onClick={() => void handleVoucherRedeem()}
                    disabled={isVoucherLoading}
                    className={`rounded-lg px-4 py-3 text-sm font-bold ${portalStyle.button}`}
                  >
                    {isVoucherLoading ? 'Connecting…' : 'Connect'}
                  </button>
                </div>

                {tvOnly && (
                  <div className="mt-3">
                    <label className="block text-xs font-bold text-slate-700">TV wireless MAC address</label>
                    <input
                      value={tvMacAddress}
                      onChange={(event) => setTvMacAddress(formatMacInput(event.target.value))}
                      placeholder="AA:BB:CC:DD:EE:FF"
                      inputMode="text"
                      className={`mt-1 w-full rounded-lg border px-4 py-3 text-sm font-semibold tracking-wide outline-none ${portalStyle.input}`}
                    />
                    <p className="mt-1 text-[11px] leading-5 text-slate-500">
                      Find it on the TV under WiFi network details. After activation, disconnect and reconnect the TV to this same WiFi.
                    </p>
                  </div>
                )}

                {!tvOnly && (
                  <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
                    <Link
                      href={`/tv${context?.tenant.domain || hotspotParams.tenantDomain ? `?tenantDomain=${encodeURIComponent(context?.tenant.domain || hotspotParams.tenantDomain)}` : ''}`}
                      className={`flex items-center justify-center gap-2 rounded-lg border px-3 py-2.5 text-xs font-bold ${portalStyle.link}`}
                    >
                      <Wifi className="h-3.5 w-3.5" /> Connect TV
                    </Link>
                    <Link href="/login" className={`flex items-center justify-center gap-2 rounded-lg border px-3 py-2.5 text-xs font-bold ${portalStyle.link}`}>
                      <LogIn className="h-3.5 w-3.5" /> Find purchase
                    </Link>
                    {freeTrialPackage && (
                      <button
                        type="button"
                        onClick={() => void handleTrialStart(freeTrialPackage)}
                        disabled={isPaymentLoading}
                        className={`col-span-2 flex items-center justify-center gap-2 rounded-lg border px-3 py-2.5 text-xs font-bold sm:col-span-1 ${portalStyle.link}`}
                      >
                        <Ticket className="h-3.5 w-3.5" /> Try free
                      </button>
                    )}
                  </div>
                )}
              </div>

              {activeActivation && ('''

regex_once(
    portal,
    r'''              <div className="mt-5 flex gap-2">.*?              \)\}\n\n              \{activeActivation && \(''',
    quick_access,
    sentinel="Voucher, TV, previous purchase, or free trial.",
)
replace_once(
    portal,
    """              <Link href="/login" className={`mx-auto mt-4 flex w-fit items-center gap-2 rounded-md border px-4 py-2 text-xs font-medium ${portalStyle.link}`}>
                <LogIn className="h-3 w-3" />
                Already bought? Find My Voucher
              </Link>

""",
    "",
)
replace_once(
    portal,
    "{(!activeActivation || showMorePackages) && (",
    "{(tvOnly || !activeActivation || showMorePackages) && (",
)
replace_once(
    portal,
    """                  <p className={`mt-5 text-center text-sm ${resolvePortalTemplate(context?.tenant.portalTemplate) === 'midnight' ? 'text-slate-200' : 'text-slate-700'}`}>Select a package and pay with Mobile Money</p>""",
    """                  <p className={`mt-5 text-center text-sm ${resolvePortalTemplate(context?.tenant.portalTemplate) === 'midnight' ? 'text-slate-200' : 'text-slate-700'}`}>
                    {tvOnly ? 'Choose a Smart TV package or use a voucher above' : 'Select a package and pay with Mobile Money'}
                  </p>""",
    sentinel="Choose a Smart TV package or use a voucher above",
)
replace_once(
    portal,
    "                {normalPackages.map(renderPackageButton)}",
    "                {!tvOnly && paidNormalPackages.map(renderPackageButton)}",
)
replace_once(
    portal,
    """                  <p className={`mt-6 text-center text-sm font-semibold ${resolvePortalTemplate(context?.tenant.portalTemplate) === 'midnight' ? 'text-slate-200' : 'text-slate-700'}`}>Smart TV connection</p>
                  <p className={`mx-auto mt-1 max-w-sm text-center text-xs ${resolvePortalTemplate(context?.tenant.portalTemplate) === 'midnight' ? 'text-slate-300' : 'text-slate-500'}`}>
                    Select a TV package, enter the TV wireless MAC address, pay by phone, then select this WiFi on the TV.
                  </p>""",
    """                  <p className={`mt-6 text-center text-sm font-semibold ${resolvePortalTemplate(context?.tenant.portalTemplate) === 'midnight' ? 'text-slate-200' : 'text-slate-700'}`}>
                    {tvOnly ? 'Smart TV packages' : 'Smart TV connection'}
                  </p>
                  <p className={`mx-auto mt-1 max-w-sm text-center text-xs ${resolvePortalTemplate(context?.tenant.portalTemplate) === 'midnight' ? 'text-slate-300' : 'text-slate-500'}`}>
                    Enter the TV MAC address, pay from any phone, then reconnect the TV to this WiFi.
                  </p>""",
    sentinel="Enter the TV MAC address, pay from any phone",
)
replace_once(
    portal,
    "{multiDevicePackages.length > 0 && (",
    "{!tvOnly && multiDevicePackages.length > 0 && (",
)

# Guard against accidental remnants of the old scattered TV checkbox.
text = read(portal)
if "Connect this voucher to a Smart TV" in text:
    raise RuntimeError("PortalCheckout still contains the old Smart TV checkbox")
if "Already bought? Find My Voucher" in text:
    raise RuntimeError("PortalCheckout still contains the old scattered purchase link")
write(portal, text)

print('Package duration units and Smart TV portal patches applied.')
