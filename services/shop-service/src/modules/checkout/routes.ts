// POST /api/shop/checkout/  {address} -> 201 {order, payment}
//   1. validate address (422)          2. cart must not be empty (400)
//   3. core-service creates the order with server-side prices and stock check (sync REST)
//   4. a PENDING payment is created here. The cart is emptied only when payment succeeds.
import { ApiError, currentUser, parse } from "@threads/shared";
import { Router } from "express";
import { coreClient } from "../../clients/coreClient";
import { prisma } from "../../db";
import { paymentJson } from "../payments/serializers";
import { checkoutSchema } from "./schemas";

export const checkoutRouter = Router();

checkoutRouter.post("/", async (req, res) => {
  const user = currentUser(req);
  const { address } = parse(checkoutSchema, req.body, 422);

  const items = await prisma.cartItem.findMany({ where: { cart: { userId: user.id } }, orderBy: { id: "asc" } });
  if (!items.length) throw new ApiError(400, "Your cart is empty.");

  const order = await coreClient.createOrder({
    user_id: user.id,
    items: items.map((i) => ({ variant_id: i.variantId, quantity: i.quantity })),
    address,
  });
  const payment = await prisma.payment.create({
    data: { orderId: order.id, userId: user.id, amount: order.total },
  });

  req.log.info({ orderId: order.id, paymentId: payment.id, total: order.total }, "checkout complete");
  res.status(201).json({ order, payment: paymentJson(payment) });
});
