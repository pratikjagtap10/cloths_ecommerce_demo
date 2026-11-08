"use client";

// Checkout has 2 steps: (1) the shipping address form creates the order, (2) mock payment.
// Protected by middleware.ts (must be logged in).
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useAuth } from "@/context/AuthContext";
import { useCart } from "@/context/CartContext";
import { api, errorMessage } from "@/lib/api";
import { formatPrice, shippingFor } from "@/lib/format";
import type { CheckoutResult } from "@/types";

const addressSchema = z.object({
  full_name: z.string().min(2, "Enter your full name"),
  phone: z.string().regex(/^[6-9]\d{9}$/, "Enter a valid 10-digit mobile number"),
  line1: z.string().min(5, "Enter your street address"),
  city: z.string().min(2, "Enter your city"),
  state: z.string().min(2, "Enter your state"),
  postal_code: z.string().regex(/^\d{6}$/, "PIN code must be 6 digits"),
});
type AddressForm = z.infer<typeof addressSchema>;

const FIELDS: { name: keyof AddressForm; label: string; placeholder: string; full?: boolean }[] = [
  { name: "full_name", label: "Full name", placeholder: "Demo User" },
  { name: "phone", label: "Mobile number", placeholder: "9876543210" },
  { name: "line1", label: "Address", placeholder: "12 MG Road", full: true },
  { name: "city", label: "City", placeholder: "Bengaluru" },
  { name: "state", label: "State", placeholder: "Karnataka" },
  { name: "postal_code", label: "PIN code", placeholder: "560001" },
];

export default function CheckoutPage() {
  const router = useRouter();
  const { user } = useAuth();
  const { cart, loading, refresh } = useCart();
  const [result, setResult] = useState<CheckoutResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [paying, setPaying] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<AddressForm>({
    resolver: zodResolver(addressSchema),
    values: user
      ? { full_name: `${user.first_name} ${user.last_name}`, phone: "", line1: "", city: "", state: "", postal_code: "" }
      : undefined,
    resetOptions: { keepDirtyValues: true },
  });

  const placeOrder = async (address: AddressForm) => {
    setError(null);
    try {
      setResult(await api.checkout(address));
    } catch (e) {
      setError(errorMessage(e));
    }
  };

  const pay = async (success: boolean) => {
    if (!result) return;
    setPaying(true);
    setError(null);
    try {
      const payment = await api.confirmPayment(result.payment.id, success);
      if (payment.status === "SUCCESS") {
        await refresh(); // the cart was cleared by the "payment.succeeded" flow
        router.push(`/orders/${result.order.id}?placed=1`);
      } else {
        setError("Payment failed (simulated). You can try again.");
      }
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setPaying(false);
    }
  };

  if (loading) return <div className="container-page py-16 text-stone-500">Loading…</div>;

  if (!result && cart.items.length === 0) {
    return (
      <div className="container-page py-24 text-center">
        <h1 className="text-2xl font-bold">Nothing to check out</h1>
        <Link href="/products" className="btn-primary mt-8">
          Browse products
        </Link>
      </div>
    );
  }

  const shipping = result ? result.order.shipping_fee : shippingFor(cart.subtotal);
  const total = result ? result.order.total : cart.subtotal + shipping;
  const items = result ? result.order.items : cart.items;

  return (
    <div className="container-page py-10">
      <h1 className="text-3xl font-bold">Checkout</h1>
      <ol className="mt-4 flex gap-6 text-sm">
        <li className={!result ? "font-semibold" : "text-stone-400"}>1. Shipping address</li>
        <li className={result ? "font-semibold" : "text-stone-400"}>2. Payment</li>
      </ol>
      {error && <p className="mt-4 rounded bg-red-50 p-3 text-sm text-red-700">{error}</p>}

      <div className="mt-8 grid gap-10 lg:grid-cols-[1fr_320px]">
        {!result ? (
          <form onSubmit={handleSubmit(placeOrder)} noValidate className="grid gap-4 sm:grid-cols-2">
            {FIELDS.map((f) => (
              <div key={f.name} className={f.full ? "sm:col-span-2" : ""}>
                <label htmlFor={f.name} className="mb-1 block text-sm font-medium">
                  {f.label}
                </label>
                <input id={f.name} placeholder={f.placeholder} className="input w-full" {...register(f.name)} />
                {errors[f.name] && <p className="field-error">{errors[f.name]?.message}</p>}
              </div>
            ))}
            <button type="submit" disabled={isSubmitting} className="btn-primary sm:col-span-2">
              {isSubmitting ? "Placing order…" : `Place order · ${formatPrice(total)}`}
            </button>
          </form>
        ) : (
          <div className="rounded-lg border border-stone-200 p-6">
            <h2 className="text-lg font-semibold">Mock payment</h2>
            <p className="mt-2 text-sm text-stone-600">
              Order <strong>#{result.order.id}</strong> was created with status <strong>PENDING</strong>.
              In the real system the FastAPI service handles payment, then publishes a
              <code className="mx-1 rounded bg-stone-100 px-1">payment.succeeded</code>
              event so Django marks the order PAID.
            </p>
            <p className="mt-4 text-2xl font-bold">{formatPrice(result.payment.amount)}</p>
            <div className="mt-6 flex flex-wrap gap-3">
              <button
                disabled={paying}
                onClick={() => pay(true)}
                className="btn-primary bg-green-700 hover:bg-green-600"
              >
                {paying ? "Processing…" : "Pay now (success)"}
              </button>
              <button disabled={paying} onClick={() => pay(false)} className="btn-secondary">
                Simulate failure
              </button>
            </div>
          </div>
        )}

        <aside className="h-fit rounded-lg bg-stone-50 p-6 text-sm">
          <h2 className="text-lg font-semibold">Your items</h2>
          <ul className="mt-4 space-y-2">
            {items.map((i) => (
              <li key={i.id} className="flex justify-between gap-2">
                <span>
                  {i.quantity} × {i.product_name}{" "}
                  <span className="text-stone-500">
                    ({i.color}/{i.size})
                  </span>
                </span>
                <span>{formatPrice(i.unit_price * i.quantity)}</span>
              </li>
            ))}
          </ul>
          <div className="mt-4 space-y-1 border-t border-stone-200 pt-3">
            <div className="flex justify-between">
              <span>Shipping</span>
              <span>{shipping === 0 ? "Free" : formatPrice(shipping)}</span>
            </div>
            <div className="flex justify-between text-base font-semibold">
              <span>Total</span>
              <span>{formatPrice(total)}</span>
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}
