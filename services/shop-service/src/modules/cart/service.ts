// Cart rules. Live stock/price always come from core-service; product info is
// snapshotted into the cart item so GET /cart never needs core-service.
import { ApiError } from "@threads/shared";
import { coreClient, type CoreVariant } from "../../clients/coreClient";
import { prisma } from "../../db";
import type { CartItem } from "../../../generated/client";

export const cartItemJson = (i: CartItem) => ({
  id: i.id,
  variant_id: i.variantId,
  product_name: i.productName,
  product_slug: i.productSlug,
  size: i.size,
  color: i.color,
  color_hex: i.colorHex,
  quantity: i.quantity,
  unit_price: i.unitPrice,
});

export async function cartJson(userId: number) {
  const items = await prisma.cartItem.findMany({ where: { cart: { userId } }, orderBy: { id: "asc" } });
  return {
    items: items.map(cartItemJson),
    subtotal: items.reduce((sum, i) => sum + i.unitPrice * i.quantity, 0),
  };
}

const getOrCreateCart = (userId: number) =>
  prisma.cart.upsert({ where: { userId }, create: { userId }, update: {} });

async function liveVariant(variantId: number): Promise<CoreVariant> {
  try {
    return await coreClient.getVariant(variantId);
  } catch (e) {
    if (e instanceof ApiError && e.status === 404) throw new ApiError(404, "Product variant not found.");
    throw e;
  }
}

const snapshot = (v: CoreVariant) => ({
  unitPrice: v.price,
  productName: v.product_name,
  productSlug: v.product_slug,
  size: v.size,
  color: v.color,
  colorHex: v.color_hex,
});

export async function addItem(userId: number, variantId: number, quantity: number) {
  const variant = await liveVariant(variantId);
  if (!variant.is_active) throw new ApiError(400, "This product is no longer available.");

  const cart = await getOrCreateCart(userId);
  const existing = await prisma.cartItem.findUnique({
    where: { cartId_variantId: { cartId: cart.id, variantId } },
  });
  const newQuantity = (existing?.quantity ?? 0) + quantity;
  if (newQuantity > variant.stock) {
    throw new ApiError(400, `Only ${variant.stock} left in stock for ${variant.color} / ${variant.size}.`);
  }

  await prisma.cartItem.upsert({
    where: { cartId_variantId: { cartId: cart.id, variantId } },
    create: { cartId: cart.id, variantId, quantity: newQuantity, ...snapshot(variant) },
    update: { quantity: newQuantity, ...snapshot(variant) },
  });
}

async function ownItem(userId: number, itemId: number) {
  const item = await prisma.cartItem.findFirst({ where: { id: itemId, cart: { userId } } });
  if (!item) throw new ApiError(404, "Cart item not found.");
  return item;
}

export async function updateItem(userId: number, itemId: number, quantity: number) {
  const item = await ownItem(userId, itemId);
  const variant = await liveVariant(item.variantId);
  if (!variant.is_active) throw new ApiError(400, "This product is no longer available.");
  if (quantity > variant.stock) throw new ApiError(400, `Only ${variant.stock} left in stock.`);
  await prisma.cartItem.update({ where: { id: item.id }, data: { quantity, ...snapshot(variant) } });
}

export async function removeItem(userId: number, itemId: number) {
  const item = await ownItem(userId, itemId);
  await prisma.cartItem.delete({ where: { id: item.id } });
}
