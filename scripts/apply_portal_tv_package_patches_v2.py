#!/usr/bin/env python3
"""Build-safe package-duration and Smart TV portal improvements.

Durations remain stored as minutes by the API. The admin UI accepts a number
plus minutes/hours/days/weeks. The portal receives a compact quick-access panel
and a permanent /portal/tv workflow using the existing MAC-bound voucher and
payment activation endpoints.

This patch runs after the unified and live gateway scripts. It accepts both the
original Mobile Money heading and the gateway-aware replacement, while treating
the live ioTec/Yo! Uganda radio selector as the required final settings UI.
"""

from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def read(path: str) -> str:
    return (ROOT / path).read_text(encoding="utf-8")


def write(path: str, text: str) -> None:
    (ROOT / path).write_text(text, encoding="utf-8")


def replace_once(path: str, old: str, new: str, sentinel: str | None = None) -> None:
    text = read(path)
    if sentinel and sentinel in text:
        return
    if new in text:
        return
    count = text.count(old)
    if count != 1:
        raise RuntimeError(f"{path}: expected one match, found {count}: {old[:160]!r}")
    write(path, text.replace(old, new, 1))


def replace_one_of(path: str, candidates: tuple[str, ...], new: str, sentinel: str) -> None:
    text = read(path)
    if sentinel in text or new in text:
        return
    matches = [candidate for candidate in candidates if candidate in text]
    if len(matches) != 1:
        previews = [candidate[:120] for candidate in candidates]
        raise RuntimeError(
            f"{path}: expected exactly one compatible source variant, found {len(matches)}: {previews!r}"
        )
    write(path, text.replace(matches[0], new, 1))


def replace_between(path: str, start: str, end: str, replacement: str, sentinel: str) -> None:
    text = read(path)
    if sentinel in text:
        return
    start_index = text.find(start)
    if start_index < 0:
        raise RuntimeError(f"{path}: start marker not found: {start!r}")
    end_index = text.find(end, start_index)
    if end_index < 0:
        raise RuntimeError(f"{path}: end marker not found: {end!r}")
    write(path, text[:start_index] + replacement + text[end_index:])


# ---------------------------------------------------------------------------
# Admin package form: value + unit, converted back to durationMinutes.
# ---------------------------------------------------------------------------
packages = "apps/admin-web/src/components/PackagesManagerImproved.tsx"
replace_once(
    packages,
    "import Modal from './Modal'",
    "import Modal from './Modal'\nimport { DurationInput } from './DurationInput'",
    "import { DurationInput } from './DurationInput'",
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
    "onChangeMinutes={(durationMinutes) => setForm",
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
    "onChangeMinutes={setTrialDuration}",
)


# ---------------------------------------------------------------------------
# Portal: permanent TV mode and compact quick actions.
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
    "tvOnly = false",
)
replace_once(
    portal,
    "  const [voucherTvMode, setVoucherTvMode] = useState(false)",
    "  const [voucherTvMode] = useState(tvOnly)",
    "useState(tvOnly)",
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
    "const freeTrialPackage = normalPackages.find",
)

quick_access = '''              <div className="mt-5 rounded-xl border border-slate-200 bg-white/80 p-3 shadow-sm">
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
                      Find it under the TV WiFi network details. After activation, disconnect and reconnect the TV to this same WiFi.
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

'''
replace_between(
    portal,
    '              <div className="mt-5 flex gap-2">',
    '              {activeActivation && (',
    quick_access,
    "Voucher, TV, previous purchase, or free trial.",
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
replace_one_of(
    portal,
    (
        """                  <p className={`mt-5 text-center text-sm ${resolvePortalTemplate(context?.tenant.portalTemplate) === 'midnight' ? 'text-slate-200' : 'text-slate-700'}`}>Select a package and pay with Mobile Money</p>""",
        """                  <p className={`mt-5 text-center text-sm ${resolvePortalTemplate(context?.tenant.portalTemplate) === 'midnight' ? 'text-slate-200' : 'text-slate-700'}`}>Select a package and choose a payment method</p>""",
    ),
    """                  <p className={`mt-5 text-center text-sm ${resolvePortalTemplate(context?.tenant.portalTemplate) === 'midnight' ? 'text-slate-200' : 'text-slate-700'}`}>
                    {tvOnly ? 'Choose a Smart TV package or use a voucher above' : 'Select a package and choose a payment method'}
                  </p>""",
    "Choose a Smart TV package or use a voucher above",
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
    "Enter the TV MAC address, pay from any phone",
)
replace_once(
    portal,
    "{multiDevicePackages.length > 0 && (",
    "{!tvOnly && multiDevicePackages.length > 0 && (",
)

portal_text = read(portal)
# Validate structural markers only. The text “Already bought? Find My Voucher”
# may legitimately remain in another recovery view and must not block a build.
for obsolete in [
    "Connect this voucher to a Smart TV",
    "setVoucherTvMode(",
]:
    if obsolete in portal_text:
        raise RuntimeError(f"PortalCheckout still contains obsolete UI: {obsolete}")
for required in [
    "Choose a Smart TV package or use a voucher above",
    "Select a package and choose a payment method",
    "paidNormalPackages.map(renderPackageButton)",
]:
    if required not in portal_text:
        raise RuntimeError(f"PortalCheckout missing required final marker: {required}")
write(portal, portal_text)

# The live gateway script runs before this file and replaces the old dropdown
# with the final ioTec/Yo! Uganda radio selector, readiness cards, callback URLs,
# save flow, and live test button. Verify that final UI instead of rewriting it.
settings = "apps/admin-web/src/components/SettingsManager.tsx"
settings_text = read(settings)
for required in [
    'name="paymentGateway"',
    "(['IOTEC_PAY', 'YO_UGANDA'] as const)",
    "Callback URLs to register with",
    "Test active gateway",
]:
    if required not in settings_text:
        raise RuntimeError(f"SettingsManager missing live payment gateway control: {required}")

print('Build-safe package duration and Smart TV portal patches applied.')
