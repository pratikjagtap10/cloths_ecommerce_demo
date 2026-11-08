import { FREE_SHIPPING_OVER, SHIPPING_FEE } from "./config";
import type { Product } from "@/types";

const inr = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  maximumFractionDigits: 0,
});

export const formatPrice = (amount: number) => inr.format(amount);

export const formatDate = (iso: string) =>
  new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });

export const shippingFor = (subtotal: number) =>
  subtotal === 0 || subtotal >= FREE_SHIPPING_OVER ? 0 : SHIPPING_FEE;

export const minPrice = (p: Product) => Math.min(...p.variants.map((v) => v.price));

export const totalStock = (p: Product) => p.variants.reduce((sum, v) => sum + v.stock, 0);

const toSlug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");

/** Photo for a product in a given colour. Uses a backend image URL when one exists,
 *  otherwise the generated photos in /public/images/products/<slug>--<color>.jpg */
export const productImageSrc = (slug: string, color: string, images: { url: string }[] = []) =>
  images[0]?.url ?? `/images/products/${slug}--${toSlug(color)}.jpg`;

export const uniqueColors = (p: Product) => {
  const seen = new Map<string, string>();
  p.variants.forEach((v) => seen.set(v.color, v.color_hex));
  return [...seen.entries()].map(([name, hex]) => ({ name, hex }));
};
