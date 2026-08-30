#!/usr/bin/env python3
"""Lock the premium flat AROFi captive portal presentation.

The portal must stay visually strong on small phones while preserving all payment,
voucher, Smart TV, trial, reconnect, and same-business roaming behavior.

Design invariants:
- flat white/blue presentation with no gradients;
- wider mobile canvas with reduced side padding;
- larger package cards with clear duration, price, and BUY affordance;
- Smart TV and returning-customer actions share one row;
- wording stays explicit: "Already bought? Find My Voucher" and
  "Connect Smart TV";
- the patch is idempotent and runs late in the production source pipeline so
  earlier compatibility patches cannot silently restore the old compact UI.
"""

from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
PORTAL = ROOT / "apps/portal-web/src/components/PortalCheckout.tsx"


def replace_once(text: str, before: str, after: str, label: str) -> str:
    if after in text:
        return text
    count = text.count(before)
    if count != 1:
        raise RuntimeError(f"Premium portal UI patch rejected: {label} expected 1 match, found {count}")
    return text.replace(before, after, 1)


def replace_all_identical(text: str, before: str, after: str, label: str) -> str:
    if before not in text:
        if after in text:
            return text
        raise RuntimeError(f"Premium portal UI patch rejected: {label} found no source or final token")
    return text.replace(before, after)


