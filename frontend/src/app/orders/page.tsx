"use client";

// Protected page (see middleware.ts). Fetches data on the client with useEffect.
import Link from "next/link";
import { useEffect, useState } from "react";
import { OrderStatusBadge } from "@/components/OrderStatusBadge";
import { api, errorMessage } from "@/lib/api";
import { formatDate, formatPrice } from "@/lib/format";
import type { Order } from "@/types";

export default function OrdersPage() {
  const [orders, setOrders] = useState<Order[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .getOrders()
      .then(setOrders)
      .catch((e) => setError(errorMessage(e)));
  }, []);

  return (
    <div className="container-page py-10">
      <h1 className="text-3xl font-bold">My orders</h1>

      {error && <p className="mt-6 rounded bg-red-50 p-3 text-sm text-red-700">{error}</p>}
      {!orders && !error && <p className="mt-6 text-stone-500">Loading orders…</p>}

      {orders?.length === 0 && (
        <div className="mt-8 rounded-lg border border-dashed border-stone-300 p-12 text-center text-stone-500">
          You have no orders yet.{" "}
          <Link href="/products" className="underline">
            Start shopping
          </Link>
        </div>
      )}

      {orders && orders.length > 0 && (
        <ul className="mt-8 space-y-4">
          {orders.map((o) => (
            <li key={o.id}>
              <Link
                href={`/orders/${o.id}`}
                className="flex flex-wrap items-center justify-between gap-4 rounded-lg border border-stone-200 p-5 transition hover:shadow-md"
              >
                <div>
                  <p className="font-semibold">Order #{o.id}</p>
                  <p className="text-sm text-stone-500">
                    {formatDate(o.created_at)} · {o.items.reduce((n, i) => n + i.quantity, 0)} item(s)
                  </p>
                </div>
                <div className="flex items-center gap-4">
                  <OrderStatusBadge status={o.status} />
                  <span className="font-semibold">{formatPrice(o.total)}</span>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
