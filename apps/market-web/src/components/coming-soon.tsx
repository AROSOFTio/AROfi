"use client";

import {
  BadgeCheck,
  BatteryCharging,
  Bell,
  Cable,
  Camera,
  CheckCircle2,
  ChevronDown,
  Heart,
  Laptop,
  Loader2,
  MapPin,
  Network,
  PackageCheck,
  Router,
  Search,
  ShieldCheck,
  ShoppingCart,
  Smartphone,
  Store,
  UserRound,
  Wifi,
  XCircle,
} from "lucide-react";
import { FormEvent, useMemo, useState } from "react";

const categories = [
  { name: "Routers", icon: Router },
  { name: "Access Points", icon: Wifi },
  { name: "Switches", icon: Network },
  { name: "CCTV", icon: Camera },
  { name: "Computers", icon: Laptop },
  { name: "Phones", icon: Smartphone },
  { name: "Cables & Fibre", icon: Cable },
  { name: "Power & Backup", icon: BatteryCharging },
];

const productPreview = [
  { name: "MikroTik Routers", meta: "Routers & gateways", icon: Router },
  { name: "Wi‑Fi Access Points", meta: "Indoor & outdoor", icon: Wifi },
  { name: "Managed PoE Switches", meta: "Core networking", icon: Network },
  { name: "IP Cameras & NVRs", meta: "CCTV & security", icon: Camera },
];

type Interest = "BUYER" | "SELLER" | "BOTH";
type Toast = { tone: "success" | "error"; title: string; message: string } | null;

