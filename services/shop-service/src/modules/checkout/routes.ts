// POST /api/shop/checkout/  {address} -> 201 {order, payment}
//   1. validate address (422)          2. cart must not be empty (400)
//   3. core-service creates the order with server-side prices and stock check (sync REST)
//   4. a PENDING payment is created here. The cart is emptied only when payment succeeds.
import { ApiError, currentUser, parse } from "@threads/shared";
import { Router } from "express";
import { coreClient } from "../../clients/coreClient";
import { prisma } from "../../db";
import { idempotent } from "../../lib/idempotency";
import { paymentJson } from "../payments/serializers";
import { checkoutSchema } from "./schemas";

export const checkoutRouter = Router();

// `idempotent`: a repeated request with the same Idempotency-Key returns the first response
checkoutRouter.post("/", idempotent, async (req, res) => {
  const user = currentUser(req);
  const { address } = parse(checkoutSchema, req.body, 422);

  const items = await prisma.cartItem.findMany({ where: { cart: { userId: user.id } }, orderBy: { id: "asc" } });
  if (!items.length) throw new ApiError(400, "Your cart is empty.");

  // The key is passed on to core-service, so even if this request failed half-way (e.g. core
  // created the order but the response was lost) the retry gets the SAME order back.
  const key = res.locals.idempotencyKey as string | undefined;
  const order = await coreClient.createOrder(
    {
      user_id: user.id,
      items: items.map((i) => ({ variant_id: i.variantId, quantity: i.quantity })),
      address,
    },
    key ? `shop-checkout:${user.id}:${key}` : undefined,
  );
  // One payment per order: a retry for the same order reuses the existing payment
  const payment = await prisma.payment.upsert({
    where: { orderId: order.id },
    create: { orderId: order.id, userId: user.id, amount: order.total },
    update: {},
  });

  req.log.info({ orderId: order.id, paymentId: payment.id, total: order.total }, "checkout complete");
  res.status(201).json({ order, payment: paymentJson(payment) });
});
