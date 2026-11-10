// Idempotency keys for checkout and payment.
//
// A key identifies ONE user action ("place this order", "pay this payment"). If the same
// request is sent again (slow network retry, double submit, page refresh) with the same key,
// the backend returns the first result instead of creating a second order or payment.
import type { Address, CartItem } from "@/types";

const STORAGE_KEY = "checkout_idempotency";

/** Random UUID; falls back to getRandomValues where randomUUID is unavailable (non-HTTPS hosts). */
export function newIdempotencyKey(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") return crypto.randomUUID();
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * Checkout key = one per (cart contents + address), kept for the browser tab session.
 * Submitting the same cart and address again, even after a page refresh, reuses the key, so
 * the backend returns the order it already created. Change the cart or address -> new key.
 */
export function checkoutKey(items: Pick<CartItem, "variant_id" | "quantity">[], address: Address): string {
  const signature = JSON.stringify({
    items: items.map((i) => [i.variant_id, i.quantity]).sort((a, b) => a[0] - b[0]),
    address,
  });
  try {
    const saved = JSON.parse(sessionStorage.getItem(STORAGE_KEY) ?? "null") as { signature: string; key: string } | null;
    if (saved?.signature === signature) return saved.key;
    const key = newIdempotencyKey();
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify({ signature, key }));
    return key;
  } catch {
    return newIdempotencyKey(); // storage unavailable (private mode): still safe within this attempt
  }
}

/** Forget the checkout key once the order is paid, so the next purchase gets a new one. */
export function clearCheckoutKey() {
  try {
    sessionStorage.removeItem(STORAGE_KEY);
  } catch {
    /* ignore */
  }
}

/** Payment key: one per payment and outcome, so repeating "Pay now" never pays twice. */
export const paymentKey = (paymentId: number, success: boolean) =>
  `payment-${paymentId}-${success ? "success" : "failure"}`;
