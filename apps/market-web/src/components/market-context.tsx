"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { CheckCircle2, Heart, ShoppingCart, X } from "lucide-react";
import type { MarketProduct } from "@/data/market";

type ToastTone = "success" | "info";

type MarketContextValue = {
  cartCount: number;
  wishlistCount: number;
  wishlist: Set<string>;
  addToCart: (product: MarketProduct, quantity?: number) => void;
  toggleWishlist: (product: MarketProduct) => void;
  notify: (message: string, tone?: ToastTone) => void;
};

const MarketContext = createContext<MarketContextValue | null>(null);

type ToastState = {
  id: number;
  message: string;
  tone: ToastTone;
} | null;

export function MarketProvider({ children }: { children: ReactNode }) {
  const [cartCount, setCartCount] = useState(0);
  const [wishlist, setWishlist] = useState<Set<string>>(() => new Set());
  const [toast, setToast] = useState<ToastState>(null);

  const notify = useCallback((message: string, tone: ToastTone = "success") => {
    const id = Date.now();
    setToast({ id, message, tone });
    window.setTimeout(() => {
      setToast((current) => (current?.id === id ? null : current));
    }, 3600);
  }, []);

  const addToCart = useCallback(
    (product: MarketProduct, quantity = 1) => {
      setCartCount((count) => count + Math.max(1, quantity));
      notify(`${product.name} added to your cart.`);
    },
    [notify],
  );

  const toggleWishlist = useCallback(
    (product: MarketProduct) => {
      setWishlist((current) => {
        const next = new Set(current);
        if (next.has(product.slug)) {
          next.delete(product.slug);
          notify(`${product.name} removed from saved items.`, "info");
        } else {
          next.add(product.slug);
          notify(`${product.name} saved for later.`, "info");
        }
        return next;
      });
    },
    [notify],
  );

  const value = useMemo(
    () => ({
      cartCount,
      wishlistCount: wishlist.size,
      wishlist,
      addToCart,
      toggleWishlist,
      notify,
    }),
    [addToCart, cartCount, notify, toggleWishlist, wishlist],
  );

  return (
    <MarketContext.Provider value={value}>
      {children}
      {toast ? (
        <div className="pointer-events-none fixed inset-x-4 bottom-5 z-[90] flex justify-end sm:inset-x-auto sm:right-6 sm:w-[390px]">
          <div className="pointer-events-auto flex w-full items-start gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-2xl shadow-slate-900/15">
            <div
              className={`mt-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-xl ${
                toast.tone === "success"
                  ? "bg-emerald-50 text-emerald-700"
                  : "bg-blue-50 text-blue-700"
              }`}
            >
              {toast.tone === "success" ? (
                <CheckCircle2 className="h-5 w-5" />
              ) : (
                <Heart className="h-5 w-5" />
              )}
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-slate-950">
                {toast.tone === "success" ? "Done" : "Saved"}
              </p>
              <p className="mt-0.5 text-sm leading-5 text-slate-600">
                {toast.message}
              </p>
            </div>
            <button
              type="button"
              onClick={() => setToast(null)}
              className="rounded-lg p-1.5 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
              aria-label="Dismiss notification"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>
      ) : null}
    </MarketContext.Provider>
  );
}

export function useMarket() {
  const context = useContext(MarketContext);
  if (!context) {
    throw new Error("useMarket must be used inside MarketProvider");
  }
  return context;
}

export function CartCountBadge() {
  const { cartCount } = useMarket();
  if (!cartCount) return null;

  return (
    <span className="absolute -right-2 -top-2 grid min-h-5 min-w-5 place-items-center rounded-full bg-blue-600 px-1 text-[10px] font-bold text-white shadow-sm">
      {cartCount > 99 ? "99+" : cartCount}
    </span>
  );
}

export function CartIcon() {
  return <ShoppingCart className="h-5 w-5" />;
}
