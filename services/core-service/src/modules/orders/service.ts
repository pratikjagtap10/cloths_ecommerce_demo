// Order business logic: the rules that must never break.
import { ApiError } from "@threads/shared";
import { prisma, Prisma } from "../../db";
import { variantPrice } from "../catalog/serializers";
import { orderInclude } from "./serializers";
import { shippingFor } from "./shipping";

export interface CreateOrderInput {
  user_id: number;
  items: { variant_id: number; quantity: number }[];
  address: { full_name: string; phone: string; line1: string; city: string; state: string; postal_code: string };
}

/**
 * Create a PENDING order (called by shop-service at checkout).
 *  - variant rows are locked (SELECT ... FOR UPDATE) so two checkouts can't both take the last item
 *  - prices come from the database, never from the request
 *  - stock is checked here and reduced later, when the payment succeeds (markOrderPaid)
 */
export async function createOrder(input: CreateOrderInput) {
  // Merge duplicate lines: [{1, 2}, {1, 1}] -> {1: 3}
  const quantities = new Map<number, number>();
  for (const { variant_id, quantity } of input.items) {
    quantities.set(variant_id, (quantities.get(variant_id) ?? 0) + quantity);
  }
  const ids = [...quantities.keys()];

  const user = await prisma.user.findUnique({ where: { id: input.user_id } });
  if (!user || !user.isActive) throw new ApiError(400, "User: Unknown user.");

  return prisma.$transaction(
    async (tx) => {
      await tx.$queryRaw`SELECT id FROM product_variants WHERE id = ANY(${ids}::int[]) ORDER BY id FOR UPDATE`;
      const variants = await tx.productVariant.findMany({ where: { id: { in: ids } }, include: { product: true } });

      let subtotal = 0;
      const items: Prisma.OrderItemCreateWithoutOrderInput[] = [];
      for (const [variantId, quantity] of quantities) {
        const v = variants.find((x) => x.id === variantId);
        if (!v) throw new ApiError(400, `Items: Product variant ${variantId} does not exist.`);
        const available = v.product.isActive ? v.stock : 0;
        if (quantity > available) {
          throw new ApiError(
            409,
            `${v.product.name} (${v.color} / ${v.size}) is no longer available in that quantity. Only ${available} left.`,
          );
        }
        const unitPrice = variantPrice(v, v.product.basePrice);
        subtotal += unitPrice * quantity;
        items.push({
          variantId: v.id,
          productName: v.product.name,
          productSlug: v.product.slug,
          size: v.size,
          color: v.color,
          colorHex: v.colorHex,
          quantity,
          unitPrice,
        });
      }

      const shippingFee = shippingFor(subtotal);
      const a = input.address;
      return tx.order.create({
        data: {
          userId: user.id,
          subtotal,
          shippingFee,
          total: subtotal + shippingFee,
          fullName: a.full_name,
          phone: a.phone,
          line1: a.line1,
          city: a.city,
          state: a.state,
          postalCode: a.postal_code,
          items: { create: items },
        },
        include: orderInclude,
      });
    },
    { timeout: 10_000 },
  );
}

export type MarkPaidResult = "paid" | "duplicate" | "not_pending" | "missing";

/**
 * Handle payment.succeeded. Idempotent: the event id is stored in processed_events in the
 * SAME transaction, so a redelivered event is skipped (unique violation -> "duplicate").
 */
export async function markOrderPaid(eventId: string, orderId: number): Promise<MarkPaidResult> {
  try {
    return await prisma.$transaction(async (tx) => {
      await tx.processedEvent.create({ data: { eventId } });

      const rows = await tx.$queryRaw<{ status: string }[]>`
        SELECT status::text AS status FROM orders WHERE id = ${orderId} FOR UPDATE`;
      if (!rows.length) return "missing";
      if (rows[0].status !== "PENDING") return "not_pending";

      const items = await tx.orderItem.findMany({ where: { orderId } });
      for (const item of items) {
        await tx.$executeRaw`
          UPDATE product_variants SET stock = GREATEST(stock - ${item.quantity}, 0) WHERE id = ${item.variantId}`;
      }
      await tx.order.update({ where: { id: orderId }, data: { status: "PAID" } });
      return "paid";
    });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") return "duplicate";
    throw e;
  }
}

/** Admin: PAID -> SHIPPED (only from PAID). Returns the updated order or throws 400/404. */
export async function changeStatus(orderId: number, from: "PAID" | "PENDING", to: "SHIPPED" | "CANCELLED") {
  const { count } = await prisma.order.updateMany({ where: { id: orderId, status: from }, data: { status: to } });
  const order = await prisma.order.findUnique({ where: { id: orderId }, include: { ...orderInclude, user: true } });
  if (!order) throw new ApiError(404, "Order not found.");
  if (count === 0) {
    throw new ApiError(400, `Only ${from} orders can be ${to === "SHIPPED" ? "shipped" : "cancelled"}. This order is ${order.status}.`);
  }
  return order;
}
