// Events consumed by core-worker (consumer group "core-workers")
import { EVENT_TYPES, type EventHandler } from "@threads/shared";
import { logger } from "../logger";
import { markOrderPaid } from "../modules/orders/service";

const onPaymentSucceeded: EventHandler = async (event) => {
  const orderId = Number(event.data?.order_id);
  if (!Number.isInteger(orderId) || orderId <= 0) {
    logger.warn({ eventId: event.id, data: event.data }, "payment.succeeded without a valid order_id, skipped");
    return;
  }
  const result = await markOrderPaid(event.id, orderId);
  logger.info({ eventId: event.id, orderId, result }, "payment.succeeded processed");
};

export const handlers: Record<string, EventHandler> = {
  [EVENT_TYPES.paymentSucceeded]: onPaymentSucceeded,
};
