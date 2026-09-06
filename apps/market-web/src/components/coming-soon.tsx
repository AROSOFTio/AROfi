"use client";

import {
  ArrowRight,
  BadgeCheck,
  BellRing,
  Box,
  Camera,
  Check,
  CheckCircle2,
  ChevronRight,
  Globe2,
  HeartHandshake,
  Laptop,
  Menu,
  Network,
  PackageCheck,
  Router,
  Search,
  ShieldCheck,
  ShoppingBag,
  Smartphone,
  Sparkles,
  Store,
  Truck,
  Users,
  Wifi,
  X,
  Zap,
} from "lucide-react";
import { FormEvent, useMemo, useState } from "react";

const categories = [
  { name: "Routers", icon: Router, copy: "MikroTik, TP-Link, Cisco and more" },
  { name: "Access Points", icon: Wifi, copy: "Indoor, outdoor and managed Wi-Fi" },
  { name: "Switches", icon: Network, copy: "PoE, managed, fibre and enterprise" },
  { name: "CCTV", icon: Camera, copy: "IP cameras, NVRs and surveillance kits" },
  { name: "Computers", icon: Laptop, copy: "Business laptops, desktops and monitors" },
  { name: "Phones", icon: Smartphone, copy: "Phones and tablets for field operations" },
  { name: "Cables & Fibre", icon: Zap, copy: "Cat6, fibre, SFPs and connectors" },
  { name: "Power & Backup", icon: Box, copy: "UPS, PoE, surge and backup power" },
];

const sampleProducts = [
  { name: "MikroTik RB5009UG+S+IN", category: "Router", price: "UGX 890,000", icon: Router, tag: "AROFi Ready" },
  { name: "Wi-Fi 6 Ceiling Access Point", category: "Access Point", price: "From UGX 520,000", icon: Wifi, tag: "Verified" },
  { name: "8-Port Managed PoE+ Switch", category: "Switch", price: "From UGX 670,000", icon: Network, tag: "Buyer Protected" },
  { name: "4MP PoE IP Camera", category: "CCTV", price: "From UGX 285,000", icon: Camera, tag: "Tested" },
];

const countries = [
  { code: "UG", name: "Uganda", status: "Available at launch" },
  { code: "KE", name: "Kenya", status: "Coming soon" },
  { code: "TZ", name: "Tanzania", status: "Coming soon" },
  { code: "RW", name: "Rwanda", status: "Coming soon" },
];

type Toast = { tone: "success" | "error"; title: string; message: string } | null;

