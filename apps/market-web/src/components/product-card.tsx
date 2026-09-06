"use client";

import Link from "next/link";
import {
  CheckCircle2,
  Heart,
  PackageCheck,
  ShieldCheck,
  ShoppingCart,
  Star,
} from "lucide-react";
import { formatUgx, type MarketProduct } from "@/data/market";
import { useMarket } from "./market-context";
import { ProductVisual } from "./product-visual";

export function ProductCard({ product }: { product: MarketProduct }) {
  const { addToCart, toggleWishlist, wishlist } = useMarket();
  const saved = wishlist.has(product.slug);
  const discount = product.compareAtUgx
    ? Math.round((1 - product.priceUgx / product.compareAtUgx) * 100)
    : 0;

  return (
    <article className="group flex h-full flex-col rounded-[28px] border border-slate-200/80 bg-white p-3 shadow-sm transition duration-300 hover:-translate-y-1 hover:border-blue-200 hover:shadow-card">
      <div className="relative">
        <Link href={`/product/${product.slug}`} className="block rounded-3xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2">
          <ProductVisual
            visual={product.visual}
            brand={product.brand}
            name={product.name}
          />
        </Link>

        <div className="absolute left-3 top-3 flex max-w-[70%] flex-wrap gap-1.5">
          {product.badge ? (
            <span className="rounded-full bg-slate-950/90 px-2.5 py-1 text-[10px] font-bold text-white shadow-sm backdrop-blur">
              {product.badge}
            </span>
          ) : null}
          {discount > 0 ? (
            <span className="rounded-full bg-emerald-600 px-2.5 py-1 text-[10px] font-bold text-white shadow-sm">
              Save {discount}%
            </span>
          ) : null}
        </div>

        <button
          type="button"
          onClick={() => toggleWishlist(product)}
          className={`absolute right-3 top-3 grid h-10 w-10 place-items-center rounded-full border bg-white/95 shadow-sm backdrop-blur transition focus:outline-none focus:ring-2 focus:ring-blue-500 ${
            saved
              ? "border-rose-200 text-rose-600"
              : "border-white text-slate-500 hover:text-rose-600"
          }`}
          aria-label={saved ? "Remove from saved items" : "Save item"}
        >
          <Heart className={`h-5 w-5 ${saved ? "fill-current" : ""}`} />
        </button>
      </div>

      <div className="flex flex-1 flex-col px-2 pb-2 pt-4">
        <div className="mb-2 flex flex-wrap gap-1.5">
          {product.arofiVerified ? (
            <span className="inline-flex items-center gap-1 rounded-full bg-blue-50 px-2 py-1 text-[10px] font-bold text-blue-700">
              <ShieldCheck className="h-3.5 w-3.5" /> AROFi Verified
            </span>
          ) : null}
          {product.arofiReady ? (
            <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-1 text-[10px] font-bold text-emerald-700">
              <PackageCheck className="h-3.5 w-3.5" /> AROFi Ready
            </span>
          ) : null}
        </div>

        <Link
          href={`/product/${product.slug}`}
          className="line-clamp-2 text-[15px] font-bold leading-5 text-slate-950 transition hover:text-blue-700 focus:outline-none focus-visible:underline"
        >
          {product.name}
        </Link>

        <p className="mt-1.5 line-clamp-2 text-xs leading-5 text-slate-500">
          {product.description}
        </p>

        <div className="mt-3 flex items-center gap-1.5 text-xs">
          <span className="inline-flex items-center gap-1 font-bold text-slate-800">
            <Star className="h-3.5 w-3.5 fill-amber-400 text-amber-400" />
            {product.rating.toFixed(1)}
          </span>
          <span className="text-slate-400">({product.reviewCount})</span>
          <span className="text-slate-300">•</span>
          <span className="truncate text-slate-500">{product.seller}</span>
          {product.sellerVerified ? (
            <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-blue-600" aria-label="Approved seller" />
          ) : null}
        </div>

        <div className="mt-auto pt-4">
          <div className="flex items-end justify-between gap-3">
            <div>
              <p className="text-lg font-black tracking-tight text-slate-950">
                {formatUgx(product.priceUgx)}
              </p>
              {product.compareAtUgx ? (
                <p className="text-xs text-slate-400 line-through">
                  {formatUgx(product.compareAtUgx)}
                </p>
              ) : (
                <p className="text-xs text-slate-400">Buyer protected</p>
              )}
            </div>
            <span
              className={`rounded-full px-2.5 py-1 text-[10px] font-bold ${
                product.stockLabel === "AROFi Stocked"
                  ? "bg-emerald-50 text-emerald-700"
                  : product.stockLabel === "Seller Confirmed"
                    ? "bg-blue-50 text-blue-700"
                    : "bg-amber-50 text-amber-700"
              }`}
            >
              {product.stockLabel}
            </span>
          </div>

          <button
            type="button"
            onClick={() => addToCart(product)}
            className="mt-3 inline-flex h-11 w-full items-center justify-center gap-2 rounded-2xl bg-slate-950 px-4 text-sm font-bold text-white shadow-sm transition hover:bg-blue-700 hover:shadow-lg hover:shadow-blue-600/20 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 active:scale-[0.99]"
          >
            <ShoppingCart className="h-4 w-4" />
            Add to cart
          </button>
        </div>
      </div>
    </article>
  );
}
