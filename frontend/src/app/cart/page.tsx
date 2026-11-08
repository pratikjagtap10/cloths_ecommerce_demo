"use client";

// CSR: the cart is per-browser/per-user state, so this page renders on the client.
import Link from "next/link";
import { useState } from "react";
import { ProductImage } from "@/components/ProductImage";
import { useCart } from "@/context/CartContext";
import { errorMessage } from "@/lib/api";
import { FREE_SHIPPING_OVER } from "@/lib/config";
import { formatPrice, productImageSrc, shippingFor } from "@/lib/format";

export default function CartPage() {
  const { cart, loading, update, remove } = useCart();
  const [error, setError] = useState<string | null>(null);

  const run = async (fn: () => Promise<void>) => {
    setError(null);
    try {
      await fn();
    } catch (e) {
      setError(errorMessage(e));
    }
  };

  if (loading) {
    return <div className="container-page py-16 text-stone-500">Loading your cart…</div>;
  }

  if (cart.items.length === 0) {
    return (
      <div className="container-page py-24 text-center">
        <p className="text-5xl">🛒</p>
        <h1 className="mt-4 text-2xl font-bold">Your cart is empty</h1>
        <Link href="/products" className="btn-primary mt-8">
          Start shopping
        </Link>
      </div>
    );
  }

  const shipping = shippingFor(cart.subtotal);

  return (
    <div className="container-page py-10">
      <h1 className="text-3xl font-bold">Your cart</h1>
      {error && <p className="mt-4 rounded bg-red-50 p-3 text-sm text-red-700">{error}</p>}

      <div className="mt-8 grid gap-10 lg:grid-cols-[1fr_320px]">
        <ul className="divide-y divide-stone-200 border-y border-stone-200">
          {cart.items.map((item) => (
            <li key={item.id} className="flex gap-4 py-5">
              <Link href={`/products/${item.product_slug}`} className="w-24 shrink-0">
                <ProductImage
                  color={item.color_hex}
                  label={item.product_name}
                  src={productImageSrc(item.product_slug, item.color)}
                  width={96}
                />
              </Link>
              <div className="flex flex-1 flex-col justify-between">
                <div className="flex justify-between gap-4">
                  <div>
                    <Link href={`/products/${item.product_slug}`} className="font-medium hover:underline">
                      {item.product_name}
                    </Link>
                    <p className="text-sm text-stone-500">
                      {item.color} · Size {item.size}
                    </p>
                  </div>
                  <p className="font-semibold">{formatPrice(item.unit_price * item.quantity)}</p>
                </div>
                <div className="flex items-center justify-between">
                  <div className="flex items-center rounded border border-stone-300">
                    <button
                      className="px-3 py-1"
                      aria-label="Decrease quantity"
                      disabled={item.quantity <= 1}
                      onClick={() => run(() => update(item.id, item.quantity - 1))}
                    >
                      −
                    </button>
                    <span className="w-8 text-center">{item.quantity}</span>
                    <button
                      className="px-3 py-1"
                      aria-label="Increase quantity"
                      onClick={() => run(() => update(item.id, item.quantity + 1))}
                    >
                      +
                    </button>
                  </div>
                  <button
                    className="text-sm text-stone-500 underline hover:text-red-600"
                    onClick={() => run(() => remove(item.id))}
                  >
                    Remove
                  </button>
                </div>
              </div>
            </li>
          ))}
        </ul>

        <aside className="h-fit rounded-lg bg-stone-50 p-6">
          <h2 className="text-lg font-semibold">Order summary</h2>
          <dl className="mt-4 space-y-2 text-sm">
            <div className="flex justify-between">
              <dt>Subtotal</dt>
              <dd>{formatPrice(cart.subtotal)}</dd>
            </div>
            <div className="flex justify-between">
              <dt>Shipping</dt>
              <dd>{shipping === 0 ? "Free" : formatPrice(shipping)}</dd>
            </div>
            {shipping > 0 && (
              <p className="text-xs text-stone-500">
                Add {formatPrice(FREE_SHIPPING_OVER - cart.subtotal)} more for free shipping.
              </p>
            )}
            <div className="flex justify-between border-t border-stone-200 pt-2 text-base font-semibold">
              <dt>Total</dt>
              <dd>{formatPrice(cart.subtotal + shipping)}</dd>
            </div>
          </dl>
          <Link href="/checkout" className="btn-primary mt-6 w-full">
            Proceed to checkout
          </Link>
        </aside>
      </div>
    </div>
  );
}