export default function ComingSoon() {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [interest, setInterest] = useState<"BUYER" | "SELLER" | "BOTH">("BUYER");
  const [submitting, setSubmitting] = useState(false);
  const [toast, setToast] = useState<Toast>(null);
  const [waitlistCount, setWaitlistCount] = useState<number | null>(null);

  const buttonCopy = useMemo(() => {
    if (interest === "SELLER") return "Join seller launch list";
    if (interest === "BOTH") return "Join buyer & seller list";
    return "Get early access";
  }, [interest]);

  async function submitWaitlist(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    setSubmitting(true);
    setToast(null);

    try {
      const response = await fetch("/api/waitlist", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          name: data.get("name"),
          email: data.get("email"),
          phone: data.get("phone"),
          country: data.get("country"),
          interest,
          businessName: data.get("businessName"),
          source: "market-coming-soon",
        }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload?.message || "Could not join the waitlist.");

      setWaitlistCount(typeof payload.count === "number" ? payload.count : null);
      setToast({
        tone: "success",
        title: "You’re on the launch list",
        message: interest === "SELLER"
          ? "We’ll contact you when approved-seller onboarding opens."
          : "We’ll notify you when early shopping access opens in Uganda.",
      });
      form.reset();
    } catch (error) {
      setToast({
        tone: "error",
        title: "We couldn’t save that yet",
        message: error instanceof Error ? error.message : "Please try again.",
      });
    } finally {
      setSubmitting(false);
    }
  }

  const jumpToWaitlist = (type: "BUYER" | "SELLER" | "BOTH" = "BUYER") => {
    setInterest(type);
    document.getElementById("waitlist")?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  return (
    <main className="min-h-screen overflow-hidden">
      <header className="sticky top-0 z-50 border-b border-slate-200/80 bg-white/88 backdrop-blur-xl">
        <div className="mx-auto flex h-16 max-w-7xl items-center gap-4 px-4 sm:px-6 lg:px-8">
          <a href="#top" className="flex min-w-0 items-center gap-2.5" aria-label="AROFi Market home">
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl bg-slate-950 text-white shadow-lg shadow-slate-950/15">
              <Network className="h-5 w-5" />
            </span>
            <span className="min-w-0">
              <span className="block truncate text-[15px] font-black tracking-tight text-slate-950">AROFi Market</span>
              <span className="block text-[10px] font-bold uppercase tracking-[0.18em] text-blue-600">by AROFi</span>
            </span>
          </a>

          <nav className="ml-auto hidden items-center gap-7 text-sm font-semibold text-slate-600 md:flex">
            <a className="transition hover:text-blue-700" href="#how-it-works">How it works</a>
            <a className="transition hover:text-blue-700" href="#categories">Categories</a>
            <a className="transition hover:text-blue-700" href="#sellers">For sellers</a>
            <a className="transition hover:text-blue-700" href="#countries">Countries</a>
          </nav>

          <div className="ml-auto hidden items-center gap-2 md:ml-3 md:flex">
            <button onClick={() => jumpToWaitlist("SELLER")} className="focus-market inline-flex h-10 items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 text-sm font-bold text-slate-800 transition hover:border-blue-200 hover:bg-blue-50 hover:text-blue-700">
              <Store className="h-4 w-4" /> Sell on AROFi
            </button>
            <button onClick={() => jumpToWaitlist("BUYER")} className="market-shine focus-market inline-flex h-10 items-center gap-2 rounded-xl bg-blue-600 px-4 text-sm font-bold text-white shadow-lg shadow-blue-600/20 transition hover:bg-blue-700">
              Join waitlist <ArrowRight className="h-4 w-4" />
            </button>
          </div>

          <button onClick={() => setMobileOpen((v) => !v)} className="focus-market ml-auto grid h-10 w-10 place-items-center rounded-xl border border-slate-200 bg-white text-slate-700 md:hidden" aria-label="Toggle menu">
            {mobileOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </div>
        {mobileOpen ? (
          <div className="border-t border-slate-200 bg-white p-4 md:hidden">
            <div className="grid gap-2 text-sm font-semibold text-slate-700">
              {[['How it works','how-it-works'],['Categories','categories'],['For sellers','sellers'],['Countries','countries']].map(([label,id]) => (
                <a key={id} href={`#${id}`} onClick={() => setMobileOpen(false)} className="rounded-xl px-3 py-3 hover:bg-slate-50">{label}</a>
              ))}
              <button onClick={() => { setMobileOpen(false); jumpToWaitlist("SELLER"); }} className="mt-1 rounded-xl border border-slate-200 px-4 py-3 text-left font-bold">Become a seller</button>
              <button onClick={() => { setMobileOpen(false); jumpToWaitlist("BUYER"); }} className="rounded-xl bg-blue-600 px-4 py-3 text-left font-bold text-white">Join waitlist</button>
            </div>
          </div>
        ) : null}
      </header>

      <section id="top" className="relative border-b border-slate-200/70 bg-white">
        <div className="market-grid absolute inset-0" />
        <div className="relative mx-auto grid max-w-7xl gap-14 px-4 py-16 sm:px-6 sm:py-24 lg:grid-cols-[1.08fr_.92fr] lg:px-8 lg:py-28">
          <div className="max-w-3xl">
            <div className="inline-flex items-center gap-2 rounded-full border border-blue-200 bg-blue-50 px-3 py-1.5 text-xs font-extrabold text-blue-700 shadow-sm">
              <Sparkles className="h-4 w-4" /> Uganda launch coming soon
            </div>
            <h1 className="mt-6 text-4xl font-black leading-[1.02] tracking-[-0.045em] text-slate-950 sm:text-6xl lg:text-7xl">
              Build your network <span className="text-blue-600">with confidence.</span>
            </h1>
            <p className="mt-6 max-w-2xl text-lg leading-8 text-slate-600 sm:text-xl">
              AROFi Market is the trusted marketplace for networking devices and the technology around them — from routers, access points and switches to CCTV, computers, phones, cables and power. Approved sellers. Verified products. Buyer protection. Optional AROFi configuration.
            </p>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <button onClick={() => jumpToWaitlist("BUYER")} className="market-shine focus-market inline-flex min-h-14 items-center justify-center gap-2 rounded-2xl bg-blue-600 px-6 text-base font-black text-white shadow-xl shadow-blue-600/25 transition hover:-translate-y-0.5 hover:bg-blue-700">
                <BellRing className="h-5 w-5" /> Get early shopping access <ArrowRight className="h-5 w-5" />
              </button>
              <button onClick={() => jumpToWaitlist("SELLER")} className="focus-market inline-flex min-h-14 items-center justify-center gap-2 rounded-2xl border border-slate-300 bg-white px-6 text-base font-black text-slate-900 shadow-sm transition hover:-translate-y-0.5 hover:border-blue-300 hover:bg-blue-50 hover:text-blue-700">
                <Store className="h-5 w-5" /> Apply to sell
              </button>
            </div>
            <div className="mt-7 flex flex-wrap gap-x-5 gap-y-2 text-sm font-semibold text-slate-600">
              <span className="inline-flex items-center gap-1.5"><ShieldCheck className="h-4 w-4 text-emerald-600" /> Buyer protection</span>
              <span className="inline-flex items-center gap-1.5"><BadgeCheck className="h-4 w-4 text-blue-600" /> Approved sellers</span>
              <span className="inline-flex items-center gap-1.5"><PackageCheck className="h-4 w-4 text-violet-600" /> Tested before shipping</span>
            </div>
          </div>

          <div className="relative lg:pt-4">
            <div className="absolute -inset-8 rounded-full bg-blue-200/35 blur-3xl" />
            <div className="market-glass relative rounded-[32px] p-4 shadow-2xl shadow-slate-900/10 sm:p-5">
              <div className="rounded-[26px] bg-slate-950 p-5 text-white sm:p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs font-bold uppercase tracking-[0.18em] text-blue-300">AROFi Buyer Protection</p>
                    <p className="mt-2 text-xl font-black">Money follows verified progress.</p>
                  </div>
                  <ShieldCheck className="h-9 w-9 text-blue-400" />
                </div>
                <div className="mt-6 grid gap-2.5">
                  {["Customer pays securely", "Seller supplies within deadline", "AROFi receives, verifies & tests", "Optional AROFi configuration", "Product ships to customer", "Seller payout released after completion"].map((step, index) => (
                    <div key={step} className="flex items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.06] px-3 py-3">
                      <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-blue-500 text-xs font-black">{index + 1}</span>
                      <span className="text-sm font-semibold text-slate-100">{step}</span>
                    </div>
                  ))}
                </div>
              </div>
              <div className="mt-4 grid grid-cols-3 gap-3">
                {[['3 days','Seller supply'],['10%','Default fee'],['UG','First market']].map(([value,label]) => (
                  <div key={label} className="rounded-2xl border border-slate-200 bg-white p-3 text-center">
                    <div className="text-lg font-black text-slate-950">{value}</div>
                    <div className="mt-0.5 text-[10px] font-bold uppercase tracking-wide text-slate-500">{label}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      <section id="how-it-works" className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8 lg:py-24">
        <div className="max-w-2xl">
          <p className="text-sm font-black uppercase tracking-[0.2em] text-blue-600">Not another random electronics shop</p>
          <h2 className="mt-3 text-3xl font-black tracking-tight text-slate-950 sm:text-4xl">A marketplace built around trust and deployment.</h2>
          <p className="mt-4 text-base leading-7 text-slate-600">AROFi Market is designed for people who need equipment to work in the real world — hotspot owners, businesses, installers, schools, ISPs and technology teams.</p>
        </div>
        <div className="mt-10 grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          {[
            { icon: Store, title: "Approved sellers", copy: "Sellers register, submit KYC and business details, and are approved by AROFi before listing products." },
            { icon: ShieldCheck, title: "AROFi Verified", copy: "Eligible equipment is received, inspected, powered on and tested before it leaves our verification process." },
            { icon: Zap, title: "AROFi Ready", copy: "Networking equipment can be pre-configured for AROFi hotspots and deployment when the buyer requests it." },
            { icon: Truck, title: "Protected fulfilment", copy: "Seller deadlines, verification states, shipment tracking, delivery confirmation and controlled seller payout." },
          ].map(({ icon: Icon, title, copy }) => (
            <article key={title} className="rounded-[26px] border border-slate-200 bg-white p-6 shadow-sm transition hover:-translate-y-1 hover:shadow-card">
              <span className="grid h-12 w-12 place-items-center rounded-2xl bg-blue-50 text-blue-700"><Icon className="h-6 w-6" /></span>
              <h3 className="mt-5 text-lg font-black text-slate-950">{title}</h3>
              <p className="mt-2 text-sm leading-6 text-slate-600">{copy}</p>
            </article>
          ))}
        </div>
      </section>

      <section id="categories" className="border-y border-slate-200 bg-white py-16 lg:py-24">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
            <div>
              <p className="text-sm font-black uppercase tracking-[0.2em] text-blue-600">What is coming</p>
              <h2 className="mt-3 text-3xl font-black tracking-tight text-slate-950 sm:text-4xl">One place for the full network stack.</h2>
            </div>
            <button onClick={() => jumpToWaitlist("BUYER")} className="inline-flex items-center gap-2 text-sm font-black text-blue-700">Get launch alert <ChevronRight className="h-4 w-4" /></button>
          </div>
          <div className="mt-9 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {categories.map(({ name, icon: Icon, copy }) => (
              <article key={name} className="group rounded-3xl border border-slate-200 bg-slate-50/65 p-5 transition hover:border-blue-200 hover:bg-blue-50/50">
                <div className="flex items-start justify-between gap-3">
                  <span className="grid h-11 w-11 place-items-center rounded-2xl bg-white text-slate-800 shadow-sm group-hover:text-blue-700"><Icon className="h-5 w-5" /></span>
                  <span className="rounded-full bg-white px-2 py-1 text-[9px] font-black uppercase tracking-wider text-slate-500">Coming soon</span>
                </div>
                <h3 className="mt-5 font-black text-slate-950">{name}</h3>
                <p className="mt-1.5 text-sm leading-5 text-slate-600">{copy}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8 lg:py-24">
        <div className="flex items-center gap-3">
          <ShoppingBag className="h-6 w-6 text-blue-600" />
          <h2 className="text-2xl font-black tracking-tight text-slate-950 sm:text-3xl">Marketplace preview</h2>
        </div>
        <p className="mt-2 max-w-2xl text-slate-600">Examples of the equipment experience we are preparing. Final seller availability and launch prices will appear when the market opens.</p>
        <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {sampleProducts.map(({ name, category, price, icon: Icon, tag }) => (
            <article key={name} className="rounded-[28px] border border-slate-200 bg-white p-3 shadow-sm">
              <div className="relative flex aspect-[4/3] items-center justify-center overflow-hidden rounded-3xl bg-gradient-to-br from-blue-50 via-white to-slate-100">
                <div className="absolute right-3 top-3 rounded-full bg-white px-2.5 py-1 text-[9px] font-black uppercase tracking-wider text-blue-700 shadow-sm">{tag}</div>
                <span className="grid h-20 w-20 place-items-center rounded-3xl border border-white bg-white/80 text-blue-700 shadow-xl"><Icon className="h-10 w-10" strokeWidth={1.7} /></span>
              </div>
              <div className="p-3">
                <p className="text-[10px] font-black uppercase tracking-wider text-slate-400">{category}</p>
                <h3 className="mt-1.5 min-h-10 text-sm font-black leading-5 text-slate-950">{name}</h3>
                <p className="mt-3 text-base font-black text-slate-950">{price}</p>
                <button onClick={() => jumpToWaitlist("BUYER")} className="mt-3 flex h-10 w-full items-center justify-center gap-2 rounded-xl bg-slate-950 text-xs font-black text-white transition hover:bg-blue-700">Notify me at launch <BellRing className="h-3.5 w-3.5" /></button>
              </div>
            </article>
          ))}
        </div>
      </section>

      <section id="sellers" className="bg-slate-950 py-16 text-white lg:py-24">
        <div className="mx-auto grid max-w-7xl gap-10 px-4 sm:px-6 lg:grid-cols-2 lg:px-8">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.06] px-3 py-1.5 text-xs font-bold text-blue-300"><Store className="h-4 w-4" /> Seller launch programme</div>
            <h2 className="mt-5 text-3xl font-black tracking-tight sm:text-5xl">Good sellers should win too.</h2>
            <p className="mt-5 max-w-xl text-base leading-7 text-slate-300">List products without opening another physical branch, gain buyers looking specifically for networking technology, and receive settlement after the protected order process is completed.</p>
            <button onClick={() => jumpToWaitlist("SELLER")} className="market-shine mt-7 inline-flex min-h-13 items-center gap-2 rounded-2xl bg-blue-500 px-6 py-3.5 text-sm font-black text-white shadow-xl shadow-blue-500/20 hover:bg-blue-400">Join seller launch list <ArrowRight className="h-4 w-4" /></button>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            {["Free seller application at launch", "AROFi-approved seller badge", "Seller shop and product catalogue", "Configurable category commissions", "Order and supply deadline notifications", "Pending → available payout visibility", "Verified-sales reputation score", "Future promoted listings & analytics"].map((item) => (
              <div key={item} className="flex items-start gap-3 rounded-2xl border border-white/10 bg-white/[0.05] p-4"><CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-400" /><span className="text-sm font-semibold leading-5 text-slate-200">{item}</span></div>
            ))}
          </div>
        </div>
      </section>

      <section id="countries" className="border-b border-slate-200 bg-white py-16 lg:py-24">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="flex items-center gap-3"><Globe2 className="h-7 w-7 text-blue-600" /><h2 className="text-3xl font-black tracking-tight text-slate-950">Country rollout</h2></div>
          <p className="mt-3 max-w-2xl text-slate-600">Country selection will control currency, available payment methods, seller requirements, fulfilment rules and local availability. We are launching carefully, not pretending every country is live on day one.</p>
          <div className="mt-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {countries.map((country) => (
              <div key={country.code} className={`rounded-3xl border p-5 ${country.code === "UG" ? "border-emerald-200 bg-emerald-50" : "border-slate-200 bg-slate-50"}`}>
                <div className="flex items-center justify-between"><span className="text-xs font-black uppercase tracking-[0.18em] text-slate-500">{country.code}</span>{country.code === "UG" ? <CheckCircle2 className="h-5 w-5 text-emerald-600" /> : <span className="rounded-full bg-white px-2 py-1 text-[9px] font-black uppercase text-slate-500">Soon</span>}</div>
                <h3 className="mt-4 text-xl font-black text-slate-950">{country.name}</h3>
                <p className={`mt-1 text-sm font-bold ${country.code === "UG" ? "text-emerald-700" : "text-slate-500"}`}>{country.status}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section id="waitlist" className="relative scroll-mt-24 py-16 lg:py-24">
        <div className="absolute inset-0 bg-gradient-to-b from-blue-50/60 to-transparent" />
        <div className="relative mx-auto grid max-w-6xl gap-8 px-4 sm:px-6 lg:grid-cols-[.82fr_1.18fr] lg:px-8">
          <div className="pt-4">
            <p className="text-sm font-black uppercase tracking-[0.2em] text-blue-600">Launch list</p>
            <h2 className="mt-3 text-3xl font-black tracking-tight text-slate-950 sm:text-4xl">Be among the first inside AROFi Market.</h2>
            <p className="mt-4 text-base leading-7 text-slate-600">Choose whether you want to buy, sell, or do both. Uganda opens first; other selected countries stay on the list and will be notified as we activate them.</p>
            <div className="mt-6 grid gap-3">
              {["Early marketplace launch notification", "Seller onboarding opening alert", "Network-kit and AROFi Ready announcements", "Country activation notifications"].map((item) => <div key={item} className="flex items-center gap-2.5 text-sm font-semibold text-slate-700"><Check className="h-4 w-4 text-emerald-600" />{item}</div>)}
            </div>
          </div>

          <form onSubmit={submitWaitlist} className="rounded-[30px] border border-slate-200 bg-white p-5 shadow-card sm:p-7">
            <fieldset>
              <legend className="text-sm font-black text-slate-950">I want to</legend>
              <div className="mt-3 grid grid-cols-3 gap-2">
                {([['BUYER','Buy'],['SELLER','Sell'],['BOTH','Both']] as const).map(([value,label]) => (
                  <button key={value} type="button" onClick={() => setInterest(value)} className={`focus-market min-h-11 rounded-xl border px-3 text-sm font-black transition ${interest === value ? "border-blue-600 bg-blue-600 text-white shadow-lg shadow-blue-600/15" : "border-slate-200 bg-white text-slate-700 hover:border-blue-200 hover:bg-blue-50"}`}>{label}</button>
                ))}
              </div>
            </fieldset>

            <div className="mt-5 grid gap-4 sm:grid-cols-2">
              <label className="block"><span className="text-xs font-black text-slate-700">Full name</span><input name="name" required maxLength={120} autoComplete="name" className="focus-market mt-1.5 h-12 w-full rounded-xl border border-slate-200 bg-slate-50 px-4 text-sm text-slate-950 placeholder:text-slate-400" placeholder="Your name" /></label>
              <label className="block"><span className="text-xs font-black text-slate-700">Email</span><input name="email" type="email" required maxLength={180} autoComplete="email" className="focus-market mt-1.5 h-12 w-full rounded-xl border border-slate-200 bg-slate-50 px-4 text-sm text-slate-950 placeholder:text-slate-400" placeholder="you@example.com" /></label>
              <label className="block"><span className="text-xs font-black text-slate-700">Phone <span className="font-semibold text-slate-400">(optional)</span></span><input name="phone" maxLength={32} autoComplete="tel" className="focus-market mt-1.5 h-12 w-full rounded-xl border border-slate-200 bg-slate-50 px-4 text-sm text-slate-950 placeholder:text-slate-400" placeholder="+256…" /></label>
              <label className="block"><span className="text-xs font-black text-slate-700">Country</span><select name="country" defaultValue="UG" className="focus-market mt-1.5 h-12 w-full rounded-xl border border-slate-200 bg-slate-50 px-4 text-sm font-semibold text-slate-800"><option value="UG">Uganda — launch market</option><option value="KE">Kenya — coming soon</option><option value="TZ">Tanzania — coming soon</option><option value="RW">Rwanda — coming soon</option><option value="OTHER">Other country</option></select></label>
            </div>

            {(interest === "SELLER" || interest === "BOTH") ? <label className="mt-4 block"><span className="text-xs font-black text-slate-700">Business / shop name</span><input name="businessName" maxLength={160} className="focus-market mt-1.5 h-12 w-full rounded-xl border border-slate-200 bg-slate-50 px-4 text-sm text-slate-950 placeholder:text-slate-400" placeholder="e.g. Kampala Network Solutions" /></label> : null}

            <button disabled={submitting} className="market-shine focus-market mt-5 inline-flex min-h-14 w-full items-center justify-center gap-2 rounded-2xl bg-blue-600 px-5 text-base font-black text-white shadow-xl shadow-blue-600/20 transition hover:bg-blue-700 disabled:cursor-wait disabled:opacity-65">
              {submitting ? "Saving your place…" : buttonCopy} {!submitting ? <ArrowRight className="h-5 w-5" /> : null}
            </button>
            <p className="mt-3 text-center text-[11px] leading-5 text-slate-400">We’ll use these details only for AROFi Market launch, seller onboarding and relevant country availability updates.</p>
            {waitlistCount ? <p className="mt-2 text-center text-xs font-bold text-emerald-700">You joined successfully. Current waitlist entries: {waitlistCount}</p> : null}
          </form>
        </div>
      </section>

      <section className="mx-auto max-w-5xl px-4 pb-16 sm:px-6 lg:px-8 lg:pb-24" aria-labelledby="faq-title">
        <div className="text-center"><h2 id="faq-title" className="text-2xl font-black tracking-tight text-slate-950 sm:text-3xl">What AROFi Market will do</h2><p className="mt-2 text-sm text-slate-600">Clear answers for customers, sellers, search engines and AI assistants.</p></div>
        <div className="mt-8 grid gap-3">
          {[
            ["What is AROFi Market?", "AROFi Market is a multi-vendor technology marketplace focused on networking equipment and supporting electronics, with seller approval, buyer protection, product verification and optional AROFi configuration."],
            ["Where will AROFi Market launch first?", "Uganda is the first live market. Kenya, Tanzania, Rwanda and additional countries are planned as payments, seller operations and fulfilment are activated country by country."],
            ["Can anyone sell on AROFi Market?", "Anyone may apply, but sellers must be reviewed and approved by AROFi before they can trade. Seller verification and ongoing fulfilment performance are part of the trust model."],
            ["When does the seller receive money?", "The marketplace is designed so seller proceeds are not immediately withdrawable at checkout. Orders pass through supply, verification, shipment and delivery/completion states before seller settlement becomes available, subject to the payment-provider arrangement and marketplace policy."],
            ["Can AROFi configure networking equipment before delivery?", "Yes. Eligible routers and networking devices can offer an AROFi Ready option so buyers can request testing and AROFi-related configuration before shipment."],
          ].map(([question,answer]) => <details key={question} className="group rounded-2xl border border-slate-200 bg-white p-5"><summary className="cursor-pointer list-none font-black text-slate-950">{question}<ChevronRight className="float-right mt-0.5 h-5 w-5 text-slate-400 transition group-open:rotate-90" /></summary><p className="mt-3 max-w-4xl text-sm leading-6 text-slate-600">{answer}</p></details>)}
        </div>
      </section>

      <footer className="border-t border-slate-200 bg-white">
        <div className="mx-auto flex max-w-7xl flex-col gap-5 px-4 py-8 sm:px-6 md:flex-row md:items-center md:justify-between lg:px-8">
          <div className="flex items-center gap-3"><span className="grid h-9 w-9 place-items-center rounded-xl bg-slate-950 text-white"><Network className="h-4 w-4" /></span><div><p className="text-sm font-black text-slate-950">AROFi Market</p><p className="text-xs text-slate-500">A product of AROFi / AROSOFT Innovations Ltd</p></div></div>
          <div className="flex flex-wrap gap-x-5 gap-y-2 text-xs font-semibold text-slate-500"><a href="https://arofi.net" className="hover:text-blue-700">AROFi</a><a href="https://arofi.net/privacy" className="hover:text-blue-700">Privacy</a><button onClick={() => jumpToWaitlist("SELLER")} className="hover:text-blue-700">Seller waitlist</button><span>© 2026 AROFi</span></div>
        </div>
      </footer>

      {toast ? (
        <div className="fixed inset-x-4 bottom-5 z-[80] mx-auto max-w-md sm:left-auto sm:right-6 sm:mx-0">
          <div className={`flex items-start gap-3 rounded-2xl border bg-white p-4 shadow-2xl ${toast.tone === "success" ? "border-emerald-200" : "border-rose-200"}`}>
            <span className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl ${toast.tone === "success" ? "bg-emerald-50 text-emerald-700" : "bg-rose-50 text-rose-700"}`}>{toast.tone === "success" ? <CheckCircle2 className="h-5 w-5" /> : <X className="h-5 w-5" />}</span>
            <div className="min-w-0 flex-1"><p className="text-sm font-black text-slate-950">{toast.title}</p><p className="mt-0.5 text-sm leading-5 text-slate-600">{toast.message}</p></div>
            <button type="button" onClick={() => setToast(null)} className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700" aria-label="Dismiss notification"><X className="h-4 w-4" /></button>
          </div>
        </div>
      ) : null}
    </main>
  );
}
