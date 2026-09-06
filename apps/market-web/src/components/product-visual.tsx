import {
  BatteryCharging,
  Cable,
  Camera,
  Monitor,
  Network,
  Router,
  Smartphone,
  Wifi,
  type LucideIcon,
} from "lucide-react";
import type { ProductVisual as ProductVisualType } from "@/data/market";

const visualMap: Record<ProductVisualType, LucideIcon> = {
  router: Router,
  "access-point": Wifi,
  switch: Network,
  camera: Camera,
  computer: Monitor,
  phone: Smartphone,
  cable: Cable,
  power: BatteryCharging,
};

const toneMap: Record<ProductVisualType, string> = {
  router: "from-blue-50 via-white to-indigo-100 text-blue-700",
  "access-point": "from-cyan-50 via-white to-blue-100 text-cyan-700",
  switch: "from-slate-50 via-white to-blue-100 text-slate-700",
  camera: "from-violet-50 via-white to-indigo-100 text-violet-700",
  computer: "from-emerald-50 via-white to-teal-100 text-emerald-700",
  phone: "from-rose-50 via-white to-orange-100 text-rose-700",
  cable: "from-amber-50 via-white to-yellow-100 text-amber-700",
  power: "from-lime-50 via-white to-emerald-100 text-lime-700",
};

export function ProductVisual({
  visual,
  brand,
  name,
  compact = false,
}: {
  visual: ProductVisualType;
  brand: string;
  name: string;
  compact?: boolean;
}) {
  const Icon = visualMap[visual];

  return (
    <div
      className={`relative isolate overflow-hidden bg-gradient-to-br ${toneMap[visual]} ${
        compact ? "h-24 rounded-2xl" : "aspect-[4/3] rounded-3xl"
      }`}
      aria-label={`${name} product illustration`}
      role="img"
    >
      <div className="absolute -right-10 -top-12 h-28 w-28 rounded-full bg-white/75 blur-xl" />
      <div className="absolute -bottom-14 -left-10 h-32 w-32 rounded-full bg-white/60 blur-2xl" />
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_20%,rgba(255,255,255,.9),transparent_38%)]" />
      <div className="relative flex h-full flex-col items-center justify-center gap-3 p-5 text-center">
        <div
          className={`grid place-items-center rounded-3xl border border-white/80 bg-white/80 shadow-lg shadow-slate-900/5 backdrop-blur ${
            compact ? "h-12 w-12" : "h-20 w-20"
          }`}
        >
          <Icon className={compact ? "h-6 w-6" : "h-10 w-10"} strokeWidth={1.8} />
        </div>
        {!compact ? (
          <div>
            <p className="text-[11px] font-bold uppercase tracking-[0.18em] opacity-70">
              {brand}
            </p>
            <p className="mt-1 line-clamp-1 text-xs font-semibold text-slate-700/80">
              Verified equipment
            </p>
          </div>
        ) : null}
      </div>
    </div>
  );
}