export default function ComingSoon() {
  const [interest, setInterest] = useState<Interest>("BUYER");
  const [submitting, setSubmitting] = useState(false);
  const [toast, setToast] = useState<Toast>(null);

  const buttonLabel = useMemo(() => {
    if (interest === "SELLER") return "Join seller waitlist";
    if (interest === "BOTH") return "Join buyer & seller waitlist";
    return "Join shopping waitlist";
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

      setToast({
        tone: "success",
        title: "You’re on the list",
        message:
          interest === "SELLER"
            ? "We’ll contact you when seller onboarding opens."
            : "We’ll notify you when AROFi Market opens for shopping.",
      });
      form.reset();
    } catch (error) {
      setToast({
        tone: "error",
        title: "Could not save your details",
        message: error instanceof Error ? error.message : "Please try again.",
      });
    } finally {
      setSubmitting(false);
    }
  }

  const openWaitlist = (next: Interest) => {
    setInterest(next);
    document.getElementById("waitlist")?.scrollIntoView({ behavior: "smooth", block: "center" });
  };

  return (
    <main className="min-h-screen bg-[#F5F7F9] text-[#122033]">
      <div className="border-b border-[#E1E6EA] bg-white">
        <div className="mx-auto flex h-9 max-w-[1440px] items-center justify-between px-4 text-xs font-semibold text-[#596675] sm:px-6 lg:px-8">
          <span className="inline-flex items-center gap-1.5"><MapPin className="h-3.5 w-3.5 text-[#22A53A]" /> Uganda</span>
          <button onClick={() => openWaitlist("SELLER")} className="inline-flex items-center gap-1.5 font-bold text-[#197C2C] hover:text-[#22A53A]">
            <Store className="h-3.5 w-3.5" /> Sell on AROFi
          </button>
        </div>
      </div>

      <header className="sticky top-0 z-40 border-b border-[#E1E6EA] bg-white/95 backdrop-blur">
        <div className="mx-auto max-w-[1440px] px-4 py-3 sm:px-6 lg:px-8">
          <div className="flex items-center gap-3 lg:gap-5">
            <a href="#" className="flex shrink-0 items-center gap-1.5" aria-label="AROFi Market home">
              <img src="/arofi-logo.svg" alt="AROFi" className="h-9 w-auto sm:h-10" />
              <span className="hidden border-l border-[#E1E6EA] pl-3 text-sm font-black tracking-tight text-[#122033] sm:block">MARKET</span>
            </a>

            <div className="order-3 mt-2 flex w-full flex-1 rounded-lg border-2 border-[#22A53A] bg-white md:order-none md:mt-0">
              <div className="hidden items-center gap-1 border-r border-[#E1E6EA] px-3 text-xs font-semibold text-[#596675] lg:flex">
                All categories <ChevronDown className="h-3.5 w-3.5" />
              </div>
              <label className="flex min-w-0 flex-1 items-center gap-2 px-3">
                <Search className="h-4 w-4 shrink-0 text-[#7F8A96]" />
                <input
                  aria-label="Search AROFi Market"
                  readOnly
                  onFocus={() => openWaitlist("BUYER")}
                  placeholder="Search routers, access points, switches, cameras..."
                  className="h-10 w-full min-w-0 bg-transparent text-sm outline-none placeholder:text-[#929BA5]"
                />
              </label>
              <button onClick={() => openWaitlist("BUYER")} className="bg-[#22A53A] px-4 text-sm font-extrabold text-white transition hover:bg-[#1E9134] active:bg-[#197C2C] sm:px-6">
                Search
              </button>
            </div>

            <div className="ml-auto flex shrink-0 items-center gap-1 sm:gap-2">
              <button onClick={() => openWaitlist("BUYER")} className="market-icon-action" aria-label="Account coming soon"><UserRound className="h-5 w-5" /><span>Account</span></button>
              <button onClick={() => openWaitlist("BUYER")} className="market-icon-action hidden sm:flex" aria-label="Wishlist coming soon"><Heart className="h-5 w-5" /><span>Wishlist</span></button>
              <button onClick={() => openWaitlist("BUYER")} className="market-icon-action" aria-label="Cart coming soon"><ShoppingCart className="h-5 w-5" /><span>Cart</span></button>
            </div>
          </div>
        </div>

        <div className="border-t border-[#EDF0F2] bg-white">
          <div className="market-scroll mx-auto flex max-w-[1440px] gap-1 overflow-x-auto px-4 py-2 sm:px-6 lg:px-8">
            {categories.map(({ name, icon: Icon }) => (
              <button key={name} onClick={() => openWaitlist("BUYER")} className="inline-flex shrink-0 items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-bold text-[#596675] transition hover:bg-[#EAF7ED] hover:text-[#197C2C]">
                <Icon className="h-4 w-4" /> {name}
              </button>
            ))}
          </div>
        </div>
      </header>

      <section className="mx-auto max-w-[1440px] px-4 py-4 sm:px-6 lg:px-8">
        <div className="grid gap-4 lg:grid-cols-[220px_minmax(0,1fr)_300px]">
          <aside className="hidden rounded-xl border border-[#E1E6EA] bg-white p-2 shadow-sm lg:block">
            <div className="px-3 py-2 text-xs font-black uppercase tracking-[0.12em] text-[#7F8A96]">Shop categories</div>
            {categories.map(({ name, icon: Icon }) => (
              <button key={name} onClick={() => openWaitlist("BUYER")} className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm font-semibold text-[#26313D] transition hover:bg-[#EAF7ED] hover:text-[#197C2C]">
                <Icon className="h-4 w-4 text-[#22A53A]" /> {name}
              </button>
            ))}
          </aside>

          <div className="relative overflow-hidden rounded-xl bg-[#122033] px-5 py-7 text-white shadow-sm sm:px-8 sm:py-9">
            <div className="absolute -right-12 -top-16 h-48 w-48 rounded-full bg-[#22A53A]/25 blur-3xl" />
            <div className="relative max-w-2xl">
              <span className="inline-flex rounded-full bg-[#22A53A] px-3 py-1 text-[11px] font-black uppercase tracking-[0.13em] text-white">Coming Soon</span>
              <h1 className="mt-4 text-3xl font-black tracking-[-0.035em] sm:text-4xl lg:text-5xl">AROFi Market</h1>
              <p className="mt-3 max-w-xl text-sm leading-6 text-slate-300 sm:text-base">
                Networking equipment and supporting technology from approved sellers — with AROFi verification and optional configuration.
              </p>
              <div className="mt-5 flex flex-wrap gap-2">
                <button onClick={() => openWaitlist("BUYER")} className="rounded-lg bg-[#22A53A] px-5 py-3 text-sm font-black text-white shadow-lg shadow-black/10 transition hover:bg-[#1E9134] active:bg-[#197C2C]">
                  Join shopping waitlist
                </button>
                <button onClick={() => openWaitlist("SELLER")} className="rounded-lg border border-white/20 bg-white/10 px-5 py-3 text-sm font-black text-white transition hover:bg-white/15">
                  Become a seller
                </button>
              </div>
            </div>
          </div>

          <aside className="grid gap-3 sm:grid-cols-3 lg:grid-cols-1">
            {[
              { icon: ShieldCheck, title: "Buyer Protection", copy: "Protected order flow" },
              { icon: BadgeCheck, title: "Approved Sellers", copy: "Seller review before trading" },
              { icon: PackageCheck, title: "AROFi Ready", copy: "Testing & configuration options" },
            ].map(({ icon: Icon, title, copy }) => (
              <div key={title} className="flex items-center gap-3 rounded-xl border border-[#E1E6EA] bg-white p-4 shadow-sm">
                <span className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-[#EAF7ED] text-[#22A53A]"><Icon className="h-5 w-5" /></span>
                <div><div className="text-sm font-black text-[#122033]">{title}</div><div className="mt-0.5 text-xs text-[#74808D]">{copy}</div></div>
              </div>
            ))}
          </aside>
        </div>
      </section>

      <section className="mx-auto max-w-[1440px] px-4 pb-4 sm:px-6 lg:px-8">
        <div className="rounded-xl border border-[#E1E6EA] bg-white p-4 shadow-sm sm:p-5">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <h2 className="text-lg font-black text-[#122033]">What you’ll find on AROFi Market</h2>
              <p className="mt-0.5 text-xs text-[#74808D]">A small preview of the launch catalogue.</p>
            </div>
            <button onClick={() => openWaitlist("BUYER")} className="hidden text-sm font-bold text-[#197C2C] hover:text-[#22A53A] sm:block">Notify me at launch</button>
          </div>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            {productPreview.map(({ name, meta, icon: Icon }) => (
              <button key={name} onClick={() => openWaitlist("BUYER")} className="group overflow-hidden rounded-lg border border-[#EDF0F2] bg-white text-left transition hover:-translate-y-0.5 hover:border-[#B9E7C2] hover:shadow-md">
                <div className="grid h-28 place-items-center bg-[#F5F7F9] sm:h-36">
                  <span className="grid h-16 w-16 place-items-center rounded-2xl bg-white text-[#22A53A] shadow-sm ring-1 ring-[#EDF0F2]"><Icon className="h-8 w-8" /></span>
                </div>
                <div className="p-3">
                  <div className="line-clamp-1 text-sm font-black text-[#122033] group-hover:text-[#197C2C]">{name}</div>
                  <div className="mt-1 text-xs text-[#74808D]">{meta}</div>
                  <div className="mt-2 inline-flex rounded bg-[#EAF7ED] px-2 py-1 text-[10px] font-black uppercase tracking-wide text-[#197C2C]">Coming soon</div>
                </div>
              </button>
            ))}
          </div>
        </div>
      </section>

      <section id="waitlist" className="mx-auto max-w-[980px] px-4 pb-12 pt-3 sm:px-6 lg:px-8">
        <div className="overflow-hidden rounded-xl border border-[#D5EEDB] bg-white shadow-md">
          <div className="grid md:grid-cols-[.78fr_1.22fr]">
            <div className="bg-[#EAF7ED] p-5 sm:p-6">
              <span className="inline-flex items-center gap-2 text-xs font-black uppercase tracking-[0.13em] text-[#197C2C]"><Bell className="h-4 w-4" /> Launch waitlist</span>
              <h2 className="mt-3 text-2xl font-black tracking-tight text-[#122033]">Be first in.</h2>
              <p className="mt-2 text-sm leading-6 text-[#596675]">Join as a buyer, seller, or both. Uganda launches first; other countries will open later.</p>
              <div className="mt-4 inline-flex items-center gap-2 rounded-lg bg-white px-3 py-2 text-xs font-bold text-[#596675] ring-1 ring-[#D5EEDB]"><MapPin className="h-4 w-4 text-[#22A53A]" /> Uganda • first launch market</div>
            </div>

            <form onSubmit={submitWaitlist} className="p-5 sm:p-6">
              <div className="grid grid-cols-3 gap-2 rounded-lg bg-[#F5F7F9] p-1">
                {(["BUYER", "SELLER", "BOTH"] as Interest[]).map((type) => (
                  <button key={type} type="button" onClick={() => setInterest(type)} className={`rounded-md px-2 py-2 text-xs font-black transition ${interest === type ? "bg-white text-[#197C2C] shadow-sm ring-1 ring-[#DDE4E8]" : "text-[#74808D] hover:text-[#26313D]"}`}>
                    {type === "BUYER" ? "Buy" : type === "SELLER" ? "Sell" : "Both"}
                  </button>
                ))}
              </div>

              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                <input name="name" required placeholder="Full name" className="market-input" />
                <input name="email" required type="email" placeholder="Email address" className="market-input" />
                <input name="phone" placeholder="Phone number" className="market-input" />
                <select name="country" defaultValue="Uganda" className="market-input">
                  <option>Uganda</option><option>Kenya</option><option>Tanzania</option><option>Rwanda</option><option>Other</option>
                </select>
                {(interest === "SELLER" || interest === "BOTH") && <input name="businessName" placeholder="Business / shop name" className="market-input sm:col-span-2" />}
              </div>

              <button disabled={submitting} className="mt-4 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-lg bg-[#22A53A] px-5 text-sm font-black text-white transition hover:bg-[#1E9134] active:bg-[#197C2C] disabled:cursor-not-allowed disabled:opacity-60">
                {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Bell className="h-4 w-4" />}{buttonLabel}
              </button>
            </form>
          </div>
        </div>
      </section>

      <footer className="border-t border-[#E1E6EA] bg-white py-5 text-center text-xs text-[#74808D]">© 2026 AROFi Market • AROSOFT Innovations Ltd</footer>

      {toast ? (
        <div className="fixed bottom-4 right-4 z-50 w-[calc(100%-2rem)] max-w-sm rounded-xl border border-[#E1E6EA] bg-white p-4 shadow-2xl">
          <div className="flex gap-3">
            {toast.tone === "success" ? <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-[#22A53A]" /> : <XCircle className="mt-0.5 h-5 w-5 shrink-0 text-red-600" />}
            <div><div className="text-sm font-black text-[#122033]">{toast.title}</div><div className="mt-1 text-xs leading-5 text-[#596675]">{toast.message}</div></div>
            <button onClick={() => setToast(null)} className="ml-auto text-xs font-black text-[#74808D]">×</button>
          </div>
        </div>
      ) : null}
    </main>
  );
}
