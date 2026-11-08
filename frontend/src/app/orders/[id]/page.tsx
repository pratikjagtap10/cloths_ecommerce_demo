"use client";

// Order detail + "order placed" success banner (/orders/1003?placed=1).
import Link from "next/link";
import { useParams, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { OrderStatusBadge } from "@/components/OrderStatusBadge";
import { ProductImage } from "@/components/ProductImage";
import { api, errorMessage } from "@/lib/api";
import { formatDate, formatPrice, productImageSrc } from "@/lib/format";
import type { Order } from "@/types";

function OrderDetail() {
  const { id } = useParams<{ id: string }>();
  const placed = useSearchParams().get("placed") === "1";
  const [order, setOrder] = useState<Order | null | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .getOrder(Number(id))
      .then(setOrder)
      .catch((e) => setError(errorMessage(e)));
  }, [id]);

  if (error) return <p className="mt-6 rounded bg-red-50 p-3 text-sm text-red-700">{error}</p>;
  if (order === undefined) return <p className="mt-6 text-stone-500">Loading order…</p>;
  if (order === null) {
    return (
      <div className="py-16 text-center">
        <h1 className="text-2xl font-bold">Order not found</h1>
        <Link href="/orders" className="btn-primary mt-6">
          Back to my orders
        </Link>
      </div>
    );
  }

  const subtotal = order.total - order.shipping_fee;

  return (
    <>
      {placed && (
        <div className="mb-8 rounded-lg bg-green-50 p-6 text-center text-green-900">
          <p className="text-4xl">🎉</p>
          <h1 className="mt-2 text-2xl font-bold">Thank you! Your order is confirmed.</h1>
          <p className="mt-1 text-sm">A confirmation email is on its way (simulated).</p>
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold">Order #{order.id}</h2>
          <p className="text-sm text-stone-500">Placed on {formatDate(order.created_at)}</p>
        </div>
        <OrderStatusBadge status={order.status} />
      </div>

      <div className="mt-8 grid gap-10 lg:grid-cols-[1fr_300px]">
        <ul className="divide-y divide-stone-200 border-y border-stone-200">
          {order.items.map((i) => (
            <li key={i.id} className="flex items-center gap-4 py-4">
              <div className="w-16 shrink-0">
                <ProductImage
                  color={i.color_hex}
                  label={i.product_name}
                  src={productImageSrc(i.product_slug, i.color)}
                  width={64}
                />
              </div>
              <div className="flex-1">
                <Link href={`/products/${i.product_slug}`} className="font-medium hover:underline">
                  {i.product_name}
                </Link>
                <p className="text-sm text-stone-500">
                  {i.color} · Size {i.size} · Qty {i.quantity}
                </p>
              </div>
              <p className="font-semibold">{formatPrice(i.unit_price * i.quantity)}</p>
            </li>
          ))}
        </ul>

        <aside className="space-y-6 text-sm">
          <div className="rounded-lg bg-stone-50 p-5">
            <h3 className="font-semibold">Shipping to</h3>
            <address className="mt-2 not-italic text-stone-600">
              {order.address.full_name}
              <br />
              {order.address.line1}
              <br />
              {order.address.city}, {order.address.state} {order.address.postal_code}
              <br />
              📞 {order.address.phone}
            </address>
          </div>
          <dl className="space-y-1 rounded-lg bg-stone-50 p-5">
            <div className="flex justify-between">
              <dt>Subtotal</dt>
              <dd>{formatPrice(subtotal)}</dd>
            </div>
            <div className="flex justify-between">
              <dt>Shipping</dt>
              <dd>{order.shipping_fee === 0 ? "Free" : formatPrice(order.shipping_fee)}</dd>
            </div>
            <div className="flex justify-between border-t border-stone-200 pt-2 text-base font-semibold">
              <dt>Total</dt>
              <dd>{formatPrice(order.total)}</dd>
            </div>
          </dl>
        </aside>
      </div>

      <div className="mt-10 flex gap-3">
        <Link href="/orders" className="btn-secondary">
          ← All orders
        </Link>
        <Link href="/products" className="btn-primary">
          Continue shopping
        </Link>
      </div>
    </>
  );
}

export default function OrderDetailPage() {
  return (
    <div className="container-page py-10">
      <Suspense>
        <OrderDetail />
      </Suspense>
    </div>
  );
}
