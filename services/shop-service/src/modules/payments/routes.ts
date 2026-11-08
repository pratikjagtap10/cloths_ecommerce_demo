// Mock payment provider.
//   GET  /api/shop/payments/:id/
//   POST /api/shop/payments/:id/confirm/   {success: true|false}
// A successful payment, in ONE database transaction:
//   payment -> SUCCESS, cart emptied, "payment.succeeded" written to the outbox.
// The outbox relay then publishes the event; core-worker marks the order PAID.
import { randomUUID } from "node:crypto";
import { ApiError, currentUser, EVENT_TYPES, intParam, parse, REQUIRED } from "@threads/shared";
import { Router } from "express";
import { z } from "zod";
import { prisma } from "../../db";
import { outbox } from "../../events/outbox";
import { notify } from "../../notifications";
import { paymentJson } from "./serializers";

export const paymentsRouter = Router();

async function ownPayment(userId: number, rawId: unknown) {
  const payment = await prisma.payment.findFirst({ where: { id: intParam(rawId, "Payment not found."), userId } });
  if (!payment) throw new ApiError(404, "Payment not found.");
  return payment;
}

paymentsRouter.get("/:id", async (req, res) => {
  res.json(paymentJson(await ownPayment(currentUser(req).id, req.params.id)));
});

const confirmSchema = z.object({
  success: z.boolean({ required_error: REQUIRED, invalid_type_error: "Must be true or false." }),
});

paymentsRouter.post("/:id/confirm", async (req, res) => {
  const user = currentUser(req);
  const payment = await ownPayment(user.id, req.params.id);
  const { success } = parse(confirmSchema, req.body);

  // Idempotent: confirming an already successful payment changes nothing
  if (payment.status === "SUCCESS") {
    res.json(paymentJson(payment));
    return;
  }

  if (!success) {
    const failed = await prisma.payment.update({ where: { id: payment.id }, data: { status: "FAILED" } });
    req.log.info({ paymentId: payment.id, orderId: payment.orderId }, "payment failed (simulated)");
    res.json(paymentJson(failed));
    return;
  }

  const eventId = randomUUID();
  const updated = await prisma.$transaction(async (tx) => {
    // Guard against two parallel confirms: only one can move the payment to SUCCESS
    const { count } = await tx.payment.updateMany({
      where: { id: payment.id, status: { not: "SUCCESS" } },
      data: { status: "SUCCESS", providerRef: `mock_${randomUUID().slice(0, 12)}` },
    });
    if (count === 1) {
      await tx.cartItem.deleteMany({ where: { cart: { userId: user.id } } });
      await tx.outboxEvent.create({
        data: {
          id: eventId,
          type: EVENT_TYPES.paymentSucceeded,
          payload: { order_id: payment.orderId, payment_id: payment.id, user_id: user.id, amount: payment.amount },
        },
      });
    }
    return tx.payment.findUniqueOrThrow({ where: { id: payment.id } });
  });

  outbox.flushSoon(); // publish now instead of waiting for the next relay tick
  // Background task after the response (like FastAPI BackgroundTasks)
  setImmediate(() => notify.paymentReceived(user.email, payment.orderId, payment.amount));

  req.log.info({ paymentId: payment.id, orderId: payment.orderId, eventId }, "payment succeeded");
  res.json(paymentJson(updated));
});
