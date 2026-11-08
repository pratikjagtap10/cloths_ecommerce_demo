import type { Payment } from "../../../generated/client";

export const paymentJson = (p: Payment) => ({
  id: p.id,
  order_id: p.orderId,
  amount: p.amount,
  status: p.status,
  provider_ref: p.providerRef,
  created_at: p.createdAt.toISOString(),
});
