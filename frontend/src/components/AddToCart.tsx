"use client";

// Interactive part of the product page: pick colour + size + quantity.
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useMemo, useState } from "react";
import { useCart } from "@/context/CartContext";
import { ApiError, errorMessage } from "@/lib/api";
import { formatPrice, productImageSrc, uniqueColors } from "@/lib/format";
import { ProductImage } from "./ProductImage";
import type { Product } from "@/types";

export function AddToCart({ product }: { product: Product }) {
  const { add } = useCart();
  const colors = uniqueColors(product);
  const [color, setColor] = useState(colors[0]?.name ?? "");
  const [size, setSize] = useState<string | null>(null);
  const [qty, setQty] = useState(1);
  const [status, setStatus] = useState<{ type: "ok" | "error" | "login"; text: string } | null>(null);
  const pathname = usePathname();
  const [busy, setBusy] = useState(false);

  // Derived state: variants available for the chosen colour
  const sizesForColor = useMemo(
    () => product.variants.filter((v) => v.color === color),
    [product.variants, color],
  );
  const variant = sizesForColor.find((v) => v.size === size) ?? null;
  const colorHex = colors.find((c) => c.name === color)?.hex ?? "#ddd";

  const onAdd = async () => {
    if (!variant) return;
    setBusy(true);
    setStatus(null);
    try {
      await add(variant.id, qty);
      setStatus({ type: "ok", text: `Added ${qty} × ${product.name} (${color} / ${size}) to your cart.` });
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) {
        setStatus({ type: "login", text: "Please log in to add items to your cart." });
      } else {
        setStatus({ type: "error", text: errorMessage(e) });
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="grid gap-8 md:grid-cols-2">
      <ProductImage
        color={colorHex}
        label={`${product.name} in ${color}`}
        src={productImageSrc(product.slug, color, product.images)}
        width={560}
        priority
        allowLoadOnDemand
      />

      <div className="space-y-6">
        <div>
          <p className="text-sm uppercase tracking-wide text-stone-500">{product.category.name}</p>
          <h1 className="mt-1 text-3xl font-bold">{product.name}</h1>
          <p className="mt-3 text-2xl font-semibold">
            {formatPrice(variant?.price ?? product.base_price)}
          </p>
          <p className="mt-4 text-stone-600">{product.description}</p>
        </div>

        <div>
          <p className="mb-2 text-sm font-semibold">
            Colour: <span className="font-normal">{color}</span>
          </p>
          <div className="flex gap-2">
            {colors.map((c) => (
              <button
                key={c.name}
                title={c.name}
                aria-label={`Colour ${c.name}`}
                aria-pressed={c.name === color}
                onClick={() => {
                  setColor(c.name);
                  setSize(null);
                  setStatus(null);
                }}
                className={`h-9 w-9 rounded-full border-2 ${c.name === color ? "border-stone-900 ring-2 ring-amber-500 ring-offset-2" : "border-stone-300"}`}
                style={{ backgroundColor: c.hex }}
              />
            ))}
          </div>
        </div>

        <div>
          <p className="mb-2 text-sm font-semibold">Size</p>
          <div className="flex flex-wrap gap-2">
            {sizesForColor.map((v) => (
              <button
                key={v.id}
                disabled={v.stock === 0}
                onClick={() => {
                  setSize(v.size);
                  setQty(1);
                  setStatus(null);
                }}
                className={`min-w-12 rounded border px-3 py-2 text-sm ${
                  v.size === size
                    ? "border-stone-900 bg-stone-900 text-white"
                    : "border-stone-300 hover:border-stone-900"
                } disabled:cursor-not-allowed disabled:border-stone-200 disabled:text-stone-300 disabled:line-through`}
              >
                {v.size}
              </button>
            ))}
          </div>
          {variant && (
            <p className={`mt-2 text-sm ${variant.stock <= 3 ? "text-red-600" : "text-green-700"}`}>
              {variant.stock <= 3 ? `Hurry, only ${variant.stock} left!` : "In stock"} · SKU {variant.sku}
            </p>
          )}
        </div>

        <div className="flex items-center gap-3">
          <div className="flex items-center rounded border border-stone-300">
            <button
              className="px-3 py-2"
              aria-label="Decrease quantity"
              onClick={() => setQty((q) => Math.max(1, q - 1))}
            >
              −
            </button>
            <span className="w-8 text-center" aria-live="polite">{qty}</span>
            <button
              className="px-3 py-2"
              aria-label="Increase quantity"
              onClick={() => setQty((q) => Math.min(variant?.stock ?? 10, q + 1))}
            >
              +
            </button>
          </div>
          <button onClick={onAdd} disabled={!variant || busy} className="btn-primary flex-1">
            {busy ? "Adding…" : variant ? "Add to cart" : "Select a size"}
          </button>
        </div>

        {status && (
          <div
            role="status"
            className={`rounded p-3 text-sm ${status.type === "ok" ? "bg-green-50 text-green-800" : "bg-red-50 text-red-700"}`}
          >
            {status.text}{" "}
            {status.type === "ok" && (
              <Link href="/cart" className="font-semibold underline">
                View cart
              </Link>
            )}
            {status.type === "login" && (
              <Link href={`/login?next=${encodeURIComponent(pathname)}`} className="font-semibold underline">
                Log in
              </Link>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