def main() -> None:
    if not PORTAL.exists():
        raise RuntimeError("Premium portal UI patch rejected: PortalCheckout.tsx is missing")

    text = PORTAL.read_text(encoding="utf-8")

    text = replace_once(
        text,
        "import { ArrowRight, Check, Copy, Loader2, LogIn, Share2, Ticket, Wifi } from 'lucide-react'",
        "import { ArrowRight, CalendarDays, Check, Clock3, Copy, Loader2, LogIn, Share2, Ticket, Tv, Wifi } from 'lucide-react'",
        "premium portal icons",
    )

    text = replace_once(
        text,
        "shell: 'rounded-2xl border border-blue-200 bg-blue-50 px-5 py-5 shadow-[0_8px_32px_rgba(37,99,235,0.10)] sm:px-6',",
        "shell: 'rounded-[28px] border border-slate-200 bg-white px-3 py-4 shadow-[0_16px_50px_rgba(15,23,42,0.08)] sm:px-4',",
        "flat classic shell",
    )
    text = replace_once(
        text,
        "input: 'border-slate-200 bg-slate-50 focus:border-blue-500 focus:ring-[rgba(37,99,235,0.15)]',",
        "input: 'border-slate-300 bg-white text-slate-900 placeholder:text-slate-400 focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10',",
        "premium classic input",
    )
    text = replace_once(
        text,
        "link: 'border-blue-200 bg-blue-50 text-blue-700',",
        "link: 'border-blue-200 bg-white text-blue-700 hover:bg-blue-50',",
        "flat classic action link",
    )
    text = replace_all_identical(
        text,
        "packageCard: 'border-slate-200 bg-white',",
        "packageCard: 'border-slate-200 bg-white hover:border-blue-200 hover:shadow-md',",
        "premium package card theme",
    )

    old_render = '''  function renderPackageButton(pkg: PortalPackage) {
    const isTrial = isTrialPackage(pkg)
    return (
      <button
        key={pkg.id}
        type="button"
        onClick={() => {
          if (isTrial) {
            void handleTrialStart(pkg)
            return
          }
          setSelectedPackage(pkg)
          setCheckoutOpen(true)
          setCurrentPayment(null)
          setErrorMessage('')
          setStatusMessage('')
          setSmartTvNotice(null)
        }}
        className={`grid grid-cols-[1fr_auto_auto] items-center gap-3 rounded-lg border px-4 py-3 text-left shadow-sm ${portalStyle.packageCard}`}
      >
        <span>
          <span className={`block text-base font-bold ${resolvePortalTemplate(context?.tenant.portalTemplate) === 'midnight' ? 'text-white' : 'text-slate-700'}`}>{pkg.name}</span>
          <span className={`block text-xs ${resolvePortalTemplate(context?.tenant.portalTemplate) === 'midnight' ? 'text-slate-400' : 'text-slate-500'}`}>
            {formatDuration(pkg.durationMinutes)}
            {isMultiDevicePackage(pkg) ? ` - ${pkg.deviceLimit} devices` : ''}
          </span>
        </span>
        <span className={`text-sm font-extrabold ${portalStyle.packagePrice}`}>{isTrial ? 'Free' : formatCurrency(pkg.amountUgx)}</span>
        <span className={`rounded-xl border px-4 py-2 text-sm font-extrabold shadow-sm ${portalStyle.buyPill}`}>{isTrial ? 'TRY' : 'BUY'}</span>
      </button>
    )
  }
'''
    new_render = '''  function renderPackageButton(pkg: PortalPackage) {
    const isTrial = isTrialPackage(pkg)
    const tvPackage = isTvPackage(pkg)
    const PackageIcon = tvPackage ? Tv : pkg.durationMinutes < 1440 ? Clock3 : CalendarDays
    return (
      <button
        key={pkg.id}
        type="button"
        onClick={() => {
          if (isTrial) {
            void handleTrialStart(pkg)
            return
          }
          setSelectedPackage(pkg)
          setCheckoutOpen(true)
          setCurrentPayment(null)
          setErrorMessage('')
          setStatusMessage('')
          setSmartTvNotice(null)
        }}
        className={`grid min-h-[78px] w-full grid-cols-[48px_minmax(0,1fr)_auto_auto] items-center gap-3 rounded-2xl border px-3 py-3 text-left shadow-[0_5px_18px_rgba(15,23,42,0.06)] transition sm:px-4 ${portalStyle.packageCard}`}
      >
        <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-blue-50 text-blue-600">
          <PackageIcon className="h-6 w-6" strokeWidth={2.2} />
        </span>
        <span className="min-w-0">
          <span className={`block truncate text-[17px] font-extrabold leading-tight ${resolvePortalTemplate(context?.tenant.portalTemplate) === 'midnight' ? 'text-white' : 'text-slate-900'}`}>{pkg.name}</span>
          <span className={`mt-1 block text-xs font-medium ${resolvePortalTemplate(context?.tenant.portalTemplate) === 'midnight' ? 'text-slate-400' : 'text-slate-500'}`}>
            {formatDuration(pkg.durationMinutes)}
            {isMultiDevicePackage(pkg) ? ` · ${pkg.deviceLimit} devices` : ''}
          </span>
        </span>
        <span className={`whitespace-nowrap text-[15px] font-black ${portalStyle.packagePrice}`}>{isTrial ? 'Free' : formatCurrency(pkg.amountUgx)}</span>
        <span className={`min-w-[72px] rounded-xl border px-4 py-2.5 text-center text-sm font-black shadow-sm ${portalStyle.buyPill}`}>{isTrial ? 'TRY' : 'BUY'}</span>
      </button>
    )
  }
'''
    text = replace_once(text, old_render, new_render, "large package card renderer")

    text = replace_once(
        text,
        '<section className={`mx-auto w-full max-w-[540px] ${portalStyle.shell}`}>',
        '<section className={`mx-auto w-full max-w-[620px] font-sans ${portalStyle.shell}`}>',
        "wider premium mobile shell",
    )
    text = replace_once(
        text,
        '<span className="sr-only">AROFi simple portal build 2026-05-16-2328</span>',
        '<span className="sr-only">AROFi premium flat portal build 2026-08-30</span>',
        "premium portal build marker",
    )

    old_brand = '''              <div className="text-center flex flex-col items-center justify-center">
              <div className={`mb-2 animate-pulse flex justify-center items-center ${portalStyle.iconText}`}>
                <Wifi className="h-12 w-12" />
              </div>
              <div className={`mx-auto mb-2 w-fit ${portalStyle.logoBox}`}>
                <img src={context?.tenant.logoUrl || '/logo.png'} alt="AROFi" className="h-10 w-auto" />
              </div>
              <h1 className={`text-sm font-semibold tracking-wider opacity-60 uppercase mt-1 ${portalStyle.title}`}>
                {portalDisplayName}
              </h1>'''
    new_brand = '''              <div className="flex flex-col items-center justify-center text-center">
              <div className={`mb-1 flex items-center justify-center ${portalStyle.iconText}`}>
                <Wifi className="h-14 w-14" strokeWidth={2.4} />
              </div>
              <div className={`mx-auto mb-1 w-fit ${portalStyle.logoBox}`}>
                <img src={context?.tenant.logoUrl || '/logo.png'} alt="AROFi" className="h-11 w-auto max-w-[190px] object-contain" />
              </div>
              <h1 className={`mt-1 text-[18px] font-black tracking-wide ${portalStyle.title}`}>
                {portalDisplayName}
              </h1>
              <p className="mt-1 text-sm font-medium text-slate-500">Stay connected</p>'''
    text = replace_once(text, old_brand, new_brand, "premium portal branding")

    text = replace_once(
        text,
        '<div className="mt-5 rounded-xl border border-slate-200 bg-white/80 p-3 shadow-sm">',
        '<div className="mt-6 rounded-2xl border border-slate-200 bg-white p-3 shadow-[0_8px_24px_rgba(15,23,42,0.05)] sm:p-4">',
        "flat quick-access panel",
    )
    text = replace_once(
        text,
        '''                <div className="flex items-start justify-between gap-3">
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

                <div className="mt-3 flex gap-2">''',
        '''                <div className="flex items-center justify-between gap-3">
                  <div className="text-sm font-extrabold text-slate-900">{tvOnly ? 'Connect a Smart TV' : 'Enter your voucher'}</div>
                  {tvOnly && (
                    <Link href="/" className={`rounded-lg border px-3 py-2 text-xs font-bold ${portalStyle.link}`}>
                      Back
                    </Link>
                  )}
                </div>

                <div className="mt-3 flex gap-2">''',
        "clean quick-access heading",
    )
    text = replace_once(
        text,
        "placeholder={tvOnly ? 'Enter TV voucher code' : 'Enter voucher code'}",
        "placeholder={tvOnly ? 'Enter TV voucher code' : 'Enter your voucher code'}",
        "voucher placeholder wording",
    )
    text = replace_once(
        text,
        'className={`min-w-0 flex-1 rounded-lg border px-4 py-3 text-sm outline-none ${portalStyle.input}`}',
        'className={`min-w-0 flex-1 rounded-xl border px-4 py-3.5 text-base font-medium outline-none ${portalStyle.input}`}',
        "larger voucher input",
    )
    text = replace_once(
        text,
        'className={`rounded-lg px-4 py-3 text-sm font-bold ${portalStyle.button}`}',
        'className={`min-w-[92px] rounded-xl px-5 py-3.5 text-base font-black shadow-sm ${portalStyle.button}`}',
        "larger connect button",
    )

    text = replace_once(
        text,
        '<div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">',
        '<div className="mt-3 grid grid-cols-2 gap-2">',
        "single-row portal actions",
    )
    text = replace_once(
        text,
        '<Wifi className="h-3.5 w-3.5" /> Connect TV',
        '<Tv className="h-4 w-4 shrink-0" /> <span className="whitespace-nowrap">Connect Smart TV</span>',
        "Smart TV action wording",
    )
    text = replace_once(
        text,
        '<LogIn className="h-3.5 w-3.5" /> Find purchase',
        '<LogIn className="h-4 w-4 shrink-0" /> <span className="whitespace-nowrap">Already bought? Find My Voucher</span>',
        "returning buyer action wording",
    )
    text = replace_once(
        text,
        'className={`flex items-center justify-center gap-2 rounded-lg border px-3 py-2.5 text-xs font-bold ${portalStyle.link}`}',
        'className={`flex min-h-[44px] items-center justify-center gap-1.5 rounded-xl border px-2 py-2.5 text-[10px] font-extrabold tracking-tight ${portalStyle.link}`}',
        "Smart TV action sizing",
    )
    text = replace_once(
        text,
        'className={`flex items-center justify-center gap-2 rounded-lg border px-3 py-2.5 text-xs font-bold ${portalStyle.link}`}>\n                      <LogIn',
        'className={`flex min-h-[44px] items-center justify-center gap-1.5 rounded-xl border px-2 py-2.5 text-[10px] font-extrabold tracking-tight ${portalStyle.link}`}>\n                      <LogIn',
        "returning buyer action sizing",
    )
    text = replace_once(
        text,
        'className={`col-span-2 flex items-center justify-center gap-2 rounded-lg border px-3 py-2.5 text-xs font-bold sm:col-span-1 ${portalStyle.link}`}',
        'className={`col-span-2 flex items-center justify-center gap-2 rounded-xl border px-3 py-2.5 text-xs font-bold ${portalStyle.link}`}',
        "trial action row preservation",
    )

    old_duplicate = '''              <Link href="/login" className={`mx-auto mt-4 flex w-fit items-center gap-2 rounded-md border px-4 py-2 text-xs font-medium ${portalStyle.link}`}>
                <LogIn className="h-3 w-3" />
                Already bought? Find My Voucher
              </Link>

'''
    text = replace_once(text, old_duplicate, "", "duplicate returning buyer link")

    text = replace_once(
        text,
        "{tvOnly ? 'Choose a Smart TV package or use a voucher above' : 'Select a package and choose a payment method'}",
        "{tvOnly ? 'Choose a Smart TV package or use a voucher above' : 'Select a package and pay with Mobile Money'}",
        "package instruction wording",
    )
    text = replace_once(
        text,
        '<div className="mt-6 grid gap-3 sm:grid-cols-2">',
        '<div className="mt-4 grid gap-3">',
        "larger single-column normal packages",
    )
    text = replace_once(
        text,
        '<p className={`mt-6 text-center text-sm font-semibold ${resolvePortalTemplate(context?.tenant.portalTemplate) === \'midnight\' ? \'text-slate-200\' : \'text-slate-700\'}`}>\n                    {tvOnly ? \'Smart TV packages\' : \'Smart TV connection\'}\n                  </p>',
        '<p className={`mt-7 text-center text-base font-extrabold ${resolvePortalTemplate(context?.tenant.portalTemplate) === \'midnight\' ? \'text-slate-200\' : \'text-blue-700\'}`}>\n                    {tvOnly ? \'Smart TV packages\' : \'Smart TV connection\'}\n                  </p>',
        "Smart TV section heading",
    )
    text = replace_once(
        text,
        '<div className="mt-3 grid gap-3 sm:grid-cols-2">\n                    {smartTvPackages.map(renderPackageButton)}\n                  </div>',
        '<div className="mt-3 grid gap-3 rounded-2xl border border-slate-200 bg-slate-50/60 p-3">\n                    {smartTvPackages.map(renderPackageButton)}\n                  </div>',
        "Smart TV premium package group",
    )

    required = (
        "AROFi premium flat portal build 2026-08-30",
        "Already bought? Find My Voucher",
        "Connect Smart TV",
        "Select a package and pay with Mobile Money",
        "min-h-[78px]",
        "max-w-[620px]",
        "PackageIcon",
    )
    missing = [marker for marker in required if marker not in text]
    if missing:
        raise RuntimeError("Premium portal UI invariant missing: " + ", ".join(missing))

    premium_region = text[text.find("AROFi premium flat portal build 2026-08-30"):]
    if "bg-gradient-" in premium_region or "from-blue-" in premium_region or "to-blue-" in premium_region:
        raise RuntimeError("Premium portal UI rejected: gradient utility found in captive home UI")

    PORTAL.write_text(text, encoding="utf-8")
    print(
        "Premium portal UI enforced: flat white/blue shell, larger package cards, reduced padding, "
        "and one-line Smart TV / returning-buyer actions."
    )


if __name__ == "__main__":
    main()
